import { NextRequest, NextResponse } from "next/server";
import { getBackendInternalHeaders } from "@/lib/backendInternalAuth";

/**
 * Resolve the Flask backend base URL, preferring localhost when the
 * incoming request originates from a local dev environment — mirroring
 * the strategy used by /api/medical/route.ts.
 */
function resolveBackendUrl(req: NextRequest): string {
  const hostname = req.nextUrl.hostname.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocal) {
    return "http://localhost:8000";
  }

  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:8000"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const backendUrl = resolveBackendUrl(req);

  try {
    const res = await fetch(`${backendUrl}/api/share/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getBackendInternalHeaders(),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ error: text }, { status: 500 });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Backend unreachable";
    return NextResponse.json(
      { error: `Backend connection failed: ${message}` },
      { status: 502 }
    );
  }
}
