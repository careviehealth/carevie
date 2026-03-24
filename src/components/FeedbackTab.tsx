"use client";

import { useState } from "react";
import FeedbackPanel from "@/components/FeedbackPanel";

export default function FeedbackTab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open feedback panel"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-30 flex h-36 w-12 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-slate-200 bg-white shadow-lg transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span className="block -rotate-90 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">
          Feedback
        </span>
      </button>

      <FeedbackPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
