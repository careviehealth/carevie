// Settings block for notification controls. Three UI states flow into each
// other:
//
//   1. Permission not yet granted (undetermined / denied-but-can-ask / blocked).
//      Show an "Enable notifications" CTA. If the OS still allows prompting,
//      the CTA calls registerExpoPushToken({ promptIfNeeded: true }) to trigger
//      the one-shot system dialog (iOS only gets ONE). If the user already
//      denied with canAskAgain=false, we route them to the system settings app
//      instead — there's no other way back.
//
//   2. Permission granted + mobile push toggle. Writes channel_mobile_push
//      through the shared /api/notifications/preferences endpoint so web and
//      mobile both respect the same flag.
//
//   3. Registered device list with per-device revoke. Revoking calls the expo
//      unsubscribe endpoint (which flips disabled_at on the row, preserving
//      audit history) and locally drops the row from the list.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';

import { Text } from '@/components/Themed';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';
import { toast } from '@/lib/toast';
import { registerExpoPushToken } from '@/lib/expoPushRegistration';
import {
  fetchNotificationPreferences,
  listExpoEndpoints,
  unsubscribeExpoPushToken,
  updateNotificationPreferences,
  type ExpoEndpointSummary,
} from '@/api/modules/notifications';

type PermissionState = 'granted' | 'denied-can-ask' | 'denied-blocked' | 'undetermined' | 'unknown';

const readPermission = async (): Promise<PermissionState> => {
  try {
    const res = await Notifications.getPermissionsAsync();
    if (res.status === 'granted') return 'granted';
    if (res.status === 'denied') return res.canAskAgain ? 'denied-can-ask' : 'denied-blocked';
    return 'undetermined';
  } catch {
    return 'unknown';
  }
};

const formatLastSeen = (iso: string): string => {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'unknown';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const describePlatform = (platform: string | null): string => {
  if (!platform) return 'Device';
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  return platform;
};

const iconForPlatform = (platform: string | null): 'apple' | 'android' | 'cellphone' => {
  if (platform === 'ios') return 'apple';
  if (platform === 'android') return 'android';
  return 'cellphone';
};

export function NotificationsSettingsSection() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [mobilePushEnabled, setMobilePushEnabled] = useState<boolean>(true);
  const [endpoints, setEndpoints] = useState<ExpoEndpointSummary[]>([]);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(true);
  const [isTogglingPref, setIsTogglingPref] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [revokingEndpointId, setRevokingEndpointId] = useState<string | null>(null);

  const refreshPermission = useCallback(async () => {
    const next = await readPermission();
    setPermission(next);
    return next;
  }, []);

  const loadPreferences = useCallback(async () => {
    setIsLoadingPrefs(true);
    try {
      const res = await fetchNotificationPreferences();
      setMobilePushEnabled(res.preferences.channel_mobile_push);
    } catch (err) {
      console.warn('[settings/notifications] failed to load preferences:', err);
    } finally {
      setIsLoadingPrefs(false);
    }
  }, []);

  const loadEndpoints = useCallback(async () => {
    setIsLoadingEndpoints(true);
    try {
      const res = await listExpoEndpoints();
      setEndpoints(res.endpoints);
    } catch (err) {
      console.warn('[settings/notifications] failed to load endpoints:', err);
    } finally {
      setIsLoadingEndpoints(false);
    }
  }, []);

  useEffect(() => {
    void refreshPermission();
    void loadPreferences();
    void loadEndpoints();
  }, [refreshPermission, loadPreferences, loadEndpoints]);

  const handleEnableNotifications = useCallback(async () => {
    if (isEnabling) return;
    setIsEnabling(true);
    try {
      // If the OS has blocked us (denied-blocked), no amount of prompting
      // will re-open the system dialog. Route the user to system settings.
      if (permission === 'denied-blocked') {
        await Linking.openSettings();
        return;
      }
      const outcome = await registerExpoPushToken({ promptIfNeeded: true });
      if (outcome.status === 'registered') {
        toast.success('Notifications enabled', 'This device will now receive push alerts.');
        await refreshPermission();
        await loadEndpoints();
      } else if (outcome.status === 'permission-denied') {
        toast.error(
          'Permission denied',
          'Open iOS Settings → Notifications to re-enable push for Vytara.'
        );
        await refreshPermission();
      } else if (outcome.status === 'unsupported-device') {
        toast.error('Not supported', 'Push notifications require a physical device.');
      } else if (outcome.status === 'missing-project-id') {
        toast.error('Configuration error', 'EAS project id is missing from app.json.');
      } else if (outcome.status === 'error') {
        toast.error('Could not enable', outcome.message);
      } else {
        await refreshPermission();
      }
    } finally {
      setIsEnabling(false);
    }
  }, [isEnabling, permission, refreshPermission, loadEndpoints]);

  const handleToggleMobilePush = useCallback(
    async (next: boolean) => {
      if (isTogglingPref) return;
      const prev = mobilePushEnabled;
      setMobilePushEnabled(next);
      setIsTogglingPref(true);
      try {
        await updateNotificationPreferences({ channel_mobile_push: next });
      } catch (err) {
        setMobilePushEnabled(prev);
        toast.error(
          'Could not update',
          err instanceof Error ? err.message : 'Please try again in a moment.'
        );
      } finally {
        setIsTogglingPref(false);
      }
    },
    [isTogglingPref, mobilePushEnabled]
  );

  const handleRevoke = useCallback(
    async (endpoint: ExpoEndpointSummary) => {
      if (!endpoint.expoPushToken) return;
      if (revokingEndpointId) return;
      setRevokingEndpointId(endpoint.id);
      try {
        await unsubscribeExpoPushToken(endpoint.expoPushToken);
        setEndpoints((prev) => prev.filter((row) => row.id !== endpoint.id));
        toast.success('Device removed', 'This device will stop receiving push alerts.');
      } catch (err) {
        toast.error(
          'Could not remove device',
          err instanceof Error ? err.message : 'Please try again in a moment.'
        );
      } finally {
        setRevokingEndpointId(null);
      }
    },
    [revokingEndpointId]
  );

  const showPermissionCta = permission !== 'granted';

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderIcon}>
          <MaterialCommunityIcons name="bell-outline" size={18} color={colors.accentStrong} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionDescription}>
            Manage push alerts for medications, appointments, and care activity.
          </Text>
        </View>
      </View>

      {showPermissionCta ? (
        <Pressable
          onPress={() => void handleEnableNotifications()}
          disabled={isEnabling}
          style={({ pressed }) => [
            styles.ctaCard,
            pressed && !isEnabling && styles.ctaCardPressed,
            isEnabling && styles.disabledOpacity,
          ]}
        >
          <MaterialCommunityIcons name="bell-ring-outline" size={20} color={colors.accentStrong} />
          <View style={styles.ctaText}>
            <Text style={styles.ctaTitle}>
              {permission === 'denied-blocked' ? 'Open system settings' : 'Enable notifications'}
            </Text>
            <Text style={styles.ctaHint}>
              {permission === 'denied-blocked'
                ? `${describePlatform(Platform.OS)} has blocked push for Vytara. Re-enable it in system settings.`
                : 'Grant permission so we can remind you about medications and appointments.'}
            </Text>
          </View>
          {isEnabling ? (
            <ActivityIndicator size="small" color={colors.accentStrong} />
          ) : (
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
          )}
        </Pressable>
      ) : (
        <View style={styles.toggleCard}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>Mobile push</Text>
            <Text style={styles.toggleHint}>
              Turn off to silence push on all your devices without removing them.
            </Text>
          </View>
          {isLoadingPrefs || isTogglingPref ? (
            <ActivityIndicator size="small" color={colors.accentStrong} />
          ) : (
            <Switch
              value={mobilePushEnabled}
              onValueChange={(next) => void handleToggleMobilePush(next)}
              trackColor={{ false: colors.border, true: colors.accentStrong }}
              thumbColor="#ffffff"
            />
          )}
        </View>
      )}

      <View style={styles.devicesHeader}>
        <Text style={styles.devicesHeading}>Registered devices</Text>
        {endpoints.length > 0 ? (
          <View style={styles.deviceBadge}>
            <Text style={styles.deviceBadgeText}>{endpoints.length}</Text>
          </View>
        ) : null}
      </View>

      {isLoadingEndpoints ? (
        <View style={styles.devicesLoading}>
          <ActivityIndicator size="small" color={colors.accentStrong} />
          <Text style={styles.devicesLoadingText}>Loading devices…</Text>
        </View>
      ) : endpoints.length === 0 ? (
        <View style={styles.emptyDevicesCard}>
          <MaterialCommunityIcons name="cellphone-off" size={18} color={colors.textTertiary} />
          <Text style={styles.emptyDevicesText}>
            No devices registered yet. Enable notifications on a device to see it here.
          </Text>
        </View>
      ) : (
        endpoints.map((endpoint) => {
          const isRevoking = revokingEndpointId === endpoint.id;
          return (
            <View key={endpoint.id} style={styles.deviceRow}>
              <View style={styles.deviceIcon}>
                <MaterialCommunityIcons
                  name={iconForPlatform(endpoint.platform)}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>
                  {describePlatform(endpoint.platform)}
                  {endpoint.appVersion ? ` · v${endpoint.appVersion}` : ''}
                </Text>
                <Text style={styles.deviceMeta}>Last seen {formatLastSeen(endpoint.lastSeenAt)}</Text>
              </View>
              <Pressable
                onPress={() => void handleRevoke(endpoint)}
                disabled={isRevoking}
                style={({ pressed }) => [
                  styles.revokeButton,
                  pressed && !isRevoking && styles.revokeButtonPressed,
                  isRevoking && styles.disabledOpacity,
                ]}
              >
                {isRevoking ? (
                  <ActivityIndicator size="small" color={colors.dangerText} />
                ) : (
                  <Text style={styles.revokeButtonText}>Remove</Text>
                )}
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    sectionHeaderIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionHeaderText: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    sectionDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    ctaCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    ctaCardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    ctaText: {
      flex: 1,
    },
    ctaTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    ctaHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    toggleText: {
      flex: 1,
    },
    toggleLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    toggleHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    devicesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      marginBottom: 8,
    },
    devicesHeading: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    deviceBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    deviceBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    devicesLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    devicesLoadingText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    emptyDevicesCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    emptyDevicesText: {
      flex: 1,
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    deviceIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deviceInfo: {
      flex: 1,
    },
    deviceName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    deviceMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    revokeButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.surface,
    },
    revokeButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    revokeButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.dangerText,
    },
    disabledOpacity: {
      opacity: 0.6,
    },
  });
}
