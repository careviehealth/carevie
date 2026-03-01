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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { NotificationPanel } from '@/components/NotificationPanel';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useColorScheme } from '@/components/useColorScheme';
import {
  useNotifications,
  type CareCircleAcceptance,
  type CareCircleInvite,
  type UpcomingAppointment,
} from '@/hooks/useNotifications';
import { type User } from '@/lib/supabase';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { selectedProfile } = useProfile();
  const router = useRouter();
  const notifications = useNotifications(user?.id, selectedProfile?.id);
  const baseTabBarHeight = 56;
  const tabBarHeight = baseTabBarHeight + insets.bottom;
  const theme = colorScheme ?? 'light';
  const backgroundColor = Colors[theme].background;
  const tabBarBackground = '#1f2f33';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#eef7f7',
        tabBarInactiveTintColor: '#8fa1a6',
        headerShown: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: 'transparent',
        },
        header: () => (
          <AppHeader
            user={user}
            selectedProfile={selectedProfile}
            signOut={signOut}
            notifications={notifications}
            router={router}
          />
        ),
        sceneStyle: {
          backgroundColor,
        },
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          backgroundColor: tabBarBackground,
          borderTopColor: '#1a2629',
        },
      }}>
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
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ color }) => <TabBarIcon name="folder" color={color} />,
        }}
      />
      <Tabs.Screen
        name="carecircle"
        options={{
          title: 'Care Circle',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

type NotificationsState = ReturnType<typeof useNotifications>;

function AppHeader({
  user,
  selectedProfile,
  signOut,
  notifications,
  router,
}: {
  user: User | null;
  selectedProfile: { id: string; name: string; display_name?: string | null } | null;
  signOut: () => Promise<void>;
  notifications: NotificationsState;
  router: ReturnType<typeof useRouter>;
}) {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const {
    now,
    notificationsLoading,
    notificationsError,
    unreadAppointments,
    readAppointments,
    unreadInvites,
    readInvites,
    unreadAcceptances,
    readAcceptances,
    hasUnseenNotifications,
    hasHydratedSeen,
    markAllSeen,
  } = notifications;
  const [sessionUnreadAppointments, setSessionUnreadAppointments] = useState<UpcomingAppointment[] | null>(
    null
  );
  const [sessionUnreadInvites, setSessionUnreadInvites] = useState<CareCircleInvite[] | null>(null);
  const [sessionUnreadAcceptances, setSessionUnreadAcceptances] = useState<CareCircleAcceptance[] | null>(
    null
  );
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
      setSessionUnreadInvites(null);
      setSessionUnreadAcceptances(null);
      return;
    }
    if (sessionSnapshotDone.current) return;
    if (notificationsLoading) return;
    if (!hasHydratedSeen) return;
    sessionSnapshotDone.current = true;
    setSessionUnreadAppointments(unreadAppointments);
    setSessionUnreadInvites(unreadInvites);
    setSessionUnreadAcceptances(unreadAcceptances);
    markAllSeen();
  }, [
    notificationVisible,
    notificationsLoading,
    hasHydratedSeen,
    unreadAppointments,
    unreadInvites,
    unreadAcceptances,
    markAllSeen,
  ]);

  const unreadAppointmentsDisplay = hasHydratedSeen
    ? sessionUnreadAppointments ?? unreadAppointments
    : [];
  const unreadInvitesDisplay = hasHydratedSeen ? sessionUnreadInvites ?? unreadInvites : [];
  const unreadAcceptancesDisplay = hasHydratedSeen
    ? sessionUnreadAcceptances ?? unreadAcceptances
    : [];
  const sessionUnreadAppointmentIds = useMemo(() => {
    if (!sessionUnreadAppointments) return null;
    return new Set(sessionUnreadAppointments.map(({ appointment }) => appointment.id));
  }, [sessionUnreadAppointments]);
  const sessionUnreadInviteIds = useMemo(() => {
    if (!sessionUnreadInvites) return null;
    return new Set(sessionUnreadInvites.map((invite) => invite.id));
  }, [sessionUnreadInvites]);
  const sessionUnreadAcceptanceIds = useMemo(() => {
    if (!sessionUnreadAcceptances) return null;
    return new Set(sessionUnreadAcceptances.map((invite) => invite.id));
  }, [sessionUnreadAcceptances]);
  const readAppointmentsDisplay = useMemo(() => {
    if (!hasHydratedSeen) return [];
    if (!sessionUnreadAppointmentIds) return readAppointments;
    return readAppointments.filter(({ appointment }) => !sessionUnreadAppointmentIds.has(appointment.id));
  }, [readAppointments, sessionUnreadAppointmentIds, hasHydratedSeen]);
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

  return (
    <>
      <View style={styles.headerFrame}>
        <LinearGradient
          colors={['#2f565f', '#6aa6a8']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 4 }]}
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => setMenuVisible(true)}
              style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.bellButton, pressed && styles.avatarPressed]}
              onPress={() => setNotificationVisible(true)}
            >
              <MaterialCommunityIcons name="bell-outline" size={20} color="#eaf6f5" />
              {showNotificationIndicator ? <View style={styles.notificationIndicator} /> : null}
            </Pressable>
          </View>
        </LinearGradient>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={[styles.menuCard, { top: insets.top + 58 }]} onPress={() => { }}>
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
              <MaterialCommunityIcons name="account-switch" size={18} color="#309898" />
              <Text style={styles.menuItemText}>Switch Profile</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={async () => {
                setMenuVisible(false);
                await signOut();
              }}
            >
              <MaterialCommunityIcons name="logout" size={18} color="#b42318" />
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
        unreadInvites={unreadInvitesDisplay}
        readInvites={readInvitesDisplay}
        unreadAcceptances={unreadAcceptancesDisplay}
        readAcceptances={readAcceptancesDisplay}
        notificationsLoading={notificationsLoading}
        notificationsError={notificationsError}
        isHydrated={hasHydratedSeen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerFrame: {
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  header: {
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
    backgroundColor: '#d6e6e6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarPressed: {
    transform: [{ scale: 0.96 }],
  },
  avatarText: {
    color: '#32565d',
    fontWeight: '700',
  },
  bellButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  notificationIndicator: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f97316',
    borderWidth: 1,
    borderColor: '#2f565f',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 24, 28, 0.25)',
  },
  menuCard: {
    position: 'absolute',
    left: 16,
    width: 220,
    borderRadius: 16,
    backgroundColor: '#f7fbfb',
    borderWidth: 1,
    borderColor: '#d9e3e6',
    padding: 12,
    shadowColor: '#1b2b2f',
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
    backgroundColor: '#d6e6e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAvatarText: {
    color: '#32565d',
    fontWeight: '700',
    fontSize: 12,
  },
  menuHeaderText: {
    flex: 1,
  },
  menuName: {
    color: '#122023',
    fontWeight: '700',
    fontSize: 14,
  },
  menuSubtext: {
    color: '#6b7f86',
    fontSize: 12,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#e1eaec',
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
    backgroundColor: '#f0f5f6',
  },
  menuItemText: {
    color: '#309898',
    fontWeight: '600',
    fontSize: 14,
  },
  menuItemTextDanger: {
    color: '#b42318',
    fontWeight: '600',
    fontSize: 14,
  },
});
