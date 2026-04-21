"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./ChatWidget.module.css";
import { useAppProfile } from "./AppProfileProvider";

// SECURITY NOTE — profile_id trust model
// ─────────────────────────────────────────────────────────────────────────────
// profile_id IS sent from the client because this system supports family/care-
// circle profiles: an authenticated user may legitimately query a profile that
// is not their own (e.g. a family member they manage).
//
// The server enforces two layers of protection:
//   1. route.ts  — nullifies profile_id for unauthenticated users, so an
//                  unauthenticated attacker can never supply a profile_id that
//                  reaches the data layer.
//   2. Supabase RLS — ensures an authenticated user's session token can only
//                     read rows belonging to profiles they are authorised for.
//
// profile_id here comes from AppProfileProvider (the user's selected profile),
// NOT from any user-editable input field.

export default function ChatWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { userId, selectedProfile } = useAppProfile();
  const [isEmbeddedInIframe, setIsEmbeddedInIframe] = useState(false);
  const [hiddenByParentModal, setHiddenByParentModal] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const endRef = useRef(null);
  const isEmbeddedLegalModal =
    pathname?.startsWith("/legal/") && searchParams?.get("view") === "modal";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsEmbeddedInIframe(window.self !== window.top);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncHiddenState = () => {
      setHiddenByParentModal(document.body.dataset.hideChatWidget === "true");
    };

    syncHiddenState();
    const observer = new MutationObserver(syncHiddenState);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-hide-chat-widget"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (hiddenByParentModal || isEmbeddedLegalModal || isEmbeddedInIframe) {
      setOpen(false);
    }
  }, [hiddenByParentModal, isEmbeddedLegalModal, isEmbeddedInIframe]);

  if (hiddenByParentModal || isEmbeddedLegalModal || isEmbeddedInIframe) {
    return null;
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // profile_id comes from AppProfileProvider (the selected care profile),
    // not from any user-editable field. Empty string for unauthenticated users
    // — route.ts will nullify it server-side anyway.
    const profileId = userId ? (selectedProfile?.id ?? "") : "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          profile_id: profileId,
        }),
      });

      const data = await res.json();

      // ── Reply resolution ────────────────────────────────────────────────
      // `success: false` from the backend is NOT a system error — it is a
      // legitimate assistant response (e.g. "no records found", "please log
      // in", "out of scope question"). Always show `reply` when present,
      // regardless of the `success` flag.
      //
      // Only fall back to a generic message when the response contains no
      // `reply` field at all (unexpected system-level failure).
      const reply = data?.reply;

      if (reply && typeof reply === "string" && reply.trim()) {
        setMessages(prev => [...prev, { role: "bot", content: reply }]);
        return;
      }

      // No reply field — unexpected failure.
      console.error("[ChatWidget] Response contained no reply:", data);
      setMessages(prev => [
        ...prev,
        {
          role: "bot",
          content: "Assistant returned an empty response. Please try again.",
        },
      ]);
    } catch (error) {
      console.error("[ChatWidget] Request failed:", error);
      setMessages(prev => [
        ...prev,
        {
          role: "bot",
          content:
            "Unable to reach the assistant. Please check your connection and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating Button */}
      <button
        className={styles.fab}
        onClick={() => setOpen(o => !o)}
        aria-label="Open assistant"
      >
        <span className={styles.chatIcon} />
      </button>

      <div
        className={`${styles.window} ${open ? styles.open : styles.closed}`}
      >
        {/* Header */}
        <div className={styles.header}>
          <div>
            <strong>Carevie Assistant</strong>
            <span>Healthcare Support</span>
          </div>
          <button onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? styles.user : styles.bot}
            >
              {m.content}
            </div>
          ))}

          {loading && <div className={styles.bot}>Analyzing…</div>}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className={styles.input}>
          <textarea
            placeholder="Ask about records, care, or emergencies…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </>
  );
}