"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  PencilLine,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";

type ToastRecord = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
};

type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

type PromptDialogOptions = ConfirmDialogOptions & {
  defaultValue?: string;
  placeholder?: string;
  inputLabel?: string;
};

type ActiveConfirmDialog = ConfirmDialogOptions & {
  id: string;
  kind: "confirm";
  resolve: (value: boolean) => void;
};

type ActivePromptDialog = PromptDialogOptions & {
  id: string;
  kind: "prompt";
  resolve: (value: string | null) => void;
};

type ActiveDialog = ActiveConfirmDialog | ActivePromptDialog;

type PendingDialog =
  | {
      id: string;
      kind: "confirm";
      options: ConfirmDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      id: string;
      kind: "prompt";
      options: PromptDialogOptions;
      resolve: (value: string | null) => void;
    };

type NotifierSnapshot = {
  toasts: ToastRecord[];
  activeDialog: ActiveDialog | null;
};

const listeners = new Set<() => void>();
const dialogQueue: PendingDialog[] = [];
const EMPTY_SNAPSHOT: NotifierSnapshot = {
  toasts: [],
  activeDialog: null,
};
const subscribeHydration = () => () => {};

let toastState: ToastRecord[] = [];
let activeDialogState: ActiveDialog | null = null;
let snapshotState: NotifierSnapshot = EMPTY_SNAPSHOT;

const makeId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const emit = () => {
  listeners.forEach((listener) => listener());
};

const getSnapshot = () => snapshotState;
const getServerSnapshot = () => EMPTY_SNAPSHOT;

const commitSnapshot = () => {
  snapshotState = {
    toasts: toastState,
    activeDialog: activeDialogState,
  };
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const dismissToast = (id: string) => {
  toastState = toastState.filter((toast) => toast.id !== id);
  commitSnapshot();
};

const showToast = (
  tone: ToastTone,
  title: string,
  description?: string,
  duration = 3200
) => {
  const id = makeId();
  toastState = [
    ...toastState,
    {
      id,
      tone,
      title,
      description,
      duration,
    },
  ];
  commitSnapshot();
  return id;
};

const openNextDialog = () => {
  if (activeDialogState || dialogQueue.length === 0) return;

  const nextDialog = dialogQueue.shift();
  if (!nextDialog) return;

  if (nextDialog.kind === "confirm") {
    activeDialogState = {
      id: nextDialog.id,
      kind: "confirm",
      ...nextDialog.options,
      resolve: nextDialog.resolve,
    };
  } else {
    activeDialogState = {
      id: nextDialog.id,
      kind: "prompt",
      ...nextDialog.options,
      resolve: nextDialog.resolve,
    };
  }

  commitSnapshot();
};

const settleDialog = (result: boolean | string | null) => {
  const dialog = activeDialogState;
  if (!dialog) return;

  activeDialogState = null;

  if (dialog.kind === "confirm") {
    dialog.resolve(Boolean(result));
  } else {
    dialog.resolve(typeof result === "string" ? result : null);
  }

  commitSnapshot();
  window.setTimeout(openNextDialog, 0);
};

export const toast = {
  success: (title: string, description?: string, options?: { duration?: number }) =>
    showToast("success", title, description, options?.duration),
  error: (title: string, description?: string, options?: { duration?: number }) =>
    showToast("error", title, description, options?.duration),
  info: (title: string, description?: string, options?: { duration?: number }) =>
    showToast("info", title, description, options?.duration),
  warning: (title: string, description?: string, options?: { duration?: number }) =>
    showToast("warning", title, description, options?.duration),
};

export const confirmDialog = (options: ConfirmDialogOptions) =>
  new Promise<boolean>((resolve) => {
    dialogQueue.push({
      id: makeId(),
      kind: "confirm",
      options,
      resolve,
    });
    openNextDialog();
  });

export const promptDialog = (options: PromptDialogOptions) =>
  new Promise<string | null>((resolve) => {
    dialogQueue.push({
      id: makeId(),
      kind: "prompt",
      options,
      resolve,
    });
    openNextDialog();
  });

const toastToneStyles: Record<
  ToastTone,
  {
    icon: LucideIcon;
    accentClassName: string;
    iconClassName: string;
    badgeClassName: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    accentClassName: "bg-emerald-600",
    iconClassName: "text-emerald-700",
    badgeClassName: "bg-emerald-50 text-emerald-700",
  },
  error: {
    icon: AlertCircle,
    accentClassName: "bg-rose-600",
    iconClassName: "text-rose-700",
    badgeClassName: "bg-rose-50 text-rose-700",
  },
  info: {
    icon: Info,
    accentClassName: "bg-teal-600",
    iconClassName: "text-teal-700",
    badgeClassName: "bg-teal-50 text-teal-700",
  },
  warning: {
    icon: AlertTriangle,
    accentClassName: "bg-amber-500",
    iconClassName: "text-amber-700",
    badgeClassName: "bg-amber-50 text-amber-700",
  },
};

function ToastCard({ toast }: { toast: ToastRecord }) {
  const shouldReduceMotion = useReducedMotion();
  const toneStyles = toastToneStyles[toast.tone];
  const Icon = toneStyles.icon;

  useEffect(() => {
    if (toast.duration <= 0) return;

    const timeoutId = window.setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => window.clearTimeout(timeoutId);
  }, [toast.duration, toast.id]);

  return (
    <motion.div
      layout
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 32, scale: 0.97 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 20, scale: 0.98 }}
      transition={{ duration: shouldReduceMotion ? 0.12 : 0.22, ease: "easeOut" }}
      className="pointer-events-auto relative overflow-hidden rounded-2xl border border-slate-200 bg-white/96 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.42)] backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", toneStyles.accentClassName)}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className={cn("mt-0.5 rounded-full p-1.5", toneStyles.badgeClassName)}>
          <Icon className={cn("h-4 w-4", toneStyles.iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-500">
              {toast.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function DialogRenderer({ dialog }: { dialog: ActiveDialog }) {
  const shouldReduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(dialog.kind === "prompt" ? dialog.defaultValue ?? "" : "");

  useEffect(() => {
    if (dialog.kind !== "prompt") return;

    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [dialog]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      settleDialog(dialog.kind === "prompt" ? null : false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog.kind === "prompt") {
      settleDialog(value);
      return;
    }
    settleDialog(true);
  };

  const isDanger = dialog.variant === "danger";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={() => settleDialog(dialog.kind === "prompt" ? null : false)}
    >
      <motion.div
        initial={
          shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }
        }
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: shouldReduceMotion ? 0.12 : 0.2, ease: "easeOut" }}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_-28px_rgba(15,23,42,0.45)]"
      >
        <div
          className={cn(
            "h-1 w-full",
            isDanger
              ? "bg-gradient-to-r from-rose-500 via-rose-600 to-orange-500"
              : "bg-gradient-to-r from-teal-500 via-cyan-500 to-sky-500"
          )}
          aria-hidden="true"
        />
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "mt-0.5 rounded-2xl p-3",
                isDanger ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"
              )}
            >
              {dialog.kind === "prompt" ? (
                <PencilLine className="h-5 w-5" />
              ) : isDanger ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Info className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-950">{dialog.title}</h2>
              {dialog.description ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">
                  {dialog.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => settleDialog(dialog.kind === "prompt" ? null : false)}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {dialog.kind === "prompt" ? (
            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {dialog.inputLabel ?? "Value"}
              </label>
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={dialog.placeholder}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
              />
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => settleDialog(dialog.kind === "prompt" ? null : false)}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {dialog.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="submit"
              className={cn(
                "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition",
                isDanger
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-teal-600 hover:bg-teal-700"
              )}
            >
              {dialog.confirmLabel ?? (dialog.kind === "prompt" ? "Save" : "Continue")}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export function AppNotifier() {
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!snapshot.activeDialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [snapshot.activeDialog]);

  if (!isHydrated) return null;

  return createPortal(
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[130] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        <AnimatePresence initial={false}>
          {snapshot.toasts.map((toastRecord) => (
            <ToastCard key={toastRecord.id} toast={toastRecord} />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {snapshot.activeDialog ? (
          <DialogRenderer key={snapshot.activeDialog.id} dialog={snapshot.activeDialog} />
        ) : null}
      </AnimatePresence>
    </>,
    document.body
  );
}
