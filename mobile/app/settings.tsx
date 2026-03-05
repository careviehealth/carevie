import { useState } from 'react';
import {
  Linking,
  Platform,
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
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/api/client';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

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
    iconColor: '#0891b2',
  },
  {
    label: 'Terms of Service',
    path: '/legal/terms-of-service',
    summary: 'Rules, responsibilities, and usage terms for this platform.',
    badge: 'Usage Terms',
    iconColor: '#6366f1',
  },
  {
    label: 'Health Data Privacy',
    path: '/legal/health-data-privacy',
    summary: 'Additional safeguards and principles for health data privacy.',
    badge: 'Sensitive Data',
    iconColor: '#059669',
  },
  {
    label: 'Cookie Policy',
    path: '/legal/cookie-policy',
    summary: 'Cookie categories, purpose, and your available controls.',
    badge: 'Cookies',
    iconColor: '#d97706',
  },
];

type SettingsTab = 'account' | 'legal';

function getLegalUrl(path: string): string | null {
  const base = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(/\/$/, '');
  if (!base) return null;
  return `${base}${path}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [isDeletePanelOpen, setIsDeletePanelOpen] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const isAccountTab = activeTab === 'account';

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
    if (deleteConfirmationInput.trim().toUpperCase() !== ACCOUNT_DELETE_CONFIRMATION) {
      setDeleteAccountError(`Type "${ACCOUNT_DELETE_CONFIRMATION}" to confirm account deletion.`);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      await apiRequest<{ message?: string }>('/api/account/delete', {
        method: 'POST',
        body: { confirmation: ACCOUNT_DELETE_CONFIRMATION },
      });

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
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#1d2f33" />
        </Pressable>
        <Text style={styles.pageTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.pageSubtitle}>Account and legal controls.</Text>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab('account')}
          style={[styles.tab, isAccountTab && styles.tabActive]}
        >
          <MaterialCommunityIcons
            name="account-outline"
            size={16}
            color={isAccountTab ? '#1d2f33' : '#6b7f86'}
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
            color={!isAccountTab ? '#1d2f33' : '#6b7f86'}
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
              color="#1d2f33"
            />
            <Text style={styles.panelTitle}>{isAccountTab ? 'Account' : 'Legal'}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {isAccountTab ? '3 sections' : '4 documents'}
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
            {accountItems.map((item, index) => (
              <Animated.View
                key={item.label}
                entering={FadeInDown.delay(index * 80).springify()}
                style={styles.accountItem}
              >
                <View style={styles.accountItemLeft}>
                  <View style={styles.accountItemIcon}>
                    <MaterialCommunityIcons name={item.icon} size={18} color="#4b5563" />
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

              {!isDeletePanelOpen ? (
                <Pressable
                  onPress={() => {
                    setIsDeletePanelOpen(true);
                    setDeleteAccountError(null);
                    setDeleteConfirmationInput('');
                  }}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.deleteButtonPressed,
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
                    placeholderTextColor="#9ca3af"
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
                <View style={[styles.legalCardAccent, { backgroundColor: item.iconColor }]} />
                <View style={styles.legalCardContent}>
                  <View style={styles.legalCardTop}>
                    <View style={styles.legalCardIconWrap}>
                      <MaterialCommunityIcons
                        name="file-document-outline"
                        size={18}
                        color="#64748b"
                      />
                    </View>
                    <View style={styles.legalCardTextWrap}>
                      <Text style={styles.legalCardTitle}>{item.label}</Text>
                      <Text style={styles.legalCardSummary}>{item.summary}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#94a3b8" />
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

const styles = StyleSheet.create({
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
    backgroundColor: '#f0f5f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe7ea',
  },
  backButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
    flex: 1,
  },
  headerSpacer: {
    width: 38,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#6b7f86',
    marginBottom: 16,
    marginLeft: 50,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f5f6',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#dbe7ea',
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
    backgroundColor: '#ffffff',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7f86',
  },
  tabTextActive: {
    color: '#1d2f33',
  },

  // Panel
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    padding: 18,
    flex: 1,
    shadowColor: '#1b2b2f',
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
    borderBottomColor: '#f0f5f6',
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1d2f33',
  },
  countBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    backgroundColor: '#f7fafa',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7f86',
  },

  // Account items
  accountItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#f7fafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    padding: 14,
    marginBottom: 10,
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe7ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountItemText: {
    flex: 1,
  },
  accountItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d2f33',
  },
  accountItemHint: {
    fontSize: 12,
    color: '#6b7f86',
    marginTop: 2,
  },
  soonBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  soonBadgeText: {
    fontSize: 11,
    color: '#6b7f86',
  },

  // Danger zone
  dangerZone: {
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 16,
    marginTop: 6,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7f1d1d',
  },
  dangerDescription: {
    fontSize: 12,
    color: '#991b1b',
    marginTop: 4,
    lineHeight: 18,
  },
  deleteButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#ffffff',
  },
  deleteButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
  },
  deletePanel: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 14,
  },
  deletePanelPrompt: {
    fontSize: 13,
    color: '#4b5563',
  },
  deletePanelBold: {
    fontWeight: '700',
    color: '#1d2f33',
  },
  deleteInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1d2f33',
    backgroundColor: '#f7fbfb',
  },
  deleteInputDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.7,
  },
  deleteError: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
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
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  cancelDeleteButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  cancelDeleteText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '600',
  },
  confirmDeleteButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#dc2626',
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

  // Legal intro
  legalIntro: {
    backgroundColor: '#f7fafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    padding: 16,
    marginBottom: 14,
  },
  legalIntroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#6b7f86',
  },
  legalIntroTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d2f33',
    marginTop: 4,
  },
  legalIntroDescription: {
    fontSize: 12,
    color: '#6b7f86',
    marginTop: 4,
  },

  // Legal cards
  legalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    backgroundColor: '#ffffff',
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
    backgroundColor: '#f7fafa',
    borderWidth: 1,
    borderColor: '#dbe7ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalCardTextWrap: {
    flex: 1,
  },
  legalCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d2f33',
  },
  legalCardSummary: {
    fontSize: 12,
    color: '#6b7f86',
    marginTop: 4,
    lineHeight: 18,
  },
  legalBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe7ea',
    backgroundColor: '#f7fafa',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  legalBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7f86',
  },
});
