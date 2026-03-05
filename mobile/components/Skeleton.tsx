import { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height = 16, borderRadius = 10, style }: SkeletonProps) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#d4e0e3',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <Skeleton width={36} height={36} borderRadius={10} />
      </View>
      <Skeleton width="60%" height={14} style={{ marginTop: 14 }} />
      <View style={styles.divider} />
      <Skeleton width="40%" height={12} />
    </View>
  );
}

export function SkeletonListItem({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.listItem, style]}>
      <Skeleton width={40} height={40} borderRadius={12} />
      <View style={styles.listItemText}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function SkeletonProfileHeader() {
  return (
    <View style={styles.profileHeader}>
      <Skeleton width={72} height={72} borderRadius={36} />
      <View style={styles.profileInfo}>
        <Skeleton width={140} height={18} />
        <Skeleton width={100} height={13} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function SkeletonKPIRow() {
  return (
    <View style={styles.kpiRow}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.kpiCard}>
          <Skeleton width={20} height={20} borderRadius={10} />
          <Skeleton width="60%" height={22} style={{ marginTop: 8 }} />
          <Skeleton width="80%" height={11} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f7fafa',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5eaed',
    padding: 16,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5eaed',
    marginVertical: 10,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7fafa',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5eaed',
    padding: 14,
    marginBottom: 10,
  },
  listItemText: {
    flex: 1,
    marginLeft: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#f7fafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5eaed',
    padding: 12,
    alignItems: 'flex-start',
  },
});
