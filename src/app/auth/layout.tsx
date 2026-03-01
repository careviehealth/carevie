import Plasma from "@/components/Plasma";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-slate-950">
      {/* Background layer */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <Plasma />
      </div>

      {/* Foreground */}
      {children}
    </div>
  );
}
