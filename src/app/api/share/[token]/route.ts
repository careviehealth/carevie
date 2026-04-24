import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  const res = await fetch(`${backendUrl}/api/share/${token}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const text = await res.text();

  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: text }, { status: 500 });
  }
}
