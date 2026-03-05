import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

type GradientTextProps = TextProps & {
  colors?: string[];
};

export function GradientText({ colors = ['#4FD1A6', '#FFBF69'], style, children, ...rest }: GradientTextProps) {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flattened?.fontSize ?? 28;
  const lineHeight = flattened?.lineHeight ?? Math.round(fontSize * 1.15);
  const fontWeight = flattened?.fontWeight ?? '800';

  return (
    <MaskedView
      maskElement={
        <Text {...rest} style={[style, { color: '#000' }]}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
      >
        <Text
          {...rest}
          style={[
            style,
            styles.gradientText,
            {
              fontSize,
              lineHeight,
              fontWeight,
            },
          ]}
        >
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  gradientText: {
    backgroundColor: 'transparent',
  },
});
