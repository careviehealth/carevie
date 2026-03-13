import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  appThemes,
  defaultThemeId,
  getAppTheme,
  normalizeThemePaletteId,
  type AppThemeColors,
  type AppThemeDefinition,
  type ThemeColorScheme,
  type ThemePaletteId,
} from '@/constants/appThemes';
import { useAuth } from '@/hooks/useAuth';
import {
  getStoredLocalTheme,
  getStoredThemeFromDatabase,
  persistLocalTheme,
  persistThemeToDatabase,
  seedThemeForUserFromLegacy,
} from '@/lib/themePreferences';

type AppThemeContextValue = {
  colorScheme: ThemeColorScheme;
  selectedThemeId: ThemePaletteId;
  selectedTheme: AppThemeDefinition;
  colors: AppThemeColors;
  navigationTheme: AppThemeDefinition['navigationTheme'];
  themes: AppThemeDefinition[];
  isHydrated: boolean;
  isSyncing: boolean;
  setSelectedTheme: (themeId: ThemePaletteId) => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [selectedThemeId, setSelectedThemeId] = useState<ThemePaletteId>(defaultThemeId);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const selectionVersionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const beginSync = useCallback(() => {
    setPendingSyncCount((count) => count + 1);
  }, []);

  const endSync = useCallback(() => {
    setPendingSyncCount((count) => Math.max(0, count - 1));
  }, []);

  const persistThemeLocally = useCallback(async (themeId: ThemePaletteId, nextUserId?: string) => {
    try {
      await persistLocalTheme(themeId, nextUserId);
    } catch (error) {
      console.warn('Failed to store theme locally:', error);
    }
  }, []);

  const queueDatabaseThemeSave = useCallback(
    (themeId: ThemePaletteId, nextUserId: string) => {
      if (!nextUserId.trim()) {
        return Promise.resolve();
      }

      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          beginSync();
          try {
            await persistThemeToDatabase(themeId, nextUserId);
          } catch (error) {
            console.warn('Failed to sync theme preference:', error);
          } finally {
            endSync();
          }
        });

      return saveQueueRef.current;
    },
    [beginSync, endSync]
  );

  useEffect(() => {
    let cancelled = false;
    const activeUserId = userId.trim();
    const bootstrapSelectionVersion = selectionVersionRef.current;

    const hydrateThemePreference = async () => {
      setIsHydrated(false);

      let localThemeId = defaultThemeId;

      try {
        if (activeUserId) {
          await seedThemeForUserFromLegacy(activeUserId);
        }

        const storedLocalTheme = await getStoredLocalTheme(activeUserId || undefined);
        localThemeId = storedLocalTheme ?? defaultThemeId;
      } catch (error) {
        console.warn('Failed to read stored theme preference:', error);
      }

      if (cancelled) return;

      setSelectedThemeId(localThemeId);
      setIsHydrated(true);

      if (!activeUserId) return;

      beginSync();
      try {
        const storedRemoteTheme = await getStoredThemeFromDatabase(activeUserId);
        if (cancelled) return;

        if (selectionVersionRef.current !== bootstrapSelectionVersion) {
          return;
        }

        if (storedRemoteTheme) {
          if (storedRemoteTheme !== localThemeId) {
            setSelectedThemeId(storedRemoteTheme);
            await persistThemeLocally(storedRemoteTheme, activeUserId);
          }
          return;
        }

        await queueDatabaseThemeSave(localThemeId, activeUserId);
      } catch (error) {
        console.warn('Failed to restore remote theme preference:', error);
      } finally {
        endSync();
      }
    };

    hydrateThemePreference();

    return () => {
      cancelled = true;
    };
  }, [beginSync, endSync, persistThemeLocally, queueDatabaseThemeSave, userId]);

  const setSelectedTheme = useCallback(
    async (themeId: ThemePaletteId) => {
      const normalizedThemeId = normalizeThemePaletteId(themeId);
      selectionVersionRef.current += 1;
      setSelectedThemeId(normalizedThemeId);

      await persistThemeLocally(normalizedThemeId, userId || undefined);

      if (userId) {
        await queueDatabaseThemeSave(normalizedThemeId, userId);
      }
    },
    [persistThemeLocally, queueDatabaseThemeSave, userId]
  );

  const selectedTheme = useMemo(() => getAppTheme(selectedThemeId), [selectedThemeId]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      colorScheme: selectedTheme.colorScheme,
      selectedThemeId,
      selectedTheme,
      colors: selectedTheme.colors,
      navigationTheme: selectedTheme.navigationTheme,
      themes: appThemes,
      isHydrated,
      isSyncing: pendingSyncCount > 0,
      setSelectedTheme,
    }),
    [isHydrated, pendingSyncCount, selectedTheme, selectedThemeId, setSelectedTheme]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppThemeContext() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppThemeContext must be used within an AppThemeProvider');
  }
  return context;
}

export function useOptionalAppTheme() {
  return useContext(AppThemeContext);
}
