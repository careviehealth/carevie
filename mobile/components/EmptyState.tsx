import { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from '@/components/Themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';

type EmptyStateProps = {
  icon: string;
  title: string;
  subtitle?: string;
  style?: ViewStyle;
};

export function EmptyState({ icon, title, subtitle, style }: EmptyStateProps) {
  const float = useSharedValue(0);
  const ringScale = useSharedValue(0.85);
  const ringOpacity = useSharedValue(0.15);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    ringScale.value = withRepeat(
      withDelay(
        400,
        withSequence(
          withTiming(1.3, { duration: 2000, easing: Easing.out(Easing.ease) }),
          withTiming(0.85, { duration: 0 })
        )
      ),
      -1,
      false
    );

    ringOpacity.value = withRepeat(
      withDelay(
        400,
        withSequence(
          withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
          withTiming(0.15, { duration: 0 })
        )
      ),
      -1,
      false
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <Animated.View entering={FadeIn.duration(500)} style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={floatStyle}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name={icon as any} size={32} color="#309898" />
          </View>
        </Animated.View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </Animated.View>
  );
}

const PRESETS = {
  vault: { icon: 'file-document-outline', title: 'No documents yet', subtitle: 'Upload files to keep them safe and organized' },
  appointments: { icon: 'calendar-blank-outline', title: 'No appointments', subtitle: 'Schedule one to stay on top of your health' },
  medications: { icon: 'pill', title: 'No medications', subtitle: 'Add your medications for easy tracking' },
  contacts: { icon: 'account-heart-outline', title: 'No emergency contacts', subtitle: 'Add someone you trust for SOS alerts' },
  members: { icon: 'account-group-outline', title: 'No members yet', subtitle: 'Invite someone to get started' },
  doctors: { icon: 'stethoscope', title: 'No doctors added', subtitle: 'Add your medical team for quick access' },
  notifications: { icon: 'bell-outline', title: 'No notifications yet', subtitle: "We'll let you know when something needs your attention" },
  files: { icon: 'folder-open-outline', title: 'No files', subtitle: 'Documents will appear here' },
  search: { icon: 'magnify', title: 'No results found', subtitle: 'Try a different keyword or filter' },
  history: { icon: 'history', title: 'No history yet', subtitle: "You're all caught up" },
} as const;

export type EmptyStatePreset = keyof typeof PRESETS;

export function EmptyStatePreset({ preset, style }: { preset: EmptyStatePreset; style?: ViewStyle }) {
  const config = PRESETS[preset];
  return <EmptyState {...config} style={style} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: '#309898',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(48, 152, 152, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1d2f33',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7f86',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
});
