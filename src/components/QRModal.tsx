'use client';
import { QRCodeSVG } from 'qrcode.react';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  shareLink: string;
  isGenerating: boolean;
  error?: string | null;
  readyMessage?: string;
}

export default function QRModal({
  isOpen,
  onClose,
  title,
  subtitle,
  shareLink,
  isGenerating,
  error,
  readyMessage = 'Scan this QR code to access the profile',
}: QRModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6 w-[340px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex w-full items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* QR / State */}
        {isGenerating ? (
          <div className="w-[200px] h-[200px] flex items-center justify-center border border-slate-200 rounded-xl">
            <p className="text-slate-400 text-sm">Generating…</p>
          </div>
        ) : error ? (
          <p className="text-rose-600 text-sm text-center">{error}</p>
        ) : (
          <div className="rounded-xl border border-slate-200 p-2">
            <QRCodeSVG value={shareLink} size={200} />
          </div>
        )}

        {/* Status message */}
        <p className="text-sm text-slate-500 text-center">
          {isGenerating
            ? 'Generating secure link…'
            : error
            ? 'Something went wrong.'
            : readyMessage}
        </p>

        {/* Copy button — only when link is ready */}
        {shareLink && !isGenerating && !error && (
          <button
            onClick={() => navigator.clipboard.writeText(shareLink)}
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-2xl transition-all text-sm"
          >
            📋 Copy Link
          </button>
        )}
      </div>
    </div>
  );
}