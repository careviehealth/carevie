'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, FileText, AlertCircle } from 'lucide-react';

interface SummaryResponse {
  success: boolean;
  summary?: string;
  report_count?: number;
  error?: string;
  cached?: boolean;
}

interface MedicalSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderType?: string;
  userId?: string;
  onSummaryReady?: () => void;
  onSummaryViewed?: () => void;
}

const PUBLIC_BACKEND_BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://medical-rag-backend-phaq.onrender.com'
    : 'http://localhost:5000')
).replace(/\/+$/, '');
const HEALTH_CHECK_URL = `${PUBLIC_BACKEND_BASE_URL}/api/health`;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}


function isBackendWakeupError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('backend is unavailable or waking up') ||
    normalized.includes('render cold start') ||
    normalized.includes('operation was aborted due to timeout') ||
    normalized.includes('timeout')
  );
}

function toUserFriendlyError(message: string): string {
  if (!isBackendWakeupError(message)) {
    return message;
  }

  return 'Our medical backend is waking up (Render free tier cold start). Please wait about 60-90 seconds and tap “Try Again”.';
}

function sanitizeAndFormat(text: string): string {
  // Strip all HTML tags first to prevent XSS
  const stripped = text.replace(/<[^>]*>/g, '');
  // Then apply safe formatting
  return stripped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

export function MedicalSummaryModal({ 
  isOpen, 
  onClose, 
  folderType = 'reports',
  userId: propUserId,
  onSummaryReady,
  onSummaryViewed
}: MedicalSummaryModalProps) {
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [reportCount, setReportCount] = useState<number>(0);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const hasMarkedSummaryViewedRef = useRef(false);
  const isOpenRef = useRef(isOpen);

  isOpenRef.current = isOpen;

  if (process.env.NODE_ENV !== 'production') {
    console.log('🎭 Modal render - isOpen:', isOpen);
  }

  // Use selected profile ID only (no auth user fallback)
  useEffect(() => {
    const normalizedProfileId =
      typeof propUserId === 'string' ? propUserId.trim() : '';

    if (normalizedProfileId) {
      console.log('✅ [Modal] Using profileId from props:', normalizedProfileId);
      setUserId(normalizedProfileId);
      setError('');
      return;
    }

    setUserId('');
    setError('Please select a profile first');
  }, [propUserId]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      console.log('🔄 [Modal] Resetting state (modal closed)');
      setHasProcessed(false);
      setError('');
      setSummary('');
      hasMarkedSummaryViewedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !summary || isProcessing || isGenerating) {
      return;
    }
    if (hasMarkedSummaryViewedRef.current) {
      return;
    }
    hasMarkedSummaryViewedRef.current = true;
    onSummaryViewed?.();
  }, [isGenerating, isOpen, isProcessing, onSummaryViewed, summary]);

  const processFiles = useCallback(async () => {
    if (!userId) {
      console.error('❌ [Frontend] No profileId available');
      setError('Please select a profile first');
      return false;
    }

    setIsProcessing(true);
    setError('');
    
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('📋 [Frontend] Processing files...');
      }
      
      const response = await fetch('/api/medical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process',
          folder_type: folderType,
          profile_id: userId,
          user_id: userId
        }),
      });
      
      console.log('📡 [Frontend] Process response status:', response.status);
      
      const data = await response.json();
      console.log('📦 [Frontend] Process response data:', data);
      
      if (!data.success) {
        throw new Error(toUserFriendlyError(data.error || 'Failed to process files'));
      }
      
      console.log('✅ [Frontend] Files processed:', data.processed_count);
      return true;
      
    } catch (err: unknown) {
      console.error('❌ [Frontend] Process error:', err);
      setError(toUserFriendlyError(getErrorMessage(err)));
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [folderType, userId]);

  const generateSummary = useCallback(async (): Promise<{ ok: boolean; errorMessage?: string }> => {
    if (!userId) {
      console.error('❌ [Frontend] No profileId for summary generation');
      const authError = 'Please select a profile first';
      setError(authError);
      return { ok: false, errorMessage: authError };
    }

    setIsGenerating(true);
    setError('');
    
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('🤖 [Frontend] Generating summary...');
      }
      
      const response = await fetch('/api/medical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-summary',
          folder_type: folderType,
          use_cache: true,
          force_regenerate: false,
          profile_id: userId,
          user_id: userId
        }),
      });
      
      console.log('📡 [Frontend] Summary response status:', response.status);
      
      const data: SummaryResponse = await response.json();
      console.log('📦 [Frontend] Summary response data:', data);
      
      if (!data.success) {
        throw new Error(toUserFriendlyError(data.error || 'Failed to generate summary'));
      }
      
      console.log('✅ [Frontend] Summary received!');
      console.log('✅ [Frontend] Summary length:', data.summary?.length);
      console.log('✅ [Frontend] Report count:', data.report_count);
      
      setSummary(data.summary || '');
      setReportCount(data.report_count || 0);
      setHasProcessed(true);
      hasMarkedSummaryViewedRef.current = false;
      if (!isOpenRef.current) {
        onSummaryReady?.();
      }
      
      console.log('✅ [Frontend] State updated, summary should display');
      return { ok: true };
      
    } catch (err: unknown) {
      console.error('❌ [Frontend] Summary error:', err);
      const errorMessage = toUserFriendlyError(getErrorMessage(err));
      setError(errorMessage);
      return { ok: false, errorMessage };
    } finally {
      setIsGenerating(false);
    }
  }, [folderType, onSummaryReady, userId]);

  const handleGenerateSummary = useCallback(async () => {
    console.log('🎬 [Modal] Starting generation process...');
    // Always process first so newly uploaded reports are included in summary.
    const processed = await processFiles();
    if (!processed) {
      console.error('❌ [Modal] Processing failed, skipping summary to avoid stale cache results');
      return;
    }

    await generateSummary();
  }, [generateSummary, processFiles]);

  // Auto-trigger when modal opens AND userId is available
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔄 [Modal] Effect check - isOpen:', isOpen, 'hasProcessed:', hasProcessed);
    }

    if (isOpen && !hasProcessed && userId) {
      console.log('🚀 [Modal] Triggering summary generation!');
      handleGenerateSummary();
    } else if (isOpen && !userId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('ℹ️ [Modal] Modal open but no userId available yet');
      }
      // Don't set error here, let the first useEffect handle it
    }
  }, [handleGenerateSummary, hasProcessed, isOpen, userId]);

  if (!isOpen) {
    console.log('🎭 [Modal] Not rendering (isOpen=false)');
    return null;
  }

  console.log('🎭 [Modal] RENDERING MODAL');

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <FileText className="text-emerald-600" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Medical Report Summary
                </h2>
                {reportCount > 0 && (
                  <p className="text-sm text-slate-600 mt-1">
                    Analysis of {reportCount} report{reportCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-full hover:bg-slate-100 transition"
              aria-label="Close"
            >
              <X size={24} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          
          {/* Loading State */}
          {(isProcessing || isGenerating) && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
              <p className="text-lg font-medium text-slate-700">
                {isProcessing && 'Processing your medical reports...'}
                {isGenerating && 'Generating AI-powered summary...'}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                This may take about a minute. We&apos;ll notify you when your summary is ready. Feel free to come back when it&apos;s ready.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !isProcessing && !isGenerating && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-1" size={24} />
                <div>
                  <p className="font-semibold text-red-900 mb-2">Unable to Generate Summary</p>
                  <p className="text-sm text-red-700 mb-3">{error}</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    <li>• Make sure you&apos;re logged in</li>
                    <li>• Check Flask is running: <a href={HEALTH_CHECK_URL} target="_blank" className="underline">{HEALTH_CHECK_URL}</a></li>
                    <li>• Check you have medical reports uploaded in Supabase Storage</li>
                    <li>• Check browser console (F12) for detailed errors</li>
                  </ul>
                </div>
              </div>
              <button
                onClick={handleGenerateSummary}
                className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition font-medium"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Summary Display */}
          {summary && !isProcessing && !isGenerating && (
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ 
                __html: sanitizeAndFormat(summary)
              }}
            />
          )}

          {/* No Content State */}
          {!isProcessing && !isGenerating && !error && !summary && (
            <div className="text-center py-12 text-slate-500">
              <p>Initializing...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {summary && !isProcessing && !isGenerating && (
          <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Generated using AI • Always consult healthcare professionals
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(summary);
                  alert('✅ Summary copied to clipboard!');
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition font-medium"
              >
                📋 Copy
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
