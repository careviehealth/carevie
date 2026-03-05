import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const s = (size: number): number => Math.round((width / BASE_WIDTH) * size);
  const vs = (size: number): number => Math.round((height / BASE_HEIGHT) * size);
  const ms = (size: number, factor = 0.5): number =>
    Math.round(size + (s(size) - size) * factor);

  return {
    screenWidth: width,
    screenHeight: height,
    isCompact: width < 360,
    isRegular: width >= 360 && width < 768,
    isWide: width >= 768,
    /** Scale linearly relative to 375px base width */
    s,
    /** Scale linearly relative to 812px base height */
    vs,
    /** Moderate scale with dampening factor */
    ms,
    /** Clamp a fixed value to screen width minus margin */
    clampWidth: (value: number, margin = 32) => Math.min(value, width - margin),
    /** Responsive modal max height */
    modalMaxHeight: (cap = 760) => Math.min(height - 24, cap),
  };
}
