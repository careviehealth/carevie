import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type OtpSendPayload = {
  phone?: string;
  mode?: "login" | "signup";
};

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

const getPhoneVariants = (phone: string) => {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  const variants = new Set<string>();

  if (normalized) variants.add(normalized);
  if (digits) variants.add(`+${digits}`);
  if (digits) variants.add(digits);
  if (digits.length === 10) {
    variants.add(`+91${digits}`);
    variants.add(`91${digits}`);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    variants.add(digits.slice(2));
    variants.add(`+${digits.slice(2)}`);
  }

  return Array.from(variants).map((value) => normalizePhone(value));
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
  const perPage = 1000;
  const maxPages = 50;

  while (page <= maxPages) {
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
    existingUserId = await findAuthUserIdByPhone(adminClient, variants);
    if (!existingUserId) {
      existingUserId = await findUserIdByProfilePhone(adminClient, variants);
    }
  } catch (lookupError: unknown) {
    return NextResponse.json(
      { message: getErrorMessage(lookupError, "Lookup failed.") },
      { status: 500 }
    );
  }

  if (mode === "login" && !existingUserId) {
    return NextResponse.json(
      { message: "User not found. Please create an account first." },
      { status: 404 }
    );
  }

  if (mode === "signup" && existingUserId) {
    return NextResponse.json(
      { message: "Account already exists. Please sign in." },
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

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.Status !== "Success") {
    return NextResponse.json(
      { message: data?.Details || "Failed to send OTP." },
      { status: 500 }
    );
  }

  return NextResponse.json({ sessionId: data.Details });
}
