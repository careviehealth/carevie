import Navbar from "@/components/Navbar";
import ChatWidget from "@/components/ChatWidget";
import { AppProfileProvider } from "@/components/AppProfileProvider";
import { Suspense } from "react";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProfileProvider>
      <div className="vytara-theme-scope min-h-screen flex flex-col md:flex-row">
        <Navbar />
        <main className="vytara-theme-content flex-1 min-w-0">
          {children}
        </main>
        <Suspense fallback={null}>
          <ChatWidget />
        </Suspense>
        <div id="vytara-translate" className="vytara-translate-anchor" />
      </div>
    </AppProfileProvider>
  );
}
