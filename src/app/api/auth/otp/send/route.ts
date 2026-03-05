import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';

export const runtime = "nodejs";

type OtpSendPayload = {
  phone?: string;
  mode?: "login" | "signup";
};

const ipLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 10 });
const phoneLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });

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

const findAuthUserIdByPhone = async (
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
      return match.id;
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

const findUserIdByProfilePhone = async (
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
  if (userLookupError || !userLookup?.user?.id) {
    return null;
  }

  return userLookup.user.id;
};

export async function POST(request: Request) {
  const ip = getClientIP(request as any);
  const ipBlock = ipLimiter.check(ip);
  if (ipBlock) return ipBlock;

  let payload: OtpSendPayload | null = null;
  try {
    payload = (await request.json()) as OtpSendPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const rawPhone = payload?.phone ?? "";
  const phone = normalizePhone(rawPhone);
  const mode = payload?.mode;

  if (!phone || !/^\+\d{10,15}$/.test(phone)) {
    return NextResponse.json({ message: "Invalid phone number." }, { status: 400 });
  }

  const phoneBlock = phoneLimiter.check(phone);
  if (phoneBlock) return phoneBlock;

  if (mode !== "login" && mode !== "signup") {
    return NextResponse.json({ message: "Invalid mode." }, { status: 400 });
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

  const variants = getPhoneVariants(phone);
  let existingUserId: string | null = null;
  try {
    existingUserId = await findUserIdByProfilePhone(adminClient, variants);
    if (!existingUserId) {
      existingUserId = await findAuthUserIdByPhone(adminClient, variants);
    }
  } catch (lookupError: unknown) {
    return NextResponse.json(
      { message: getErrorMessage(lookupError, "Lookup failed.") },
      { status: 500 }
    );
  }

  if (mode === "login" && !existingUserId) {
    return NextResponse.json(
      { message: "No account found with this number." },
      { status: 404 }
    );
  }

  if (mode === "signup" && existingUserId) {
    return NextResponse.json(
      { message: "This number is already registered." },
      { status: 409 }
    );
  }

  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "2Factor API key is missing." },
      { status: 500 }
    );
  }

  const template = process.env.TWOFACTOR_TEMPLATE;
  const baseUrl = process.env.TWOFACTOR_BASE_URL ?? "https://2factor.in/API/V1";
  const url =
    `${baseUrl}/${apiKey}/SMS/${encodeURIComponent(phone)}/AUTOGEN` +
    (template ? `/${encodeURIComponent(template)}` : "");

  let response: Response;
  let data: { Status?: string; Details?: string } | null = null;
  try {
    response = await fetch(url, { cache: "no-store" });
    data = (await response.json().catch(() => null)) as { Status?: string; Details?: string } | null;
  } catch (providerError: unknown) {
    console.error("OTP provider request failed:", providerError);
    return NextResponse.json(
      { message: "OTP service is temporarily unreachable. Please try again." },
      { status: 503 }
    );
  }

  if (!response.ok || !data || data.Status !== "Success") {
    return NextResponse.json(
      { message: data?.Details || "Failed to send OTP." },
      { status: 500 }
    );
  }

  return NextResponse.json({ sessionId: data.Details });
}
