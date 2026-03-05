import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseJwt } from "@/lib/supabaseJwt";
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';

export const runtime = "nodejs";

type OtpVerifyPayload = {
  phone?: string;
  otp?: string;
  sessionId?: string;
  mode?: "login" | "signup";
};

const ipLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 20 });
const sessionLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 8 });

const AUTH_LOOKUP_MAX_PAGES = Number.parseInt(
  process.env.SUPABASE_AUTH_LOOKUP_MAX_PAGES ?? "8",
  10
);
const AUTH_LOOKUP_TIMEOUT_MS = Number.parseInt(
  process.env.SUPABASE_AUTH_LOOKUP_TIMEOUT_MS ?? "3500",
  10
);

const normalizePhone = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.replace(/\D/g, "")}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return trimmed;
};

const addPhoneVariant = (variants: Set<string>, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return;
  variants.add(trimmed);
  const normalized = normalizePhone(trimmed);
  if (normalized) {
    variants.add(normalized);
  }
};

const getPhoneVariants = (phone: string) => {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  const variants = new Set<string>();

  addPhoneVariant(variants, phone);
  addPhoneVariant(variants, normalized);
  if (digits) addPhoneVariant(variants, `+${digits}`);
  if (digits) addPhoneVariant(variants, digits);
  if (digits.length === 10) {
    addPhoneVariant(variants, `+91${digits}`);
    addPhoneVariant(variants, `91${digits}`);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    addPhoneVariant(variants, digits.slice(2));
    addPhoneVariant(variants, `+${digits.slice(2)}`);
  }

  return Array.from(variants);
};

type ExistingProfileRow = {
  id: string;
  auth_id?: string | null;
  user_id?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
};

const pickPreferredProfile = (rows: ExistingProfileRow[]) =>
  [...rows].sort((a, b) => {
    const primaryDiff = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
    if (primaryDiff !== 0) return primaryDiff;
    return parseDate(a.created_at) - parseDate(b.created_at);
  })[0] ?? null;

const isMissingAuthColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST204" || error?.message?.toLowerCase().includes("auth_id");

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const findAuthUserByPhone = async (
  adminClient: SupabaseClient,
  variants: string[]
) => {
  const normalizedVariants = new Set(
    variants
      .map((value) => normalizePhone(value))
      .filter((value) => /^\+\d{10,15}$/.test(value))
  );
  if (normalizedVariants.size === 0) return null;

  let page = 1;
  const startedAt = Date.now();
  const perPage = 1000;
  const maxPages = Number.isFinite(AUTH_LOOKUP_MAX_PAGES) && AUTH_LOOKUP_MAX_PAGES > 0
    ? AUTH_LOOKUP_MAX_PAGES
    : 8;
  const timeoutMs = Number.isFinite(AUTH_LOOKUP_TIMEOUT_MS) && AUTH_LOOKUP_TIMEOUT_MS > 0
    ? AUTH_LOOKUP_TIMEOUT_MS
    : 3500;

  while (page <= maxPages && Date.now() - startedAt < timeoutMs) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    const match = users.find((user: User) => {
      if (!user.phone) return false;
      const normalized = normalizePhone(user.phone);
      return normalizedVariants.has(normalized);
    });
    if (match?.id) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  if (page > maxPages || Date.now() - startedAt >= timeoutMs) {
    console.warn("Auth user phone lookup reached fallback limits.");
  }

  return null;
};

const findAuthUserByProfilePhone = async (
  adminClient: SupabaseClient,
  variants: string[]
) => {
  const profileLookupWithAuth = await adminClient
    .from("profiles")
    .select("id, auth_id, user_id, is_primary, created_at")
    .in("phone", variants)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);

  let rows: ExistingProfileRow[] = [];
  if (!profileLookupWithAuth.error) {
    rows = (profileLookupWithAuth.data ?? []) as ExistingProfileRow[];
  } else if (!isMissingAuthColumnError(profileLookupWithAuth.error)) {
    throw profileLookupWithAuth.error;
  } else {
    const profileLookupLegacy = await adminClient
      .from("profiles")
      .select("id, user_id, is_primary, created_at")
      .in("phone", variants)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(20);

    if (profileLookupLegacy.error) {
      throw profileLookupLegacy.error;
    }
    rows = (profileLookupLegacy.data ?? []) as ExistingProfileRow[];
  }

  const preferredProfile = pickPreferredProfile(rows);
  if (!preferredProfile) return null;

  const candidateUserId = preferredProfile.auth_id ?? preferredProfile.user_id ?? null;
  if (!candidateUserId) return null;

  const { data: userLookup, error: userLookupError } = await adminClient.auth.admin.getUserById(
    candidateUserId
  );
  if (userLookupError || !userLookup?.user) {
    return null;
  }

  return userLookup.user;
};

export async function POST(request: Request) {
  const ip = getClientIP(request as any);
  const ipBlock = ipLimiter.check(ip);
  if (ipBlock) return ipBlock;

  let payload: OtpVerifyPayload | null = null;
  try {
    payload = (await request.json()) as OtpVerifyPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const rawPhone = payload?.phone ?? "";
  const phone = normalizePhone(rawPhone);
  const otp = payload?.otp?.trim() ?? "";
  const sessionId = payload?.sessionId?.trim() ?? "";
  const mode = payload?.mode;

  const sessionBlock = sessionLimiter.check(sessionId);
  if (sessionBlock) return sessionBlock;

  if (!phone || !/^\+\d{10,15}$/.test(phone)) {
    return NextResponse.json({ message: "Invalid phone number." }, { status: 400 });
  }

  if (!otp || !/^\d{4,8}$/.test(otp)) {
    return NextResponse.json({ message: "Invalid OTP." }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ message: "OTP session is missing." }, { status: 400 });
  }

  if (mode !== "login" && mode !== "signup") {
    return NextResponse.json({ message: "Invalid mode." }, { status: 400 });
  }

  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "2Factor API key is missing." },
      { status: 500 }
    );
  }

  const baseUrl = process.env.TWOFACTOR_BASE_URL ?? "https://2factor.in/API/V1";
  const verifyUrl = `${baseUrl}/${apiKey}/SMS/VERIFY/${encodeURIComponent(
    sessionId
  )}/${encodeURIComponent(otp)}`;

  let verifyResponse: Response;
  let verifyData: { Status?: string; Details?: string } | null = null;
  try {
    verifyResponse = await fetch(verifyUrl, { cache: "no-store" });
    verifyData = (await verifyResponse.json().catch(() => null)) as
      | { Status?: string; Details?: string }
      | null;
  } catch (providerError: unknown) {
    console.error("OTP verification provider request failed:", providerError);
    return NextResponse.json(
      { message: "OTP service is temporarily unreachable. Please try again." },
      { status: 503 }
    );
  }

  if (!verifyResponse.ok || !verifyData || verifyData.Status !== "Success") {
    return NextResponse.json(
      { message: verifyData?.Details || "OTP verification failed." },
      { status: 400 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { message: "Service role key is missing." },
      { status: 500 }
    );
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    const variants = getPhoneVariants(phone);
    const userByProfilePhone = await findAuthUserByProfilePhone(adminClient, variants);
    const authUserByPhone = userByProfilePhone ? null : await findAuthUserByPhone(adminClient, variants);
    const existingUser = userByProfilePhone ?? authUserByPhone;

    if (!existingUser && mode === "login") {
      return NextResponse.json(
        { message: "User not found. Please create an account first." },
        { status: 404 }
      );
    }

    if (mode === "signup" && existingUser) {
      return NextResponse.json(
        { message: "Account already exists. Please sign in." },
        { status: 409 }
      );
    }

    let userId = existingUser?.id as string | undefined;

    if (!userId) {
      const { data: created, error: createError } =
        await adminClient.auth.admin.createUser({
          phone,
          phone_confirm: true,
        });

      if (createError || !created?.user?.id) {
        return NextResponse.json(
          { message: createError?.message || "Failed to create user." },
          { status: 500 }
        );
      }

      userId = created.user.id;
      console.log("✅ Auth user created");

      // The database triggers handle profile creation automatically:
      //   1. on_auth_user_created_profile → creates a profile (is_primary=true)
      // We fetch that profile and persist phone on profiles.

      // Wait briefly for triggers to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const fetchPrimaryProfile = async () => {
        const { data: byAuth, error: byAuthError } = await adminClient
          .from("profiles")
          .select("id")
          .eq("auth_id", userId)
          .eq("is_primary", true)
          .maybeSingle();
        if (!byAuthError && byAuth?.id) {
          return byAuth.id;
        }

        const { data: byUser, error: byUserError } = await adminClient
          .from("profiles")
          .select("id")
          .eq("user_id", userId)
          .eq("is_primary", true)
          .maybeSingle();
        if (!byUserError && byUser?.id) {
          return byUser.id;
        }

        return undefined;
      };

      let profileId = await fetchPrimaryProfile();

      if (!profileId) {
        // Fallback: create profile manually if trigger didn't fire
        console.warn("⚠️ Trigger didn't create profile, creating manually...");
        const payload = {
          auth_id: userId,
          user_id: userId,
          name: "Profile",
          avatar_type: "default",
          avatar_color: "#14b8a6",
          is_primary: true,
        };

        let manualProfileError: { message?: string } | null = null;
        let manualProfileId: string | undefined;

        const { data: manualProfileWithAuth, error: insertWithAuthError } = await adminClient
          .from("profiles")
          .insert(payload)
          .select("id")
          .single();

        if (!insertWithAuthError && manualProfileWithAuth?.id) {
          manualProfileId = manualProfileWithAuth.id;
        } else {
          const missingAuthColumn =
            insertWithAuthError?.message?.toLowerCase().includes("auth_id") ?? false;

          if (missingAuthColumn) {
            const { data: manualProfileLegacy, error: insertLegacyError } = await adminClient
              .from("profiles")
              .insert({
                user_id: userId,
                name: "Profile",
                avatar_type: "default",
                avatar_color: "#14b8a6",
                is_primary: true,
              })
              .select("id")
              .single();

            if (!insertLegacyError && manualProfileLegacy?.id) {
              manualProfileId = manualProfileLegacy.id;
            } else {
              manualProfileError = insertLegacyError;
            }
          } else {
            manualProfileError = insertWithAuthError;
          }
        }

        if (!manualProfileId) {
          console.error("❌ Failed to create profile:", manualProfileError);
          return NextResponse.json(
            { message: "Failed to create user profile.", error: manualProfileError },
            { status: 500 }
          );
        }

        profileId = manualProfileId;
        console.log("✅ Profile created manually:", profileId);
      } else {
        console.log("✅ Profile auto-created by trigger:", profileId);
      }

      if (!profileId) {
        return NextResponse.json(
          { message: "Failed to determine user profile." },
          { status: 500 }
        );
      }

      // Ensure profile row(s) carry phone for downstream lookups.
      const phonePayload = { phone, updated_at: new Date().toISOString() };
      let persistedPhone = false;

      const authUpdate = await adminClient
        .from("profiles")
        .update(phonePayload)
        .eq("auth_id", userId)
        .select("id");

      const missingAuthColumn =
        authUpdate.error?.code === "PGRST204" ||
        authUpdate.error?.message?.toLowerCase().includes("auth_id");

      if (!authUpdate.error && (authUpdate.data?.length ?? 0) > 0) {
        persistedPhone = true;
      }

      if (!persistedPhone) {
        const legacyUpdate = await adminClient
          .from("profiles")
          .update(phonePayload)
          .eq("user_id", userId)
          .select("id");
        if (!legacyUpdate.error && (legacyUpdate.data?.length ?? 0) > 0) {
          persistedPhone = true;
        } else if (legacyUpdate.error && !missingAuthColumn) {
          console.error("❌ Profiles phone update error:", legacyUpdate.error);
        }
      }

      if (!persistedPhone && profileId) {
        const byIdUpdate = await adminClient
          .from("profiles")
          .update(phonePayload)
          .eq("id", profileId);
        if (!byIdUpdate.error) {
          persistedPhone = true;
        } else {
          console.error("❌ Profiles phone update error:", byIdUpdate.error);
        }
      }

      if (persistedPhone) {
        console.log("✅ Profile phone ready");
      }
    } else {
      const { data: authUser, error: authError } =
        await adminClient.auth.admin.getUserById(userId);

      if (authError || !authUser?.user) {
        return NextResponse.json(
          {
            message:
              "Auth record is missing for this user. Please contact support.",
          },
          { status: 500 }
        );
      }
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json(
        { message: "Supabase JWT secret is missing." },
        { status: 500 }
      );
    }

    const jwtIssuer = process.env.SUPABASE_JWT_ISSUER || "supabase";

    const expiresInSeconds = Number.parseInt(
      process.env.SUPABASE_JWT_EXPIRES_IN_SECONDS || "",
      10
    );
    const ttl = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? expiresInSeconds
      : 60 * 60 * 24 * 30;

    const { token, expiresAt } = createSupabaseJwt({
      userId,
      phone,
      issuer: jwtIssuer,
      secret: jwtSecret,
      expiresInSeconds: ttl,
    });

    return NextResponse.json({
      access_token: token,
      refresh_token: "no-refresh",
      expires_at: expiresAt,
      expires_in: ttl,
      token_type: "bearer",
      user: { id: userId, phone },
    });
  } catch (error: unknown) {
    console.error("🚨 SIGNUP ERROR:", error);
    return NextResponse.json(
      { message: "Signup failed", error: getErrorMessage(error, "Unknown error") },
      { status: 500 }
    );
  }
}
