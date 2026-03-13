import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
import { EmptyStatePreset } from '@/components/EmptyState';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';

import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from '@/lib/countries';
import { toast } from '@/lib/toast';

export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relation: string;
};

type Props = {
  visible: boolean;
  contacts: EmergencyContact[];
  onClose: () => void;
  onAdd: (contact: EmergencyContact) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
};

const createContactId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function EmergencyContactsModal({ visible, contacts, onClose, onAdd, onDelete }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const isCompact = windowWidth < 360;
  const sheetMaxHeight = Math.min(windowHeight - 24, 760);
  const countryPickerHeight = Math.min(windowHeight * 0.72, 520);
  const countryListMaxHeight = Math.min(windowHeight * 0.56, 420);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setShowForm(false);
    setName('');
    setPhone('');
    setRelation('');
    setSelectedCountry(DEFAULT_COUNTRY);
  }, [visible]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setRelation('');
    setSelectedCountry(DEFAULT_COUNTRY);
  };

  const handleSave = async () => {
    if (!name.trim() || !relation.trim()) {
      toast.warning('Missing info', 'Please enter a valid name and relation.');
      return;
    }
    const digitsOnly = phone.replace(/\D/g, '');
    const isIndia = selectedCountry.code === 'IN';
    const minLen = isIndia ? INDIA_PHONE_DIGITS : 10;
    if (digitsOnly.length < minLen || digitsOnly.length > PHONE_MAX_DIGITS) {
      toast.warning(
        'Invalid phone',
        isIndia
          ? 'Please enter a valid 10-digit phone number.'
          : 'Please enter a valid phone number (10–15 digits).'
      );
      return;
    }

    const fullPhone = `${selectedCountry.dialCode}${digitsOnly}`;

    setSaving(true);
    try {
      await onAdd({
        id: createContactId(),
        name: name.trim(),
        phone: fullPhone,
        relation: relation.trim(),
      });
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete contact?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.scrim} onPress={onClose} />
          <KeyboardAvoidingView
            style={styles.keyboardWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <MotiView
              from={{ translateY: 100, opacity: 0.5 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            >
              <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Emergency Contacts</Text>
                  <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={20} color={themeColors.textPrimary} />
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={styles.sheetContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <Pressable
                    style={[styles.addToggle, showForm && styles.addToggleActive]}
                    onPress={() => {
                      setShowForm((prev) => !prev);
                      if (showForm) resetForm();
                    }}
                  >
                    <MaterialCommunityIcons
                      name={showForm ? 'close' : 'plus'}
                      size={18}
                      color={themeColors.accentStrong}
                    />
                    <Text style={styles.addToggleText}>
                      {showForm ? 'Close' : 'Add Contact'}
                    </Text>
                  </Pressable>

                  {showForm ? (
                    <View style={styles.formCard}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Name</Text>
                        <TextInput
                          value={name}
                          onChangeText={setName}
                          placeholder="e.g., Mom / John Doe"
                          placeholderTextColor={themeColors.textTertiary}
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Phone</Text>
                        <View style={[styles.phoneRow, isCompact && styles.phoneRowStacked]}>
                          <Pressable
                            style={styles.countryCodeButton}
                            onPress={() => setCountryPickerVisible(true)}
                          >
                            <Text style={styles.countryCodeText}>{selectedCountry.dialCode}</Text>
                            <MaterialCommunityIcons
                              name="chevron-down"
                              size={16}
                              color={themeColors.textSecondary}
                            />
                          </Pressable>
                          <TextInput
                            value={phone}
                            onChangeText={(value) =>
                              setPhone(value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS))
                            }
                            placeholder="e.g., 9876543210"
                            placeholderTextColor={themeColors.textTertiary}
                            keyboardType="phone-pad"
                            style={[styles.input, styles.phoneInput]}
                          />
                        </View>
                        <Modal
                          visible={countryPickerVisible}
                          transparent
                          animationType="slide"
                          onRequestClose={() => setCountryPickerVisible(false)}
                        >
                          <View style={styles.countryModalOverlay}>
                            <Pressable
                              style={StyleSheet.absoluteFill}
                              onPress={() => setCountryPickerVisible(false)}
                            />
                            <View
                              style={[styles.countryModalContent, { height: countryPickerHeight }]}
                              pointerEvents="box-none"
                            >
                              <View style={styles.countryModalHeader}>
                                <Text style={styles.countryModalTitle}>Select country</Text>
                                <Pressable onPress={() => setCountryPickerVisible(false)} hitSlop={12}>
                                  <Text style={styles.countryModalDone}>Done</Text>
                                </Pressable>
                              </View>
                              <View
                                style={[
                                  styles.countryListContainer,
                                  { maxHeight: countryListMaxHeight },
                                ]}
                              >
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
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Relation</Text>
                        <TextInput
                          value={relation}
                          onChangeText={setRelation}
                          placeholder="e.g., Parent / Friend"
                          placeholderTextColor={themeColors.textTertiary}
                          style={styles.input}
                        />
                      </View>
                      <Pressable
                        style={[styles.primaryAction, saving && styles.buttonDisabled]}
                        onPress={handleSave}
                        disabled={saving}
                      >
                        <Text style={styles.primaryActionText}>
                          {saving ? 'Saving...' : 'Save Contact'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {!contacts.length ? (
                    <EmptyStatePreset preset="contacts" />
                  ) : (
                    contacts.map((contact) => (
                      <View key={contact.id} style={styles.contactCard}>
                        <View style={styles.contactInfo}>
                          <Text style={styles.contactName}>{contact.name}</Text>
                          <Text style={styles.contactMeta}>
                            {contact.relation} • {contact.phone}
                          </Text>
                        </View>
                        <Pressable onPress={() => handleDelete(contact.id)} hitSlop={10}>
                          <MaterialCommunityIcons
                            name="trash-can-outline"
                            size={18}
                            color={themeColors.dangerText}
                          />
                        </Pressable>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            </MotiView>
          </KeyboardAvoidingView>
        </View>
      </BlurView>
    </Modal>
  );
}

function createStyles(themeColors: AppThemeColors) {
  return StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardWrapper: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: themeColors.surfaceMuted,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.surfaceElevated,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  addToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingVertical: 12,
    backgroundColor: themeColors.surface,
  },
  addToggleActive: {
    borderColor: themeColors.accentStrong,
  },
  addToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.accentStrong,
  },
  formCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    gap: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: themeColors.textPrimary,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  phoneRowStacked: {
    flexDirection: 'column',
  },
  countryCodeButton: {
    minWidth: 70,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.inputBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  phoneInput: {
    flex: 1,
  },
  countryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  countryModalContent: {
    backgroundColor: themeColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  countryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.surface,
  },
  countryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  countryModalDone: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.accentStrong,
  },
  countryListContainer: {
    flex: 1,
    minHeight: 0,
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
    borderBottomColor: themeColors.border,
  },
  countryItemPressed: {
    backgroundColor: themeColors.accentSoft,
  },
  countryItemText: {
    fontSize: 16,
    color: themeColors.textPrimary,
  },
  primaryAction: {
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: themeColors.accentContrast,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: themeColors.textSecondary,
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactInfo: {
    flex: 1,
    marginRight: 12,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  contactMeta: {
    fontSize: 12,
    color: themeColors.textSecondary,
    marginTop: 4,
  },
  });
}
