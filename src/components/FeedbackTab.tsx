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
        className="fixed right-0 top-1/2 z-30 -translate-y-1/2 translate-x-[36%] rounded-t-xl rounded-b-xl border border-slate-200 bg-white px-3 py-4 shadow-lg transition hover:translate-x-[24%] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span className="block -rotate-90 text-sm font-semibold tracking-[0.22em] text-slate-700 uppercase">
          Feedback
        </span>
      </button>

      <FeedbackPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
