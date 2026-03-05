import { Dimensions, Platform, type ViewStyle } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_WIDTH = 375;

// Linear scale relative to 375px base width
export function scale(size: number): number {
  return Math.round((SCREEN_WIDTH / BASE_WIDTH) * size);
}

// Scale with dampening factor so large values don't grow too aggressively
export function moderateScale(size: number, factor = 0.5): number {
  return Math.round(size + (scale(size) - size) * factor);
}

// ─── Colors ────────────────────────────────────────────────────────────────────
export const colors = {
  brand: '#0f766e',
  brandDark: '#2f565f',
  brandDarker: '#1f2f33',
  brandLight: '#14b8a6',
  brandMuted: '#309898',

  // Header / navigation
  headerGradientStart: '#2f565f',
  headerGradientEnd: '#4d8289',
  homeGradientStart: '#2f565f',
  homeGradientEnd: '#6aa6a8',
  tabBar: '#1f2f33',

  // Surfaces
  background: '#eef3f3',
  surface: '#ffffff',
  surfaceMuted: '#f7fafa',
  surfaceSubtle: '#f0f5f6',

  // Borders
  border: '#dbe7ea',
  borderLight: '#e1eaec',
  borderInput: '#d8e3e6',

  // Text
  textPrimary: '#1d2f33',
  textSecondary: '#6b7f86',
  textTertiary: '#94a3b8',
  textOnBrand: '#ffffff',
  textOnDark: '#eef7f7',

  // Semantic
  danger: '#dc2626',
  dangerDark: '#b91c1c',
  dangerLight: '#fef2f2',
  dangerBorder: '#fecaca',

  sos: '#d7263d',
  warning: '#d97706',
  success: '#15803d',
  info: '#2563eb',

  // Overlay
  overlay: 'rgba(15, 23, 42, 0.4)',

  // Accent (for add/edit actions)
  accent: '#FF8000',
} as const;

// ─── Spacing ───────────────────────────────────────────────────────────────────
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
} as const;

// ─── Border Radius ─────────────────────────────────────────────────────────────
export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  '2xl': 28,
  pill: 999,
} as const;

// ─── Typography ────────────────────────────────────────────────────────────────
export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

// ─── Shadows ───────────────────────────────────────────────────────────────────
type ShadowStyle = Pick<ViewStyle, 'shadowColor' | 'shadowOpacity' | 'shadowRadius' | 'shadowOffset' | 'elevation'>;

export const shadows: Record<'subtle' | 'medium' | 'elevated', ShadowStyle> = {
  subtle: {
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  medium: {
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  elevated: {
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

// ─── Shared Component Styles ───────────────────────────────────────────────────
export const cardStyle: ViewStyle = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.border,
  ...shadows.medium,
};

export const modalOverlay: ViewStyle = {
  flex: 1,
  backgroundColor: colors.overlay,
  justifyContent: 'flex-end',
};

export const modalSheet: ViewStyle = {
  backgroundColor: colors.surface,
  borderTopLeftRadius: radii.xl,
  borderTopRightRadius: radii.xl,
};

export const modalHeader: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  borderBottomWidth: 1,
  borderBottomColor: colors.borderLight,
};

export const inputStyle: ViewStyle = {
  borderWidth: 1,
  borderColor: colors.borderInput,
  borderRadius: radii.md,
  backgroundColor: colors.surfaceMuted,
  paddingHorizontal: 14,
  paddingVertical: 12,
};

// ─── Pressed States ────────────────────────────────────────────────────────────
export const pressed = {
  button: { opacity: 0.9, transform: [{ scale: 0.97 }] } as ViewStyle,
  card: { transform: [{ scale: 0.98 }] } as ViewStyle,
  icon: { opacity: 0.7 } as ViewStyle,
};
