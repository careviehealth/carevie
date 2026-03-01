import { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  maxWidth?: number;
  padded?: boolean;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  safeAreaStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  maxWidth = 720,
  padded = true,
  scrollable = true,
  contentContainerStyle,
  innerStyle,
  safeAreaStyle,
}: ScreenProps) {
  const { width } = useWindowDimensions();
  const horizontalPadding = padded ? (width < 380 ? 16 : 24) : 0;
  const contentWidth = Math.min(width - horizontalPadding * 2, maxWidth);

  const content = (
    <View style={[styles.inner, { width: contentWidth }, innerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, safeAreaStyle]}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding },
            contentContainerStyle,
          ]}
        >
          {content}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  inner: {
    alignSelf: 'center',
  },
});
