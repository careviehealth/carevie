"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/createClient";

export type AppProfile = {
  id: string;
  user_id: string | null;
  auth_id?: string | null;
  name: string;
  display_name?: string | null;
  phone?: string | null;
  gender?: string | null;
  address?: string | null;
  avatar_type: string;
  avatar_color: string | null;
  is_primary: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type AppProfileContextValue = {
  userId: string;
  profiles: AppProfile[];
  selectedProfile: AppProfile | null;
  isLoading: boolean;
  selectProfile: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
};

const AppProfileContext = createContext<AppProfileContextValue | undefined>(undefined);

const localSelectedProfileKey = (userId: string) => `vytara:last-selected-profile:${userId}`;

const readLocalSelectedProfileId = (userId: string) => {
  if (!userId || typeof window === "undefined") return null;
  return window.localStorage.getItem(localSelectedProfileKey(userId));
};

const writeLocalSelectedProfileId = (userId: string, profileId: string) => {
  if (!userId || typeof window === "undefined") return;
  window.localStorage.setItem(localSelectedProfileKey(userId), profileId);
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
};

const sortProfiles = (profiles: AppProfile[]) =>
  [...profiles].sort((a, b) => {
    const primaryDiff = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
    if (primaryDiff !== 0) return primaryDiff;
    return parseDate(a.created_at) - parseDate(b.created_at);
  });

const fetchProfilesByAuth = async (userId: string) =>
  supabase
    .from("profiles")
    .select("*")
    .eq("auth_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

const fetchProfilesByUser = async (userId: string) =>
  supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

const fetchProfilesForUser = async (userId: string): Promise<AppProfile[]> => {
  const byAuth = await fetchProfilesByAuth(userId);
  if (!byAuth.error && byAuth.data && byAuth.data.length > 0) {
    return sortProfiles(byAuth.data as AppProfile[]);
  }

  const missingAuthColumn =
    byAuth.error?.code === "PGRST204" ||
    byAuth.error?.message?.toLowerCase().includes("auth_id");

  const byUser = await fetchProfilesByUser(userId);
  if (byUser.error && !missingAuthColumn) {
    throw byUser.error;
  }

  return sortProfiles((byUser.data ?? []) as AppProfile[]);
};

const fetchLastSelectedProfileId = async (userId: string) => {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("user_profile_preferences")
    .select("last_selected_profile_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return readLocalSelectedProfileId(userId);
  }

  return (data?.last_selected_profile_id as string | null) ?? readLocalSelectedProfileId(userId);
};

const persistLastSelectedProfileId = async (userId: string, profileId: string) => {
  if (!userId || !profileId) return;

  writeLocalSelectedProfileId(userId, profileId);

  const { error } = await supabase
    .from("user_profile_preferences")
    .upsert(
      {
        user_id: userId,
        last_selected_profile_id: profileId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    // Keep local fallback only.
    return;
  }
};

export function AppProfileProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<AppProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? "");
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? "");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfiles = useCallback(async () => {
    if (!userId) {
      setProfiles([]);
      setSelectedProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const nextProfiles = await fetchProfilesForUser(userId);
      setProfiles(nextProfiles);

      if (nextProfiles.length === 0) {
        setSelectedProfile(null);
        return;
      }

      const remembered = await fetchLastSelectedProfileId(userId);
      const previousId = selectedProfile?.id ?? null;

      const chosen =
        nextProfiles.find((profile) => profile.id === previousId) ??
        nextProfiles.find((profile) => profile.id === remembered) ??
        nextProfiles.find((profile) => profile.is_primary) ??
        nextProfiles[0] ??
        null;

      setSelectedProfile(chosen);

      if (chosen && chosen.id !== remembered) {
        await persistLastSelectedProfileId(userId, chosen.id);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedProfile?.id, userId]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const selectProfile = useCallback(
    async (profileId: string) => {
      const next = profiles.find((profile) => profile.id === profileId);
      if (!next) {
        throw new Error("Profile not found");
      }
      setSelectedProfile(next);
      if (userId) {
        await persistLastSelectedProfileId(userId, profileId);
      }
    },
    [profiles, userId]
  );

  const value = useMemo<AppProfileContextValue>(
    () => ({
      userId,
      profiles,
      selectedProfile,
      isLoading,
      selectProfile,
      refreshProfiles: loadProfiles,
    }),
    [isLoading, loadProfiles, profiles, selectProfile, selectedProfile, userId]
  );

  return <AppProfileContext.Provider value={value}>{children}</AppProfileContext.Provider>;
}

export function useAppProfile() {
  const context = useContext(AppProfileContext);
  if (!context) {
    throw new Error("useAppProfile must be used within an AppProfileProvider");
  }
  return context;
}
