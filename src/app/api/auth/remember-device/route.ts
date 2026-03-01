import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import {
  generateDeviceToken,
  hashDeviceToken,
  REMEMBER_DEVICE_COOKIE_NAME,
  rememberDeviceCookieClearOptions,
  rememberDeviceCookieOptions,
} from "@/lib/rememberDevice";

export const runtime = "nodejs";

type RememberDevicePayload = {
  action?: "register" | "remove";
  label?: string;
  deviceToken?: string;
  client?: "web" | "mobile";
};

const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const createAnonClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const extractBearerToken = (request: Request) => {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
};

const base64UrlToBuffer = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64");
};

const getVerifiedUserIdFromJwt = (token: string, secret: string) => {
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const signedPart = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPart)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(encodedSignature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlToBuffer(encodedPayload).toString("utf8")) as {
      sub?: string;
      exp?: number;
    };

    if (!payload.sub || typeof payload.sub !== "string") return null;

    if (typeof payload.exp === "number") {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const payload = (await request
    .json()
    .catch(() => null)) as RememberDevicePayload | null;

  if (payload?.action !== "register" && payload?.action !== "remove") {
    return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { message: "Service role key is missing." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const adminClient = createAdminClient();

  if (payload.action === "register") {
    const isMobileClient = payload.client === "mobile";
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

    let userId = "";
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!authError && user?.id) {
      userId = user.id;
    }

    if (!userId) {
      const bearerToken = extractBearerToken(request);
      if (bearerToken) {
        const jwtSecret = process.env.SUPABASE_JWT_SECRET;
        if (jwtSecret) {
          const verifiedUserId = getVerifiedUserIdFromJwt(bearerToken, jwtSecret);
          if (verifiedUserId) {
            userId = verifiedUserId;
          }
        }

        if (userId) {
          // skip auth API verification if JWT signature was validated locally
        } else {
        const anonClient = createAnonClient();
        const { data: authData, error: tokenError } = await anonClient.auth.getUser(bearerToken);
        if (!tokenError && authData.user?.id) {
          userId = authData.user.id;
        }
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const deviceToken = generateDeviceToken();
    const deviceTokenHash = hashDeviceToken(deviceToken);

    const { error } = await adminClient
      .from("remembered_devices")
      .upsert(
        {
          user_id: userId,
          device_token_hash: deviceTokenHash,
          label: payload.label ?? null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "device_token_hash" }
      );

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    if (isMobileClient) {
      return NextResponse.json({ ok: true, deviceToken });
    }

    cookieStore.set(
      REMEMBER_DEVICE_COOKIE_NAME,
      deviceToken,
      rememberDeviceCookieOptions
    );

    return NextResponse.json({ ok: true });
  }

  const existingDeviceToken =
    payload.deviceToken?.trim() || cookieStore.get(REMEMBER_DEVICE_COOKIE_NAME)?.value;

  if (existingDeviceToken) {
    const { error } = await adminClient
      .from("remembered_devices")
      .delete()
      .eq("device_token_hash", hashDeviceToken(existingDeviceToken));

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
  }

  cookieStore.set(
    REMEMBER_DEVICE_COOKIE_NAME,
    "",
    rememberDeviceCookieClearOptions
  );

  return NextResponse.json({ ok: true });
}
