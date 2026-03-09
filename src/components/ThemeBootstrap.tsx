'use client';

import { useEffect, useRef } from 'react';
import { useAppProfile } from '@/components/AppProfileProvider';
import {
  applyTheme,
  getCurrentTheme,
  getStoredLocalTheme,
  getStoredThemeFromDatabase,
  isThemeStorageKey,
  persistThemeToDatabase,
  seedThemeForUserFromLegacy,
} from '@/lib/themeUtils';

const resolveAndApplyTheme = (userId?: string) => {
  const nextTheme = getCurrentTheme(userId);
  applyTheme(nextTheme, userId);
};

export default function ThemeBootstrap() {
  const { userId } = useAppProfile();
  const themeChangeVersionRef = useRef(0);

  useEffect(() => {
    const handleThemeSignal = () => {
      themeChangeVersionRef.current += 1;
    };

    window.addEventListener('themeChange', handleThemeSignal as EventListener);
    return () => window.removeEventListener('themeChange', handleThemeSignal as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (userId) {
      seedThemeForUserFromLegacy(userId);
      resolveAndApplyTheme(userId);

      const requestVersion = themeChangeVersionRef.current;
      const syncThemePreference = async () => {
        try {
          const storedTheme = await getStoredThemeFromDatabase(userId);
          if (cancelled || requestVersion !== themeChangeVersionRef.current) {
            return;
          }

          if (storedTheme !== null) {
            applyTheme(storedTheme, userId);
            return;
          }

          const localTheme = getStoredLocalTheme(userId);
          if (localTheme === null) {
            return;
          }

          await persistThemeToDatabase(localTheme, userId);
          if (cancelled) {
            return;
          }

          if (requestVersion !== themeChangeVersionRef.current) {
            const latestTheme = getStoredLocalTheme(userId);
            if (latestTheme !== null && latestTheme !== localTheme) {
              await persistThemeToDatabase(latestTheme, userId);
            }
          }
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Failed to sync theme preference:', error);
          }
        }
      };

      void syncThemePreference();
      return () => {
        cancelled = true;
      };
    }

    resolveAndApplyTheme();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const handleThemeSignal = () => resolveAndApplyTheme(userId || undefined);
    const handleStorage = (event: StorageEvent) => {
      if (isThemeStorageKey(event.key)) {
        resolveAndApplyTheme(userId || undefined);
      }
    };

    window.addEventListener('themeChange', handleThemeSignal as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('themeChange', handleThemeSignal as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [userId]);

  return null;
}
