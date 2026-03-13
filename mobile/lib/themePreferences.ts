import * as SecureStore from 'expo-secure-store';

import {
  defaultThemeId,
  normalizeThemePaletteId,
  type ThemePaletteId,
} from '@/constants/appThemes';
import { supabase } from '@/lib/supabase';

const BASE_THEME_STORAGE_KEY = 'vytara_theme';
const USER_THEME_STORAGE_PREFIX = `${BASE_THEME_STORAGE_KEY}:`;
const THEME_PREFERENCE_COLUMN = 'selected_theme';

function getUserThemeStorageKey(userId: string) {
  return `${USER_THEME_STORAGE_PREFIX}${userId}`;
}

function hasMissingThemePreferenceColumnError(
  error: { code?: string; message?: string } | null | undefined
) {
  return (
    error?.code === 'PGRST204' ||
    error?.message?.toLowerCase().includes(THEME_PREFERENCE_COLUMN) ||
    false
  );
}

async function readStoredThemeValue(storageKey: string) {
  const storedTheme = await SecureStore.getItemAsync(storageKey);
  return storedTheme === null ? null : normalizeThemePaletteId(storedTheme);
}

export async function seedThemeForUserFromLegacy(userId: string) {
  if (!userId) return;

  const userStorageKey = getUserThemeStorageKey(userId);
  const userTheme = await SecureStore.getItemAsync(userStorageKey);
  if (userTheme !== null) return;

  const legacyTheme = await SecureStore.getItemAsync(BASE_THEME_STORAGE_KEY);
  if (legacyTheme === null) return;

  await SecureStore.setItemAsync(userStorageKey, normalizeThemePaletteId(legacyTheme));
}

export async function getStoredLocalTheme(userId?: string): Promise<ThemePaletteId | null> {
  const trimmedUserId = userId?.trim();
  if (trimmedUserId) {
    const accountTheme = await readStoredThemeValue(getUserThemeStorageKey(trimmedUserId));
    if (accountTheme !== null) {
      return accountTheme;
    }
  }

  return readStoredThemeValue(BASE_THEME_STORAGE_KEY);
}

export async function persistLocalTheme(themeId: string, userId?: string) {
  const normalizedTheme = normalizeThemePaletteId(themeId);
  const trimmedUserId = userId?.trim();

  if (trimmedUserId) {
    await SecureStore.setItemAsync(getUserThemeStorageKey(trimmedUserId), normalizedTheme);
  }

  await SecureStore.setItemAsync(BASE_THEME_STORAGE_KEY, normalizedTheme);
}

export async function getStoredThemeFromDatabase(
  userId: string
): Promise<ThemePaletteId | null> {
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
  return storedTheme === null ? null : normalizeThemePaletteId(storedTheme);
}

export async function persistThemeToDatabase(
  themeId: string,
  userId: string
): Promise<boolean> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return false;

  const normalizedTheme = normalizeThemePaletteId(themeId);
  const now = new Date().toISOString();

  const { error } = await supabase.from('user_profile_preferences').upsert(
    {
      user_id: trimmedUserId,
      [THEME_PREFERENCE_COLUMN]: normalizedTheme,
      updated_at: now,
    },
    {
      onConflict: 'user_id',
    }
  );

  if (error) {
    if (hasMissingThemePreferenceColumnError(error)) {
      return false;
    }
    throw error;
  }

  return true;
}

export function getDefaultThemePreference(): ThemePaletteId {
  return defaultThemeId;
}
