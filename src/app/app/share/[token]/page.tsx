"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function SharePage() {
  const { token } = useParams();
  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "not_found" | "error">("loading");
  const [data, setData] = useState<{ profile_id: string; expires_at: string } | null>(null);

  useEffect(() => {
    if (!token) return;

    const check = async () => {
      try {
        const res = await fetch(`/api/share/${token}`);
        const json = await res.json();

        if (res.status === 404) {
          setStatus("not_found");
        } else if (res.status === 410) {
          setStatus("expired");
        } else if (json.valid) {
          setStatus("valid");
          setData(json);
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    };

    check();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-lg">Checking link...</p>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full mx-4">
          <p className="text-6xl mb-4">⏰</p>
          <h1 className="text-2xl font-bold text-red-500 mb-2">Link Expired</h1>
          <p className="text-slate-500 text-sm">
            This QR code has expired. Please ask the user to generate a new one.
          </p>
        </div>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full mx-4">
          <p className="text-6xl mb-4">❌</p>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Link Not Found</h1>
          <p className="text-slate-500 text-sm">This link does not exist or has already been deleted.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full mx-4">
          <p className="text-6xl mb-4">⚠️</p>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h1>
          <p className="text-slate-500 text-sm">Please try again later.</p>
        </div>
      </div>
    );
  }

  // status === "valid"
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full mx-4">
        <p className="text-6xl mb-4 text-center">✅</p>
        <h1 className="text-2xl font-bold text-slate-800 text-center mb-6">
          Profile Summary
        </h1>
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <p className="text-xs text-slate-400 mb-1">Profile ID</p>
          <p className="text-slate-800 font-mono text-sm break-all">{data?.profile_id}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4">
          <p className="text-xs text-slate-400 mb-1">Link expires at</p>
          <p className="text-slate-800 text-sm">
            {data?.expires_at ? new Date(data.expires_at).toLocaleString() : "—"}
          </p>
        </div>
        {/* 
          Your teammate builds the full summary UI here.
          They can use data.profile_id to fetch whatever they need.
        */}
      </div>
    </div>
  );
}
