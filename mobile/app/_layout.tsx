import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthProvider } from '@/providers/AuthProvider';
import { ProfileProvider } from '@/providers/ProfileProvider';
import { supabase } from '@/lib/supabase';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(auth)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ProfileProvider>
        <SafeAreaProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AuthGate />
            <Stack>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="profile-selection" options={{ headerShown: false }} />
              <Stack.Screen
                name="manage-profiles"
                options={{
                  headerShown: false,
                  presentation: 'modal',
                  title: 'Manage Children',
                }}
              />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="health-onboarding"
                options={{
                  headerShown: false,
                  title: 'Health Setup',
                }}
              />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack>
          </ThemeProvider>
        </SafeAreaProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading } = useAuth();
  const { selectedProfile, isLoading: isProfileLoading } = useProfile();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [checkedOnboardingKey, setCheckedOnboardingKey] = useState<string>('');
  const onboardingScope = segments[0] ?? '';
  const onboardingCheckKey = `${user?.id ?? ''}:${selectedProfile?.id ?? ''}:${onboardingScope}`;

  useEffect(() => {
    if (isLoading || isProfileLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inProfileSelection = segments[0] === 'profile-selection';
    const inManageProfiles = segments[0] === 'manage-profiles';
    const inOnboarding = segments[0] === 'health-onboarding';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (user && inAuthGroup) {
      router.replace('/profile-selection');
      return;
    }

    if (user && !selectedProfile && !inProfileSelection && !inManageProfiles) {
      router.replace('/profile-selection');
      return;
    }

    if (user && !selectedProfile) {
      return;
    }

    // Wait until onboarding state has been re-checked for the current route/profile context.
    if (checkedOnboardingKey !== onboardingCheckKey) {
      return;
    }

    if (needsOnboarding === null) {
      return;
    }

    if (needsOnboarding && !inOnboarding) {
      router.replace('/health-onboarding');
      return;
    }

    if (!needsOnboarding && inOnboarding) {
      router.replace('/home');
      return;
    }
  }, [
    isLoading,
    isProfileLoading,
    needsOnboarding,
    checkedOnboardingKey,
    onboardingCheckKey,
    router,
    segments,
    user,
    selectedProfile,
  ]);

  useEffect(() => {
    let isMounted = true;
    const currentKey = onboardingCheckKey;

    const checkOnboarding = async () => {
      if (!user?.id || !selectedProfile?.id) {
        if (isMounted) {
          setNeedsOnboarding(null);
          setCheckedOnboardingKey(currentKey);
        }
        return;
      }

      if (isMounted) setNeedsOnboarding(null);

      const { data, error } = await supabase
        .from('health')
        .select('date_of_birth, blood_group, height_cm, weight_kg')
        .eq('profile_id', selectedProfile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Onboarding check failed:', error);
      }

      const isComplete =
        !!data?.date_of_birth && !!data?.blood_group && !!data?.height_cm && !!data?.weight_kg;

      if (isMounted) {
        setNeedsOnboarding(!isComplete);
        setCheckedOnboardingKey(currentKey);
      }
    };

    checkOnboarding();

    return () => {
      isMounted = false;
    };
  }, [onboardingCheckKey, user?.id, selectedProfile?.id]);

  return null;
}
