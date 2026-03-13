import { DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';

export const themePaletteIds = [
  'default',
  'charcoal',
  'clay',
  'olive',
  'coffee',
  'ocean',
  'sunset',
  'lemon',
  'lavender',
  'cherryblue',
] as const;

export type ThemePaletteId = (typeof themePaletteIds)[number];
export type ThemeColorScheme = 'light';

type ThemeSeed = {
  id: ThemePaletteId;
  label: string;
  description: string;
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  navbar: string;
  buttonSecondary: string;
};

export type AppThemeColors = {
  background: string;
  backgroundMuted: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentStrong: string;
  accentMuted: string;
  accentSoft: string;
  accentContrast: string;
  headerGradientStart: string;
  headerGradientEnd: string;
  headerForeground: string;
  headerChipBackground: string;
  headerChipBorder: string;
  headerChipText: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  overlay: string;
  inputBackground: string;
  inputDisabled: string;
  shadow: string;
  danger: string;
  dangerSurface: string;
  dangerBorder: string;
  dangerText: string;
  dangerMutedText: string;
  warning: string;
  warningSurface: string;
  warningText: string;
  success: string;
  successSurface: string;
  info: string;
  infoSurface: string;
};

export type AppThemeDefinition = {
  id: ThemePaletteId;
  label: string;
  description: string;
  colorScheme: ThemeColorScheme;
  preview: {
    start: string;
    end: string;
    surface: string;
    accent: string;
  };
  colors: AppThemeColors;
  navigationTheme: NavigationTheme;
};

export const defaultThemeId: ThemePaletteId = 'default';

const baseThemeSeeds: ThemeSeed[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Teal slate with the current Vytara feel.',
    primary: '#14b8a6',
    secondary: '#2f565f',
    background: '#eef3f3',
    surface: '#ffffff',
    text: '#1d2f33',
    textSecondary: '#6b7f86',
    border: '#dbe7ea',
    navbar: '#2f565f',
    buttonSecondary: '#1f2f33',
  },
  {
    id: 'charcoal',
    label: 'Charcoal',
    description: 'Neutral graphite with restrained contrast.',
    primary: '#6b7280',
    secondary: '#374151',
    background: '#f3f4f6',
    surface: '#ffffff',
    text: '#111827',
    textSecondary: '#4b5563',
    border: '#d1d5db',
    navbar: '#111827',
    buttonSecondary: '#374151',
  },
  {
    id: 'clay',
    label: 'Clay',
    description: 'Warm earthen browns with soft paper surfaces.',
    primary: '#a57a5e',
    secondary: '#835c44',
    background: '#f3e6da',
    surface: '#fff7f1',
    text: '#3a2418',
    textSecondary: '#6b4a36',
    border: '#d6b597',
    navbar: '#4a342a',
    buttonSecondary: '#6b4a36',
  },
  {
    id: 'olive',
    label: 'Olive',
    description: 'Muted greens with clinical calm.',
    primary: '#97ad7f',
    secondary: '#7b9460',
    background: '#f1f6e9',
    surface: '#ffffff',
    text: '#2d3c24',
    textSecondary: '#556747',
    border: '#b8cba0',
    navbar: '#5f7449',
    buttonSecondary: '#5f7449',
  },
  {
    id: 'coffee',
    label: 'Coffee',
    description: 'Rich espresso accents on warm ivory.',
    primary: '#9b6744',
    secondary: '#734128',
    background: '#f2e4d4',
    surface: '#fff7f0',
    text: '#2f1d12',
    textSecondary: '#5a3b2a',
    border: '#c7a27d',
    navbar: '#3a2215',
    buttonSecondary: '#5a3020',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Cool blue steel with airy surfaces.',
    primary: '#6ea4bd',
    secondary: '#4d86a1',
    background: '#eef6fa',
    surface: '#ffffff',
    text: '#17384a',
    textSecondary: '#3a6074',
    border: '#a8c8d9',
    navbar: '#2f6b87',
    buttonSecondary: '#2f6b87',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Orange-red accents with warm whites.',
    primary: '#e4884a',
    secondary: '#d85a18',
    background: '#fff3e8',
    surface: '#fff7f2',
    text: '#4a2614',
    textSecondary: '#7a4325',
    border: '#f1b185',
    navbar: '#c74b12',
    buttonSecondary: '#b44812',
  },
  {
    id: 'lemon',
    label: 'Lemon',
    description: 'Bright citrus paired with dark amber text.',
    primary: '#ebb733',
    secondary: '#d18f00',
    background: '#fffbe2',
    surface: '#fff9d8',
    text: '#3f3007',
    textSecondary: '#6b5b1f',
    border: '#e8c865',
    navbar: '#d18f00',
    buttonSecondary: '#ad7400',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    description: 'Soft violet accents with bright contrast.',
    primary: '#9a6fc1',
    secondary: '#7f4ca5',
    background: '#f5ebff',
    surface: '#ffffff',
    text: '#2f1c45',
    textSecondary: '#5e3f82',
    border: '#c7a7df',
    navbar: '#6c4190',
    buttonSecondary: '#6c4190',
  },
  {
    id: 'cherryblue',
    label: 'Cherryblue',
    description: 'Cherry red chrome balanced by powder blue.',
    primary: '#c7425b',
    secondary: '#8eabb5',
    background: '#e7f0f2',
    surface: '#ffffff',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#c6d8dc',
    navbar: '#c7425b',
    buttonSecondary: '#9f3547',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function expandHex(hex: string) {
  const value = hex.replace('#', '').trim();
  if (value.length === 3) {
    return value
      .split('')
      .map((part) => `${part}${part}`)
      .join('');
  }

  return value.slice(0, 6);
}

function hexToRgb(hex: string) {
  const normalized = expandHex(hex);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColors(base: string, target: string, ratio: number) {
  const safeRatio = clamp(ratio, 0, 1);
  const start = hexToRgb(base);
  const end = hexToRgb(target);
  return rgbToHex(
    start.r + (end.r - start.r) * safeRatio,
    start.g + (end.g - start.g) * safeRatio,
    start.b + (end.b - start.b) * safeRatio
  );
}

function withAlpha(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function relativeLuminance(color: string) {
  const { r, g, b } = hexToRgb(color);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function isColorDark(color: string) {
  return relativeLuminance(color) < 0.45;
}

function getReadableText(background: string, darkText = '#0f172a', lightText = '#ffffff') {
  return isColorDark(background) ? lightText : darkText;
}

function createNavigationTheme(colors: AppThemeColors): NavigationTheme {
  return {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

function buildThemeDefinition(seed: ThemeSeed): AppThemeDefinition {
  const headerForeground = getReadableText(seed.navbar);
  const headerChipBackground = isColorDark(seed.navbar)
    ? mixColors(seed.navbar, seed.background, 0.76)
    : mixColors(seed.navbar, seed.text, 0.1);

  const colors: AppThemeColors = {
    background: seed.background,
    backgroundMuted: mixColors(seed.background, '#ffffff', 0.32),
    surface: seed.surface,
    surfaceMuted: mixColors(seed.surface, seed.background, 0.35),
    surfaceElevated: mixColors(seed.surface, '#ffffff', 0.12),
    border: seed.border,
    borderStrong: mixColors(seed.border, seed.text, 0.12),
    textPrimary: seed.text,
    textSecondary: seed.textSecondary,
    textTertiary: withAlpha(seed.textSecondary, 0.78),
    accent: seed.primary,
    accentStrong: seed.buttonSecondary,
    accentMuted: mixColors(seed.secondary, seed.primary, 0.35),
    accentSoft: mixColors(seed.background, seed.primary, 0.16),
    accentContrast: getReadableText(seed.primary),
    headerGradientStart: seed.navbar,
    headerGradientEnd: mixColors(seed.navbar, seed.primary, 0.28),
    headerForeground,
    headerChipBackground,
    headerChipBorder: isColorDark(seed.navbar)
      ? withAlpha('#ffffff', 0.34)
      : withAlpha(seed.text, 0.14),
    headerChipText: getReadableText(headerChipBackground, seed.text, '#ffffff'),
    tabBarBackground: mixColors(seed.navbar, '#08181c', 0.18),
    tabBarBorder: isColorDark(seed.navbar)
      ? withAlpha('#ffffff', 0.08)
      : withAlpha(seed.text, 0.12),
    tabBarActive: seed.primary,
    tabBarInactive: isColorDark(seed.navbar)
      ? withAlpha('#ffffff', 0.58)
      : withAlpha(seed.text, 0.55),
    overlay: withAlpha(seed.text, 0.2),
    inputBackground: mixColors(seed.surface, seed.background, 0.3),
    inputDisabled: mixColors(seed.surface, seed.text, 0.08),
    shadow: withAlpha(seed.text, 0.16),
    danger: '#dc2626',
    dangerSurface: '#fef2f2',
    dangerBorder: '#fecaca',
    dangerText: '#b91c1c',
    dangerMutedText: '#991b1b',
    warning: '#d97706',
    warningSurface: '#fffbeb',
    warningText: '#92400e',
    success: '#15803d',
    successSurface: '#f0fdf4',
    info: '#2563eb',
    infoSurface: '#eff6ff',
  };

  return {
    id: seed.id,
    label: seed.label,
    description: seed.description,
    colorScheme: 'light',
    preview: {
      start: seed.navbar,
      end: seed.primary,
      surface: seed.surface,
      accent: seed.secondary,
    },
    colors,
    navigationTheme: createNavigationTheme(colors),
  };
}

const themeEntries = baseThemeSeeds.map((seed) => {
  const definition = buildThemeDefinition(seed);
  return [definition.id, definition] as const;
});

export const appThemes = themeEntries.map(([, definition]) => definition);

export const appThemeMap = Object.fromEntries(themeEntries) as Record<
  ThemePaletteId,
  AppThemeDefinition
>;

export function isThemePaletteId(value: string | null | undefined): value is ThemePaletteId {
  return typeof value === 'string' && themePaletteIds.includes(value as ThemePaletteId);
}

export function normalizeThemePaletteId(value: string | null | undefined): ThemePaletteId {
  return isThemePaletteId(value) ? value : defaultThemeId;
}

export function getAppTheme(themeId: string | null | undefined) {
  return appThemeMap[normalizeThemePaletteId(themeId)];
}
