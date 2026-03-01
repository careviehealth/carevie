"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ChatWidget.module.css";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
      setMessages(prev => [
        ...prev,
        { role: "bot", content: data.reply || "No response available." },
      ]);
    } catch {
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
