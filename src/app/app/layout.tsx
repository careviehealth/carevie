import Navbar from "@/components/Navbar";
import AppTourController from "@/components/AppTourController";
import ThemeBootstrap from "@/components/ThemeBootstrap";
import { Suspense } from "react";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="vytara-theme-scope min-h-screen flex flex-col md:flex-row">
      <ThemeBootstrap />
      <Suspense fallback={null}>
        <AppTourController />
      </Suspense>
      <Navbar />
      <main className="vytara-theme-content flex-1 min-w-0">
        {children}
      </main>
      <div id="vytara-translate" className="vytara-translate-anchor" />
    </div>
  );
}
