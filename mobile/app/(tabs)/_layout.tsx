import React, { useEffect, useMemo, useRef, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatWidget } from '@/components/ChatWidget';

import { type AppThemeColors } from '@/constants/appThemes';
import { NotificationPanel } from '@/components/NotificationPanel';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { TourAnchor, useTourAnchor } from '@/providers/OnboardingTourProvider';
import {
  useNotifications,
  type CareCircleAcceptance,
  type CareCircleInvite,
  type MedicationReminderNotification,
  type UpcomingAppointment,
} from '@/hooks/useNotifications';
import type { SharedActivityLogRow } from '@/api/modules/carecircle';
import { type User } from '@/lib/supabase';
import type { OnboardingTourStepId } from '@/lib/onboardingTour';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

function TourTabBarButton({
  accessibilityLabel,
  accessibilityState,
  children,
  disabled,
  onLongPress,
  onPress,
  style,
  testID,
  tourId,
}: any & { tourId: OnboardingTourStepId }) {
  const anchor = useTourAnchor(tourId);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      collapsable={anchor.collapsable}
      disabled={disabled}
      onLayout={anchor.onLayout}
      onLongPress={onLongPress}
      onPress={onPress}
      ref={anchor.ref}
      style={style}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { selectedProfile } = useProfile();
  const router = useRouter();
  const notifications = useNotifications(user?.id, selectedProfile?.id);
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const baseTabBarHeight = 56;
  const tabBarHeight = baseTabBarHeight + insets.bottom;
  const backgroundColor = themeColors.background;
  const appHeaderHeight = insets.top + 54;

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: themeColors.tabBarActive,
          tabBarInactiveTintColor: themeColors.tabBarInactive,
          headerShown: true,
          headerTransparent: false,
          headerStatusBarHeight: 0,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: themeColors.headerGradientStart,
            height: appHeaderHeight,
            borderBottomWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            shadowColor: 'transparent',
          },
          header: () => (
            <AppHeader
              user={user}
              selectedProfile={selectedProfile}
              signOut={signOut}
              notifications={notifications}
              router={router}
              headerHeight={appHeaderHeight}
              themeColors={themeColors}
            />
          ),
          sceneStyle: {
            backgroundColor,
          },
          tabBarStyle: {
            height: tabBarHeight,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 8,
            backgroundColor: themeColors.tabBarBackground,
            borderTopWidth: 1,
            borderTopColor: themeColors.tabBarBorder,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
            tabBarButton: (props) => <TourTabBarButton {...props} tourId="nav-home" />,
          }}
        />
        <Tabs.Screen
          name="vault"
          options={{
            title: 'Vault',
            tabBarIcon: ({ color }) => <TabBarIcon name="folder" color={color} />,
            tabBarButton: (props) => <TourTabBarButton {...props} tourId="nav-vault" />,
          }}
        />
        <Tabs.Screen
          name="carecircle"
          options={{
            title: 'Care Circle',
            tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
            tabBarButton: (props) => <TourTabBarButton {...props} tourId="nav-care-circle" />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
            tabBarButton: (props) => <TourTabBarButton {...props} tourId="nav-profile" />,
          }}
        />
        <Tabs.Screen
          name="two"
          options={{
            href: null,
          }}
        />
      </Tabs>
      <ChatWidget />
    </View>
  );
}

type NotificationsState = ReturnType<typeof useNotifications>;

function AppHeader({
  user,
  selectedProfile,
  signOut,
  notifications,
  router,
  headerHeight,
  themeColors,
}: {
  user: User | null;
  selectedProfile: { id: string; name: string; display_name?: string | null } | null;
  signOut: () => Promise<void>;
  notifications: NotificationsState;
  router: ReturnType<typeof useRouter>;
  headerHeight: number;
  themeColors: AppThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const menuWidth = Math.min(Math.round(screenWidth * 0.58), 240);
  const [displayName, setDisplayName] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const {
    now,
    notificationsLoading,
    notificationsError,
    unreadAppointments,
    readAppointments,
    unreadMedicationReminders,
    readMedicationReminders,
    unreadInvites,
    readInvites,
    unreadAcceptances,
    readAcceptances,
    unreadFamilyActivity,
    readFamilyActivity,
    hasUnseenNotifications,
    hasHydratedSeen,
    markAllSeen,
    dismissNotification,
    activityLogs,
    logsLoading,
    logsLoadingMore,
    logsHasMore,
    logsError,
    loadMoreLogs,
    unreadLogsCount,
    markLogsSeen,
    hasHydratedSeenLogs,
  } = notifications;
  const [sessionUnreadAppointments, setSessionUnreadAppointments] = useState<UpcomingAppointment[] | null>(
    null
  );
  const [sessionUnreadMedicationReminders, setSessionUnreadMedicationReminders] = useState<
    MedicationReminderNotification[] | null
  >(null);
  const [sessionUnreadInvites, setSessionUnreadInvites] = useState<CareCircleInvite[] | null>(null);
  const [sessionUnreadAcceptances, setSessionUnreadAcceptances] = useState<CareCircleAcceptance[] | null>(
    null
  );
  const [sessionUnreadFamilyActivity, setSessionUnreadFamilyActivity] = useState<SharedActivityLogRow[] | null>(null);
  const sessionSnapshotDone = useRef(false);

  useEffect(() => {
    const nextName = selectedProfile?.display_name?.trim() || selectedProfile?.name?.trim() || '';
    setDisplayName(nextName);
  }, [selectedProfile?.id, selectedProfile?.display_name, selectedProfile?.name]);

  const initials = useMemo(() => {
    if (displayName) {
      const parts = displayName.trim().split(' ').filter(Boolean);
      const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
      return letters.join('') || 'CC';
    }
    if (user?.phone) {
      return user.phone.slice(-2);
    }
    return 'CC';
  }, [displayName, user?.phone]);

  const userLabel = displayName || user?.phone || 'Profile';
  const showNotificationIndicator = hasHydratedSeen && hasUnseenNotifications && !notificationVisible;

  useEffect(() => {
    if (!notificationVisible) {
      sessionSnapshotDone.current = false;
      setSessionUnreadAppointments(null);
      setSessionUnreadMedicationReminders(null);
      setSessionUnreadInvites(null);
      setSessionUnreadAcceptances(null);
      setSessionUnreadFamilyActivity(null);
      return;
    }
    if (sessionSnapshotDone.current) return;
    if (notificationsLoading) return;
    if (!hasHydratedSeen) return;
    sessionSnapshotDone.current = true;
    setSessionUnreadAppointments(unreadAppointments);
    setSessionUnreadMedicationReminders(unreadMedicationReminders);
    setSessionUnreadInvites(unreadInvites);
    setSessionUnreadAcceptances(unreadAcceptances);
    setSessionUnreadFamilyActivity(unreadFamilyActivity);
    markAllSeen();
  }, [
    notificationVisible,
    notificationsLoading,
    hasHydratedSeen,
    unreadAppointments,
    unreadMedicationReminders,
    unreadInvites,
    unreadAcceptances,
    unreadFamilyActivity,
    markAllSeen,
  ]);

  const unreadAppointmentsDisplay = hasHydratedSeen
    ? sessionUnreadAppointments ?? unreadAppointments
    : [];
  const unreadMedicationRemindersDisplay = hasHydratedSeen
    ? sessionUnreadMedicationReminders ?? unreadMedicationReminders
    : [];
  const unreadInvitesDisplay = hasHydratedSeen ? sessionUnreadInvites ?? unreadInvites : [];
  const unreadAcceptancesDisplay = hasHydratedSeen
    ? sessionUnreadAcceptances ?? unreadAcceptances
    : [];
  const unreadFamilyActivityDisplay = hasHydratedSeen
    ? sessionUnreadFamilyActivity ?? unreadFamilyActivity
    : [];
  const sessionUnreadAppointmentIds = useMemo(() => {
    if (!sessionUnreadAppointments) return null;
    return new Set(sessionUnreadAppointments.map(({ notificationId }) => notificationId));
  }, [sessionUnreadAppointments]);
  const sessionUnreadMedicationReminderIds = useMemo(() => {
    if (!sessionUnreadMedicationReminders) return null;
    return new Set(sessionUnreadMedicationReminders.map(({ notificationId }) => notificationId));
  }, [sessionUnreadMedicationReminders]);
  const sessionUnreadInviteIds = useMemo(() => {
    if (!sessionUnreadInvites) return null;
    return new Set(sessionUnreadInvites.map((invite) => invite.id));
  }, [sessionUnreadInvites]);
  const sessionUnreadAcceptanceIds = useMemo(() => {
    if (!sessionUnreadAcceptances) return null;
    return new Set(sessionUnreadAcceptances.map((invite) => invite.id));
  }, [sessionUnreadAcceptances]);
  const sessionUnreadFamilyActivityIds = useMemo(() => {
    if (!sessionUnreadFamilyActivity) return null;
    return new Set(sessionUnreadFamilyActivity.map((log) => log.id));
  }, [sessionUnreadFamilyActivity]);
  const readAppointmentsDisplay = useMemo(() => {
    if (!hasHydratedSeen) return [];
    if (!sessionUnreadAppointmentIds) return readAppointments;
    return readAppointments.filter(
      ({ notificationId }) => !sessionUnreadAppointmentIds.has(notificationId)
    );
  }, [readAppointments, sessionUnreadAppointmentIds, hasHydratedSeen]);
  const readMedicationRemindersDisplay = useMemo(() => {
    if (!hasHydratedSeen) return [];
    if (!sessionUnreadMedicationReminderIds) return readMedicationReminders;
    return readMedicationReminders.filter(
      ({ notificationId }) => !sessionUnreadMedicationReminderIds.has(notificationId)
    );
  }, [readMedicationReminders, sessionUnreadMedicationReminderIds, hasHydratedSeen]);
  const readInvitesDisplay = useMemo(() => {
    if (!hasHydratedSeen) return [];
    if (!sessionUnreadInviteIds) return readInvites;
    return readInvites.filter((invite) => !sessionUnreadInviteIds.has(invite.id));
  }, [readInvites, sessionUnreadInviteIds, hasHydratedSeen]);
  const readAcceptancesDisplay = useMemo(() => {
    if (!hasHydratedSeen) return [];
    if (!sessionUnreadAcceptanceIds) return readAcceptances;
    return readAcceptances.filter((invite) => !sessionUnreadAcceptanceIds.has(invite.id));
  }, [readAcceptances, sessionUnreadAcceptanceIds, hasHydratedSeen]);
  const readFamilyActivityDisplay = useMemo(() => {
    if (!hasHydratedSeen) return [];
    if (!sessionUnreadFamilyActivityIds) return readFamilyActivity;
    return readFamilyActivity.filter((log) => !sessionUnreadFamilyActivityIds.has(log.id));
  }, [readFamilyActivity, sessionUnreadFamilyActivityIds, hasHydratedSeen]);

  return (
    <>
      <View style={[styles.headerFrame, { height: headerHeight }]}>
        <LinearGradient
          colors={[themeColors.headerGradientStart, themeColors.headerGradientEnd]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.header, { paddingTop: insets.top + 4 }]}
        >
          <View style={styles.headerRow}>
            <TourAnchor tourId="nav-switch-profile">
              <Pressable
                onPress={() => setMenuVisible(true)}
                style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </Pressable>
            </TourAnchor>
            <TourAnchor tourId="home-notifications-mobile">
              <Pressable
                style={({ pressed }) => [styles.bellButton, pressed && styles.avatarPressed]}
                onPress={() => setNotificationVisible(true)}
              >
                <MaterialCommunityIcons
                  name="bell-outline"
                  size={20}
                  color={themeColors.headerForeground}
                />
                {showNotificationIndicator ? <View style={styles.notificationIndicator} /> : null}
              </Pressable>
            </TourAnchor>
          </View>
        </LinearGradient>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={[styles.menuCard, { top: insets.top + 58, width: menuWidth }]} onPress={() => { }}>
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}>
                <Text style={styles.menuAvatarText}>{initials}</Text>
              </View>
              <View style={styles.menuHeaderText}>
                <Text style={styles.menuName} numberOfLines={1}>
                  {userLabel}
                </Text>
                <Text style={styles.menuSubtext}>Account</Text>
              </View>
            </View>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                setMenuVisible(false);
                router.push('/profile-selection');
              }}
            >
              <MaterialCommunityIcons
                name="account-switch"
                size={18}
                color={themeColors.accentMuted}
              />
              <Text style={styles.menuItemText}>Switch Profile</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                setMenuVisible(false);
                router.push('/settings');
              }}
            >
              <MaterialCommunityIcons
                name="cog-outline"
                size={18}
                color={themeColors.accentMuted}
              />
              <Text style={styles.menuItemText}>Settings</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={async () => {
                setMenuVisible(false);
                await signOut();
              }}
            >
              <MaterialCommunityIcons
                name="logout"
                size={18}
                color={themeColors.dangerText}
              />
              <Text style={styles.menuItemTextDanger}>Log Out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <NotificationPanel
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        insets={insets}
        now={now}
        unreadAppointments={unreadAppointmentsDisplay}
        readAppointments={readAppointmentsDisplay}
        unreadMedicationReminders={unreadMedicationRemindersDisplay}
        readMedicationReminders={readMedicationRemindersDisplay}
        unreadInvites={unreadInvitesDisplay}
        readInvites={readInvitesDisplay}
        unreadAcceptances={unreadAcceptancesDisplay}
        readAcceptances={readAcceptancesDisplay}
        unreadFamilyActivity={unreadFamilyActivityDisplay}
        readFamilyActivity={readFamilyActivityDisplay}
        notificationsLoading={notificationsLoading}
        notificationsError={notificationsError}
        isHydrated={hasHydratedSeen}
        dismissNotification={dismissNotification}
        activityLogs={activityLogs}
        logsLoading={logsLoading}
        logsLoadingMore={logsLoadingMore}
        logsHasMore={logsHasMore}
        logsError={logsError}
        loadMoreLogs={loadMoreLogs}
        unreadLogsCount={unreadLogsCount}
        markLogsSeen={markLogsSeen}
        hasHydratedSeenLogs={hasHydratedSeenLogs}
      />
    </>
  );
}

function createStyles(themeColors: AppThemeColors) {
  return StyleSheet.create({
    headerFrame: {
      width: '100%',
      overflow: 'hidden',
      marginBottom: -2,
    },
    header: {
      flex: 1,
      paddingHorizontal: 28,
      paddingBottom: 0,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 2,
      minHeight: 46,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: themeColors.headerChipBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: themeColors.headerChipBorder,
    },
    avatarPressed: {
      transform: [{ scale: 0.96 }],
    },
    avatarText: {
      color: themeColors.headerChipText,
      fontWeight: '700',
    },
    bellButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: themeColors.headerChipBackground,
      borderWidth: 1,
      borderColor: themeColors.headerChipBorder,
    },
    notificationIndicator: {
      position: 'absolute',
      top: 5,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: themeColors.warning,
      borderWidth: 1,
      borderColor: themeColors.headerGradientStart,
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: themeColors.overlay,
    },
    menuCard: {
      position: 'absolute',
      left: 16,
      width: 220,
      borderRadius: 16,
      backgroundColor: themeColors.surfaceElevated,
      borderWidth: 1,
      borderColor: themeColors.border,
      padding: 12,
      shadowColor: themeColors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    menuHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    menuAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: themeColors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuAvatarText: {
      color: themeColors.accentStrong,
      fontWeight: '700',
      fontSize: 12,
    },
    menuHeaderText: {
      flex: 1,
    },
    menuName: {
      color: themeColors.textPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    menuSubtext: {
      color: themeColors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    menuDivider: {
      height: 1,
      backgroundColor: themeColors.border,
      marginVertical: 10,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 10,
    },
    menuItemPressed: {
      backgroundColor: themeColors.surfaceMuted,
    },
    menuItemText: {
      color: themeColors.accentStrong,
      fontWeight: '600',
      fontSize: 14,
    },
    menuItemTextDanger: {
      color: themeColors.dangerText,
      fontWeight: '600',
      fontSize: 14,
    },
  });
}
