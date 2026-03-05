'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/createClient';
import { applyTheme, getCurrentTheme, isThemeStorageKey, seedThemeForUserFromLegacy } from '@/lib/themeUtils';

const resolveAndApplyTheme = (userId?: string) => {
  const nextTheme = getCurrentTheme(userId);
  applyTheme(nextTheme, userId);
};

export default function ThemeBootstrap() {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setUserId(session?.user?.id ?? '');
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? '');
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userId) {
      seedThemeForUserFromLegacy(userId);
      resolveAndApplyTheme(userId);
      return;
    }

    resolveAndApplyTheme();
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
