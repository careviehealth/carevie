"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/signup");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      Redirecting to signup...
    </div>
  );
}
