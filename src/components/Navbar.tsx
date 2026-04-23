'use client';

import {
  LogOut,
  Home,
  User,
  Folder,
  Menu,
  ChevronLeft,
  ChevronRight,
  Users,
  UserRoundCog,
  Check,
  X,
  Plus,
  Settings2,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { confirmDialog } from '@/components/AppNotifier';
import { supabase } from '@/lib/createClient';
import { useAppProfile, type AppProfile } from '@/components/AppProfileProvider';
import { syncRememberedAccountName } from '@/lib/rememberedAccount';

// theme selector component provides the dropdown of available colour themes
import ThemeSelector from '@/components/FloatingThemeButton';

type Notice = {
  type: 'success' | 'error';
  text: string;
} | null;

const PROFILE_COLORS = ['#14b8a6', '#0ea5e9', '#6366f1', '#f59e0b', '#ec4899', '#22c55e'];

const getProfileLabel = (profile: Pick<AppProfile, 'display_name' | 'name'> | null | undefined) => {
  const value = profile?.display_name?.trim() || profile?.name?.trim() || '';
  return value || 'Profile';
};

const getProfileInitials = (label: string) =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('') || 'P';

const hasMissingColumnError = (
  error: { code?: string; message?: string } | null | undefined,
  column: string
) =>
  error?.code === 'PGRST204' ||
  error?.message?.toLowerCase().includes(column.toLowerCase()) ||
  false;

const profilePreferenceKey = (userId: string) => `vytara:last-selected-profile:${userId}`;
const navbarLogoCapsuleClass =
  'inline-flex items-center justify-center rounded-2xl border border-white/70 bg-white/95 shadow-[0_12px_28px_rgba(2,6,23,0.20)] ring-1 ring-slate-900/5 backdrop-blur';
const navbarLogoWordmarkCapsuleClass = `${navbarLogoCapsuleClass} px-2.5 py-1.5`;
const navbarLogoExpandedCapsuleClass =
  'inline-flex h-11 w-[142px] items-center justify-center rounded-xl border border-white/75 bg-white/95 px-3 shadow-[0_10px_22px_rgba(2,6,23,0.18)] ring-1 ring-slate-900/5 backdrop-blur';
const navbarLogoMarkCapsuleClass = `${navbarLogoCapsuleClass} p-1.5`;

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfilePickerOpen, setIsProfilePickerOpen] = useState(false);
  const [manageProfilesMode, setManageProfilesMode] = useState(false);
  const [showAddProfileForm, setShowAddProfileForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const isOnboarding = pathname === '/app/health-onboarding';
  const isSettingsPage = pathname === '/app/settings';
  const effectiveCollapsed = isOnboarding ? false : collapsed;
  const { profiles, selectedProfile, selectProfile, refreshProfiles, userId, isLoading } = useAppProfile();

  const selectedProfileLabel = useMemo(() => getProfileLabel(selectedProfile), [selectedProfile]);
  const mobileHeaderStyle: CSSProperties = {
    borderColor: 'var(--theme-button-secondary)',
    background: 'linear-gradient(90deg, var(--theme-navbar) 0%, #020617 100%)',
  };
  const desktopSidebarStyle: CSSProperties = {
    borderColor: 'var(--theme-button-secondary)',
    background: 'linear-gradient(180deg, var(--theme-navbar) 0%, #020617 100%)',
  };
  const activeItemStyle: CSSProperties = {
    backgroundColor: 'var(--theme-sidebar-active)',
  };

  const navItems = [
    { label: 'Home', href: '/app/homepage', icon: Home },
    { label: 'Profile', href: '/app/profilepage', icon: User },
    { label: 'Vault', href: '/app/vaultpage', icon: Folder },
    { label: 'Care Circle', href: '/app/carecircle', icon: Users },
  ];

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('g1_nav_collapsed');
      if (stored) {
        window.setTimeout(() => setCollapsed(stored === '1'), 0);
      }
    } catch {
      // Storage may be unavailable; keep default expanded state.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('g1_nav_collapsed', collapsed ? '1' : '0');
    } catch {
      // Storage may be unavailable; skip persistence.
    }
  }, [collapsed]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.navCollapsed = effectiveCollapsed ? "true" : "false";
  }, [effectiveCollapsed]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.hasNavbar = 'true';
    return () => {
      delete document.body.dataset.hasNavbar;
      delete document.body.dataset.navCollapsed;
    };
  }, []);

  const resetProfileModalState = () => {
    setManageProfilesMode(false);
    setShowAddProfileForm(false);
    setNewProfileName('');
    setEditingProfileId(null);
    setEditingProfileName('');
    setIsCreatingProfile(false);
    setSavingProfileId(null);
    setDeletingProfileId(null);
    setNotice(null);
  };

  const openProfileModal = () => {
    setNotice(null);
    setMobileMenuOpen(false);
    setIsProfilePickerOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfilePickerOpen(false);
    resetProfileModalState();
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    clearSensitiveStorage();
    clearSupabaseAuthCookies();
    await supabase.auth.signOut({ scope: "local" });
    router.push('/auth/login');
  };

  const clearSensitiveStorage = () => {
    if (typeof window === "undefined") return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith("vytara:")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // Storage may be unavailable
    }
  };

  const clearSupabaseAuthCookies = () => {
    if (typeof document === "undefined") return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;
    let projectRef = "";
    try {
      projectRef = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
    } catch {
      return;
    }
    if (!projectRef) return;
    const storageKey = `sb-${projectRef}-auth-token`;
    document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .forEach((cookie) => {
        const name = cookie.split("=")[0];
        if (name.startsWith(storageKey)) {
          document.cookie = `${name}=; Max-Age=0; path=/`;
        }
      });
  };

  const persistSelectedProfileHint = async (profileId: string) => {
    if (!userId || !profileId) return;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(profilePreferenceKey(userId), profileId);
      } catch {
        // Keep the server-side preference write even if local storage fails.
      }
    }
    await supabase
      .from('user_profile_preferences')
      .upsert(
        {
          user_id: userId,
          last_selected_profile_id: profileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
  };

  const handleSelectProfile = async (profileId: string) => {
    setNotice(null);
    try {
      await selectProfile(profileId);
      if (!manageProfilesMode) {
        closeProfileModal();
      }
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to switch profile right now.',
      });
    }
  };

  const handleCreateProfile = async () => {
    if (!userId) {
      setNotice({ type: 'error', text: 'Please sign in again to add a profile.' });
      return;
    }
    const previousSelectedProfileId = selectedProfile?.id ?? '';
    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      setNotice({ type: 'error', text: 'Please enter a profile name.' });
      return;
    }

    setIsCreatingProfile(true);
    setNotice(null);
    const fallbackColor = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] ?? '#14b8a6';

    const withAuthInsert = await supabase
      .from('profiles')
      .insert({
        auth_id: userId,
        user_id: userId,
        name: trimmedName,
        avatar_type: 'default',
        avatar_color: fallbackColor,
        is_primary: profiles.length === 0,
      })
      .select('id')
      .maybeSingle();

    let createdProfileId = withAuthInsert.data?.id ?? null;
    let createError = withAuthInsert.error;

    if (createError && hasMissingColumnError(createError, 'auth_id')) {
      const legacyInsert = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          name: trimmedName,
          avatar_type: 'default',
          avatar_color: fallbackColor,
          is_primary: profiles.length === 0,
        })
        .select('id')
        .maybeSingle();
      createdProfileId = legacyInsert.data?.id ?? null;
      createError = legacyInsert.error;
    }

    if (createError || !createdProfileId) {
      setNotice({
        type: 'error',
        text: createError?.message || 'Unable to create profile. Please try again.',
      });
      setIsCreatingProfile(false);
      return;
    }

    await persistSelectedProfileHint(createdProfileId);
    await refreshProfiles();
    setNotice({ type: 'success', text: 'Profile added successfully. Redirecting to onboarding...' });
    closeProfileModal();
    const onboardingParams = new URLSearchParams();
    onboardingParams.set('newProfileId', createdProfileId);
    if (previousSelectedProfileId && previousSelectedProfileId !== createdProfileId) {
      onboardingParams.set('previousProfileId', previousSelectedProfileId);
    }
    if (pathname.startsWith('/app/')) {
      onboardingParams.set('returnTo', pathname);
    }
    router.push(`/app/health-onboarding?${onboardingParams.toString()}`);
    setIsCreatingProfile(false);
  };

  const handleStartEditingProfile = (profile: AppProfile) => {
    setEditingProfileId(profile.id);
    setEditingProfileName(getProfileLabel(profile));
    setNotice(null);
  };

  const handleSaveProfileName = async (profile: AppProfile) => {
    const trimmed = editingProfileName.trim();
    if (!trimmed) {
      setNotice({ type: 'error', text: 'Profile name cannot be empty.' });
      return;
    }

    setSavingProfileId(profile.id);
    setNotice(null);

    const updateWithDisplay = await supabase
      .from('profiles')
      .update({
        name: trimmed,
        display_name: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)
      .select('id')
      .maybeSingle();

    let updateError = updateWithDisplay.error;
    if (updateError && hasMissingColumnError(updateError, 'display_name')) {
      const updateLegacy = await supabase
        .from('profiles')
        .update({
          name: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .select('id')
        .maybeSingle();
      updateError = updateLegacy.error;
    }

    if (updateError) {
      setNotice({
        type: 'error',
        text: updateError.message || 'Unable to rename profile. Please try again.',
      });
      setSavingProfileId(null);
      return;
    }

    if (profile.is_primary) {
      syncRememberedAccountName(userId, trimmed);
    }

    await refreshProfiles();
    setEditingProfileId(null);
    setEditingProfileName('');
    setNotice({ type: 'success', text: 'Profile name updated.' });
    setSavingProfileId(null);
  };

  const handleDeleteProfile = async (profile: AppProfile) => {
    if (profile.is_primary) {
      setNotice({ type: 'error', text: 'Primary profile cannot be deleted.' });
      return;
    }

    const confirmed = await confirmDialog({
      title: `Delete "${getProfileLabel(profile)}"?`,
      description: 'This profile data will be permanently removed.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }

    setDeletingProfileId(profile.id);
    setNotice(null);

    const deletionResponse = await fetch('/api/profile/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: profile.id }),
    });

    const deletionPayload = (await deletionResponse.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!deletionResponse.ok) {
      setNotice({
        type: 'error',
        text: deletionPayload?.message || 'Unable to delete profile right now.',
      });
      setDeletingProfileId(null);
      return;
    }

    await refreshProfiles();
    if (editingProfileId === profile.id) {
      setEditingProfileId(null);
      setEditingProfileName('');
    }
    setNotice({ type: 'success', text: 'Profile deleted successfully.' });
    setDeletingProfileId(null);
  };

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full border-b text-white md:hidden ${isOnboarding ? 'pointer-events-none opacity-70' : ''
          }`}
        style={mobileHeaderStyle}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            className="flex items-center text-left"
            onClick={() => router.push('/app/homepage')}
          >
            <span className={navbarLogoWordmarkCapsuleClass}>
              <BrandLogo variant="wordmark" width={104} className="shrink-0" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navbar-menu"
            className="rounded-lg border border-white/15 p-2 text-teal-100/90 transition hover:bg-white/10 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div
            id="mobile-navbar-menu"
            className="border-t border-white/10 px-4 pb-4 pt-3"
          >
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <button
                    key={item.href}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      router.push(item.href);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive
                        ? 'text-white'
                        : 'text-teal-100/85 hover:bg-white/10 hover:text-white'
                      }`}
                    style={isActive ? activeItemStyle : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="my-3 h-px bg-white/10" />
            <div className="space-y-1.5">
              <button
                onClick={openProfileModal}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-teal-100/90 transition hover:bg-white/10 hover:text-white"
                title={selectedProfileLabel}
              >
                <UserRoundCog className="h-4 w-4" />
                Switch Profile
              </button>
              {/* theme selector between switch profile and settings */}
              <ThemeSelector variant="mobile" userId={userId} />
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push('/app/settings');
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isSettingsPage
                    ? 'text-white'
                    : 'text-teal-100/90 hover:bg-white/10 hover:text-white'
                  }`}
                style={isSettingsPage ? activeItemStyle : undefined}
              >
                <Settings2 className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={() => {
                  void handleLogout();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-200/90 transition hover:bg-white/10 hover:text-red-100"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        )}
        {isOnboarding && (
          <div className="px-4 pb-3 text-xs text-teal-100/80">
            Complete onboarding to unlock navigation.
          </div>
        )}
      </header>

      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r text-white transition-[width] duration-200 md:block ${effectiveCollapsed ? 'w-20' : 'w-64'
          } ${isOnboarding ? 'pointer-events-none opacity-70' : ''}`}
        style={desktopSidebarStyle}
      >
        <div className="flex h-full flex-col px-3 py-6">
          <div
            className={`px-1 ${effectiveCollapsed
              ? 'flex flex-col items-center gap-3'
              : 'flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
              }`}
          >
            <button
              className={`text-left ${effectiveCollapsed ? 'flex items-center justify-center' : 'flex min-w-0 items-center gap-2.5'}`}
              onClick={() => router.push('/app/homepage')}
            >
              {effectiveCollapsed ? (
                <span className={navbarLogoMarkCapsuleClass}>
                  <BrandLogo variant="mark" width={36} className="shrink-0" />
                </span>
              ) : (
                <span className={navbarLogoExpandedCapsuleClass}>
                  <BrandLogo variant="full" width={118} className="shrink-0" />
                </span>
              )}
            </button>
            <button
              onClick={() => setCollapsed((v) => !v)}
              title={effectiveCollapsed ? 'Open navbar' : 'Close navbar'}
              className={`rounded-lg p-2 text-teal-100/70 transition hover:bg-white/10 hover:text-white ${effectiveCollapsed ? '' : 'ml-auto'
                }`}
              aria-label={effectiveCollapsed ? 'Expand navbar' : 'Collapse navbar'}
            >
              {effectiveCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          <nav className="mt-8 flex-1 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const desktopTourTarget =
                item.href === '/app/homepage'
                  ? 'nav-home'
                  : item.href === '/app/profilepage'
                    ? 'nav-profile'
                    : item.href === '/app/vaultpage'
                      ? 'nav-vault'
                      : item.href === '/app/carecircle'
                        ? 'nav-care-circle'
                        : undefined;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive
                      ? 'text-white shadow-sm'
                      : 'text-teal-100/80 hover:bg-white/10 hover:text-white'
                    }`}
                  title={effectiveCollapsed ? item.label : undefined}
                  style={isActive ? activeItemStyle : undefined}
                  data-tour={desktopTourTarget}
                >
                  <Icon className="w-4 h-4" />
                  {!effectiveCollapsed && item.label}
                </button>
              );
            })}
          </nav>

          {isOnboarding && !effectiveCollapsed && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-teal-100/80">
              Complete onboarding to unlock navigation.
            </div>
          )}

          <div className="mt-auto space-y-2">
            <button
              onClick={openProfileModal}
              title={effectiveCollapsed ? 'Switch Profile' : selectedProfileLabel}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-teal-100/90 hover:bg-white/10 hover:text-white transition"
              data-tour="nav-switch-profile"
            >
              <UserRoundCog className="w-4 h-4" />
              {!effectiveCollapsed && 'Switch Profile'}
            </button>
            {/* desktop theme selector between switch profile and settings */}
            {!effectiveCollapsed && (
              <ThemeSelector variant="desktop" userId={userId} />
            )}

            <button
              onClick={() => router.push('/app/settings')}
              title={effectiveCollapsed ? 'Settings' : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isSettingsPage
                  ? 'text-white shadow-sm'
                  : 'text-teal-100/90 hover:bg-white/10 hover:text-white'
                }`}
              style={isSettingsPage ? activeItemStyle : undefined}
              data-tour="nav-settings"
            >
              <Settings2 className="w-4 h-4" />
              {!effectiveCollapsed && 'Settings'}
            </button>

            <button
              onClick={async () => {
                await handleLogout();
              }}
              title={effectiveCollapsed ? 'Logout' : undefined}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-200/90 hover:bg-white/10 hover:text-red-100 transition"
            >
              <LogOut className="w-4 h-4" />
              {!effectiveCollapsed && 'Logout'}
            </button>
          </div>
        </div>
      </aside>

      {isProfilePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          onClick={closeProfileModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 px-5 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/75">Family Profiles</p>
                  <h3 className="mt-1 text-xl font-semibold">Switch Profile</h3>
                  <p className="mt-1 text-sm text-white/85">
                    Choose, add, and manage your children&apos;s profiles.
                  </p>
                </div>
                <button
                  className="rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
                  onClick={closeProfileModal}
                  aria-label="Close profile picker"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
                    {getProfileInitials(selectedProfileLabel)}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70">Current Profile</p>
                    <p className="text-sm font-semibold">{selectedProfileLabel}</p>
                  </div>
                </div>
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-xs font-medium text-white/90">
                  {profiles.length} {profiles.length === 1 ? 'Child Profile' : 'Child Profiles'}
                </span>
              </div>
            </div>

            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddProfileForm((prev) => !prev);
                    setNotice(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
                >
                  <Plus className="h-4 w-4" />
                  Add Child Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManageProfilesMode((prev) => !prev);
                    setEditingProfileId(null);
                    setEditingProfileName('');
                    setNotice(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${manageProfilesMode
                      ? 'border-slate-800 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  <Settings2 className="h-4 w-4" />
                  {manageProfilesMode ? 'Managing Children' : 'Manage Child Profiles'}
                </button>
              </div>

              {notice && (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-sm ${notice.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                >
                  {notice.text}
                </div>
              )}

              {showAddProfileForm && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Child Name
                  </label>
                  <input
                    value={newProfileName}
                    onChange={(event) => setNewProfileName(event.target.value)}
                    placeholder="Enter child name"
                    maxLength={40}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddProfileForm(false);
                        setNewProfileName('');
                      }}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCreateProfile();
                      }}
                      disabled={isCreatingProfile}
                      className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreatingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                      Create
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Loading child profiles...
                  </div>
                ) : profiles.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No child profiles found. Use <span className="font-semibold">Add Child Profile</span> to create one.
                  </div>
                ) : (
                  profiles.map((profile) => {
                    const label = getProfileLabel(profile);
                    const initials = getProfileInitials(label);
                    const isActive = selectedProfile?.id === profile.id;
                    const isSavingThis = savingProfileId === profile.id;
                    const isDeletingThis = deletingProfileId === profile.id;

                    return (
                      <div
                        key={profile.id}
                        className={`rounded-2xl border px-4 py-3 transition ${isActive
                            ? 'border-teal-300 bg-teal-50/70'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                              style={{ backgroundColor: profile.avatar_color || '#14b8a6' }}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              {editingProfileId === profile.id ? (
                                <input
                                  value={editingProfileName}
                                  onChange={(event) => setEditingProfileName(event.target.value)}
                                  maxLength={40}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                                />
                              ) : (
                                <p className="truncate text-sm font-semibold text-slate-800">{label}</p>
                              )}
                              <p className="mt-0.5 text-xs text-slate-500">
                                {profile.is_primary ? 'Parent profile' : 'Child profile'}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              void handleSelectProfile(profile.id);
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${isActive
                                ? 'border border-teal-300 bg-white text-teal-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                          >
                            {isActive ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Selected
                              </>
                            ) : (
                              'Switch Profile'
                            )}
                          </button>
                        </div>

                        {manageProfilesMode && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                            {editingProfileId === profile.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleSaveProfileName(profile);
                                  }}
                                  disabled={isSavingThis}
                                  className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {isSavingThis && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                  Save Child Name
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProfileId(null);
                                    setEditingProfileName('');
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartEditingProfile(profile)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Rename
                              </button>
                            )}

                            {!profile.is_primary && (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleDeleteProfile(profile);
                                }}
                                disabled={isDeletingThis}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {isDeletingThis ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
