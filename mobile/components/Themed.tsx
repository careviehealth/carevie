/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */

import { Text as DefaultText, View as DefaultView } from 'react-native';

import { getAppTheme } from '@/constants/appThemes';
import { useOptionalAppTheme } from '@/providers/ThemeProvider';
import { useColorScheme } from './useColorScheme';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: 'text' | 'background' | 'tint' | 'tabIconDefault' | 'tabIconSelected'
) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = useOptionalAppTheme() ?? {
    colorScheme: 'light' as const,
    colors: getAppTheme('default').colors,
  };
  const colorFromProps = props[colorScheme];

  const fallbackColorMap = {
    text: theme.colors.textPrimary,
    background: theme.colors.background,
    tint: theme.colors.accent,
    tabIconDefault: theme.colors.tabBarInactive,
    tabIconSelected: theme.colors.tabBarActive,
  };

  if (colorFromProps) {
    return colorFromProps;
  }

  return fallbackColorMap[colorName];
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}
