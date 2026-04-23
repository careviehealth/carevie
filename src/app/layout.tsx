import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "driver.js/dist/driver.css";

import ChatWidget from "@/components/ChatWidget";
import ConveyThisProvider from "@/components/ConveyThisProvider";
import FeedbackTab from "@/components/FeedbackTab";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { AppNotifier } from "@/components/AppNotifier";
import { AppProfileProvider } from "@/components/AppProfileProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carevie Health",
  description: "Carevie Health a platform for all your healthcare related work",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative min-h-screen overflow-x-hidden`}
      >
        <AppProfileProvider>
          {measurementId ? (
            <Suspense fallback={null}>
              <GoogleAnalytics measurementId={measurementId} />
            </Suspense>
          ) : null}

          {/* ConveyThis (loads once globally) */}
          <ConveyThisProvider />

          {/* App pages */}
          {children}

          {/* Chat widget */}
          <Suspense fallback={null}>
            <ChatWidget />
          </Suspense>

          <Suspense fallback={null}>
            <FeedbackTab />
          </Suspense>

          <AppNotifier />
        </AppProfileProvider>
      </body>
    </html>
  );
}
