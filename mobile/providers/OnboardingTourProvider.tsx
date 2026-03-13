import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuth } from '@/hooks/useAuth';
import {
  getOnboardingTourSeen,
  markOnboardingTourSeen,
  onboardingTourSteps,
  type OnboardingTourMode,
  type OnboardingTourStep,
  type OnboardingTourStepId,
} from '@/lib/onboardingTour';

const STEP_INITIAL_DELAY_MS = 180;
const STEP_RETRY_DELAY_MS = 160;
const STEP_MAX_ATTEMPTS = 10;
const HIGHLIGHT_PADDING = 8;
const POPOVER_GAP = 14;
const POPOVER_MARGIN = 16;
const SURFACE_ANIMATION_DURATION_MS = 220;
const PULSE_ANIMATION_DURATION_MS = 900;

type TourRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MeasureTarget = () => void;

type OnboardingTourContextValue = {
  currentStepId: OnboardingTourStepId | null;
  isRunning: boolean;
  startTour: (mode: OnboardingTourMode) => Promise<boolean>;
  registerTarget: (tourId: OnboardingTourStepId, measure: MeasureTarget) => void;
  unregisterTarget: (tourId: OnboardingTourStepId, measure: MeasureTarget) => void;
  updateTargetRect: (tourId: OnboardingTourStepId, rect: TourRect) => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | undefined>(undefined);

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getRouteLabel(route: OnboardingTourStep['route']) {
  switch (route) {
    case '/profile':
      return 'Profile';
    case '/vault':
      return 'Vault';
    case '/carecircle':
      return 'Care Circle';
    case '/settings':
      return 'Settings';
    case '/home':
    default:
      return 'Home';
  }
}

function isRenderableRect(
  rect: TourRect | undefined,
  windowWidth: number,
  windowHeight: number
) {
  if (!rect) return false;
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.x >= windowWidth || rect.y >= windowHeight) return false;
  if (rect.x + rect.width <= 0 || rect.y + rect.height <= 0) return false;
  return true;
}

function getPopoverPosition(args: {
  insetsTop: number;
  insetsBottom: number;
  popoverHeight: number;
  popoverWidth: number;
  side: OnboardingTourStep['side'];
  targetRect: TourRect | null;
  windowHeight: number;
  windowWidth: number;
}) {
  const {
    insetsBottom,
    insetsTop,
    popoverHeight,
    popoverWidth,
    side,
    targetRect,
    windowHeight,
    windowWidth,
  } = args;
  const safeTop = insetsTop + POPOVER_MARGIN;
  const safeBottom = windowHeight - insetsBottom - POPOVER_MARGIN - popoverHeight;
  const safeLeft = POPOVER_MARGIN;
  const safeRight = windowWidth - POPOVER_MARGIN - popoverWidth;

  if (!targetRect || popoverHeight <= 0 || popoverWidth <= 0) {
    return {
      left: safeLeft,
      top: clamp(windowHeight * 0.28, safeTop, safeBottom),
    };
  }

  const centeredLeft = clamp(
    targetRect.x + targetRect.width / 2 - popoverWidth / 2,
    safeLeft,
    safeRight
  );
  const centeredTop = clamp(
    targetRect.y + targetRect.height / 2 - popoverHeight / 2,
    safeTop,
    safeBottom
  );

  switch (side) {
    case 'top':
      return {
        left: centeredLeft,
        top: clamp(targetRect.y - popoverHeight - POPOVER_GAP, safeTop, safeBottom),
      };
    case 'left':
      return {
        left: clamp(targetRect.x - popoverWidth - POPOVER_GAP, safeLeft, safeRight),
        top: centeredTop,
      };
    case 'right':
      return {
        left: clamp(targetRect.x + targetRect.width + POPOVER_GAP, safeLeft, safeRight),
        top: centeredTop,
      };
    case 'bottom':
    default:
      return {
        left: centeredLeft,
        top: clamp(targetRect.y + targetRect.height + POPOVER_GAP, safeTop, safeBottom),
      };
  }
}

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);
  const [targetRects, setTargetRects] = useState<Partial<Record<OnboardingTourStepId, TourRect>>>({});
  const [targetMissing, setTargetMissing] = useState(false);
  const [popoverSize, setPopoverSize] = useState({ width: 0, height: 0 });

  const targetMeasureFnsRef = useRef<Map<OnboardingTourStepId, Set<MeasureTarget>>>(new Map());
  const targetRectsRef = useRef<Partial<Record<OnboardingTourStepId, TourRect>>>({});
  const startInFlightRef = useRef(false);

  const currentStep =
    currentStepIndex === null ? null : onboardingTourSteps[currentStepIndex] ?? null;
  const currentStepId = currentStep?.id ?? null;
  const currentRoute = currentStep?.route as string | undefined;
  const isRunning = currentStepIndex !== null;
  const isStepRouteActive = Boolean(currentStep && pathname === currentRoute);
  const rawTargetRect = currentStep ? targetRects[currentStep.id] ?? null : null;
  const targetRect =
    rawTargetRect && isRenderableRect(rawTargetRect, windowWidth, windowHeight) ? rawTargetRect : null;
  const isWaitingForRoute = Boolean(currentStep && !isStepRouteActive);
  const isSearchingTarget = Boolean(currentStep && isStepRouteActive && !targetRect && !targetMissing);
  const showDetachedPopover = isWaitingForRoute || isSearchingTarget || targetMissing || !targetRect;
  const progressRatio =
    currentStepIndex === null ? 0 : (currentStepIndex + 1) / onboardingTourSteps.length;
  const currentRouteLabel = getRouteLabel(currentStep?.route ?? '/home');
  const statusLabel = isWaitingForRoute
    ? `Opening ${currentRouteLabel}...`
    : isSearchingTarget
      ? 'Finding this area...'
      : targetMissing
        ? 'Target not centered yet'
        : null;
  const statusHelper = isWaitingForRoute
    ? 'Hang on while the tour moves to the next screen.'
    : isSearchingTarget
      ? 'Almost there. Waiting for the screen to finish laying out.'
      : targetMissing
        ? 'If this item is off screen, scroll a little until you can see it, then continue.'
        : null;

  const overlayOpacity = useSharedValue(0);
  const popoverOpacity = useSharedValue(0);
  const popoverScale = useSharedValue(0.96);
  const popoverLeft = useSharedValue(POPOVER_MARGIN);
  const popoverTop = useSharedValue(POPOVER_MARGIN * 2);
  const highlightLeft = useSharedValue(0);
  const highlightTop = useSharedValue(0);
  const highlightWidth = useSharedValue(0);
  const highlightHeight = useSharedValue(0);
  const highlightOpacity = useSharedValue(0);
  const highlightPulseScale = useSharedValue(1);

  useEffect(() => {
    targetRectsRef.current = targetRects;
  }, [targetRects]);

  const registerTarget = useCallback(
    (tourId: OnboardingTourStepId, measure: MeasureTarget) => {
      const measures = targetMeasureFnsRef.current.get(tourId) ?? new Set<MeasureTarget>();
      measures.add(measure);
      targetMeasureFnsRef.current.set(tourId, measures);
    },
    []
  );

  const unregisterTarget = useCallback(
    (tourId: OnboardingTourStepId, measure: MeasureTarget) => {
      const measures = targetMeasureFnsRef.current.get(tourId);
      if (measures) {
        measures.delete(measure);
        if (measures.size === 0) {
          targetMeasureFnsRef.current.delete(tourId);
        }
      }

      setTargetRects((prev) => {
        if (!(tourId in prev)) return prev;
        const next = { ...prev };
        delete next[tourId];
        return next;
      });
    },
    []
  );

  const updateTargetRect = useCallback((tourId: OnboardingTourStepId, rect: TourRect) => {
    setTargetRects((prev) => {
      const current = prev[tourId];
      if (
        current &&
        current.x === rect.x &&
        current.y === rect.y &&
        current.width === rect.width &&
        current.height === rect.height
      ) {
        return prev;
      }
      return {
        ...prev,
        [tourId]: rect,
      };
    });
  }, []);

  const requestTargetMeasurement = useCallback((tourId: OnboardingTourStepId) => {
    const measures = targetMeasureFnsRef.current.get(tourId);
    if (!measures?.size) return;
    measures.forEach((measure) => measure());
  }, []);

  const finishTour = useCallback(
    async (markSeen: boolean) => {
      setCurrentStepIndex(null);
      setTargetMissing(false);
      setPopoverSize({ width: 0, height: 0 });

      if (markSeen && user?.id) {
        try {
          await markOnboardingTourSeen(user.id);
        } catch (error) {
          console.error('Failed to persist onboarding tour state:', error);
        }
      }
    },
    [user?.id]
  );

  const goToStep = useCallback(
    (index: number) => {
      const step = onboardingTourSteps[index];
      if (!step) {
        void finishTour(true);
        return;
      }

      setCurrentStepIndex(index);
      setTargetMissing(false);

      const stepRoute = step.route as Href;
      if (pathname !== step.route) {
        router.replace(stepRoute);
        return;
      }

      requestTargetMeasurement(step.id);
    },
    [finishTour, pathname, requestTargetMeasurement, router]
  );

  const startTour = useCallback(
    async (mode: OnboardingTourMode) => {
      if (!user?.id || startInFlightRef.current) return false;

      startInFlightRef.current = true;

      try {
        if (mode === 'autostart') {
          const hasSeenTour = await getOnboardingTourSeen(user.id);
          if (hasSeenTour) {
            return false;
          }
        }

        goToStep(0);
        return true;
      } catch (error) {
        console.error('Failed to start onboarding tour:', error);
        return false;
      } finally {
        startInFlightRef.current = false;
      }
    },
    [goToStep, user?.id]
  );

  useEffect(() => {
    if (user?.id) return;

    setCurrentStepIndex(null);
    setTargetMissing(false);
    setPopoverSize({ width: 0, height: 0 });
  }, [user?.id]);

  useEffect(() => {
    if (!currentStep || !isStepRouteActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interactionTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    const attemptTargetMeasure = (attempt: number) => {
      if (cancelled) return;

      interactionTask = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;

        requestTargetMeasurement(currentStep.id);

        timer = setTimeout(() => {
          if (cancelled) return;

          const rect = targetRectsRef.current[currentStep.id];
          if (isRenderableRect(rect, windowWidth, windowHeight)) {
            setTargetMissing(false);
            return;
          }

          if (attempt + 1 >= STEP_MAX_ATTEMPTS) {
            setTargetMissing(true);
            return;
          }

          attemptTargetMeasure(attempt + 1);
        }, STEP_RETRY_DELAY_MS);
      });
    };

    setTargetMissing(false);
    timer = setTimeout(() => attemptTargetMeasure(0), STEP_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      interactionTask?.cancel?.();
    };
  }, [
    currentStep,
    isStepRouteActive,
    requestTargetMeasurement,
    windowHeight,
    windowWidth,
  ]);

  const popoverPosition = useMemo(
    () =>
      getPopoverPosition({
        insetsBottom: insets.bottom,
        insetsTop: insets.top,
        popoverHeight: popoverSize.height,
        popoverWidth: popoverSize.width,
        side: currentStep?.side ?? 'bottom',
        targetRect: showDetachedPopover ? null : targetRect,
        windowHeight,
        windowWidth,
      }),
    [
      currentStep?.side,
      insets.bottom,
      insets.top,
      popoverSize.height,
      popoverSize.width,
      showDetachedPopover,
      targetRect,
      windowHeight,
      windowWidth,
    ]
  );

  useEffect(() => {
    const isActive = Boolean(isRunning && currentStep);
    overlayOpacity.value = withTiming(isActive ? 1 : 0, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    popoverOpacity.value = withTiming(isActive ? 1 : 0, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    popoverScale.value = isActive
      ? withSpring(1, {
          damping: 18,
          stiffness: 180,
          mass: 0.9,
        })
      : withTiming(0.96, {
          duration: SURFACE_ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        });

    if (!isActive) {
      highlightOpacity.value = withTiming(0, {
        duration: SURFACE_ANIMATION_DURATION_MS - 40,
        easing: Easing.out(Easing.cubic),
      });
      highlightPulseScale.value = withTiming(1, {
        duration: SURFACE_ANIMATION_DURATION_MS - 40,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [
    currentStep,
    highlightOpacity,
    highlightPulseScale,
    isRunning,
    overlayOpacity,
    popoverOpacity,
    popoverScale,
  ]);

  useEffect(() => {
    popoverLeft.value = withTiming(popoverPosition.left, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    popoverTop.value = withTiming(popoverPosition.top, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [popoverLeft, popoverPosition.left, popoverPosition.top, popoverTop]);

  useEffect(() => {
    if (showDetachedPopover || !targetRect) {
      highlightOpacity.value = withTiming(0, {
        duration: SURFACE_ANIMATION_DURATION_MS - 40,
        easing: Easing.out(Easing.cubic),
      });
      highlightPulseScale.value = withTiming(1, {
        duration: SURFACE_ANIMATION_DURATION_MS - 40,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    highlightLeft.value = withTiming(targetRect.x - HIGHLIGHT_PADDING, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    highlightTop.value = withTiming(targetRect.y - HIGHLIGHT_PADDING, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    highlightWidth.value = withTiming(targetRect.width + HIGHLIGHT_PADDING * 2, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    highlightHeight.value = withTiming(targetRect.height + HIGHLIGHT_PADDING * 2, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    highlightOpacity.value = withTiming(1, {
      duration: SURFACE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    highlightPulseScale.value = withRepeat(
      withSequence(
        withTiming(1.025, {
          duration: PULSE_ANIMATION_DURATION_MS,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0.99, {
          duration: PULSE_ANIMATION_DURATION_MS,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      true
    );
  }, [
    highlightHeight,
    highlightLeft,
    highlightOpacity,
    highlightPulseScale,
    highlightTop,
    highlightWidth,
    showDetachedPopover,
    targetRect,
  ]);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const popoverAnimatedStyle = useAnimatedStyle(() => ({
    opacity: popoverOpacity.value,
    left: popoverLeft.value,
    top: popoverTop.value,
    transform: [{ scale: popoverScale.value }],
  }));

  const highlightAnimatedStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
    left: highlightLeft.value,
    top: highlightTop.value,
    width: highlightWidth.value,
    height: highlightHeight.value,
    transform: [{ scale: highlightPulseScale.value }],
  }));

  const contextValue = useMemo<OnboardingTourContextValue>(
    () => ({
      currentStepId,
      isRunning,
      startTour,
      registerTarget,
      unregisterTarget,
      updateTargetRect,
    }),
    [
      currentStepId,
      isRunning,
      registerTarget,
      startTour,
      unregisterTarget,
      updateTargetRect,
    ]
  );

  const onPopoverLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPopoverSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, []);

  const goBack = useCallback(() => {
    if (currentStepIndex === null || currentStepIndex <= 0) return;
    goToStep(currentStepIndex - 1);
  }, [currentStepIndex, goToStep]);

  const goNext = useCallback(() => {
    if (currentStepIndex === null) return;
    if (currentStepIndex >= onboardingTourSteps.length - 1) {
      void finishTour(true);
      return;
    }
    goToStep(currentStepIndex + 1);
  }, [currentStepIndex, finishTour, goToStep]);

  return (
    <OnboardingTourContext.Provider value={contextValue}>
      {children}

      <Modal
        transparent
        animationType="fade"
        statusBarTranslucent
        visible={Boolean(isRunning && currentStep)}
        onRequestClose={() => {
          void finishTour(true);
        }}
      >
        <View style={styles.modalRoot}>
          {targetRect && !showDetachedPopover ? (
            <>
              <Animated.View
                style={[
                  styles.overlay,
                  overlayAnimatedStyle,
                  {
                    left: 0,
                    right: 0,
                    top: 0,
                    height: Math.max(targetRect.y - HIGHLIGHT_PADDING, 0),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.overlay,
                  overlayAnimatedStyle,
                  {
                    left: 0,
                    top: Math.max(targetRect.y - HIGHLIGHT_PADDING, 0),
                    width: Math.max(targetRect.x - HIGHLIGHT_PADDING, 0),
                    height: targetRect.height + HIGHLIGHT_PADDING * 2,
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.overlay,
                  overlayAnimatedStyle,
                  {
                    left: targetRect.x + targetRect.width + HIGHLIGHT_PADDING,
                    right: 0,
                    top: Math.max(targetRect.y - HIGHLIGHT_PADDING, 0),
                    height: targetRect.height + HIGHLIGHT_PADDING * 2,
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.overlay,
                  overlayAnimatedStyle,
                  {
                    left: 0,
                    right: 0,
                    top: targetRect.y + targetRect.height + HIGHLIGHT_PADDING,
                    bottom: 0,
                  },
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[styles.highlight, highlightAnimatedStyle]}
              />
            </>
          ) : (
            <Animated.View style={[styles.overlay, styles.fullscreenOverlay, overlayAnimatedStyle]} />
          )}

          <Animated.View
            onLayout={onPopoverLayout}
            style={[
              styles.popover,
              popoverAnimatedStyle,
              {
                maxWidth: Math.max(windowWidth - POPOVER_MARGIN * 2, 0),
              },
            ]}
          >
            <View style={styles.progressRail}>
              <View style={[styles.progressFill, { width: `${Math.max(progressRatio, 0.08) * 100}%` }]} />
            </View>

            <View style={styles.popoverHeader}>
              <Text style={styles.progressText}>
                Step {(currentStepIndex ?? 0) + 1} of {onboardingTourSteps.length}
              </Text>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  void finishTour(true);
                }}
                style={({ pressed }) => pressed && styles.iconButtonPressed}
              >
                <Text style={styles.closeText}>Skip</Text>
              </Pressable>
            </View>

            {statusLabel ? (
              <View style={styles.statusRow}>
                {(isWaitingForRoute || isSearchingTarget) ? (
                  <ActivityIndicator size="small" color={colors.accentStrong} />
                ) : null}
                <Text style={styles.statusText}>{statusLabel}</Text>
              </View>
            ) : null}

            <Text style={styles.description}>{currentStep?.content ?? ''}</Text>

            {statusHelper ? <Text style={styles.helperText}>{statusHelper}</Text> : null}

            <View style={styles.actionsRow}>
              <Pressable
                disabled={(currentStepIndex ?? 0) <= 0 || isWaitingForRoute}
                onPress={goBack}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  ((currentStepIndex ?? 0) <= 0 || isWaitingForRoute) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                disabled={isWaitingForRoute}
                onPress={goNext}
                style={({ pressed }) => [
                  styles.primaryButton,
                  isWaitingForRoute && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {(currentStepIndex ?? 0) >= onboardingTourSteps.length - 1 ? 'Done' : 'Next'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </OnboardingTourContext.Provider>
  );
}

function useOnboardingTourContext() {
  const context = useContext(OnboardingTourContext);
  if (!context) {
    throw new Error('useOnboardingTour must be used within an OnboardingTourProvider');
  }
  return context;
}

export function useOnboardingTour() {
  const { currentStepId, isRunning, startTour } = useOnboardingTourContext();
  return {
    currentStepId,
    isRunning,
    startTour,
  };
}

export function useTourAnchor(tourId: OnboardingTourStepId) {
  const { currentStepId, isRunning, registerTarget, unregisterTarget, updateTargetRect } =
    useOnboardingTourContext();
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;

    node.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      updateTargetRect(tourId, { x, y, width, height });
    });
  }, [tourId, updateTargetRect]);

  const handleLayout = useCallback(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    registerTarget(tourId, measure);

    return () => {
      unregisterTarget(tourId, measure);
    };
  }, [measure, registerTarget, tourId, unregisterTarget]);

  useEffect(() => {
    const interactionTask = InteractionManager.runAfterInteractions(measure);
    return () => {
      interactionTask.cancel?.();
    };
  }, [measure]);

  useEffect(() => {
    if (!isRunning || currentStepId !== tourId) return;

    const interactionTask = InteractionManager.runAfterInteractions(measure);
    return () => {
      interactionTask.cancel?.();
    };
  }, [currentStepId, isRunning, measure, tourId]);

  return {
    collapsable: false as const,
    onLayout: handleLayout,
    ref,
  };
}

export function TourAnchor({
  children,
  style,
  tourId,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tourId: OnboardingTourStepId;
}) {
  const anchor = useTourAnchor(tourId);

  return (
    <View
      collapsable={anchor.collapsable}
      onLayout={anchor.onLayout}
      ref={anchor.ref}
      style={style}
    >
      {children}
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      backgroundColor: 'rgba(2, 6, 23, 0.66)',
    },
    fullscreenOverlay: {
      inset: 0,
    },
    highlight: {
      position: 'absolute',
      borderRadius: 22,
      borderWidth: 2,
      borderColor: colors.accentStrong,
      backgroundColor: 'rgba(255,255,255,0.05)',
      shadowColor: colors.accentStrong,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 8,
      },
    },
    popover: {
      position: 'absolute',
      borderRadius: 26,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 18,
      paddingVertical: 18,
      shadowColor: colors.shadow,
      shadowOpacity: 0.22,
      shadowRadius: 22,
      shadowOffset: {
        width: 0,
        height: 14,
      },
      elevation: 18,
      minWidth: 250,
      overflow: 'hidden',
    },
    progressRail: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
      marginBottom: 14,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.accentStrong,
    },
    popoverHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    progressText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    closeText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.accentStrong,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: colors.accentSoft,
      alignSelf: 'flex-start',
    },
    statusText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accentStrong,
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    helperText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    primaryButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: colors.accentStrong,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.surface,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    buttonPressed: {
      opacity: 0.9,
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    iconButtonPressed: {
      opacity: 0.7,
    },
  });
}
