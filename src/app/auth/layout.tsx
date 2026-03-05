import Plasma from "@/components/Plasma";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-slate-950">
      {/* Background layer */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <Plasma />
      </div>

      <div className="fixed left-4 top-4 z-20 sm:left-6 sm:top-6">
        <Link
          href="/landing-page"
          className="inline-flex items-center rounded-full border border-white/30 bg-black/25 px-4 py-2 text-xs font-semibold tracking-wide text-white backdrop-blur transition hover:bg-black/40 sm:text-sm"
        >
          ← Back to Landing Page
        </Link>
      </div>

      {/* Foreground */}
      {children}
    </div>
  );
}
