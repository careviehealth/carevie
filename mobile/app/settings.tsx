import { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { Screen } from '@/components/Screen';
import { ThemeSelector } from '@/components/ThemeSelector';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useProfile } from '@/hooks/useProfile';
import { apiRequest } from '@/api/client';
import { supabase } from '@/lib/supabase';
import { clearRememberedDevice } from '@/lib/rememberDevice';
import { toast } from '@/lib/toast';
import { TourAnchor, useOnboardingTour } from '@/providers/OnboardingTourProvider';

const ACCOUNT_DELETE_CONFIRMATION = 'DELETE';

const accountItems = [
  {
    label: 'Profile details',
    hint: 'Name, email, and family profile preferences',
    icon: 'account-outline' as const,
  },
  {
    label: 'Security',
    hint: 'Password, login sessions, and account safety',
    icon: 'shield-lock-outline' as const,
  },
];

const legalItems = [
  {
    label: 'Privacy Policy',
    path: '/legal/privacy-policy',
    summary: 'How personal information is collected, used, and protected.',
    badge: 'Data Handling',
    iconColorKey: 'info',
  },
  {
    label: 'Terms of Service',
    path: '/legal/terms-of-service',
    summary: 'Rules, responsibilities, and usage terms for this platform.',
    badge: 'Usage Terms',
    iconColorKey: 'accentStrong',
  },
  {
    label: 'Health Data Privacy',
    path: '/legal/health-data-privacy',
    summary: 'Additional safeguards and principles for health data privacy.',
    badge: 'Sensitive Data',
    iconColorKey: 'success',
  },
  {
    label: 'Cookie Policy',
    path: '/legal/cookie-policy',
    summary: 'Cookie categories, purpose, and your available controls.',
    badge: 'Cookies',
    iconColorKey: 'warningText',
  },
] as const satisfies ReadonlyArray<{
  label: string;
  path: string;
  summary: string;
  badge: string;
  iconColorKey: keyof Pick<AppThemeColors, 'accentStrong' | 'info' | 'success' | 'warningText'>;
}>;

type SettingsTab = 'account' | 'legal';

function getLegalUrl(path: string): string | null {
  const base = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(/\/$/, '');
  if (!base) return null;
  return `${base}${path}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { selectedProfile, isLoading: isProfileLoading } = useProfile();
  const { colors } = useAppTheme();
  const { currentStepId, startTour } = useOnboardingTour();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [isDeletePanelOpen, setIsDeletePanelOpen] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const isAccountTab = activeTab === 'account';
  const selectedProfileId = selectedProfile?.id ?? '';
  const canDeleteAccount = Boolean(selectedProfile?.is_primary);

  useEffect(() => {
    if (canDeleteAccount) return;
    setIsDeletePanelOpen(false);
    setDeleteConfirmationInput('');
    setDeleteAccountError(null);
  }, [canDeleteAccount, selectedProfileId]);

  useEffect(() => {
    if (currentStepId === 'settings-replay-tour' && activeTab !== 'account') {
      setActiveTab('account');
    }
  }, [activeTab, currentStepId]);

  const openLegalPage = async (path: string) => {
    const url = getLegalUrl(path);
    if (!url) {
      toast.error('Configuration Error', 'EXPO_PUBLIC_API_URL is not configured.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        toast.error('Unable to open', `Cannot open URL: ${url}`);
      }
    } catch {
      toast.error('Error', 'Failed to open the link.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedProfileId || !canDeleteAccount) {
      setDeleteAccountError('Only the primary profile can delete the account.');
      return;
    }

    if (deleteConfirmationInput.trim().toUpperCase() !== ACCOUNT_DELETE_CONFIRMATION) {
      setDeleteAccountError(`Type "${ACCOUNT_DELETE_CONFIRMATION}" to confirm account deletion.`);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      await apiRequest<{ message?: string }>('/api/account/delete', {
        method: 'POST',
        body: {
          confirmation: ACCOUNT_DELETE_CONFIRMATION,
          profileId: selectedProfileId,
        },
      });

      await clearRememberedDevice();

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Account may already be removed
      }

      router.replace('/(auth)/login');
    } catch (err: any) {
      setDeleteAccountError(err?.message || 'Unable to delete account right now.');
      setIsDeletingAccount(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      innerStyle={styles.screenInner}
      scrollable={false}
      safeAreaEdges={['top', 'left', 'right', 'bottom']}
    >
      {/* Header */}
      <TourAnchor tourId="nav-settings">
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.pageTitle}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>
      </TourAnchor>

      <Text style={styles.pageSubtitle}>Account, appearance, and legal controls.</Text>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab('account')}
          style={[styles.tab, isAccountTab && styles.tabActive]}
        >
          <MaterialCommunityIcons
            name="account-outline"
            size={16}
            color={isAccountTab ? colors.textPrimary : colors.textSecondary}
          />
          <Text style={[styles.tabText, isAccountTab && styles.tabTextActive]}>Account</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('legal')}
          style={[styles.tab, !isAccountTab && styles.tabActive]}
        >
          <MaterialCommunityIcons
            name="lock-outline"
            size={16}
            color={!isAccountTab ? colors.textPrimary : colors.textSecondary}
          />
          <Text style={[styles.tabText, !isAccountTab && styles.tabTextActive]}>Legal</Text>
        </Pressable>
      </View>

      {/* Panel */}
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderLeft}>
            <MaterialCommunityIcons
              name={isAccountTab ? 'account-outline' : 'lock-outline'}
              size={18}
              color={colors.textPrimary}
            />
            <Text style={styles.panelTitle}>{isAccountTab ? 'Account' : 'Legal'}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {isAccountTab ? '4 sections' : '4 documents'}
            </Text>
          </View>
        </View>

        {isAccountTab ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.panelScrollContent}
          >
            <ThemeSelector />

            <TourAnchor tourId="settings-replay-tour">
              <Pressable
                onPress={() => {
                  void startTour('replay');
                }}
                style={({ pressed }) => [styles.accountItem, pressed && styles.pressableCardPressed]}
              >
                <View style={styles.accountItemLeft}>
                  <View style={styles.accountItemIcon}>
                    <MaterialCommunityIcons
                      name="refresh"
                      size={18}
                      color={colors.accentStrong}
                    />
                  </View>
                  <View style={styles.accountItemText}>
                    <Text style={styles.accountItemLabel}>Replay app tour</Text>
                    <Text style={styles.accountItemHint}>
                      Start the walkthrough again from the home screen.
                    </Text>
                  </View>
                </View>
                <View style={styles.replayBadge}>
                  <Text style={styles.replayBadgeText}>Replay</Text>
                </View>
              </Pressable>
            </TourAnchor>

            {accountItems.map((item, index) => (
              <Animated.View
                key={item.label}
                entering={FadeInDown.delay(index * 80).springify()}
                style={styles.accountItem}
              >
                <View style={styles.accountItemLeft}>
                  <View style={styles.accountItemIcon}>
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </View>
                  <View style={styles.accountItemText}>
                    <Text style={styles.accountItemLabel}>{item.label}</Text>
                    <Text style={styles.accountItemHint}>{item.hint}</Text>
                  </View>
                </View>
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>Soon</Text>
                </View>
              </Animated.View>
            ))}

            {/* Danger Zone */}
            <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.dangerZone}>
              <Text style={styles.dangerTitle}>Danger zone</Text>
              <Text style={styles.dangerDescription}>
                Deleting your account removes your access and permanently deletes your health
                profiles and related records.
              </Text>
              {!canDeleteAccount ? (
                <Text style={styles.dangerHint}>
                  Switch to the primary profile to delete the account.
                </Text>
              ) : null}

              {!isDeletePanelOpen ? (
                <Pressable
                  onPress={() => {
                    if (!canDeleteAccount) {
                      setDeleteAccountError('Only the primary profile can delete the account.');
                      return;
                    }
                    setIsDeletePanelOpen(true);
                    setDeleteAccountError(null);
                    setDeleteConfirmationInput('');
                  }}
                  disabled={isDeletingAccount || isProfileLoading || !canDeleteAccount}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && !isDeletingAccount && !isProfileLoading && canDeleteAccount && styles.deleteButtonPressed,
                    (isDeletingAccount || isProfileLoading || !canDeleteAccount) && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.deleteButtonText}>Delete account</Text>
                </Pressable>
              ) : (
                <View style={styles.deletePanel}>
                  <Text style={styles.deletePanelPrompt}>
                    Type <Text style={styles.deletePanelBold}>{ACCOUNT_DELETE_CONFIRMATION}</Text> to
                    confirm.
                  </Text>
                  <TextInput
                    value={deleteConfirmationInput}
                    onChangeText={setDeleteConfirmationInput}
                    placeholder={ACCOUNT_DELETE_CONFIRMATION}
                    placeholderTextColor={colors.textTertiary}
                    editable={!isDeletingAccount}
                    autoCapitalize="characters"
                    style={[styles.deleteInput, isDeletingAccount && styles.deleteInputDisabled]}
                  />
                  {deleteAccountError ? (
                    <Text style={styles.deleteError}>{deleteAccountError}</Text>
                  ) : null}
                  <View style={styles.deleteActions}>
                    <Pressable
                      onPress={() => {
                        setIsDeletePanelOpen(false);
                        setDeleteConfirmationInput('');
                        setDeleteAccountError(null);
                      }}
                      disabled={isDeletingAccount}
                      style={({ pressed }) => [
                        styles.cancelDeleteButton,
                        pressed && styles.cancelDeleteButtonPressed,
                        isDeletingAccount && styles.disabledButton,
                      ]}
                    >
                      <Text style={styles.cancelDeleteText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleDeleteAccount()}
                      disabled={isDeletingAccount}
                      style={({ pressed }) => [
                        styles.confirmDeleteButton,
                        pressed && styles.confirmDeleteButtonPressed,
                        isDeletingAccount && styles.disabledButton,
                      ]}
                    >
                      <Text style={styles.confirmDeleteText}>
                        {isDeletingAccount ? 'Deleting...' : 'Confirm delete'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.panelScrollContent}
          >
            <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.legalIntro}>
              <Text style={styles.legalIntroLabel}>LEGAL LIBRARY</Text>
              <Text style={styles.legalIntroTitle}>Policies and agreements</Text>
              <Text style={styles.legalIntroDescription}>
                Open any legal document in your browser.
              </Text>
            </Animated.View>

            {legalItems.map((item, index) => (
              <Animated.View
                key={item.label}
                entering={FadeInDown.delay(index * 80).springify()}
              >
                <Pressable
                  onPress={() => void openLegalPage(item.path)}
                  style={({ pressed }) => [styles.legalCard, pressed && styles.legalCardPressed]}
                >
                  <View style={[styles.legalCardAccent, { backgroundColor: colors[item.iconColorKey] }]} />
                  <View style={styles.legalCardContent}>
                    <View style={styles.legalCardTop}>
                      <View style={styles.legalCardIconWrap}>
                        <MaterialCommunityIcons
                          name="file-document-outline"
                          size={18}
                          color={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.legalCardTextWrap}>
                        <Text style={styles.legalCardTitle}>{item.label}</Text>
                        <Text style={styles.legalCardSummary}>{item.summary}</Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </View>
                    <View style={styles.legalBadge}>
                      <Text style={styles.legalBadgeText}>{item.badge}</Text>
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    screenContent: {
      paddingTop: 8,
      paddingBottom: 16,
      justifyContent: 'flex-start',
    },
    screenInner: {
      width: '100%',
      flex: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 4,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    backButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    pageTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.5,
      flex: 1,
    },
    headerSpacer: {
      width: 38,
    },
    pageSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 16,
      marginLeft: 50,
    },

    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      alignSelf: 'flex-start',
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textPrimary,
    },

    panel: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      flex: 1,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    panelScrollContent: {
      paddingBottom: 8,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 14,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceMuted,
    },
    panelHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    panelTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    countBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    countBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },

    accountItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
    },
    pressableCardPressed: {
      opacity: 0.9,
    },
    accountItemLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      flex: 1,
    },
    accountItemIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountItemText: {
      flex: 1,
    },
    accountItemLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    accountItemHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    soonBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginLeft: 8,
    },
    soonBadgeText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    replayBadge: {
      borderRadius: 999,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginLeft: 8,
    },
    replayBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accentStrong,
    },

    dangerZone: {
      backgroundColor: colors.dangerSurface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      padding: 16,
      marginTop: 6,
    },
    dangerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.dangerText,
    },
    dangerDescription: {
      fontSize: 12,
      color: colors.dangerMutedText,
      marginTop: 4,
      lineHeight: 18,
    },
    dangerHint: {
      fontSize: 12,
      color: colors.dangerText,
      marginTop: 8,
      fontWeight: '600',
    },
    deleteButton: {
      marginTop: 12,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.surface,
    },
    deleteButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    deleteButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.dangerText,
    },
    deletePanel: {
      marginTop: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      padding: 14,
    },
    deletePanelPrompt: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    deletePanelBold: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    deleteInput: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.inputBackground,
    },
    deleteInputDisabled: {
      backgroundColor: colors.inputDisabled,
      opacity: 0.7,
    },
    deleteError: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '600',
      color: colors.dangerText,
    },
    deleteActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    cancelDeleteButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cancelDeleteButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    cancelDeleteText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    confirmDeleteButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.danger,
    },
    confirmDeleteButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    confirmDeleteText: {
      fontSize: 14,
      color: '#ffffff',
      fontWeight: '600',
    },
    disabledButton: {
      opacity: 0.6,
    },

    legalIntro: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 14,
    },
    legalIntroLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: colors.textSecondary,
    },
    legalIntroTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 4,
    },
    legalIntroDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },

    legalCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 12,
      overflow: 'hidden',
    },
    legalCardPressed: {
      transform: [{ scale: 0.98 }],
    },
    legalCardAccent: {
      height: 3,
    },
    legalCardContent: {
      padding: 14,
    },
    legalCardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    legalCardIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    legalCardTextWrap: {
      flex: 1,
    },
    legalCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    legalCardSummary: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
    },
    legalBadge: {
      alignSelf: 'flex-start',
      marginTop: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    legalBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}
