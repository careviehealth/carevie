import { useColorScheme as useNativeColorScheme } from 'react-native';

import { useOptionalAppTheme } from '@/providers/ThemeProvider';

export function useColorScheme() {
  const nativeColorScheme = useNativeColorScheme();
  const theme = useOptionalAppTheme();

  return theme?.colorScheme ?? nativeColorScheme ?? 'light';
}
