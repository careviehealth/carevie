import * as FileSystem from 'expo-file-system/legacy';

import { clearRememberedDevice } from '@/lib/rememberDevice';
import { supabase } from '@/lib/supabase';

const INSTALL_MARKER_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}vytara-install-marker`
  : null;

/**
 * iOS keychain-backed values can survive uninstall/reinstall. We keep a marker
 * in app-local storage (removed on uninstall) and clear auth data when missing.
 */
export const clearPersistedAuthOnFreshInstall = async () => {
  if (!INSTALL_MARKER_PATH) return;

  try {
    const markerInfo = await FileSystem.getInfoAsync(INSTALL_MARKER_PATH);

    if (!markerInfo.exists) {
      await Promise.allSettled([
        supabase.auth.signOut({ scope: 'local' }),
        clearRememberedDevice(),
      ]);

      await FileSystem.writeAsStringAsync(INSTALL_MARKER_PATH, new Date().toISOString());
    }
  } catch (error) {
    console.warn('Failed to verify install marker for auth reset:', error);
  }
};
