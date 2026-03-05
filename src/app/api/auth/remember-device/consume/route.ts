import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseJwt } from "@/lib/supabaseJwt";
import {
  generateDeviceToken,
  hashDeviceToken,
  REMEMBER_DEVICE_COOKIE_NAME,
  rememberDeviceCookieClearOptions,
  rememberDeviceCookieOptions,
} from "@/lib/rememberDevice";
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';

const consumeLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 10 });

export const runtime = "nodejs";

type ConsumeRememberDevicePayload = {
  userId?: string;
  deviceToken?: string;
  client?: "web" | "mobile";
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const clearRememberCookie = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  cookieStore.set(
    REMEMBER_DEVICE_COOKIE_NAME,
    "",
    rememberDeviceCookieClearOptions
  );
};

const failedRememberResponse = (status = 401) =>
  NextResponse.json(
    { message: "Saved login expired. Please sign in again." },
    { status }
  );

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const block = consumeLimiter.check(ip);
  if (block) return block;

  const payload = (await request
    .json()
    .catch(() => null)) as ConsumeRememberDevicePayload | null;
  const isMobileClient = payload?.client === "mobile";
  const expectedUserId = payload?.userId?.trim() || null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { message: "Service role key is missing." },
      { status: 500 }
    );
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    return NextResponse.json(
      { message: "Supabase JWT secret is missing." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const adminClient = createAdminClient();

  const existingDeviceToken =
    payload?.deviceToken?.trim() || cookieStore.get(REMEMBER_DEVICE_COOKIE_NAME)?.value;
  if (!existingDeviceToken) {
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return failedRememberResponse();
  }

  const existingDeviceTokenHash = hashDeviceToken(existingDeviceToken);

  const { data: rememberedDevice, error: lookupError } = await adminClient
    .from("remembered_devices")
    .select("user_id")
    .eq("device_token_hash", existingDeviceTokenHash)
    .maybeSingle();

  if (lookupError) {
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return NextResponse.json({ message: lookupError.message }, { status: 500 });
  }

  if (!rememberedDevice?.user_id) {
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return failedRememberResponse();
  }

  if (expectedUserId && rememberedDevice.user_id !== expectedUserId) {
    await adminClient
      .from("remembered_devices")
      .delete()
      .eq("device_token_hash", existingDeviceTokenHash);
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return failedRememberResponse();
  }

  const rotatedToken = generateDeviceToken();
  const rotatedTokenHash = hashDeviceToken(rotatedToken);

  const { data: rotatedDevice, error: rotateError } = await adminClient
    .from("remembered_devices")
    .update({
      device_token_hash: rotatedTokenHash,
      last_used_at: new Date().toISOString(),
    })
    .eq("device_token_hash", existingDeviceTokenHash)
    .select("user_id")
    .maybeSingle();

  if (rotateError) {
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return NextResponse.json({ message: rotateError.message }, { status: 500 });
  }

  if (!rotatedDevice?.user_id) {
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return failedRememberResponse();
  }

  const userId = rotatedDevice.user_id;
  const { data: authUserData, error: authUserError } =
    await adminClient.auth.admin.getUserById(userId);
  const phone = authUserData?.user?.phone?.trim() || "";

  if (authUserError || !phone) {
    await adminClient
      .from("remembered_devices")
      .delete()
      .eq("device_token_hash", rotatedTokenHash);
    if (!isMobileClient) {
      clearRememberCookie(cookieStore);
    }
    return failedRememberResponse();
  }

  const sessionTtl = parsePositiveInt(
    process.env.REMEMBER_DEVICE_SESSION_TTL_SECONDS ??
      process.env.SUPABASE_JWT_EXPIRES_IN_SECONDS,
    60 * 60 * 24 * 7
  );

  const { token, expiresAt } = createSupabaseJwt({
    userId,
    phone,
    issuer: process.env.SUPABASE_JWT_ISSUER || "supabase",
    secret: jwtSecret,
    expiresInSeconds: sessionTtl,
  });

  if (isMobileClient) {
    return NextResponse.json({
      ok: true,
      userId,
      access_token: token,
      refresh_token: "no-refresh",
      expires_at: expiresAt,
      expires_in: sessionTtl,
      token_type: "bearer",
      deviceToken: rotatedToken,
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: "no-refresh",
  });

  if (sessionError || !sessionData.session) {
    await adminClient
      .from("remembered_devices")
      .delete()
      .eq("device_token_hash", rotatedTokenHash);
    clearRememberCookie(cookieStore);
    return failedRememberResponse(500);
  }

  cookieStore.set(
    REMEMBER_DEVICE_COOKIE_NAME,
    rotatedToken,
    rememberDeviceCookieOptions
  );

  return NextResponse.json({ ok: true, userId, expiresAt });
}
