const BASE_THEME_STORAGE_KEY = 'vytara_theme';
const USER_THEME_STORAGE_PREFIX = `${BASE_THEME_STORAGE_KEY}:`;

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

const hasAnyUserScopedTheme = () => {
  if (typeof window === 'undefined') return false;

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(USER_THEME_STORAGE_PREFIX)) {
      return true;
    }
  }

  return false;
};

export const isThemeStorageKey = (key: string | null) =>
  key !== null && (key === BASE_THEME_STORAGE_KEY || key.startsWith(USER_THEME_STORAGE_PREFIX));

export const seedThemeForUserFromLegacy = (userId: string) => {
  if (typeof window === 'undefined' || !userId) return;

  const userKey = getUserThemeStorageKey(userId);
  if (window.localStorage.getItem(userKey) !== null) return;
  if (hasAnyUserScopedTheme()) return;

  const legacyTheme = window.localStorage.getItem(BASE_THEME_STORAGE_KEY);
  if (legacyTheme === null) return;

  window.localStorage.setItem(userKey, normalizeTheme(legacyTheme));
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
  if (typeof window === 'undefined') return 'default';

  const trimmedUserId = userId?.trim();
  if (trimmedUserId) {
    const accountTheme = window.localStorage.getItem(getUserThemeStorageKey(trimmedUserId));
    if (accountTheme !== null) {
      return normalizeTheme(accountTheme);
    }

    if (!hasAnyUserScopedTheme()) {
      return normalizeTheme(window.localStorage.getItem(BASE_THEME_STORAGE_KEY));
    }

    return 'default';
  }

  return normalizeTheme(window.localStorage.getItem(BASE_THEME_STORAGE_KEY));
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
