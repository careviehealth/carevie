import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LogoImage from '../../assets/images/Sample_Logo.png';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Themed';
import { apiRequest } from '@/api/client';
import { isApiError } from '@/api/types/errors';
import {
  clearRememberedDevice,
  loadRememberedAccount,
  loadRememberedDeviceToken,
  saveRememberedDevice,
  type RememberedAccount,
} from '@/lib/rememberDevice';
import { supabase } from '@/lib/supabase';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from '@/lib/countries';

type OtpSendResponse = {
  sessionId?: string;
};

type OtpVerifyResponse = {
  access_token?: string;
  refresh_token?: string;
};

type RememberRegisterResponse = {
  ok?: boolean;
  deviceToken?: string;
};

type RememberConsumeResponse = {
  ok?: boolean;
  userId?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  deviceToken?: string;
};

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (isApiError(error)) {
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
};

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [timer, setTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [rememberedAccount, setRememberedAccount] = useState<RememberedAccount | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  const fullPhone = useMemo(() => `${selectedCountry.dialCode}${phone}`, [selectedCountry, phone]);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  useEffect(() => {
    let isMounted = true;

    const hydrateRememberedAccount = async () => {
      const account = await loadRememberedAccount();
      if (!isMounted) return;
      setRememberedAccount(account);
    };

    hydrateRememberedAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  const focusOtp = (index: number) => {
    otpRefs.current[index]?.focus();
  };

  const updateOtpDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) {
      focusOtp(index + 1);
    }
  };

  const resolveDisplayName = async (userId: string, fallback: string) => {
    const { data: authProfiles, error: authProfilesError } = await supabase
      .from('profiles')
      .select('display_name, name')
      .eq('auth_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    if (!authProfilesError && authProfiles?.[0]) {
      return authProfiles[0].display_name?.trim() || authProfiles[0].name?.trim() || fallback;
    }

    const { data: userProfiles } = await supabase
      .from('profiles')
      .select('display_name, name')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    return userProfiles?.[0]?.display_name?.trim() || userProfiles?.[0]?.name?.trim() || fallback;
  };

  const removeRememberedAccount = async () => {
    const deviceToken = await loadRememberedDeviceToken();
    if (deviceToken) {
      try {
        await apiRequest<{ ok?: boolean }>('/api/auth/remember-device', {
          method: 'POST',
          body: {
            action: 'remove',
            client: 'mobile',
            deviceToken,
          },
        });
      } catch {
        // Preserve local cleanup regardless of network/server failures.
      }
    }

    await clearRememberedDevice();
    setRememberedAccount(null);
  };

  const handleContinueAs = async () => {
    if (!rememberedAccount) return;
    setError(null);
    setContinueLoading(true);

    try {
      const deviceToken = await loadRememberedDeviceToken();
      if (!deviceToken) {
        await removeRememberedAccount();
        setError('Saved login expired. Please sign in again.');
        return;
      }

      const response = await apiRequest<RememberConsumeResponse>('/api/auth/remember-device/consume', {
        method: 'POST',
        body: {
          client: 'mobile',
          userId: rememberedAccount.userId,
          deviceToken,
        },
      });

      if (!response?.access_token || !response?.refresh_token || !response?.deviceToken) {
        await removeRememberedAccount();
        setError('Saved login expired. Please sign in again.');
        return;
      }

      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: response.access_token,
        refresh_token: response.refresh_token,
      });

      if (sessionError || !data?.session) {
        await removeRememberedAccount();
        setError('Saved login expired. Please sign in again.');
        return;
      }

      await saveRememberedDevice(rememberedAccount, response.deviceToken);
      router.replace('/');
    } catch (requestError) {
      if (isApiError(requestError) && (requestError.status === 401 || requestError.status === 404)) {
        await removeRememberedAccount();
      }
      setError(getRequestErrorMessage(requestError, 'Could not continue with the saved account.'));
    } finally {
      setContinueLoading(false);
    }
  };

  const sendOtp = async () => {
    setError(null);
    const digitsOnly = phone.replace(/\D/g, '');
    const isIndia = selectedCountry.code === 'IN';
    const minLen = isIndia ? INDIA_PHONE_DIGITS : 10;
    if (digitsOnly.length < minLen || digitsOnly.length > PHONE_MAX_DIGITS) {
      setError(
        isIndia
          ? 'Please enter a valid 10-digit phone number.'
          : 'Please enter a valid phone number (10–15 digits).'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiRequest<OtpSendResponse>('/api/auth/otp/send', {
        method: 'POST',
        body: {
          phone: fullPhone,
          mode: 'login',
        },
      });

      if (!response?.sessionId) {
        setError('Failed to start OTP verification.');
        return;
      }

      setOtpSessionId(response.sessionId);
      setStep('otp');
      setTimer(60);
      setOtpDigits(Array(6).fill(''));
      setTimeout(() => focusOtp(0), 50);
    } catch (requestError) {
      setError(
        getRequestErrorMessage(
          requestError,
          'Failed to send OTP. Please check the number and try again.'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    const otp = otpDigits.join('');
    if (otp.length !== 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }

    if (!otpSessionId) {
      setError('Please request a new OTP.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiRequest<OtpVerifyResponse>('/api/auth/otp/verify', {
        method: 'POST',
        body: {
          phone: fullPhone,
          otp,
          sessionId: otpSessionId,
          mode: 'login',
        },
      });

      if (!response?.access_token || !response?.refresh_token) {
        setError('Could not start session. Please try again.');
        return;
      }

      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: response.access_token,
        refresh_token: response.refresh_token,
      });

      if (sessionError || !data?.user) {
        setError(sessionError?.message || 'Could not start session.');
        return;
      }

      if (rememberDevice) {
        try {
          const fallbackName = data.user.phone ?? fullPhone;
          const displayName = await resolveDisplayName(data.user.id, fallbackName);
          const registerResponse = await apiRequest<RememberRegisterResponse>('/api/auth/remember-device', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${response.access_token}`,
            },
            body: {
              action: 'register',
              client: 'mobile',
              label: `mobile:${Platform.OS}`,
            },
          });

          if (registerResponse?.deviceToken) {
            const fullPhoneForSave = data.user.phone ?? fullPhone;
            await saveRememberedDevice(
              {
                userId: data.user.id,
                name: displayName,
                phone: fullPhoneForSave,
                email: data.user.email ?? null,
                avatarUrl: null,
              },
              registerResponse.deviceToken
            );
            setRememberedAccount({
              userId: data.user.id,
              name: displayName,
              phone: fullPhoneForSave,
              email: data.user.email ?? null,
              avatarUrl: null,
            });
          } else {
            setError('Could not save this device. You can still continue.');
          }
        } catch {
          setError('Could not save this device. You can still continue.');
        }
      }

      router.replace('/');
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, 'Invalid OTP. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      maxWidth={520}
      safeAreaStyle={styles.safeArea}
      contentContainerStyle={styles.screenContent}
      padded={false}
    >
      <View pointerEvents="none" style={styles.background}>
        <LinearGradient
          colors={['#050b10', '#0b1c21', '#050b10']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.glow, styles.glowOne]} />
        <View style={[styles.glow, styles.glowTwo]} />
      </View>
      <View style={styles.card}>
        <LinearGradient
          colors={['#14b8a6', '#134e4a']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.cardAccent}
        />
        <View style={styles.logoWrap}>
          <Image source={LogoImage} style={styles.logo} accessibilityLabel="Vytara logo" />
        </View>
        <Text style={styles.title}>Login with Phone</Text>
        <Text style={styles.subtitle}>
          {step === 'phone' ? 'We’ll send a one-time password' : `Enter the OTP sent to ${selectedCountry.dialCode} ${phone}`}
        </Text>

        {step === 'phone' && rememberedAccount ? (
          <View style={styles.rememberedCard}>
            <View style={styles.rememberedHeader}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {(rememberedAccount.name.trim().charAt(0) || 'U').toUpperCase()}
                </Text>
              </View>
              <View style={styles.rememberedIdentity}>
                <Text style={styles.rememberedLabel}>Saved account</Text>
                <Text style={styles.rememberedName}>{rememberedAccount.name}</Text>
                <Text style={styles.rememberedMeta}>
                  {rememberedAccount.email?.trim() || rememberedAccount.phone}
                </Text>
              </View>
            </View>

            <View style={styles.rememberedActions}>
              <Pressable
                onPress={removeRememberedAccount}
                disabled={continueLoading || isSubmitting}
                style={styles.rememberedRemoveButton}
              >
                <Text style={styles.rememberedRemoveText}>Remove</Text>
              </Pressable>
              <Pressable
                onPress={handleContinueAs}
                disabled={continueLoading || isSubmitting}
                style={styles.rememberedContinueButton}
              >
                {continueLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.rememberedContinueText}>Continue as {rememberedAccount.name}</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === 'phone' ? (
          <View style={styles.phoneRow}>
            <Pressable
              style={styles.countryCode}
              onPress={() => setCountryPickerVisible(true)}
            >
              <Text style={styles.countryCodeText}>{selectedCountry.dialCode}</Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#334155" />
            </Pressable>
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS))}
              placeholder="Phone number"
              keyboardType="number-pad"
              style={[styles.input, styles.phoneInput]}
              placeholderTextColor="#94a3b8"
              maxLength={PHONE_MAX_DIGITS}
            />
            <Modal
              visible={countryPickerVisible}
              transparent
              animationType="slide"
              onRequestClose={() => setCountryPickerVisible(false)}
            >
              <View style={styles.modalOverlay}>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => setCountryPickerVisible(false)}
                />
                <View style={styles.modalContent} pointerEvents="box-none">
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select country</Text>
                    <Pressable onPress={() => setCountryPickerVisible(false)} hitSlop={12}>
                      <Text style={styles.modalClose}>Done</Text>
                    </Pressable>
                  </View>
                  <View style={styles.countryListContainer}>
                    <FlatList
                      data={COUNTRIES}
                      keyExtractor={(item) => item.code}
                      style={styles.countryList}
                      contentContainerStyle={styles.countryListContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <Pressable
                          style={({ pressed }) => [
                            styles.countryItem,
                            pressed && styles.countryItemPressed,
                          ]}
                          onPress={() => {
                            setSelectedCountry(item);
                            setCountryPickerVisible(false);
                          }}
                        >
                          <Text style={styles.countryItemText}>
                            {item.name} ({item.dialCode})
                          </Text>
                        </Pressable>
                      )}
                    />
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        ) : (
          <View style={styles.otpRow}>
            {otpDigits.map((digit, index) => (
              <TextInput
                key={`otp-${index}`}
                ref={(ref) => {
                  otpRefs.current[index] = ref;
                }}
                value={digit}
                onChangeText={(value) => updateOtpDigit(index, value)}
                keyboardType="number-pad"
                maxLength={1}
                style={styles.otpInput}
                textAlign="center"
              />
            ))}
          </View>
        )}

        {step === 'phone' ? (
          <Pressable onPress={() => setRememberDevice((prev) => !prev)} style={styles.checkboxRow}>
            <View style={[styles.checkbox, rememberDevice && styles.checkboxChecked]}>
              {rememberDevice ? (
                <MaterialCommunityIcons name="check" size={14} color="#ffffff" />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>Save this account on this device</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={step === 'phone' ? sendOtp : verifyOtp} disabled={isSubmitting}>
          <LinearGradient
            colors={['#14b8a6', '#0f766e']}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{step === 'phone' ? 'Request OTP' : 'Verify & Continue'}</Text>
            )}
          </LinearGradient>
        </Pressable>

        {step === 'otp' ? (
          <View style={styles.otpFooterRow}>
            <Pressable onPress={() => setStep('phone')}>
              <Text style={styles.footerLink}>Change number</Text>
            </Pressable>
            <Pressable onPress={sendOtp} disabled={timer > 0 || isSubmitting}>
              <Text style={[styles.footerLink, timer > 0 && styles.footerLinkDisabled]}>
                {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footerDivider} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Don&apos;t have an account?</Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable>
              <Text style={styles.footerLink}>Create Account</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050b10',
  },
  screenContent: {
    justifyContent: 'center',
    paddingVertical: 32,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(20, 184, 166, 0.25)',
  },
  glowOne: {
    top: -80,
    right: -120,
  },
  glowTwo: {
    bottom: -120,
    left: -80,
  },
  card: {
    borderRadius: 28,
    padding: 24,
    gap: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#0b1c21',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    marginHorizontal: 20,
  },
  cardAccent: {
    height: 6,
    width: '100%',
    borderRadius: 999,
    marginBottom: 10,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 72,
    marginBottom: 6,
    overflow: 'visible',
  },
  logo: {
    width: 280,
    height: 280,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: '#14b8a6',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 6,
    textAlign: 'center',
  },
  rememberedCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  rememberedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#334155',
    fontWeight: '800',
  },
  rememberedIdentity: {
    flex: 1,
    gap: 2,
  },
  rememberedLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rememberedName: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 16,
  },
  rememberedMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  rememberedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rememberedRemoveButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minHeight: 42,
  },
  rememberedRemoveText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },
  rememberedContinueButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  rememberedContinueText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCode: {
    minWidth: 70,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  countryCodeText: {
    color: '#334155',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
    maxHeight: 500,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14b8a6',
  },
  countryListContainer: {
    flex: 1,
    minHeight: 0,
    maxHeight: 360,
  },
  countryList: {
    flex: 1,
  },
  countryListContent: {
    paddingBottom: 24,
  },
  countryItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  countryItemPressed: {
    backgroundColor: '#f0fdfa',
  },
  countryItemText: {
    fontSize: 16,
    color: '#334155',
  },
  input: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    color: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  phoneInput: {
    flex: 1,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpInput: {
    flex: 1,
    minHeight: 52,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    color: '#0f172a',
    borderRadius: 12,
    fontSize: 20,
    fontWeight: '700',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#14b8a6',
    borderColor: '#14b8a6',
  },
  checkboxLabel: {
    color: '#4b5563',
    fontSize: 13,
  },
  button: {
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0f766e',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: '#e11d48',
    fontSize: 13,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#6b7280',
  },
  footerLink: {
    color: '#14b8a6',
    fontWeight: '700',
  },
  otpFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  footerLinkDisabled: {
    opacity: 0.6,
  },
  footerDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 12,
  },
});
