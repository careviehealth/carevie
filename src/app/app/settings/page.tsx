'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FileText, Lock, Shield, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/createClient';

const accountItems = [
  {
    label: 'Profile details',
    hint: 'Name, email, and family profile preferences',
    icon: UserRound,
  },
  {
    label: 'Security',
    hint: 'Password, login sessions, and account safety',
    icon: Shield,
  },
];

const legalItems = [
  {
    label: 'Privacy Policy',
    href: '/legal/privacy-policy',
    summary: 'How personal information is collected, used, and protected.',
    badge: 'Data Handling',
    accent: 'from-cyan-500 to-teal-500',
  },
  {
    label: 'Terms of Service',
    href: '/legal/terms-of-service',
    summary: 'Rules, responsibilities, and usage terms for this platform.',
    badge: 'Usage Terms',
    accent: 'from-indigo-500 to-sky-500',
  },
  {
    label: 'Health Data Privacy',
    href: '/legal/health-data-privacy',
    summary: 'Additional safeguards and principles for health data privacy.',
    badge: 'Sensitive Data',
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    label: 'Cookie Policy',
    href: '/legal/cookie-policy',
    summary: 'Cookie categories, purpose, and your available controls.',
    badge: 'Cookies',
    accent: 'from-amber-500 to-orange-500',
  },
];

type SettingsTab = 'account' | 'legal';
const ACCOUNT_DELETE_CONFIRMATION = 'DELETE';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [isDeletePanelOpen, setIsDeletePanelOpen] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [activeLegalItem, setActiveLegalItem] = useState<(typeof legalItems)[number] | null>(null);
  const [isLegalModalReady, setIsLegalModalReady] = useState(false);
  const legalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isAccountTab = activeTab === 'account';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.hideChatWidget = activeLegalItem ? 'true' : 'false';
    return () => {
      delete document.body.dataset.hideChatWidget;
    };
  }, [activeLegalItem]);

  const hideLegalPageChrome = () => {
    const iframe = legalIframeRef.current;
    const iframeDocument = iframe?.contentDocument;
    if (!iframeDocument) {
      setIsLegalModalReady(true);
      return;
    }

    const styleId = 'settings-legal-embed-style';
    if (iframeDocument.getElementById(styleId)) {
      setIsLegalModalReady(true);
      return;
    }

    const styleElement = iframeDocument.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = `
      nav, footer, #footer { display: none !important; }
      [class*="w-72"][class*="border-r"][class*="overflow-y-auto"] { display: none !important; }
      [class*="justify-end"][class*="md:hidden"] { display: none !important; }
      #vytara-translate,
      [id*="conveythis"],
      [class*="conveythis"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      html, body { background: #ffffff !important; }
      body { overflow: auto !important; }
    `;
    iframeDocument.head.appendChild(styleElement);
    setIsLegalModalReady(true);
  };

  const clearSupabaseAuthCookies = () => {
    if (typeof document === 'undefined') return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;
    let projectRef = '';
    try {
      projectRef = new URL(supabaseUrl).hostname.split('.')[0] ?? '';
    } catch {
      return;
    }
    if (!projectRef) return;
    const storageKey = `sb-${projectRef}-auth-token`;
    document.cookie
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .forEach((cookie) => {
        const name = cookie.split('=')[0];
        if (name.startsWith(storageKey)) {
          document.cookie = `${name}=; Max-Age=0; path=/`;
        }
      });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationInput.trim().toUpperCase() !== ACCOUNT_DELETE_CONFIRMATION) {
      setDeleteAccountError(`Type "${ACCOUNT_DELETE_CONFIRMATION}" to confirm account deletion.`);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; warnings?: string[] }
        | null;

      if (!response.ok) {
        setDeleteAccountError(payload?.message || 'Unable to delete account right now.');
        setIsDeletingAccount(false);
        return;
      }

      // Clear all cached app data from localStorage
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key?.startsWith('vytara:')) keysToRemove.push(key);
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch { /* storage may be unavailable */ }

      clearSupabaseAuthCookies();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Account may already be removed; proceed with redirect.
      }
      router.replace('/auth/login');
    } catch {
      setDeleteAccountError('Unable to delete account right now.');
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:py-8">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-600">Account and legal controls.</p>

          <div
            role="tablist"
            aria-label="Settings sections"
            className="mt-5 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
          >
            <button
              role="tab"
              id="settings-tab-account"
              aria-selected={isAccountTab}
              aria-controls="settings-panel-account"
              onClick={() => setActiveTab('account')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                isAccountTab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              <UserRound className="h-4 w-4" />
              Account
            </button>
            <button
              role="tab"
              id="settings-tab-legal"
              aria-selected={!isAccountTab}
              aria-controls="settings-panel-legal"
              onClick={() => setActiveTab('legal')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                !isAccountTab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              <Lock className="h-4 w-4" />
              Legal
            </button>
          </div>
        </header>

        <section
          role="tabpanel"
          id={isAccountTab ? 'settings-panel-account' : 'settings-panel-legal'}
          aria-labelledby={isAccountTab ? 'settings-tab-account' : 'settings-tab-legal'}
          className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="mb-5 flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              {isAccountTab ? (
                <UserRound className="h-5 w-5 text-slate-700" />
              ) : (
                <Lock className="h-5 w-5 text-slate-700" />
              )}
              <h2 className="text-lg font-semibold text-slate-900">{isAccountTab ? 'Account' : 'Legal'}</h2>
            </div>
            {isAccountTab ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                4 sections
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                4 documents
              </span>
            )}
          </div>

          {isAccountTab ? (
            <div className="space-y-3">
              <div className="space-y-2">
                {accountItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.hint}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
                      Soon
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="flex items-center justify-between rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3"
                data-tour="settings-replay-tour"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-teal-200 bg-white p-2 text-teal-700">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Replay app tour</p>
                    <p className="text-xs text-slate-500">Start the walkthrough again from the homepage.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    router.push('/app/homepage?tour=replay');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-100"
                >
                  Start
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
                <h3 className="text-sm font-semibold text-rose-900">Danger zone</h3>
                <p className="mt-1 text-xs text-rose-800/90">
                  Deleting your account removes your access and permanently deletes your health profiles
                  and related records.
                </p>

                {!isDeletePanelOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeletePanelOpen(true);
                      setDeleteAccountError(null);
                    }}
                    className="mt-3 inline-flex items-center rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    Delete account
                  </button>
                ) : (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3">
                    <p className="text-xs text-slate-600">
                      Type <span className="font-semibold text-slate-900">{ACCOUNT_DELETE_CONFIRMATION}</span> to
                      confirm.
                    </p>
                    <input
                      value={deleteConfirmationInput}
                      onChange={(event) => setDeleteConfirmationInput(event.target.value)}
                      placeholder={ACCOUNT_DELETE_CONFIRMATION}
                      disabled={isDeletingAccount}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
                    />

                    {deleteAccountError && (
                      <p className="mt-2 text-xs font-medium text-rose-700">{deleteAccountError}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeletePanelOpen(false);
                          setDeleteConfirmationInput('');
                          setDeleteAccountError(null);
                        }}
                        disabled={isDeletingAccount}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteAccount();
                        }}
                        disabled={isDeletingAccount}
                        className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isDeletingAccount ? 'Deleting...' : 'Confirm delete account'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-teal-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Legal library</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">Policies and agreements</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Open any legal document in a focused in-app reader.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {legalItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setIsLegalModalReady(false);
                      setActiveLegalItem(item);
                    }}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${item.accent}`} />

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
                          <FileText className="h-4 w-4 text-slate-500" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.summary}</p>
                        </div>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
                    </div>

                    <div className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {item.badge}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {activeLegalItem && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/55 p-4 sm:p-6"
          onClick={() => {
            setIsLegalModalReady(false);
            setActiveLegalItem(null);
          }}
        >
          <div
            className="relative mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setIsLegalModalReady(false);
                setActiveLegalItem(null);
              }}
              aria-label="Close legal document"
              className="absolute right-3 top-3 z-10 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>

            <iframe
              ref={legalIframeRef}
              src={`${activeLegalItem.href}?view=modal`}
              title={activeLegalItem.label}
              sandbox="allow-same-origin allow-scripts"
              onLoad={hideLegalPageChrome}
              className={`h-full w-full flex-1 bg-white transition-opacity duration-150 ${
                isLegalModalReady ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {!isLegalModalReady && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white text-sm font-medium text-slate-500">
                Loading document...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
