import { createHmac } from "crypto";

type SupabaseJwtOptions = {
  userId: string;
  phone: string;
  issuer: string;
  secret: string;
  expiresInSeconds: number;
};

const base64UrlEncode = (input: string | Buffer) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export const createSupabaseJwt = ({
  userId,
  phone,
  issuer,
  secret,
  expiresInSeconds,
}: SupabaseJwtOptions) => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    phone,
    iss: issuer,
    iat: now,
    exp,
    app_metadata: { provider: "phone", providers: ["phone"] },
    user_metadata: {},
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return {
    token: `${data}.${signature}`,
    expiresAt: exp,
  };
};
