"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./ChatWidget.module.css";

export default function ChatWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await res.json();
      
      // Handle API-level failures (success: false)
      if (data?.success === false) {
        console.error('[ChatWidget] API returned error:', data);
        setMessages(prev => [
          ...prev,
          { role: "bot", content: data.reply || "Assistant is unavailable. Please try again later." },
        ]);
        return;
      }
      
      // Handle undefined or missing reply
      const reply = data?.reply;
      if (!reply) {
        console.error('[ChatWidget] No reply in response:', data);
        setMessages(prev => [
          ...prev,
          { role: "bot", content: "Assistant returned an empty response. Please try again." },
        ]);
        return;
      }
      
      setMessages(prev => [
        ...prev,
        { role: "bot", content: reply },
      ]);
    } catch (error) {
      console.error('[ChatWidget] Request failed:', error);
      setMessages(prev => [
        ...prev,
        { role: "bot", content: "Unable to process request." },
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
            <strong>G1 Assistant</strong>
            <span>Healthcare Support</span>
          </div>
          <button onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user"
                ? styles.user
                : styles.bot}
            >
              {m.content}
            </div>
          ))}

          {loading && (
            <div className={styles.bot}>Analyzing…</div>
          )}
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
