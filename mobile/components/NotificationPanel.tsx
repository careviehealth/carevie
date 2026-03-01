import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  CareCircleAcceptance,
  CareCircleInvite,
  UpcomingAppointment,
} from '@/hooks/useNotifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ANIMATION_DURATION = 280;

type Props = {
  visible: boolean;
  onClose: () => void;
  insets: { top: number; bottom: number; left: number; right: number };
  now: Date;
  unreadAppointments: UpcomingAppointment[];
  readAppointments: UpcomingAppointment[];
  unreadInvites: CareCircleInvite[];
  readInvites: CareCircleInvite[];
  unreadAcceptances: CareCircleAcceptance[];
  readAcceptances: CareCircleAcceptance[];
  notificationsLoading: boolean;
  notificationsError: string | null;
  isHydrated: boolean;
};

export function NotificationPanel({
  visible,
  onClose,
  insets,
  now,
  unreadAppointments,
  readAppointments,
  unreadInvites,
  readInvites,
  unreadAcceptances,
  readAcceptances,
  notificationsLoading,
  notificationsError,
  isHydrated,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');
  const [segmentWidth, setSegmentWidth] = useState(0);
  const segmentTranslate = useRef(new Animated.Value(0)).current;
  const wasVisible = useRef(false);

  const unreadCount = unreadAppointments.length + unreadInvites.length + unreadAcceptances.length;
  const readCount = readAppointments.length + readInvites.length + readAcceptances.length;
  const totalNotifications = unreadCount + readCount;
  const isReadView = activeTab === 'read';
  const activeAppointments = isReadView ? readAppointments : unreadAppointments;
  const activeInvites = isReadView ? readInvites : unreadInvites;
  const activeAcceptances = isReadView ? readAcceptances : unreadAcceptances;
  const activeCount = isReadView ? readCount : unreadCount;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_WIDTH);
      overlayAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
    }
  }, [visible, overlayAnim, slideAnim]);

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (!wasVisible.current) {
      setActiveTab(unreadCount === 0 && readCount > 0 ? 'read' : 'unread');
      wasVisible.current = true;
    }
  }, [visible, unreadCount, readCount]);

  useEffect(() => {
    const toValue = isReadView ? segmentWidth : 0;
    Animated.spring(segmentTranslate, {
      toValue,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [isReadView, segmentWidth, segmentTranslate]);

  const handleClose = () => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_WIDTH,
          duration: ANIMATION_DURATION * 0.85,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION * 0.85,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
      ]).start(() => onClose());
    }
  };

  const handleNavigate = (route: string) => {
    handleClose();
    router.push(route);
  };

  const handleSegmentLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const width = event.nativeEvent.layout.width;
    const padding = 8;
    const nextWidth = Math.max(0, (width - padding) / 2);
    setSegmentWidth(nextWidth);
  };

  const formatInviteTimestamp = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Just now';

    const diffMs = now.getTime() - parsed.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimeUntil = (target: Date) => {
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return 'Starting now';
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) return `In ${diffMinutes}m`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `In ${diffHours}h`;
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: overlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.45],
              }),
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            {
              width: SCREEN_WIDTH,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateX: slideAnim }],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.header}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={28} color="#1f2f33" />
            </Pressable>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Notifications</Text>
            </View>
            <View style={styles.backPlaceholder} />
          </View>
          <View style={styles.content}>
            {!isHydrated && totalNotifications === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="bell-outline" size={26} color="#9fb1b6" />
                <Text style={styles.statusText}>Syncing notifications...</Text>
              </View>
            ) : notificationsLoading && totalNotifications === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="bell-outline" size={26} color="#9fb1b6" />
                <Text style={styles.statusText}>Checking for updates...</Text>
              </View>
            ) : notificationsError && totalNotifications === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="alert-circle-outline" size={26} color="#b42318" />
                <Text style={styles.errorText}>Unable to load notifications.</Text>
              </View>
            ) : (
              <>
                <View style={styles.segmentedControl} onLayout={handleSegmentLayout}>
                  <Animated.View
                    style={[
                      styles.segmentIndicator,
                      {
                        width: segmentWidth,
                        transform: [{ translateX: segmentTranslate }],
                      },
                    ]}
                  />
                  <Pressable
                    onPress={() => setActiveTab('unread')}
                    style={({ pressed }) => [styles.segment, pressed && styles.segmentPressed]}
                  >
                    <Text style={[styles.segmentText, !isReadView && styles.segmentTextActive]}>
                      Unread
                    </Text>
                    {unreadCount > 0 ? (
                      <View style={styles.segmentBadge}>
                        <Text style={styles.segmentBadgeText}>{unreadCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveTab('read')}
                    style={({ pressed }) => [styles.segment, pressed && styles.segmentPressed]}
                  >
                    <Text style={[styles.segmentText, isReadView && styles.segmentTextActive]}>
                      Read
                    </Text>
                    {readCount > 0 ? (
                      <View style={styles.segmentBadgeMuted}>
                        <Text style={styles.segmentBadgeTextMuted}>{readCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle}>
                    {isReadView ? 'Read notifications' : 'Unread notifications'}
                  </Text>
                  <View style={styles.listCount}>
                    <Text style={styles.listCountText}>{activeCount}</Text>
                  </View>
                </View>
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.list}
                  showsVerticalScrollIndicator={false}
                >
                  {totalNotifications === 0 ? (
                    <View style={styles.emptyStateInline}>
                      <MaterialCommunityIcons name="bell-outline" size={22} color="#9fb1b6" />
                      <View>
                        <Text style={styles.emptyTitle}>No notifications yet</Text>
                        <Text style={styles.emptySubtitle}>
                          We&apos;ll let you know when something needs your attention.
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {activeCount === 0 && totalNotifications > 0 ? (
                    <Text style={isReadView ? styles.listEmptyMuted : styles.listEmpty}>
                      {isReadView ? 'No read notifications yet.' : "You're all caught up."}
                    </Text>
                  ) : (
                    <>
                      {activeAppointments.map(({ appointment, dateTime }) => {
                        const title = appointment.title || appointment.type || 'Appointment';
                        const timeLabel = dateTime.toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        });
                        return (
                          <Pressable
                            key={`appointment-${isReadView ? 'read' : 'unread'}-${appointment.id}`}
                            onPress={() => handleNavigate('/home')}
                            style={({ pressed }) => [
                              styles.card,
                              styles.cardAppointment,
                              isReadView && styles.cardRead,
                              pressed && styles.cardPressed,
                            ]}
                          >
                            <View style={[styles.icon, styles.iconAppointment]}>
                              <MaterialCommunityIcons name="calendar-clock" size={18} color="#b45309" />
                            </View>
                            <View style={styles.text}>
                              <Text style={styles.itemTitle}>Upcoming appointment</Text>
                              <Text style={styles.itemSubtitle} numberOfLines={1}>
                                {title} • {timeLabel}
                              </Text>
                            </View>
                            <Text style={styles.itemMeta}>{formatTimeUntil(dateTime)}</Text>
                          </Pressable>
                        );
                      })}
                      {activeInvites.map((invite) => (
                        <Pressable
                          key={`invite-${isReadView ? 'read' : 'unread'}-${invite.id}`}
                          onPress={() => handleNavigate('/carecircle')}
                          style={({ pressed }) => [
                            styles.card,
                            styles.cardInvite,
                            isReadView && styles.cardRead,
                            pressed && styles.cardPressed,
                          ]}
                        >
                          <View style={[styles.icon, styles.iconInvite]}>
                            <MaterialCommunityIcons name="account-plus" size={18} color="#0f766e" />
                          </View>
                          <View style={styles.text}>
                            <Text style={styles.itemTitle}>Care circle invite</Text>
                            <Text style={styles.itemSubtitle} numberOfLines={1}>
                              From {invite.displayName}
                            </Text>
                          </View>
                          <Text style={styles.itemMeta}>{formatInviteTimestamp(invite.acceptedAt)}</Text>
                        </Pressable>
                      ))}
                      {activeAcceptances.map((invite) => (
                        <Pressable
                          key={`accept-${isReadView ? 'read' : 'unread'}-${invite.id}`}
                          onPress={() => handleNavigate('/carecircle')}
                          style={({ pressed }) => [
                            styles.card,
                            styles.cardAcceptance,
                            isReadView && styles.cardRead,
                            pressed && styles.cardPressed,
                          ]}
                        >
                          <View style={[styles.icon, styles.iconAcceptance]}>
                            <MaterialCommunityIcons name="account-check" size={18} color="#15803d" />
                          </View>
                          <View style={styles.text}>
                            <Text style={styles.itemTitle}>Care circle update</Text>
                            <Text style={styles.itemSubtitle} numberOfLines={2}>
                              {invite.displayName} has accepted your invite and is now a part of your care circle!
                            </Text>
                          </View>
                          <Text style={styles.itemMeta}>{formatInviteTimestamp(invite.createdAt)}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                </ScrollView>
                {notificationsError ? (
                  <Text style={styles.warningText}>{notificationsError}</Text>
                ) : null}
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a1418',
  },
  panel: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#f7fbfb',
    shadowColor: '#0a1418',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 48,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  backButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2f33',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backPlaceholder: {
    width: 44,
    marginRight: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingBottom: 24,
    gap: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6eff1',
    borderRadius: 18,
    padding: 4,
    marginBottom: 12,
    position: 'relative',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    shadowColor: '#0f1f22',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    zIndex: 1,
  },
  segmentPressed: {
    opacity: 0.8,
  },
  segmentText: {
    color: '#5c6f75',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#1f2f33',
    fontWeight: '700',
  },
  segmentBadge: {
    backgroundColor: '#1f8f7a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  segmentBadgeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 10,
  },
  segmentBadgeMuted: {
    backgroundColor: '#d6e3e6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  segmentBadgeTextMuted: {
    color: '#4f666d',
    fontWeight: '700',
    fontSize: 10,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  listTitle: {
    color: '#1f2f33',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  listCount: {
    backgroundColor: '#e3ecee',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  listCountText: {
    color: '#456068',
    fontWeight: '700',
    fontSize: 11,
  },
  listEmpty: {
    color: '#2f565f',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 6,
  },
  listEmptyMuted: {
    color: '#7b8d93',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1eaec',
    backgroundColor: '#ffffff',
  },
  cardAppointment: {
    backgroundColor: '#fff6e8',
    borderColor: '#f1ddbf',
  },
  cardInvite: {
    backgroundColor: '#f2f8f8',
    borderColor: '#dfeaec',
  },
  cardAcceptance: {
    backgroundColor: '#eef9f1',
    borderColor: '#d8f0df',
  },
  cardRead: {
    opacity: 0.8,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e4eef0',
  },
  iconAppointment: {
    backgroundColor: '#ffe7c7',
  },
  iconInvite: {
    backgroundColor: '#d9f0f1',
  },
  iconAcceptance: {
    backgroundColor: '#dcf5e5',
  },
  text: {
    flex: 1,
  },
  itemTitle: {
    color: '#1f2f33',
    fontSize: 14,
    fontWeight: '700',
  },
  itemSubtitle: {
    color: '#51666c',
    fontSize: 12,
    marginTop: 4,
  },
  itemMeta: {
    color: '#708089',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  emptyTitle: {
    color: '#2f3f44',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#6b7f86',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 220,
  },
  statusText: {
    color: '#6b7f86',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '600',
  },
  warningText: {
    color: '#b45309',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
});
