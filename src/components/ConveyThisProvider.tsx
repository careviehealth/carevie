"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const conveyThisKey = process.env.NEXT_PUBLIC_CONVEYTHIS_API_KEY;

export default function ConveyThisProvider() {
  const pathname = usePathname();

  if (!conveyThisKey) return null;
  if (!pathname) return null;

  const shouldSkip =
    pathname.startsWith("/auth") || pathname === "/app/health-onboarding";

  if (shouldSkip) return null;

  return (
    <Script
      id="conveythis-script"
      src={`https://cdn.conveythis.com/javascript/conveythis.js?api_key=${conveyThisKey}`}
      strategy="lazyOnload"
    />
  );
}
