"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronDown, MoreVertical } from "lucide-react";
import Plasma from "@/components/Plasma";
import { supabase } from "@/lib/createClient";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from "@/lib/countries";

/* ========================= LOGIN PAGE ========================= */

type RememberedAccount = {
  userId: string;
  name: string;
  phone: string;
  email?: string | null;
  avatarUrl?: string | null;
};

const REMEMBERED_ACCOUNT_KEY = "vytara_remembered_account";

/** Safe redirect path after login: must be under /app to avoid open redirect */
function getPostLoginPath(returnTo: string | null): string {
  if (!returnTo || typeof returnTo !== "string") return "/app/homepage";
  const path = returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
  return path.startsWith("/app") ? path : "/app/homepage";
}

type LoginClientProps = {
  returnTo: string | null;
};

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    const normalizedMessage = error.message.toLowerCase();
    if (
      normalizedMessage.includes("failed to fetch") ||
      normalizedMessage.includes("networkerror") ||
      normalizedMessage.includes("load failed")
    ) {
      return fallback;
    }
    return error.message;
  }
  return fallback;
};

export default function LoginClient({ returnTo }: LoginClientProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(0);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [rememberedAccount, setRememberedAccount] =
    useState<RememberedAccount | null>(null);
  const [rememberMenuOpen, setRememberMenuOpen] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState("");
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const rememberMenuRef = useRef<HTMLDivElement | null>(null);
  const countryDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    const stored = window.localStorage.getItem(REMEMBERED_ACCOUNT_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as RememberedAccount;
      if (parsed?.userId && parsed?.name && parsed?.phone) {
        window.setTimeout(() => setRememberedAccount(parsed), 0);
      }
    } catch {
      window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!rememberMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rememberMenuRef.current && !rememberMenuRef.current.contains(event.target as Node)) {
        setRememberMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [rememberMenuOpen]);

  useEffect(() => {
    if (!countryDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [countryDropdownOpen]);

  const formattedPhone = `${selectedCountry.dialCode}${phone}`;

  const resolveDisplayName = async (userId: string, fallback: string) => {
    const { data: authProfiles, error: authProfilesError } = await supabase
      .from("profiles")
      .select("display_name, name")
      .eq("auth_id", userId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (!authProfilesError && authProfiles?.[0]) {
      return authProfiles[0].display_name?.trim() || authProfiles[0].name?.trim() || fallback;
    }

    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("display_name, name")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    return userProfiles?.[0]?.display_name?.trim() || userProfiles?.[0]?.name?.trim() || fallback;
  };

  const saveRememberedAccount = (account: RememberedAccount) => {
    window.localStorage.setItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify(account));
    setRememberedAccount(account);
  };

  const removeRememberedAccount = async () => {
    try {
      await fetch("/api/auth/remember-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
        }),
      });
    } catch {
      // Keep local cleanup even if network requests fail.
    }
    window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
    setRememberedAccount(null);
    setRememberMenuOpen(false);
  };

  const handleContinueAs = async () => {
    if (!rememberedAccount) return;
    setError("");
    setContinueLoading(true);

    let consumeResponse: Response;
    try {
      consumeResponse = await fetch("/api/auth/remember-device/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: rememberedAccount.userId,
        }),
      });
    } catch {
      setContinueLoading(false);
      setError("Couldn't verify saved login. Please sign in again.");
      return;
    }

    if (!consumeResponse.ok) {
      setContinueLoading(false);
      setError("Saved login expired. Please sign in again.");
      await removeRememberedAccount();
      return;
    }

    setContinueLoading(false);
    router.push(getPostLoginPath(returnTo));
  };

  const sendOtp = async () => {
    setError("");

    const digitsOnly = phone.replace(/\D/g, "");
    const isIndia = selectedCountry.code === "IN";
    const minLen = isIndia ? INDIA_PHONE_DIGITS : 10;
    if (digitsOnly.length < minLen || digitsOnly.length > PHONE_MAX_DIGITS) {
      setError(
        isIndia
          ? "Please enter a valid 10-digit phone number."
          : "Please enter a valid phone number (10–15 digits)."
      );
      return;
    }

    let response: Response;
    try {
      setLoading(true);
      response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone, mode: "login" }),
      });
    } catch (requestError: unknown) {
      setError(
        getRequestErrorMessage(
          requestError,
          "Unable to reach the server. Please check your connection and try again."
        )
      );
      return;
    } finally {
      setLoading(false);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setError(
        errorData?.message ||
          "Failed to send OTP. Please check the number and try again."
      );
      return;
    }

    const responseData = await response.json().catch(() => null);
    if (!responseData?.sessionId) {
      setError("Failed to start OTP verification.");
      return;
    }

    setOtpSessionId(responseData.sessionId);
    setStep("otp");
    setTimer(60);
  };

  const verifyOtp = async () => {
    setError("");

    const otp = otpDigits.join("");
    if (otp.length !== 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    if (!otpSessionId) {
      setError("Please request a new OTP.");
      return;
    }

    let response: Response;
    try {
      setLoading(true);
      response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formattedPhone,
          otp,
          sessionId: otpSessionId,
          mode: "login",
        }),
      });
    } catch (requestError: unknown) {
      setError(
        getRequestErrorMessage(
          requestError,
          "Unable to reach the server. Please check your connection and try again."
        )
      );
      return;
    } finally {
      setLoading(false);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setError(errorData?.message || "Invalid OTP. Please try again.");
      return;
    }

    const responseData = await response.json().catch(() => null);
    if (!responseData?.access_token || !responseData?.refresh_token) {
      setError("Could not start session. Please try again.");
      return;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: responseData.access_token,
      refresh_token: responseData.refresh_token,
    });

    if (error || !data?.user) {
      setError(error?.message || "Could not start session.");
      return;
    }

    if (rememberDevice) {
      const fallbackName = data.user.phone ?? formattedPhone;
      const displayName = await resolveDisplayName(data.user.id, fallbackName);
      const registerResponse = await fetch("/api/auth/remember-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          label: navigator.userAgent,
        }),
      });

      if (!registerResponse.ok) {
        setError("Couldn't save this device. You can still log in.");
      } else {
        saveRememberedAccount({
          userId: data.user.id,
          name: displayName,
          phone: data.user.phone ?? formattedPhone,
          email: data.user.email ?? null,
          avatarUrl: null,
        });
      }
    }

    router.push(getPostLoginPath(returnTo));
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center relative bg-slate-950 overflow-hidden">
      <Plasma />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          <div className="h-2 bg-gradient-to-r from-[#14b8a6] to-[#134E4A]" />

          <div className="p-8">
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

            <h1 className="text-center text-[#14b8a6] text-3xl font-bold mb-1">
              Login with Phone
            </h1>
            <p className="text-center text-gray-500 mb-8 text-sm">
              {step === "phone"
                ? "We'll send a one-time password"
                : `Enter the OTP sent to ${selectedCountry.dialCode} ${phone}`}
            </p>

            {rememberedAccount && (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
                      {rememberedAccount.avatarUrl ? (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          role="img"
                          aria-label={`${rememberedAccount.name} avatar`}
                          style={{
                            backgroundImage: `url(${rememberedAccount.avatarUrl})`,
                          }}
                        />
                      ) : (
                        (rememberedAccount.name.trim().charAt(0) || "U").toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Saved account
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        {rememberedAccount.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {rememberedAccount.email?.trim() || rememberedAccount.phone}
                      </p>
                    </div>
                  </div>
                  <div className="relative" ref={rememberMenuRef}>
                    <button
                      type="button"
                      onClick={() => setRememberMenuOpen((v) => !v)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-white"
                      aria-label="Saved account options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {rememberMenuOpen && (
                      <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 bg-white shadow-lg">
                        <button
                          type="button"
                          onClick={removeRememberedAccount}
                          className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Remove account
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleContinueAs}
                  disabled={continueLoading}
                  className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:opacity-70"
                >
                  {continueLoading ? "Checking..." : `Continue as ${rememberedAccount.name}`}
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (loading) return;
                if (step === "phone") {
                  sendOtp();
                } else {
                  verifyOtp();
                }
              }}
            >
              {step === "phone" && (
                <>
                  <div className="flex mb-4" ref={countryDropdownRef}>
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setCountryDropdownOpen((v) => !v)}
                        className="flex items-center gap-1 px-3 py-3 bg-gray-100 border-2 border-r-0 border-gray-100 rounded-l-xl text-gray-700 font-semibold text-sm hover:bg-gray-200 focus:border-[#14b8a6] focus:outline-none cursor-pointer min-w-[5.5rem]"
                        aria-label="Country code"
                        aria-expanded={countryDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        <span>{selectedCountry.dialCode}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${countryDropdownOpen ? "rotate-180" : ""}`} />
                      </button>
                      {countryDropdownOpen && (
                        <div
                          className="absolute left-0 top-full z-50 mt-1 w-64 bg-white border-2 border-gray-200 rounded-xl shadow-lg overflow-hidden"
                          role="listbox"
                        >
                          <div className="max-h-[280px] overflow-y-auto overscroll-contain py-1">
                            {COUNTRIES.map((c) => (
                              <button
                                key={c.code}
                                type="button"
                                role="option"
                                aria-selected={c.code === selectedCountry.code}
                                onClick={() => {
                                  setSelectedCountry(c);
                                  setCountryDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${c.code === selectedCountry.code ? "bg-teal-50 text-[#0f766e] font-semibold" : "text-gray-700"}`}
                              >
                                {c.name} ({c.dialCode})
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "");
                        if (digitsOnly.length <= PHONE_MAX_DIGITS) setPhone(digitsOnly);
                      }}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-r-xl focus:border-[#14b8a6] focus:bg-white focus:outline-none transition-all text-black"
                    />
                  </div>

                <label className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#14b8a6] focus:ring-[#14b8a6]"
                  />
                  Save this account on this device
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-br from-[#14b8a6] to-[#0f766e] text-white py-3.5 rounded-xl font-bold shadow-lg shadow-teal-900/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                    {loading ? "Sending OTP..." : "Request OTP"}
                  </button>
                </>
              )}

              {step === "otp" && (
                <>
                  <div
                    className="flex items-center justify-between gap-2 mb-4"
                    onPaste={(e) => {
                      const text = e.clipboardData
                        .getData("text")
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      if (!text) return;
                      e.preventDefault();
                      const next = Array(6).fill("");
                      text.split("").forEach((char, idx) => {
                        next[idx] = char;
                      });
                      setOtpDigits(next);
                      otpRefs.current[Math.min(text.length, 6) - 1]?.focus();
                    }}
                  >
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        value={digit}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "").slice(-1);
                          const next = [...otpDigits];
                          next[idx] = value;
                          setOtpDigits(next);
                          if (value && idx < 5) {
                            otpRefs.current[idx + 1]?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
                            otpRefs.current[idx - 1]?.focus();
                          }
                          if (e.key === "ArrowLeft" && idx > 0) {
                            otpRefs.current[idx - 1]?.focus();
                          }
                          if (e.key === "ArrowRight" && idx < 5) {
                            otpRefs.current[idx + 1]?.focus();
                          }
                        }}
                        className="w-11 h-12 text-center text-lg font-semibold bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-[#14b8a6] focus:bg-white focus:outline-none transition-all text-black"
                        aria-label={`OTP digit ${idx + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-br from-[#14b8a6] to-[#0f766e] text-white py-3.5 rounded-xl font-bold shadow-lg shadow-teal-900/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    {loading ? "Verifying..." : "Verify & Continue"}
                  </button>
                  {timer > 0 ? (
                    <p className="mt-3 text-xs text-gray-400 text-center">
                      Resend available in {timer}s
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={sendOtp}
                      className="mt-3 text-xs text-[#14b8a6] font-semibold hover:underline block mx-auto"
                    >
                      Resend OTP
                    </button>
                  )}
                </>
              )}

              {error && (
                <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
              )}
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                Don&apos;t have an account?{" "}
                <button
                  className="text-[#14b8a6] font-bold hover:underline"
                  type="button"
                  onClick={() => router.push("/auth/signup")}
                >
                  Create Account
                </button>
              </p>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
