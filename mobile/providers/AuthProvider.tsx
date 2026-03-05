import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearPersistedAuthOnFreshInstall } from '@/lib/installState';
import { supabase, type Session, type User } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = async () => {
    setIsLoading(true);
    const {
      data: { session: nextSession },
    } = await supabase.auth.getSession();
    setSession(nextSession ?? null);
    setIsLoading(false);
  };

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      await clearPersistedAuthOnFreshInstall();
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setIsLoading(false);
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshSession,
    }),
    [isLoading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return ctx;
}
