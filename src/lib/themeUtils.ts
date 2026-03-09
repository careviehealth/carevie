import { supabase } from '@/lib/createClient';

const BASE_THEME_STORAGE_KEY = 'vytara_theme';
const USER_THEME_STORAGE_PREFIX = `${BASE_THEME_STORAGE_KEY}:`;
const THEME_PREFERENCE_COLUMN = 'selected_theme';

const themeValues = new Set([
  'default',
  'charcoal',
  'clay',
  'olive',
  'coffee',
  'ocean',
  'sunset',
  'lemon',
  'lavender',
  'cherryblue',
]);

const normalizeTheme = (theme: string | null | undefined) =>
  theme && themeValues.has(theme) ? theme : 'default';

const getUserThemeStorageKey = (userId: string) => `${USER_THEME_STORAGE_PREFIX}${userId}`;

const hasMissingThemePreferenceColumnError = (
  error: { code?: string; message?: string } | null | undefined
) =>
  error?.code === 'PGRST204' ||
  error?.message?.toLowerCase().includes(THEME_PREFERENCE_COLUMN) ||
  false;

const readStoredThemeValue = (storageKey: string) => {
  if (typeof window === 'undefined') return null;

  const storedTheme = window.localStorage.getItem(storageKey);
  return storedTheme === null ? null : normalizeTheme(storedTheme);
};

export const getAppliedTheme = (): string => {
  if (typeof document === 'undefined') return 'default';

  const root = document.documentElement;
  for (const theme of themeValues) {
    if (theme === 'default') continue;
    if (root.classList.contains(`theme-${theme}`)) {
      return theme;
    }
  }

  return 'default';
};

export const isThemeStorageKey = (key: string | null) =>
  key !== null && (key === BASE_THEME_STORAGE_KEY || key.startsWith(USER_THEME_STORAGE_PREFIX));

export const seedThemeForUserFromLegacy = (userId: string) => {
  if (typeof window === 'undefined' || !userId) return;

  const userKey = getUserThemeStorageKey(userId);
  if (window.localStorage.getItem(userKey) !== null) return;

  const legacyTheme = window.localStorage.getItem(BASE_THEME_STORAGE_KEY);
  if (legacyTheme === null) return;

  window.localStorage.setItem(userKey, normalizeTheme(legacyTheme));
};

export const getStoredLocalTheme = (userId?: string): string | null => {
  if (typeof window === 'undefined') return null;

  const trimmedUserId = userId?.trim();
  if (trimmedUserId) {
    const accountTheme = readStoredThemeValue(getUserThemeStorageKey(trimmedUserId));
    if (accountTheme !== null) {
      return accountTheme;
    }
  }

  return readStoredThemeValue(BASE_THEME_STORAGE_KEY);
};

export const applyTheme = (theme: string, userId?: string) => {
  const root = document.documentElement;
  const normalizedTheme = normalizeTheme(theme);

  // Remove existing theme classes
  root.classList.remove(
    'theme-charcoal',
    'theme-clay',
    'theme-olive',
    'theme-coffee',
    'theme-ocean',
    'theme-sunset',
    'theme-lemon',
    'theme-lavender',
    'theme-cherryblue'
  );

  // Apply new theme
  if (normalizedTheme !== 'default') {
    root.classList.add(`theme-${normalizedTheme}`);
  }

  if (typeof window === 'undefined') return;

  const trimmedUserId = userId?.trim();
  if (trimmedUserId) {
    window.localStorage.setItem(getUserThemeStorageKey(trimmedUserId), normalizedTheme);
  }

  // Keep legacy key in sync for first render fallback before auth session resolves.
  window.localStorage.setItem(BASE_THEME_STORAGE_KEY, normalizedTheme);
};

export const getCurrentTheme = (userId?: string): string => {
  return getStoredLocalTheme(userId) ?? 'default';
};

export const getStoredThemeFromDatabase = async (userId: string): Promise<string | null> => {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const { data, error } = await supabase
    .from('user_profile_preferences')
    .select(THEME_PREFERENCE_COLUMN)
    .eq('user_id', trimmedUserId)
    .maybeSingle();

  if (error) {
    if (hasMissingThemePreferenceColumnError(error)) {
      return null;
    }
    throw error;
  }

  const storedTheme = (data?.[THEME_PREFERENCE_COLUMN] ?? null) as string | null;
  return storedTheme === null ? null : normalizeTheme(storedTheme);
};

export const persistThemeToDatabase = async (theme: string, userId: string): Promise<boolean> => {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return false;

  const normalizedTheme = normalizeTheme(theme);
  const now = new Date().toISOString();
  const { error } = await supabase.from('user_profile_preferences').upsert(
    {
      user_id: trimmedUserId,
      [THEME_PREFERENCE_COLUMN]: normalizedTheme,
      updated_at: now,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    if (hasMissingThemePreferenceColumnError(error)) {
      return false;
    }
    throw error;
  }

  return true;
};

export const themes = [
  { name: 'Default', value: 'default', color: '#14b8a6' },
  { name: 'Charcoal', value: 'charcoal', color: '#374151' },
  { name: 'Clay', value: 'clay', color: '#a855f7' },
  { name: 'Olive', value: 'olive', color: '#84cc16' },
  { name: 'Coffee', value: 'coffee', color: '#78350f' },
  { name: 'Ocean', value: 'ocean', color: '#0ea5e9' },
  { name: 'Sunset', value: 'sunset', color: '#f97316' },
  { name: 'Lemon', value: 'lemon', color: '#eab308' },
  { name: 'Lavender', value: 'lavender', color: '#c084fc' },
  { name: 'Cherryblue', value: 'cherryblue', color: '#2563eb' },
];
