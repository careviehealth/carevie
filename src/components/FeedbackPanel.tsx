"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

type FeedbackType = "general" | "bug" | "feature";

type UploadedAttachment = {
  path: string;
  name: string;
  type: string;
};

type FeedbackPanelProps = {
  open: boolean;
  onClose: () => void;
};

type SubmitPayload = {
  type: FeedbackType;
  message: string;
  context: {
    page: string;
    userAgent: string;
    timestamp: string;
    feedbackId: string;
  };
  attachments?: UploadedAttachment[];
  stepsToReproduce?: string;
  useCase?: string;
};

const FEEDBACK_BUCKET = "feedback-attachments";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);
const ACCEPTED_FILE_EXTENSIONS = ".png,.jpg,.jpeg,.pdf";

const feedbackTypes: Array<{ key: FeedbackType; label: string }> = [
  { key: "general", label: "General" },
  { key: "bug", label: "Bug" },
  { key: "feature", label: "Feature" },
];

const panelTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

const isAllowedFile = (file: File) => ALLOWED_FILE_TYPES.has(file.type);

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const buildUniqueFileName = (file: File) => {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase() ?? "bin"
    : "bin";
  const randomId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${Date.now()}_${randomId}.${extension}`;
};

const getDynamicFieldMeta = (type: FeedbackType) => {
  if (type === "bug") {
    return {
      label: "Steps to reproduce",
      placeholder: "Tell us what happened, what you expected, and how we can reproduce it.",
      key: "stepsToReproduce" as const,
    };
  }

  if (type === "feature") {
    return {
      label: "Use case",
      placeholder: "Describe the workflow or problem this feature would help with.",
      key: "useCase" as const,
    };
  }

  return null;
};

export default function FeedbackPanel({ open, onClose }: FeedbackPanelProps) {
  const pathname = usePathname();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [useCase, setUseCase] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dynamicField = useMemo(() => getDynamicFieldMeta(feedbackType), [feedbackType]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  const resetForm = () => {
    setFeedbackType("general");
    setMessage("");
    setStepsToReproduce("");
    setUseCase("");
    setSelectedFiles([]);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (nextFiles.length === 0) {
      return;
    }

    const invalidType = nextFiles.find((file) => !isAllowedFile(file));
    if (invalidType) {
      setErrorMessage("Only PNG, JPG, and PDF files are supported.");
      return;
    }

    const invalidSize = nextFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (invalidSize) {
      setErrorMessage(`"${invalidSize.name}" exceeds the 5 MB size limit.`);
      return;
    }

    setErrorMessage(null);
    setSelectedFiles((current) => [...current, ...nextFiles]);
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const uploadAttachments = async (feedbackId: string): Promise<UploadedAttachment[]> => {
    if (selectedFiles.length === 0) {
      return [];
    }

    const {
      data: { user },
    } = await supabaseBrowser.auth.getUser();
    const ownerSegment = user?.id ?? "anonymous";

    const uploads: UploadedAttachment[] = [];

    try {
      for (const file of selectedFiles) {
        const path = `${ownerSegment}/${feedbackId}/${buildUniqueFileName(file)}`;
        const { error } = await supabaseBrowser.storage.from(FEEDBACK_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

        if (error) {
          throw new Error(error.message);
        }

        uploads.push({
          path,
          name: file.name,
          type: file.type,
        });
      }
    } catch (error) {
      if (uploads.length > 0) {
        await supabaseBrowser.storage
          .from(FEEDBACK_BUCKET)
          .remove(uploads.map((attachment) => attachment.path));
      }

      throw error;
    }

    return uploads;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setErrorMessage("Please enter your feedback before submitting.");
      return;
    }

    const feedbackId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const payload: SubmitPayload = {
      type: feedbackType,
      message: trimmedMessage,
      context: {
        page: pathname || "/",
        userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
        timestamp,
        feedbackId,
      },
    };

    if (feedbackType === "bug" && stepsToReproduce.trim()) {
      payload.stepsToReproduce = stepsToReproduce.trim();
    }

    if (feedbackType === "feature" && useCase.trim()) {
      payload.useCase = useCase.trim();
    }

    setIsSubmitting(true);

    try {
      const attachments = await uploadAttachments(feedbackId);
      if (attachments.length > 0) {
        payload.attachments = attachments;
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        if (attachments.length > 0) {
          await supabaseBrowser.storage
            .from(FEEDBACK_BUCKET)
            .remove(attachments.map((attachment) => attachment.path));
        }

        throw new Error(result?.message || "Unable to submit feedback right now.");
      }

      resetForm();
      setSuccessMessage("Thanks for the feedback. Your message has been sent.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit feedback right now.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close feedback panel"
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleClose}
          />

          <motion.aside
            aria-label="Feedback panel"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[350px] flex-col border-l border-slate-200 bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={panelTransition}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Share feedback</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tell us what is working, broken, or missing.
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close feedback panel</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex h-full flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Feedback type
                  </label>
                  <div
                    role="tablist"
                    aria-label="Feedback type"
                    className="grid grid-cols-3 rounded-xl bg-slate-100 p-1"
                  >
                    {feedbackTypes.map((option) => {
                      const active = feedbackType === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setFeedbackType(option.key)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                            active
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="feedback-message"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Message <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    required
                    rows={6}
                    placeholder="Tell us what you're seeing or what would make this better."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                {dynamicField ? (
                  <div>
                    <label
                      htmlFor={dynamicField.key}
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      {dynamicField.label}
                    </label>
                    <textarea
                      id={dynamicField.key}
                      value={dynamicField.key === "stepsToReproduce" ? stepsToReproduce : useCase}
                      onChange={(event) => {
                        if (dynamicField.key === "stepsToReproduce") {
                          setStepsToReproduce(event.target.value);
                          return;
                        }

                        setUseCase(event.target.value);
                      }}
                      rows={4}
                      placeholder={dynamicField.placeholder}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Attachment
                  </label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-100">
                    <Paperclip className="h-4 w-4" />
                    <span>Upload PNG, JPG, or PDF</span>
                    <input
                      type="file"
                      accept={ACCEPTED_FILE_EXTENSIONS}
                      multiple
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">Maximum file size: 5 MB each.</p>

                  {selectedFiles.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {selectedFiles.map((file, index) => (
                        <li
                          key={`${file.name}-${file.lastModified}-${index}`}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {file.name}
                            </p>
                            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="ml-3 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remove attachment</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {errorMessage ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                  >
                    {errorMessage}
                  </div>
                ) : null}

                {successMessage ? (
                  <div
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                  >
                    {successMessage}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-200 px-5 py-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isSubmitting ? "Sending..." : "Send feedback"}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
