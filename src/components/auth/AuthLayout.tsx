"use client";

import Image from "next/image";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export default function AuthLayout({
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <main className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Auth Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          {/* Top Accent Bar */}
          <div className="h-2 bg-gradient-to-r from-[#14b8a6] to-[#134E4A]" />

          <div className="p-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <Image
                src="/vytara-logo.png"
                alt="G1 Logo"
                width={96}
                height={96}
                className="w-24 h-24"
                priority
              />
            </div>

            {/* Title */}
            <h1 className="text-center text-[#14b8a6] text-3xl font-bold mb-1">
              {title}
            </h1>

            {/* Subtitle */}
            <p className="text-center text-gray-500 mb-8 text-sm">
              {subtitle}
            </p>

            {/* Page Content */}
            <div className="space-y-5">
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
