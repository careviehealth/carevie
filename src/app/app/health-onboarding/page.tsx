import { Suspense } from "react";
import HealthOnboardingChatbot from "@/components/HealthOnboardingChatbot";

export default function HealthOnboardingPage() {
  return (
    <div className="min-h-screen w-full text-slate-900">
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
        <HealthOnboardingChatbot />
      </Suspense>
    </div>
  );
}
