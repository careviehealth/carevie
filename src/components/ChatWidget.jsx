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

// ── Quick-action button definitions ────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    label: "📋 Get Summary",
    message: "Give me a summary of my medical profile.",
  },
  {
    label: "💊 My Medications",
    message: "What medications am I currently on?",
  },
  {
    label: "📅 Next Appointment",
    message: "When is my next appointment?",
  },
];

export default function ChatWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { userId, selectedProfile } = useAppProfile();
  const [isEmbeddedInIframe, setIsEmbeddedInIframe] = useState(false);
  const [hiddenByParentModal, setHiddenByParentModal] = useState(false);
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);
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
      setFullscreen(false);
    }
  }, [hiddenByParentModal, isEmbeddedLegalModal, isEmbeddedInIframe]);

  // Lock body scroll when fullscreen is open
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  // Close fullscreen on Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Focus textarea when opening fullscreen
  useEffect(() => {
    if (fullscreen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [fullscreen]);

  if (hiddenByParentModal || isEmbeddedLegalModal || isEmbeddedInIframe) {
    return null;
  }

  function handleClose() {
    setOpen(false);
    setFullscreen(false);
  }

  function handleExpand() {
    setFullscreen(true);
    setOpen(true);
  }

  function handleCollapse() {
    setFullscreen(false);
    setOpen(true);
  }

  // ── Core send logic ────────────────────────────────────────────────────────
  async function sendMessage(overrideText) {
    const text = typeof overrideText === "string" ? overrideText : input;
    if (!text.trim() || loading) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const profileId = userId ? (selectedProfile?.id ?? "") : "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          profile_id: profileId,
        }),
      });

      const data = await res.json();

      const reply = data?.reply;

      if (reply && typeof reply === "string" && reply.trim()) {
        setMessages(prev => [...prev, { role: "bot", content: reply }]);
        return;
      }

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

  const showQuickActions = messages.length === 0 && !loading;

  // ── Shared chat body (used in both floating and fullscreen) ────────────────
  const chatBody = (
    <>
      {/* Messages */}
      <div className={styles.messages}>
        {showQuickActions && (
          <div className={styles.quickActions}>
            <p className={styles.quickActionsLabel}>Quick actions</p>
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                className={styles.quickActionBtn}
                onClick={() => sendMessage(action.message)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? styles.user : styles.bot}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className={styles.bot}>
            <span className={styles.typingDots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className={styles.input}>
        <textarea
          ref={inputRef}
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
        <button onClick={() => sendMessage()} aria-label="Send message">
          Send
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ── Fullscreen overlay ── */}
      {fullscreen && (
        <div
          className={styles.fsBackdrop}
          onClick={(e) => {
            // Close if clicking the backdrop itself, not the panel
            if (e.target === e.currentTarget) handleCollapse();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Carevie Assistant fullscreen"
        >
          <div className={styles.fsPanel}>
            {/* Fullscreen header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.headerAvatar}>CA</div>
                <div>
                  <strong>Carevie Assistant</strong>
                  <span>Healthcare Support</span>
                </div>
              </div>
              <div className={styles.headerActions}>
                <button
                  className={styles.collapseBtn}
                  onClick={handleCollapse}
                  aria-label="Collapse to floating window"
                  title="Collapse"
                >
                  {/* Collapse icon: inward arrows */}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="10" y1="14" x2="3" y2="21" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                  </svg>
                </button>
                <button
                  className={styles.closeBtn}
                  onClick={handleClose}
                  aria-label="Close assistant"
                >
                  ✕
                </button>
              </div>
            </div>

            {chatBody}
          </div>
        </div>
      )}

      {/* ── Floating button (always visible unless fullscreen) ── */}
      {!fullscreen && (
        <button
          className={styles.fab}
          onClick={() => setOpen(o => !o)}
          aria-label="Open assistant"
        >
          <span className={styles.chatIcon} />
        </button>
      )}

      {/* ── Floating window ── */}
      {!fullscreen && (
        <div
          className={`${styles.window} ${open ? styles.open : styles.closed}`}
        >
          {/* Floating header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div>
                <strong>Carevie Assistant</strong>
                <span>Healthcare Support</span>
              </div>
            </div>
            <div className={styles.headerActions}>
              {/* Expand to fullscreen button */}
              <button
                className={styles.expandBtn}
                onClick={handleExpand}
                aria-label="Expand to fullscreen"
                title="Fullscreen"
              >
                {/* Expand icon: outward arrows */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button
                className={styles.closeBtn}
                onClick={handleClose}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {chatBody}
        </div>
      )}
    </>
  );
}