import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { Screen } from '@/components/Screen';
import { SkeletonListItem } from '@/components/Skeleton';
import { EmptyStatePreset, EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/lib/toast';
import {
  careCircleApi,
  type CareCircleRole,
  type CareCircleLink,
  type MemberDetailsAppointment,
  type MemberDetailsMedication,
  type MemberDetailsPayload,
  type MemberVaultFile,
  type VaultCategory,
  type VaultFolder,
} from '@/api/modules/carecircle';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from '@/lib/countries';
import { supabase } from '@/lib/supabase';

type CircleView = 'my-circle' | 'circles-in';
type MemberDetailsTab = 'personal' | 'appointments' | 'medications' | 'vault';

const normalizeCareCircleRole = (value: string | null | undefined): CareCircleRole => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'family') return 'family';
  return 'friend';
};

const isElevatedCareCircleRole = (role: CareCircleRole) => role === 'family';

const roleLabels: Record<CareCircleRole, string> = {
  family: 'Family',
  friend: 'Friend',
};

type EmergencyCardData = {
  name: string;
  age: string;
  date_of_birth: string;
  photo_id_on_file: boolean;
  photo_id_last4: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  preferred_hospital: string;
  insurer_name: string;
  plan_type: string;
  tpa_helpline: string;
  insurance_last4: string;
  blood_group: string;
  critical_allergies: string;
  chronic_conditions: string;
  current_meds: string;
  emergency_instructions: string;
};

type AppointmentEditorDraft = {
  id?: string;
  title: string;
  date: string;
  time: string;
  type: string;
  extras: Record<string, string>;
};

type AppointmentTimeParts = {
  hour: string;
  minute: string;
  period: '' | 'AM' | 'PM';
};

type AppointmentTypeField = {
  name: string;
  label: string;
  type: 'text' | 'textarea';
  placeholder: string;
};

type MedicationEditorDraft = {
  id?: string;
  name: string;
  dosage: string;
  frequency: string;
  purpose: string;
  timesPerDay: string;
  startDate: string;
  endDate: string;
  logs: MemberDetailsMedication['logs'];
};

type VaultUploadFileDraft = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

const emptyEmergencyCard: EmergencyCardData = {
  name: '',
  age: '',
  date_of_birth: '',
  photo_id_on_file: false,
  photo_id_last4: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  preferred_hospital: '',
  insurer_name: '',
  plan_type: '',
  tpa_helpline: '',
  insurance_last4: '',
  blood_group: '',
  critical_allergies: '',
  chronic_conditions: '',
  current_meds: '',
  emergency_instructions: '',
};

const emptyAppointmentEditorDraft: AppointmentEditorDraft = {
  title: '',
  date: '',
  time: '',
  type: '',
  extras: {},
};

const emptyMedicationEditorDraft: MedicationEditorDraft = {
  name: '',
  dosage: '',
  frequency: '',
  purpose: '',
  timesPerDay: '',
  startDate: '',
  endDate: '',
  logs: [],
};

const medicationFrequencyOptions = [
  { label: 'Once daily', value: 'once_daily', times: 1 },
  { label: 'Twice daily', value: 'twice_daily', times: 2 },
  { label: 'Three times daily', value: 'three_times_daily', times: 3 },
  { label: 'Four times daily', value: 'four_times_daily', times: 4 },
  { label: 'Every 4 hours', value: 'every_4_hours', times: 6 },
  { label: 'Every 6 hours', value: 'every_6_hours', times: 4 },
  { label: 'Every 8 hours', value: 'every_8_hours', times: 3 },
  { label: 'Every 12 hours', value: 'every_12_hours', times: 2 },
  { label: 'As needed', value: 'as_needed', times: 0 },
  { label: 'With meals', value: 'with_meals', times: 3 },
  { label: 'Before bed', value: 'before_bed', times: 1 },
] as const;

const appointmentTypeFields: Record<string, AppointmentTypeField[]> = {
  'Doctor Visit': [
    { name: 'doctorName', label: 'Doctor Name', type: 'text', placeholder: 'Enter doctor name' },
    { name: 'specialty', label: 'Specialty', type: 'text', placeholder: 'e.g., Cardiologist' },
    {
      name: 'hospitalName',
      label: 'Hospital/Clinic Name',
      type: 'text',
      placeholder: 'Enter hospital or clinic name',
    },
    { name: 'reason', label: 'Reason for Visit', type: 'text', placeholder: 'Enter reason for visit' },
  ],
  'Lab Test': [
    { name: 'testName', label: 'Test Name', type: 'text', placeholder: 'e.g., Blood Test' },
    { name: 'labName', label: 'Lab Name', type: 'text', placeholder: 'Enter lab name' },
    {
      name: 'instructions',
      label: 'Instructions',
      type: 'textarea',
      placeholder: 'Any pre-test instructions',
    },
  ],
  Hospital: [
    { name: 'hospitalName', label: 'Hospital Name', type: 'text', placeholder: 'Enter hospital name' },
    { name: 'department', label: 'Department', type: 'text', placeholder: 'e.g., Cardiology' },
    { name: 'reason', label: 'Reason for Admission', type: 'text', placeholder: 'Enter reason' },
  ],
  Therapy: [
    { name: 'therapyType', label: 'Type of Therapy', type: 'text', placeholder: 'e.g., Physical Therapy' },
    {
      name: 'therapistName',
      label: 'Therapist Name',
      type: 'text',
      placeholder: 'Enter therapist name',
    },
    { name: 'location', label: 'Location', type: 'text', placeholder: 'Enter clinic/location' },
  ],
  'Follow-up': [
    { name: 'previousDoctor', label: 'Doctor Name', type: 'text', placeholder: 'Enter doctor name' },
    {
      name: 'previousVisitReason',
      label: 'Previous Visit Reason',
      type: 'text',
      placeholder: 'What was the previous visit for?',
    },
    {
      name: 'hospitalName',
      label: 'Hospital/Clinic Name',
      type: 'text',
      placeholder: 'Enter hospital or clinic name',
    },
  ],
  Other: [
    { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the appointment' },
    {
      name: 'contactPerson',
      label: 'Contact Person',
      type: 'text',
      placeholder: 'Enter contact person name',
    },
  ],
};

const appointmentTypeOptions = [
  'Doctor Visit',
  'Lab Test',
  'Hospital',
  'Therapy',
  'Follow-up',
  'Other',
] as const;

const vaultCategoryLabels: Record<VaultCategory, string> = {
  all: 'All',
  reports: 'Lab Reports',
  prescriptions: 'Prescriptions',
  insurance: 'Insurance',
  bills: 'Bills',
};

const vaultAllowedImageExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'heic',
  'heif',
  'avif',
  'ico',
]);

const vaultFileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const stripVaultExtension = (name: string) => name.replace(/\.[^/.]+$/, '');
const sanitizeVaultFileName = (name: string) => name.replace(/[\\/]/g, '-').trim();
const isValidVaultFileName = (name: string) =>
  Boolean(name) && !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..';

const buildVaultUploadFileName = (file: VaultUploadFileDraft, requestedName: string) => {
  const extension = vaultFileExtension(file.name);
  const fromInput = stripVaultExtension(sanitizeVaultFileName(requestedName));
  const fallback = stripVaultExtension(sanitizeVaultFileName(file.name)) || 'untitled';
  const base = fromInput || fallback;
  return extension ? `${base}.${extension}` : base;
};

const isAllowedVaultUploadType = (name: string, mimeType?: string | null) => {
  if (mimeType === 'application/pdf' || mimeType?.startsWith('image/')) {
    return true;
  }
  const extension = vaultFileExtension(name);
  return extension === 'pdf' || vaultAllowedImageExtensions.has(extension);
};

const vaultFileKey = (file: Pick<MemberVaultFile, 'folder' | 'name'>) => `${file.folder}:${file.name}`;

const formatVaultDate = (value: string | null | undefined) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString();
};

const emptyAppointmentTimeParts: AppointmentTimeParts = {
  hour: '',
  minute: '',
  period: '',
};

const generateLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeTime24h = (value: string): string | null => {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizeAppointmentDate = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
    parsed.getDate()
  ).padStart(2, '0')}`;
};

const to24HourTime = (hour: string, minute: string, period: '' | 'AM' | 'PM') => {
  if (!hour || !minute || !period) return '';
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) return '';
  if (parsedMinute < 0 || parsedMinute > 59 || parsedHour < 0 || parsedHour > 12) return '';

  let hour24 = parsedHour;
  if (period === 'AM') {
    hour24 = parsedHour === 12 ? 0 : parsedHour;
  } else if (period === 'PM') {
    hour24 = parsedHour === 12 ? 12 : parsedHour + 12;
  }

  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
};

const from24HourTime = (value: string | null | undefined): AppointmentTimeParts => {
  const normalized = normalizeTime24h(value ?? '');
  if (!normalized) return { ...emptyAppointmentTimeParts };
  const [hours, minutes] = normalized.split(':');
  const hour24 = Number(hours);
  if (!Number.isFinite(hour24)) return { ...emptyAppointmentTimeParts };

  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    hour: String(hour12).padStart(2, '0'),
    minute: minutes,
    period,
  };
};

const clampTimePart = (value: string, max: number) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number(digits);
  if (!Number.isFinite(numeric)) return '';
  return String(Math.min(numeric, max));
};

const formatAppointmentTime = (value: string | null | undefined) => {
  const normalized = normalizeTime24h(value ?? '');
  if (!normalized) return value?.trim() || '—';
  const parsed = new Date(`1970-01-01T${normalized}`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const getAppointmentTypeFields = (type: string): AppointmentTypeField[] =>
  appointmentTypeFields[type] ?? [];

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ').filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
};

// Animated Button Component
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedButton = ({
  children,
  onPress,
  style,
  disabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
  disabled?: boolean;
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[style, animatedStyle] as any}
    >
      {children}
    </AnimatedPressable>
  );
};

// Skeleton Loader Component
const SkeletonMemberCard = ({ index }: { index: number }) => (
  <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
    <SkeletonListItem />
  </Animated.View>
);

export default function CareCircleScreen() {
  const { user } = useAuth();
  const { selectedProfile } = useProfile();
  const profileId = selectedProfile?.id ?? '';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [displayName, setDisplayName] = useState('');
  const [circleView, setCircleView] = useState<CircleView>('my-circle');
  const [outgoingLinks, setOutgoingLinks] = useState<CareCircleLink[]>([]);
  const [incomingLinks, setIncomingLinks] = useState<CareCircleLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteContact, setInviteContact] = useState('');
  const [inviteCountry, setInviteCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [inviteCountryPickerVisible, setInviteCountryPickerVisible] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [emergencyCardOwner, setEmergencyCardOwner] = useState<{
    userId: string;
    profileId: string | null;
    name: string;
  } | null>(null);
  const [emergencyCard, setEmergencyCard] = useState<EmergencyCardData>(emptyEmergencyCard);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [isEmergencyLoading, setIsEmergencyLoading] = useState(false);
  const [isEmergencyEditing, setIsEmergencyEditing] = useState(false);
  const [isSavingEmergency, setIsSavingEmergency] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<'accept' | 'decline' | null>(null);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [roleUpdatingLinkId, setRoleUpdatingLinkId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleEditorMember, setRoleEditorMember] = useState<CareCircleLink | null>(null);
  const [roleEditorValue, setRoleEditorValue] = useState<CareCircleRole>('friend');
  const [selectedMember, setSelectedMember] = useState<CareCircleLink | null>(null);
  const [memberDetailsOpen, setMemberDetailsOpen] = useState(false);
  const [memberDetails, setMemberDetails] = useState<MemberDetailsPayload | null>(null);
  const [memberDetailsLoading, setMemberDetailsLoading] = useState(false);
  const [memberDetailsError, setMemberDetailsError] = useState<string | null>(null);
  const [memberDetailsTab, setMemberDetailsTab] = useState<MemberDetailsTab>('personal');
  const [appointmentEditorOpen, setAppointmentEditorOpen] = useState(false);
  const [appointmentEditorMode, setAppointmentEditorMode] = useState<'add' | 'edit'>('add');
  const [appointmentEditorDraft, setAppointmentEditorDraft] = useState<AppointmentEditorDraft>(
    emptyAppointmentEditorDraft
  );
  const [appointmentTypePickerOpen, setAppointmentTypePickerOpen] = useState(false);
  const [appointmentTimeParts, setAppointmentTimeParts] = useState<AppointmentTimeParts>(
    emptyAppointmentTimeParts
  );
  const [appointmentEditorSaving, setAppointmentEditorSaving] = useState(false);
  const [appointmentEditorError, setAppointmentEditorError] = useState<string | null>(null);
  const [medicationEditorOpen, setMedicationEditorOpen] = useState(false);
  const [medicationEditorMode, setMedicationEditorMode] = useState<'add' | 'edit'>('add');
  const [medicationEditorDraft, setMedicationEditorDraft] = useState<MedicationEditorDraft>(
    emptyMedicationEditorDraft
  );
  const [medicationFrequencyPickerOpen, setMedicationFrequencyPickerOpen] = useState(false);
  const [medicationEditorSaving, setMedicationEditorSaving] = useState(false);
  const [medicationEditorError, setMedicationEditorError] = useState<string | null>(null);
  const [vaultFiles, setVaultFiles] = useState<MemberVaultFile[]>([]);
  const [vaultCategory, setVaultCategory] = useState<VaultCategory>('all');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [vaultUploadModalOpen, setVaultUploadModalOpen] = useState(false);
  const [vaultUploadFile, setVaultUploadFile] = useState<VaultUploadFileDraft | null>(null);
  const [vaultUploadFolder, setVaultUploadFolder] = useState<VaultFolder>('reports');
  const [vaultUploadName, setVaultUploadName] = useState('');
  const [vaultUploadError, setVaultUploadError] = useState<string | null>(null);
  const [vaultUploading, setVaultUploading] = useState(false);
  const [vaultRenameFile, setVaultRenameFile] = useState<MemberVaultFile | null>(null);
  const [vaultRenameValue, setVaultRenameValue] = useState('');
  const [vaultRenamingKey, setVaultRenamingKey] = useState<string | null>(null);
  const [vaultDeletingKey, setVaultDeletingKey] = useState<string | null>(null);
  const [vaultOpeningKey, setVaultOpeningKey] = useState<string | null>(null);
  const [vaultActionMenuFile, setVaultActionMenuFile] = useState<MemberVaultFile | null>(null);
  const [vaultPreviewFile, setVaultPreviewFile] = useState<MemberVaultFile | null>(null);
  const [vaultPreviewUrl, setVaultPreviewUrl] = useState<string | null>(null);
  const [vaultPreviewLoading, setVaultPreviewLoading] = useState(false);
  const [vaultPreviewError, setVaultPreviewError] = useState<string | null>(null);

  const modalMaxHeight = Math.max(360, Math.min(height * 0.9, 760));
  const inlineEditorScrollMaxHeight = Math.max(220, Math.min(height * 0.62, 520));
  const countryPickerHeight = Math.min(height * 0.75, 520);
  const countryPickerListMaxHeight = Math.min(height * 0.55, 420);
  const isSelectedProfilePrimary = selectedProfile?.is_primary ?? false;
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const selectedMedicationFrequency = useMemo(
    () =>
      medicationFrequencyOptions.find((option) => option.value === medicationEditorDraft.frequency) ??
      null,
    [medicationEditorDraft.frequency]
  );
  const isMedicationTimesPerDayLocked = selectedMedicationFrequency !== null;
  const getMedicationFrequencyLabel = useCallback((value: string | null | undefined) => {
    const normalized = (value ?? '').trim();
    if (!normalized) return '—';
    return (
      medicationFrequencyOptions.find((option) => option.value === normalized)?.label ?? normalized
    );
  }, []);
  const activeAppointmentTypeFields = useMemo(
    () => getAppointmentTypeFields(appointmentEditorDraft.type),
    [appointmentEditorDraft.type]
  );
  const filteredVaultFiles = useMemo(() => {
    const query = vaultSearchQuery.trim().toLowerCase();
    const filtered = query
      ? vaultFiles.filter((file) => file.name.toLowerCase().includes(query))
      : vaultFiles;
    return [...filtered].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [vaultFiles, vaultSearchQuery]);
  const vaultPreviewType = useMemo(() => {
    if (!vaultPreviewFile) return 'unknown';
    const extension = vaultFileExtension(vaultPreviewFile.name).toLowerCase();
    if (extension === 'pdf') return 'pdf';
    if (vaultAllowedImageExtensions.has(extension)) return 'image';
    return 'unknown';
  }, [vaultPreviewFile]);

  useEffect(() => {
    const loadDisplayName = async () => {
      if (!user?.id || !profileId) return;
      // Load display name from selected profile instead of personal table
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', profileId)
        .maybeSingle();
      if (data?.display_name) {
        setDisplayName(data.display_name);
      }
    };
    loadDisplayName();
  }, [user?.id, profileId]);

  const fetchLinks = useCallback(async (showSpinner = true) => {
    if (!user?.id || !profileId) return;
    if (showSpinner) setLoading(true);

    try {
      const data = await careCircleApi.getLinks(profileId);
      setOutgoingLinks(data.outgoing || []);
      setIncomingLinks(data.incoming || []);
    } catch (err: any) {
      console.error('Failed to fetch care circle links:', err);
      // If API URL is not configured, show empty state instead of error
      if (err?.message?.includes('EXPO_PUBLIC_API_URL') || err?.message?.includes('Missing')) {
        setOutgoingLinks([]);
        setIncomingLinks([]);
        // Don't show alert for missing API URL - just show empty state
      } else {
        const errorMessage = err?.message || 'Failed to load care circle links.';
        toast.error('Error', errorMessage);
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [user?.id, profileId]);

  const refreshAll = useCallback(async () => {
    if (!user?.id || !profileId) return;
    setRefreshing(true);
    await fetchLinks(false);
    setRefreshing(false);
  }, [fetchLinks, user?.id, profileId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  useFocusEffect(
    useCallback(() => {
      fetchLinks(false);
    }, [fetchLinks])
  );

  const loadEmergencyCard = useCallback(async (targetProfileId: string) => {
    setIsEmergencyLoading(true);
    setEmergencyError(null);

    if (!targetProfileId) {
      setEmergencyCard(emptyEmergencyCard);
      setEmergencyError('No profile found for this member.');
      setIsEmergencyLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('care_emergency_cards')
      .select(
        [
          'name',
          'age',
          'date_of_birth',
          'photo_id_on_file',
          'photo_id_last4',
          'emergency_contact_name',
          'emergency_contact_phone',
          'preferred_hospital',
          'insurer_name',
          'plan_type',
          'tpa_helpline',
          'insurance_last4',
          'blood_group',
          'critical_allergies',
          'chronic_conditions',
          'current_meds',
          'emergency_instructions',
        ].join(',')
      )
      .eq('profile_id', targetProfileId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      setEmergencyError('Unable to load the emergency card details.');
      setIsEmergencyLoading(false);
      return;
    }

    if (!data) {
      setEmergencyCard(emptyEmergencyCard);
      setIsEmergencyLoading(false);
      return;
    }

    const card = data as Partial<EmergencyCardData> & { age?: number | null };

    setEmergencyCard({
      name: card.name ?? '',
      age: card.age ? String(card.age) : '',
      date_of_birth: card.date_of_birth ?? '',
      photo_id_on_file: card.photo_id_on_file ?? false,
      photo_id_last4: card.photo_id_last4 ?? '',
      emergency_contact_name: card.emergency_contact_name ?? '',
      emergency_contact_phone: card.emergency_contact_phone ?? '',
      preferred_hospital: card.preferred_hospital ?? '',
      insurer_name: card.insurer_name ?? '',
      plan_type: card.plan_type ?? '',
      tpa_helpline: card.tpa_helpline ?? '',
      insurance_last4: card.insurance_last4 ?? '',
      blood_group: card.blood_group ?? '',
      critical_allergies: card.critical_allergies ?? '',
      chronic_conditions: card.chronic_conditions ?? '',
      current_meds: card.current_meds ?? '',
      emergency_instructions: card.emergency_instructions ?? '',
    });

    setIsEmergencyLoading(false);
  }, []);

  const handleViewOwnEmergencyCard = useCallback(async () => {
    if (!user?.id || !profileId) return;
    setIsEmergencyOpen(true);
    setIsEmergencyEditing(false);
    const ownerName = displayName || user?.phone || 'Your';
    setEmergencyCardOwner({ userId: user.id, profileId, name: ownerName });
    await loadEmergencyCard(profileId);
  }, [displayName, loadEmergencyCard, profileId, user?.id, user?.phone]);

  const handleViewMemberEmergencyCard = useCallback(
    async (member: CareCircleLink) => {
      if (!member.memberId || !member.memberProfileId) {
        toast.info('Unavailable', 'Unable to open this emergency card right now.');
        return;
      }
      setIsEmergencyOpen(true);
      setIsEmergencyEditing(false);
      setEmergencyCardOwner({
        userId: member.memberId,
        profileId: member.memberProfileId,
        name: member.displayName,
      });
      await loadEmergencyCard(member.memberProfileId);
    },
    [loadEmergencyCard]
  );

  const handleInvite = async () => {
    if (!profileId) {
      toast.warning('Profile Required', 'Please select a profile before inviting members.');
      return;
    }
    if (!isSelectedProfilePrimary) {
      toast.warning('Primary Profile Required', 'Only the primary profile can send care circle invites.');
      return;
    }
    const digitsOnly = inviteContact.replace(/\D/g, '');
    if (!digitsOnly) {
      toast.warning('Invalid Input', 'Please enter a phone number.');
      return;
    }
    const isIndia = inviteCountry.code === 'IN';
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

    const fullContact = `${inviteCountry.dialCode}${digitsOnly}`;
    setInviting(true);
    try {
      await careCircleApi.inviteByContact(fullContact, profileId);
      toast.success('Success', 'Invitation sent successfully!');
      setInviteModalOpen(false);
      setInviteContact('');
      setInviteCountry(DEFAULT_COUNTRY);
      await fetchLinks();
    } catch (err: any) {
      console.error('Failed to send invitation:', err);
      const errorMessage = err?.message || 'Unable to send invitation. Please check your API configuration.';
      toast.error('Invite Failed', errorMessage);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (linkId: string, memberName: string) => {
    Alert.alert(
      'Remove Member?',
      `Remove "${memberName}" from your care circle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) {
              toast.error('Error', 'Please sign in again to remove members.');
              return;
            }
            try {
              const { error } = await supabase
                .from('care_circle_links')
                .delete()
                .eq('id', linkId)
                .eq('requester_id', user.id);
              if (error) {
                throw error;
              }
              await fetchLinks(false);
            } catch (err: any) {
              console.error('Failed to remove member:', err);
              const errorMessage = err?.message || 'Unable to remove this member right now.';
              toast.error('Remove Failed', errorMessage);
            }
          },
        },
      ]
    );
  };

  const handleAccept = async (linkId: string) => {
    if (!user?.id) {
      toast.error('Error', 'Please sign in again to accept requests.');
      return;
    }
    setPendingActionId(linkId);
    setPendingActionType('accept');
    try {
      await careCircleApi.respondToInvite(linkId, 'accepted');
      await fetchLinks(false);
    } catch (err: any) {
      console.error('Failed to accept request:', err);
      toast.error('Accept Failed', err?.message || 'Unable to accept this request right now.');
    } finally {
      setPendingActionId(null);
      setPendingActionType(null);
    }
  };

  const handleDecline = async (linkId: string) => {
    if (!user?.id) {
      toast.error('Error', 'Please sign in again to decline requests.');
      return;
    }
    setPendingActionId(linkId);
    setPendingActionType('decline');
    try {
      await careCircleApi.respondToInvite(linkId, 'declined');
      await fetchLinks(false);
    } catch (err: any) {
      console.error('Failed to decline request:', err);
      toast.error('Decline Failed', err?.message || 'Unable to decline this request right now.');
    } finally {
      setPendingActionId(null);
      setPendingActionType(null);
    }
  };

  const handleUpdateRole = useCallback(async (member: CareCircleLink, role: CareCircleRole) => {
    const currentRole = normalizeCareCircleRole(member.role);
    if (role === currentRole) return true;
    setRoleUpdatingLinkId(member.id);
    setRoleError(null);
    try {
      await careCircleApi.updateRole(member.id, role);
      await fetchLinks(false);
      return true;
    } catch (err: any) {
      console.error('Failed to update role:', err);
      setRoleError(err?.message || 'Unable to update role.');
      return false;
    } finally {
      setRoleUpdatingLinkId(null);
    }
  }, [fetchLinks]);

  const openRoleEditor = useCallback(
    (member: CareCircleLink) => {
      if (!isSelectedProfilePrimary || !(member.ownerProfileIsPrimary ?? false)) return;
      setRoleError(null);
      setRoleEditorMember(member);
      setRoleEditorValue(normalizeCareCircleRole(member.role));
    },
    [isSelectedProfilePrimary]
  );

  const closeRoleEditor = useCallback(() => {
    if (roleEditorMember && roleUpdatingLinkId === roleEditorMember.id) return;
    setRoleEditorMember(null);
    setRoleError(null);
  }, [roleEditorMember, roleUpdatingLinkId]);

  const submitRoleEditor = useCallback(() => {
    if (!roleEditorMember) return;
    const currentRole = normalizeCareCircleRole(roleEditorMember.role);
    const targetRole = roleEditorValue;
    if (targetRole === currentRole) {
      closeRoleEditor();
      return;
    }
    Alert.alert(
      'Change role?',
      `Change "${roleEditorMember.displayName}" from ${roleLabels[currentRole]} to ${roleLabels[targetRole]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            const updated = await handleUpdateRole(roleEditorMember, targetRole);
            if (updated) {
              setRoleEditorMember(null);
            }
          },
        },
      ]
    );
  }, [closeRoleEditor, handleUpdateRole, roleEditorMember, roleEditorValue]);

  const handleViewMemberDetails = useCallback(
    async (member: CareCircleLink) => {
      setSelectedMember(member);
      setMemberDetailsOpen(true);
      setMemberDetailsTab('personal');
      setMemberDetailsLoading(true);
      setMemberDetailsError(null);
      setMemberDetails(null);
      setVaultFiles([]);
      setVaultCategory('all');
      setVaultSearchQuery('');
      setVaultError(null);
      setVaultUploadModalOpen(false);
      setVaultUploadFile(null);
      setVaultUploadFolder('reports');
      setVaultUploadName('');
      setVaultUploadError(null);
      setVaultUploading(false);
      setVaultRenameFile(null);
      setVaultRenameValue('');
      setVaultRenamingKey(null);
      setVaultDeletingKey(null);
      setVaultOpeningKey(null);
      setVaultActionMenuFile(null);
      setVaultPreviewFile(null);
      setVaultPreviewUrl(null);
      setVaultPreviewLoading(false);
      setVaultPreviewError(null);
      try {
        const data = await careCircleApi.getMemberDetails(member.id);
        setMemberDetails(data);
      } catch (err: any) {
        setMemberDetailsError(err?.message || 'Failed to load member details.');
      } finally {
        setMemberDetailsLoading(false);
      }
    },
    []
  );

  const fetchVaultFiles = useCallback(async (linkId: string, category: VaultCategory) => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const data = await careCircleApi.getMemberVault(linkId, category);
      setVaultFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err: any) {
      setVaultFiles([]);
      setVaultError(err?.message || 'Failed to load vault files.');
    } finally {
      setVaultLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedMember || memberDetailsTab !== 'vault') return;
    fetchVaultFiles(selectedMember.id, vaultCategory);
  }, [fetchVaultFiles, memberDetailsTab, selectedMember, vaultCategory]);

  const canManageSelectedMemberMedicalData = useMemo(() => {
    if (!selectedMember) return false;
    return isElevatedCareCircleRole(normalizeCareCircleRole(selectedMember.role));
  }, [selectedMember]);
  const canManageSelectedMemberVault = canManageSelectedMemberMedicalData;
  const roleEditorSaving = roleEditorMember ? roleUpdatingLinkId === roleEditorMember.id : false;
  const roleEditorCurrentRole = roleEditorMember ? normalizeCareCircleRole(roleEditorMember.role) : null;
  const roleEditorHasChanges = roleEditorMember ? roleEditorCurrentRole !== roleEditorValue : false;

  const openVaultActionMenu = useCallback((file: MemberVaultFile) => {
    if (!canManageSelectedMemberVault) return;
    setVaultActionMenuFile(file);
  }, [canManageSelectedMemberVault]);

  const closeVaultActionMenu = useCallback(() => {
    setVaultActionMenuFile(null);
  }, []);

  const closeVaultPreview = useCallback(() => {
    setVaultPreviewFile(null);
    setVaultPreviewUrl(null);
    setVaultPreviewLoading(false);
    setVaultPreviewError(null);
  }, []);

  const closeVaultUploadModal = useCallback(() => {
    setVaultUploadModalOpen(false);
    setVaultUploadFile(null);
    setVaultUploadName('');
    setVaultUploadError(null);
    setVaultUploading(false);
  }, []);

  const openVaultUploadModal = useCallback(() => {
    if (!canManageSelectedMemberVault) return;
    setVaultActionMenuFile(null);
    setVaultUploadFolder(vaultCategory === 'all' ? 'reports' : vaultCategory);
    setVaultUploadFile(null);
    setVaultUploadName('');
    setVaultUploadError(null);
    setVaultUploading(false);
    setVaultUploadModalOpen(true);
  }, [canManageSelectedMemberVault, vaultCategory]);

  const handlePickVaultUploadFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    if (!isAllowedVaultUploadType(asset.name, asset.mimeType)) {
      toast.warning('Unsupported file', 'Please upload a PDF or image file.');
      return;
    }
    setVaultUploadFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
    });
    setVaultUploadName(stripVaultExtension(asset.name));
    setVaultUploadError(null);
  }, []);

  const submitVaultUpload = useCallback(async () => {
    if (!selectedMember || !vaultUploadFile) {
      setVaultUploadError('Please choose a file.');
      return;
    }
    const finalName = buildVaultUploadFileName(vaultUploadFile, vaultUploadName);
    if (!isValidVaultFileName(finalName)) {
      setVaultUploadError('Please enter a valid file name.');
      return;
    }

    setVaultUploading(true);
    setVaultUploadError(null);
    try {
      await careCircleApi.uploadMemberVaultFile(
        selectedMember.id,
        vaultUploadFolder,
        vaultUploadFile,
        finalName,
        profileId || undefined
      );
      closeVaultUploadModal();
      await fetchVaultFiles(selectedMember.id, vaultCategory);
    } catch (error: any) {
      setVaultUploadError(error?.message || 'Unable to upload file.');
    } finally {
      setVaultUploading(false);
    }
  }, [
    closeVaultUploadModal,
    fetchVaultFiles,
    profileId,
    selectedMember,
    vaultCategory,
    vaultUploadFile,
    vaultUploadFolder,
    vaultUploadName,
  ]);

  const handleOpenVaultFile = useCallback(
    async (file: MemberVaultFile) => {
      if (!selectedMember) return;
      setVaultActionMenuFile(null);
      const fileKey = vaultFileKey(file);
      setVaultOpeningKey(fileKey);
      setVaultPreviewFile(file);
      setVaultPreviewUrl(null);
      setVaultPreviewError(null);
      setVaultPreviewLoading(true);
      try {
        const data = await careCircleApi.getMemberVaultSignedUrl(selectedMember.id, file.folder, file.name);
        const fileUrl = (data.url || '').trim();
        if (!fileUrl) {
          throw new Error('Unable to open this file right now.');
        }
        setVaultPreviewUrl(fileUrl);
      } catch (error: any) {
        setVaultPreviewError(error?.message || 'Unable to load preview.');
      } finally {
        setVaultPreviewLoading(false);
        setVaultOpeningKey(null);
      }
    },
    [selectedMember]
  );

  const openVaultRenameModal = useCallback((file: MemberVaultFile) => {
    setVaultActionMenuFile(null);
    setVaultRenameFile(file);
    setVaultRenameValue(stripVaultExtension(file.name));
    setVaultUploadError(null);
  }, []);

  const closeVaultRenameModal = useCallback(() => {
    setVaultRenameFile(null);
    setVaultRenameValue('');
  }, []);

  const submitVaultRename = useCallback(async () => {
    if (!selectedMember || !vaultRenameFile) return;
    const sanitized = sanitizeVaultFileName(vaultRenameValue);
    if (!sanitized) {
      closeVaultRenameModal();
      return;
    }
    const currentExtension = vaultFileExtension(vaultRenameFile.name);
    const nextName =
      sanitized.includes('.') || !currentExtension ? sanitized : `${sanitized}.${currentExtension}`;

    if (!isValidVaultFileName(nextName)) {
      toast.warning('Invalid name', "File name can't include slashes.");
      return;
    }
    if (nextName === vaultRenameFile.name) {
      closeVaultRenameModal();
      return;
    }

    const fileKey = vaultFileKey(vaultRenameFile);
    setVaultRenamingKey(fileKey);
    try {
      await careCircleApi.renameMemberVaultFile(
        selectedMember.id,
        vaultRenameFile.folder,
        vaultRenameFile.name,
        nextName,
        profileId || undefined
      );
      closeVaultRenameModal();
      await fetchVaultFiles(selectedMember.id, vaultCategory);
    } catch (error: any) {
      toast.error('Rename failed', error?.message || 'Unable to rename file.');
    } finally {
      setVaultRenamingKey(null);
    }
  }, [
    closeVaultRenameModal,
    fetchVaultFiles,
    profileId,
    selectedMember,
    vaultCategory,
    vaultRenameFile,
    vaultRenameValue,
  ]);

  const confirmVaultDelete = useCallback(
    (file: MemberVaultFile) => {
      setVaultActionMenuFile(null);
      Alert.alert('Delete document?', `Delete "${file.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!selectedMember) return;
            const fileKey = vaultFileKey(file);
            setVaultDeletingKey(fileKey);
            try {
              await careCircleApi.deleteMemberVaultFile(
                selectedMember.id,
                file.folder,
                file.name,
                profileId || undefined
              );
              await fetchVaultFiles(selectedMember.id, vaultCategory);
            } catch (error: any) {
              toast.error('Delete failed', error?.message || 'Unable to delete file.');
            } finally {
              setVaultDeletingKey(null);
            }
          },
        },
      ]);
    },
    [fetchVaultFiles, profileId, selectedMember, vaultCategory]
  );

  const updateMemberAppointments = useCallback((appointments: MemberDetailsAppointment[]) => {
    setMemberDetails((prev) => (prev ? { ...prev, appointments } : prev));
  }, []);

  const updateMemberMedications = useCallback((medications: MemberDetailsMedication[]) => {
    setMemberDetails((prev) => (prev ? { ...prev, medications } : prev));
  }, []);

  const openAddAppointmentEditor = useCallback(() => {
    if (!canManageSelectedMemberMedicalData) return;
    setAppointmentEditorMode('add');
    setAppointmentEditorDraft({
      ...emptyAppointmentEditorDraft,
      date: todayIso,
      time: '',
    });
    setAppointmentTimeParts({ ...emptyAppointmentTimeParts });
    setAppointmentTypePickerOpen(false);
    setAppointmentEditorError(null);
    setAppointmentEditorOpen(true);
  }, [canManageSelectedMemberMedicalData, todayIso]);

  const openEditAppointmentEditor = useCallback(
    (appointment: MemberDetailsAppointment) => {
      if (!canManageSelectedMemberMedicalData) return;
      const normalizedTime = normalizeTime24h(appointment.time || '') || appointment.time || '';
      const typeFields = getAppointmentTypeFields(appointment.type || '');
      const extras = typeFields.reduce<Record<string, string>>((acc, field) => {
        const value = appointment[field.name];
        acc[field.name] = typeof value === 'string' ? value : '';
        return acc;
      }, {});
      setAppointmentEditorMode('edit');
      setAppointmentEditorDraft({
        id: appointment.id,
        title: appointment.title || '',
        date: normalizeAppointmentDate(appointment.date) || appointment.date || todayIso,
        time: normalizedTime,
        type: appointment.type || '',
        extras,
      });
      setAppointmentTimeParts(from24HourTime(normalizedTime));
      setAppointmentTypePickerOpen(false);
      setAppointmentEditorError(null);
      setAppointmentEditorOpen(true);
    },
    [canManageSelectedMemberMedicalData, todayIso]
  );

  const closeAppointmentEditor = useCallback(() => {
    setAppointmentEditorOpen(false);
    setAppointmentTypePickerOpen(false);
    setAppointmentTimeParts({ ...emptyAppointmentTimeParts });
    setAppointmentEditorSaving(false);
    setAppointmentEditorError(null);
    setAppointmentEditorDraft(emptyAppointmentEditorDraft);
  }, []);

  const updateAppointmentTime = useCallback((next: Partial<AppointmentTimeParts>) => {
    setAppointmentEditorError(null);
    setAppointmentTimeParts((prev) => {
      const updated = { ...prev, ...next };
      setAppointmentEditorDraft((draft) => ({
        ...draft,
        time: to24HourTime(updated.hour, updated.minute, updated.period),
      }));
      return updated;
    });
  }, []);

  const handleAppointmentTypeSelect = useCallback((value: string) => {
    const typeFields = getAppointmentTypeFields(value);
    setAppointmentEditorDraft((prev) => ({
      ...prev,
      type: value,
      extras: typeFields.reduce<Record<string, string>>((acc, field) => {
        acc[field.name] = prev.extras[field.name] || '';
        return acc;
      }, {}),
    }));
    setAppointmentTypePickerOpen(false);
    setAppointmentEditorError(null);
  }, []);

  const handleAppointmentExtraFieldChange = useCallback((key: string, value: string) => {
    setAppointmentEditorDraft((prev) => ({
      ...prev,
      extras: {
        ...prev.extras,
        [key]: value,
      },
    }));
  }, []);

  const handleSaveMemberAppointment = useCallback(
    async (appointment: MemberDetailsAppointment) => {
      if (!selectedMember || !canManageSelectedMemberMedicalData) {
        throw new Error('You are not allowed to edit this member.');
      }

      const hasExisting = (memberDetails?.appointments ?? []).some((item) => item.id === appointment.id);
      const payload = hasExisting
        ? await careCircleApi.updateMemberAppointment(
            selectedMember.id,
            appointment,
            profileId || undefined
          )
        : await careCircleApi.addMemberAppointment(
            selectedMember.id,
            appointment,
            profileId || undefined
          );

      if (Array.isArray(payload.appointments)) {
        updateMemberAppointments(payload.appointments);
        return;
      }

      const current = memberDetails?.appointments ?? [];
      if (hasExisting) {
        updateMemberAppointments(current.map((row) => (row.id === appointment.id ? appointment : row)));
      } else {
        updateMemberAppointments([...current, appointment]);
      }
    },
    [
      canManageSelectedMemberMedicalData,
      memberDetails?.appointments,
      profileId,
      selectedMember,
      updateMemberAppointments,
    ]
  );

  const handleDeleteMemberAppointment = useCallback(
    async (appointmentId: string) => {
      if (!selectedMember || !canManageSelectedMemberMedicalData) {
        throw new Error('You are not allowed to edit this member.');
      }

      const payload = await careCircleApi.deleteMemberAppointment(
        selectedMember.id,
        appointmentId,
        profileId || undefined
      );
      if (Array.isArray(payload.appointments)) {
        updateMemberAppointments(payload.appointments);
        return;
      }

      const current = memberDetails?.appointments ?? [];
      updateMemberAppointments(current.filter((row) => row.id !== appointmentId));
    },
    [
      canManageSelectedMemberMedicalData,
      memberDetails?.appointments,
      profileId,
      selectedMember,
      updateMemberAppointments,
    ]
  );

  const submitAppointmentEditor = useCallback(async () => {
    const title = appointmentEditorDraft.title.trim();
    const date = normalizeAppointmentDate(appointmentEditorDraft.date) || appointmentEditorDraft.date.trim();
    const type = appointmentEditorDraft.type.trim();
    const normalizedTime = normalizeTime24h(appointmentEditorDraft.time);

    if (!title || !date || !type || !normalizedTime) {
      setAppointmentEditorError('Title, date, time, and type are required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAppointmentEditorError('Use date format YYYY-MM-DD.');
      return;
    }
    const appointmentDateTime = new Date(`${date}T${normalizedTime}`);
    if (Number.isNaN(appointmentDateTime.getTime()) || appointmentDateTime.getTime() < Date.now()) {
      setAppointmentEditorError('Please select a future date and time for the appointment.');
      return;
    }

    setAppointmentEditorSaving(true);
    setAppointmentEditorError(null);
    try {
      const typeFields = getAppointmentTypeFields(type);
      const normalizedExtras = typeFields.reduce<Record<string, string>>((acc, field) => {
        acc[field.name] = (appointmentEditorDraft.extras[field.name] || '').trim();
        return acc;
      }, {});

      const payload: MemberDetailsAppointment = {
        id: appointmentEditorDraft.id || generateLocalId(),
        title,
        date,
        time: normalizedTime,
        type,
        ...normalizedExtras,
      };
      await handleSaveMemberAppointment(payload);
      closeAppointmentEditor();
    } catch (error: any) {
      setAppointmentEditorError(error?.message || 'Unable to save appointment.');
    } finally {
      setAppointmentEditorSaving(false);
    }
  }, [appointmentEditorDraft, closeAppointmentEditor, handleSaveMemberAppointment]);

  const confirmDeleteAppointment = useCallback(
    (appointment: MemberDetailsAppointment) => {
      Alert.alert('Delete appointment?', `Delete "${appointment.title || 'this appointment'}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await handleDeleteMemberAppointment(appointment.id);
            } catch (error: any) {
              toast.error('Delete failed', error?.message || 'Unable to delete appointment.');
            }
          },
        },
      ]);
    },
    [handleDeleteMemberAppointment]
  );

  const openAddMedicationEditor = useCallback(() => {
    if (!canManageSelectedMemberMedicalData) return;
    setMedicationEditorMode('add');
    setMedicationEditorDraft({
      ...emptyMedicationEditorDraft,
      startDate: todayIso,
    });
    setMedicationFrequencyPickerOpen(false);
    setMedicationEditorError(null);
    setMedicationEditorOpen(true);
  }, [canManageSelectedMemberMedicalData, todayIso]);

  const openEditMedicationEditor = useCallback(
    (medication: MemberDetailsMedication) => {
      if (!canManageSelectedMemberMedicalData) return;
      const matchingOption = medicationFrequencyOptions.find(
        (option) => option.value === (medication.frequency || '')
      );
      setMedicationEditorMode('edit');
      setMedicationEditorDraft({
        id: medication.id,
        name: medication.name || '',
        dosage: medication.dosage || '',
        frequency: medication.frequency || '',
        purpose: medication.purpose || '',
        timesPerDay: matchingOption
          ? String(matchingOption.times)
          : medication.timesPerDay === undefined || medication.timesPerDay === null
            ? ''
            : String(medication.timesPerDay),
        startDate: medication.startDate || '',
        endDate: medication.endDate || '',
        logs: medication.logs ?? [],
      });
      setMedicationFrequencyPickerOpen(false);
      setMedicationEditorError(null);
      setMedicationEditorOpen(true);
    },
    [canManageSelectedMemberMedicalData]
  );

  const closeMedicationEditor = useCallback(() => {
    setMedicationEditorOpen(false);
    setMedicationFrequencyPickerOpen(false);
    setMedicationEditorSaving(false);
    setMedicationEditorError(null);
    setMedicationEditorDraft(emptyMedicationEditorDraft);
  }, []);

  const handleMedicationFrequencySelect = useCallback((value: string) => {
    const selected = medicationFrequencyOptions.find((option) => option.value === value);
    setMedicationEditorDraft((prev) => ({
      ...prev,
      frequency: value,
      timesPerDay: selected ? String(selected.times) : prev.timesPerDay,
    }));
    setMedicationFrequencyPickerOpen(false);
  }, []);

  const handleAddMemberMedication = useCallback(
    async (medication: MemberDetailsMedication) => {
      if (!selectedMember || !canManageSelectedMemberMedicalData) {
        throw new Error('You are not allowed to edit this member.');
      }

      const payload = await careCircleApi.addMemberMedication(
        selectedMember.id,
        medication,
        profileId || undefined
      );

      if (Array.isArray(payload.medications)) {
        updateMemberMedications(payload.medications);
        return;
      }

      const current = memberDetails?.medications ?? [];
      updateMemberMedications([
        ...current,
        medication,
      ]);
    },
    [
      canManageSelectedMemberMedicalData,
      memberDetails?.medications,
      profileId,
      selectedMember,
      updateMemberMedications,
    ]
  );

  const handleUpdateMemberMedication = useCallback(
    async (medication: MemberDetailsMedication) => {
      if (!selectedMember || !canManageSelectedMemberMedicalData) {
        throw new Error('You are not allowed to edit this member.');
      }

      const payload = await careCircleApi.updateMemberMedication(
        selectedMember.id,
        medication,
        profileId || undefined
      );
      if (Array.isArray(payload.medications)) {
        updateMemberMedications(payload.medications);
        return;
      }

      const current = memberDetails?.medications ?? [];
      updateMemberMedications(
        current.map((row) => (row.id === medication.id ? medication : row))
      );
    },
    [
      canManageSelectedMemberMedicalData,
      memberDetails?.medications,
      profileId,
      selectedMember,
      updateMemberMedications,
    ]
  );

  const handleDeleteMemberMedication = useCallback(
    async (medicationId: string) => {
      if (!selectedMember || !canManageSelectedMemberMedicalData) {
        throw new Error('You are not allowed to edit this member.');
      }

      const payload = await careCircleApi.deleteMemberMedication(
        selectedMember.id,
        medicationId,
        profileId || undefined
      );
      if (Array.isArray(payload.medications)) {
        updateMemberMedications(payload.medications);
        return;
      }

      const current = memberDetails?.medications ?? [];
      updateMemberMedications(current.filter((row) => row.id !== medicationId));
    },
    [
      canManageSelectedMemberMedicalData,
      memberDetails?.medications,
      profileId,
      selectedMember,
      updateMemberMedications,
    ]
  );

  const submitMedicationEditor = useCallback(async () => {
    const name = medicationEditorDraft.name.trim();
    const dosage = medicationEditorDraft.dosage.trim();
    const frequency = medicationEditorDraft.frequency.trim();
    const purpose = medicationEditorDraft.purpose.trim();
    const startDate = medicationEditorDraft.startDate.trim();
    const endDate = medicationEditorDraft.endDate.trim();
    const timesRaw = medicationEditorDraft.timesPerDay.trim();

    if (!name || !dosage || !frequency) {
      setMedicationEditorError('Name, dosage, and frequency are required.');
      return;
    }
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setMedicationEditorError('Start date must be YYYY-MM-DD.');
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setMedicationEditorError('End date must be YYYY-MM-DD.');
      return;
    }

    const selectedFrequency = medicationFrequencyOptions.find((option) => option.value === frequency);
    const parsedTimes = Number.parseInt(timesRaw, 10);
    const resolvedTimesPerDay = selectedFrequency
      ? selectedFrequency.times
      : Number.isFinite(parsedTimes)
        ? parsedTimes
        : undefined;
    if (resolvedTimesPerDay === undefined || resolvedTimesPerDay < 0) {
      setMedicationEditorError('Times/day must be a non-negative number.');
      return;
    }

    setMedicationEditorSaving(true);
    setMedicationEditorError(null);
    try {
      const payload: MemberDetailsMedication = {
        id: medicationEditorDraft.id || generateLocalId(),
        name,
        dosage,
        frequency,
        purpose: purpose || undefined,
        timesPerDay: resolvedTimesPerDay,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        logs: medicationEditorDraft.logs ?? [],
      };

      if (medicationEditorMode === 'edit' && medicationEditorDraft.id) {
        await handleUpdateMemberMedication(payload);
      } else {
        await handleAddMemberMedication(payload);
      }
      closeMedicationEditor();
    } catch (error: any) {
      setMedicationEditorError(error?.message || 'Unable to save medication.');
    } finally {
      setMedicationEditorSaving(false);
    }
  }, [
    closeMedicationEditor,
    handleAddMemberMedication,
    handleUpdateMemberMedication,
    medicationEditorDraft,
    medicationEditorMode,
  ]);

  const confirmDeleteMedication = useCallback(
    (medication: MemberDetailsMedication) => {
      Alert.alert('Delete medication?', `Delete "${medication.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await handleDeleteMemberMedication(medication.id);
            } catch (error: any) {
              toast.error('Delete failed', error?.message || 'Unable to delete medication.');
            }
          },
        },
      ]);
    },
    [handleDeleteMemberMedication]
  );

  const closeMemberDetailsModal = () => {
    setMemberDetailsOpen(false);
    setSelectedMember(null);
    setMemberDetails(null);
    setMemberDetailsError(null);
    setMemberDetailsTab('personal');
    setAppointmentEditorOpen(false);
    setAppointmentTypePickerOpen(false);
    setAppointmentTimeParts({ ...emptyAppointmentTimeParts });
    setMedicationEditorOpen(false);
    setMedicationFrequencyPickerOpen(false);
    setAppointmentEditorError(null);
    setMedicationEditorError(null);
    setAppointmentEditorDraft(emptyAppointmentEditorDraft);
    setMedicationEditorDraft(emptyMedicationEditorDraft);
    setVaultFiles([]);
    setVaultCategory('all');
    setVaultSearchQuery('');
    setVaultError(null);
    setVaultUploadModalOpen(false);
    setVaultUploadFile(null);
    setVaultUploadFolder('reports');
    setVaultUploadName('');
    setVaultUploadError(null);
    setVaultUploading(false);
    setVaultRenameFile(null);
    setVaultRenameValue('');
    setVaultRenamingKey(null);
    setVaultDeletingKey(null);
    setVaultOpeningKey(null);
    setVaultActionMenuFile(null);
    setVaultPreviewFile(null);
    setVaultPreviewUrl(null);
    setVaultPreviewLoading(false);
    setVaultPreviewError(null);
  };

  const handleEmergencyChange = <Key extends keyof EmergencyCardData>(
    key: Key,
    value: EmergencyCardData[Key]
  ) => {
    setEmergencyCard((prev) => ({ ...prev, [key]: value }));
  };

  const handleEmergencySave = async () => {
    if (!user?.id || !profileId) {
      setEmergencyError('Please sign in again to save this card.');
      return;
    }

    setIsSavingEmergency(true);
    setEmergencyError(null);

    const ageValue = emergencyCard.age ? Number(emergencyCard.age) : null;

    const payload = {
      profile_id: profileId,
      user_id: user.id,
      name: emergencyCard.name || null,
      age: Number.isFinite(ageValue) ? ageValue : null,
      date_of_birth: emergencyCard.date_of_birth || null,
      photo_id_on_file: emergencyCard.photo_id_on_file,
      photo_id_last4: emergencyCard.photo_id_last4 || null,
      emergency_contact_name: emergencyCard.emergency_contact_name || null,
      emergency_contact_phone: emergencyCard.emergency_contact_phone || null,
      preferred_hospital: emergencyCard.preferred_hospital || null,
      insurer_name: emergencyCard.insurer_name || null,
      plan_type: emergencyCard.plan_type || null,
      tpa_helpline: emergencyCard.tpa_helpline || null,
      insurance_last4: emergencyCard.insurance_last4 || null,
      blood_group: emergencyCard.blood_group || null,
      critical_allergies: emergencyCard.critical_allergies || null,
      chronic_conditions: emergencyCard.chronic_conditions || null,
      current_meds: emergencyCard.current_meds || null,
      emergency_instructions: emergencyCard.emergency_instructions || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('care_emergency_cards')
      .upsert(payload, { onConflict: 'profile_id' });

    if (error) {
      setEmergencyError('Unable to save the emergency card details.');
      setIsSavingEmergency(false);
      return;
    }

    setIsSavingEmergency(false);
    setIsEmergencyEditing(false);
    await loadEmergencyCard(profileId);
  };

  const myCircleMembers = useMemo(() => {
    return outgoingLinks.filter((link) => link.status === 'accepted');
  }, [outgoingLinks]);

  const pendingInvites = useMemo(() => {
    return outgoingLinks.filter((link) => link.status === 'pending');
  }, [outgoingLinks]);

  const circlesIn = useMemo(() => {
    return incomingLinks.filter((link) => link.status === 'accepted');
  }, [incomingLinks]);

  const primaryProfileNameByMemberId = useMemo(() => {
    const map = new Map<string, string>();
    circlesIn.forEach((member) => {
      if (member.ownerProfileIsPrimary && !map.has(member.memberId)) {
        map.set(member.memberId, member.displayName);
      }
    });
    return map;
  }, [circlesIn]);

  const pendingRequests = useMemo(() => {
    return incomingLinks.filter((link) => link.status === 'pending');
  }, [incomingLinks]);
  const hasPendingRequests = pendingRequests.length > 0;

  const emergencyOwnerLabel = useMemo(() => {
    if (!emergencyCardOwner?.name) return 'Emergency Card';
    if (emergencyCardOwner.name === 'Your') return 'Your Emergency Card';
    return `${emergencyCardOwner.name}'s Emergency Card`;
  }, [emergencyCardOwner]);

  const photoIdLabel = useMemo(() => {
    if (emergencyCard.photo_id_on_file && emergencyCard.photo_id_last4) {
      return `On file •••• ${emergencyCard.photo_id_last4}`;
    }
    if (emergencyCard.photo_id_on_file) {
      return 'On file';
    }
    if (emergencyCard.photo_id_last4) {
      return `•••• ${emergencyCard.photo_id_last4}`;
    }
    return 'Not provided';
  }, [emergencyCard.photo_id_last4, emergencyCard.photo_id_on_file]);

  const insuranceLast4Label = useMemo(() => {
    if (!emergencyCard.insurance_last4) {
      return 'Not provided';
    }
    return `•••• ${emergencyCard.insurance_last4}`;
  }, [emergencyCard.insurance_last4]);

  const isViewingExternalCard = Boolean(
    emergencyCardOwner?.userId && user?.id && emergencyCardOwner.userId !== user.id
  );

  const currentMembers = circleView === 'my-circle' ? myCircleMembers : circlesIn;
  const currentPending = circleView === 'my-circle' ? pendingInvites : pendingRequests;

  // Animated value for segment indicator
  const segmentTranslateX = useSharedValue(circleView === 'my-circle' ? 0 : 1);

  useEffect(() => {
    // Animate to 0 for "My Circle", 1 for "Circles I'm In"
    segmentTranslateX.value = withSpring(circleView === 'my-circle' ? 0 : 1, {
      damping: 25,
      stiffness: 300,
      mass: 0.8,
    });
  }, [circleView]);

  const segmentIndicatorStyle = useAnimatedStyle(() => {
    // Calculate the actual pixel translation
    // Segmented control: padding 24*2 = 48px, inner padding 5*2 = 10px, gap 5px
    // Available width = width - 48
    // Each segment width = (available width - 10 - 5) / 2
    const availableWidth = width - 48;
    const segmentWidth = (availableWidth - 10 - 5) / 2;
    const translateX = interpolate(
      segmentTranslateX.value,
      [0, 1],
      [0, segmentWidth + 5] // Move by one segment width + gap
    );
    return {
      transform: [{ translateX }],
    };
  }, [width]);

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      innerStyle={styles.innerContent}
      padded={false}
      scrollable={false}
      safeAreaStyle={styles.safeArea}
      safeAreaEdges={['left', 'right', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <Animated.View entering={FadeInDown.springify()} style={styles.headerRow}>
          <Text style={styles.title}>Care Circle</Text>
          <AnimatedButton onPress={() => setInviteModalOpen(true)} style={styles.inviteButton}>
            <View style={styles.inviteButtonIcon}>
              <MaterialCommunityIcons name="account-plus" size={16} color="#2f565f" />
            </View>
            <Text style={styles.inviteText}>Invite member</Text>
          </AnimatedButton>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.segmentedControl}>
          <Animated.View style={[styles.segmentIndicator, segmentIndicatorStyle]} />
          <Pressable
            style={[styles.segment, { zIndex: 1 }]}
            onPress={() => setCircleView('my-circle')}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                circleView === 'my-circle' && styles.segmentTextActive,
              ]}
            >
              My Circle
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, { zIndex: 1 }]}
            onPress={() => setCircleView('circles-in')}
          >
            <View style={styles.segmentLabel}>
              <Text
                numberOfLines={1}
                style={[
                  styles.segmentText,
                  circleView === 'circles-in' && styles.segmentTextActive,
                ]}
              >
                Circles I'm In
              </Text>
              {hasPendingRequests ? (
                <View style={styles.segmentBadge}>
                  <Text style={styles.segmentBadgeText}>{pendingRequests.length}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.emergencyCardWrapper}>
          <AnimatedButton onPress={handleViewOwnEmergencyCard}>
            <LinearGradient
              colors={['#2f565f', '#4a7a7d', '#6aa6a8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emergencyCard}
            >
              <View style={styles.emergencyCardIcon}>
                <MaterialCommunityIcons name="card-account-details-outline" size={24} color="#ffffff" />
              </View>
              <Text style={styles.emergencyCardText}>Emergency card</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" style={{ opacity: 0.8 }} />
            </LinearGradient>
          </AnimatedButton>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Members</Text>
            <AnimatedButton
              onPress={() => setPendingModalOpen(true)}
              style={[
                styles.pendingButton,
                currentPending.length > 0 && styles.pendingButtonWithBadge,
              ]}
            >
              <MaterialCommunityIcons
                name={circleView === 'my-circle' ? 'send-clock-outline' : 'inbox-arrow-down-outline'}
                size={16}
                color="#2f565f"
              />
              <Text style={styles.pendingButtonText}>
                {circleView === 'my-circle' ? 'Pending invites' : 'Pending requests'}
              </Text>
              {currentPending.length > 0 ? (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{currentPending.length}</Text>
                </View>
              ) : null}
            </AnimatedButton>
          </View>
          {loading && currentMembers.length === 0 ? (
            <Animated.View entering={FadeIn} style={styles.memberList}>
              {[...Array(2)].map((_, i) => (
                <SkeletonMemberCard key={i} index={i} />
              ))}
            </Animated.View>
          ) : currentMembers.length === 0 ? (
            <EmptyStatePreset preset="members" />
          ) : (
            <View style={styles.memberList}>
              {currentMembers.map((member) => {
                const memberRole = normalizeCareCircleRole(member.role);
                const isFamily = isElevatedCareCircleRole(memberRole);
                const canView = isFamily || (member.ownerProfileIsPrimary ?? false);
                const primaryName = primaryProfileNameByMemberId.get(member.memberId);

                return (
                  <View key={member.id} style={styles.memberCard}>
                    <LinearGradient
                      colors={['#e4eef0', '#d6e6e6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.memberAvatar}
                    >
                      <Text style={styles.memberAvatarText}>{getInitials(member.displayName)}</Text>
                    </LinearGradient>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                        {member.displayName}
                      </Text>
                      {circleView === 'my-circle' ? (
                        <View style={styles.roleRow}>
                          <Text style={styles.roleLabel}>Role: {roleLabels[memberRole]}</Text>
                          {(member.ownerProfileIsPrimary ?? false) && isSelectedProfilePrimary ? (
                            <Pressable
                              onPress={() => openRoleEditor(member)}
                              disabled={roleUpdatingLinkId === member.id}
                              style={[
                                styles.roleEditButton,
                                roleUpdatingLinkId === member.id && styles.buttonDisabled,
                              ]}
                            >
                              <Text style={styles.roleEditButtonText}>
                                {roleUpdatingLinkId === member.id ? 'Updating...' : 'Edit role'}
                              </Text>
                            </Pressable>
                          ) : !isSelectedProfilePrimary ? (
                            <Text style={styles.rolePrimaryHint}>Switch to primary profile to change role</Text>
                          ) : (
                            <Text style={styles.roleSublabel}>Role can only be changed by the owner primary profile</Text>
                          )}
                        </View>
                      ) : (
                        <View style={styles.roleRow}>
                          <Text style={styles.roleLabel}>Role: {roleLabels[memberRole]}</Text>
                          <Text style={styles.roleSublabel}>
                            {member.ownerProfileIsPrimary
                              ? 'Primary profile'
                              : primaryName
                                ? `Dependent of ${primaryName}`
                                : 'Dependent profile'}
                          </Text>
                        </View>
                      )}
                    </View>
                    {circleView === 'my-circle' && (
                      <AnimatedButton
                        onPress={() => handleRemove(member.id, member.displayName)}
                        style={styles.removeButton}
                      >
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </AnimatedButton>
                    )}
                    {circleView === 'circles-in' && (
                      <AnimatedButton
                        onPress={() =>
                          isFamily
                            ? handleViewMemberDetails(member)
                            : handleViewMemberEmergencyCard(member)
                        }
                        disabled={!canView}
                        style={[styles.viewButton, !canView && styles.buttonDisabled]}
                      >
                        <Text style={styles.viewButtonText}>
                          {isFamily ? 'View details' : 'View card'}
                        </Text>
                      </AnimatedButton>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Animated.View>

      </ScrollView>

      <Modal transparent visible={pendingModalOpen} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.modalOverlayCentered}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingModalOpen(false)} />
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[
              styles.pendingSheet,
              styles.modalCardCentered,
              { maxHeight: height * 0.7 },
            ]}
          >
            <View style={styles.pendingSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>
                  {circleView === 'my-circle' ? 'Pending invites' : 'Pending requests'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  {circleView === 'my-circle'
                    ? "Invites you've sent waiting for a response."
                    : 'Care circle requests you can accept or decline.'}
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setPendingModalOpen(false)}
              >
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            </View>
            {currentPending.length === 0 ? (
              circleView === 'my-circle' ? (
                <EmptyState icon="email-outline" title="No pending invites" subtitle="Invitations you send will appear here" />
              ) : (
                <EmptyState icon="email-check-outline" title="No pending requests" subtitle="Requests to join your circle will appear here" />
              )
            ) : (
              <ScrollView
                style={[
                  styles.pendingSheetScroll,
                  { maxHeight: Math.min(height * 0.55, 360) },
                ]}
                contentContainerStyle={styles.pendingSheetContent}
                showsVerticalScrollIndicator={true}
              >
                {currentPending.map((pending) => (
                  <View key={pending.id} style={styles.pendingCard}>
                    <View style={styles.pendingHeaderRow}>
                      <LinearGradient
                        colors={['#f5e6d3', '#e8d4b8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.pendingAvatar}
                      >
                        <Text style={[styles.memberAvatarText, { color: '#8b6f47' }]}>
                          {getInitials(pending.displayName)}
                        </Text>
                      </LinearGradient>
                      <View style={styles.pendingInfo}>
                        <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                          {pending.displayName || 'Unknown member'}
                        </Text>
                        <Text style={styles.pendingStatus}>
                          {circleView === 'my-circle' ? 'Pending invite' : 'Pending request'}
                        </Text>
                      </View>
                    </View>
                    {circleView === 'my-circle' ? (
                      <AnimatedButton
                        onPress={() => handleRemove(pending.id, pending.displayName)}
                        style={[styles.removeButton, styles.pendingActionSingle]}
                      >
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </AnimatedButton>
                    ) : (
                      <View style={styles.pendingActionsRow}>
                        <AnimatedButton
                          onPress={() => handleAccept(pending.id)}
                          style={[
                            styles.acceptButton,
                            pendingActionId === pending.id && pendingActionType === 'accept'
                              ? styles.buttonDisabled
                              : null,
                          ]}
                          disabled={
                            pendingActionId === pending.id &&
                            pendingActionType === 'accept'
                          }
                        >
                          <Text style={styles.acceptButtonText}>
                            {pendingActionId === pending.id && pendingActionType === 'accept'
                              ? 'Accepting...'
                              : 'Accept'}
                          </Text>
                        </AnimatedButton>
                        <AnimatedButton
                          onPress={() => handleDecline(pending.id)}
                          style={[
                            styles.declineButton,
                            pendingActionId === pending.id && pendingActionType === 'decline'
                              ? styles.buttonDisabled
                              : null,
                          ]}
                          disabled={
                            pendingActionId === pending.id &&
                            pendingActionType === 'decline'
                          }
                        >
                          <Text style={styles.declineButtonText}>
                            {pendingActionId === pending.id && pendingActionType === 'decline'
                              ? 'Declining...'
                              : 'Decline'}
                          </Text>
                        </AnimatedButton>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={inviteModalOpen} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.modalOverlayCentered}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteModalOpen(false)} />
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.inviteSheet, styles.modalCardCentered, { maxHeight: modalMaxHeight }]}
            >
              <View>
              <View style={styles.inviteHeader}>
                <Text style={styles.sheetTitle}>Invite Member</Text>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => {
                    setInviteModalOpen(false);
                    setInviteContact('');
                    setInviteCountry(DEFAULT_COUNTRY);
                  }}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#475569" />
                </Pressable>
              </View>
              <Text style={styles.sheetSubtitle}>
                Enter a phone number to send an invitation
              </Text>
              <View style={styles.invitePhoneRow}>
                <Pressable
                  style={styles.inviteCountryCode}
                  onPress={() => setInviteCountryPickerVisible(true)}
                >
                  <Text style={styles.inviteCountryCodeText}>{inviteCountry.dialCode}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#39484c" />
                </Pressable>
                <TextInput
                  value={inviteContact}
                  onChangeText={(value) => setInviteContact(value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS))}
                  placeholder="Phone number"
                  placeholderTextColor="#94a3b8"
                  style={[styles.sheetInput, styles.invitePhoneInput]}
                  keyboardType="phone-pad"
                />
              </View>
              <Modal
                visible={inviteCountryPickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setInviteCountryPickerVisible(false)}
              >
                <View style={styles.countryModalOverlay}>
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setInviteCountryPickerVisible(false)}
                  />
                  <View
                    style={[
                      styles.countryModalContent,
                      { height: countryPickerHeight, maxHeight: countryPickerHeight },
                    ]}
                    pointerEvents="box-none"
                  >
                    <View style={styles.countryModalHeader}>
                      <Text style={styles.countryModalTitle}>Select country</Text>
                      <Pressable onPress={() => setInviteCountryPickerVisible(false)} hitSlop={12}>
                        <Text style={styles.countryModalDone}>Done</Text>
                      </Pressable>
                    </View>
                    <View style={[styles.countryListContainer, { maxHeight: countryPickerListMaxHeight }]}>
                      <FlatList
                        data={COUNTRIES}
                        keyExtractor={(item) => item.code}
                        style={styles.countryList}
                        contentContainerStyle={styles.countryListContent}
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <Pressable
                            style={({ pressed }) => [
                              styles.countryItem,
                              pressed && styles.countryItemPressed,
                            ]}
                            onPress={() => {
                              setInviteCountry(item);
                              setInviteCountryPickerVisible(false);
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
              <View style={styles.sheetActions}>
                <AnimatedButton
                  style={styles.secondaryButton}
                  onPress={() => {
                    setInviteModalOpen(false);
                    setInviteContact('');
                    setInviteCountry(DEFAULT_COUNTRY);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </AnimatedButton>
                <AnimatedButton
                  style={[styles.primaryButton, inviting && styles.buttonDisabled]}
                  onPress={handleInvite}
                  disabled={inviting || !inviteContact.trim()}
                >
                  <Text style={styles.primaryButtonText}>{inviting ? 'Sending...' : 'Send Invite'}</Text>
                </AnimatedButton>
              </View>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(roleEditorMember)}
        animationType="fade"
        onRequestClose={closeRoleEditor}
      >
        <Animated.View entering={FadeIn} style={styles.modalOverlayCentered}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!roleEditorSaving) closeRoleEditor();
            }}
          />
          <Animated.View entering={FadeIn.duration(200)} style={[styles.roleEditorSheet, styles.modalCardCentered]}>
            <View style={styles.inviteHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Edit Role</Text>
                <Text style={styles.sheetSubtitle} numberOfLines={2}>
                  {roleEditorMember ? roleEditorMember.displayName : ''}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeRoleEditor} disabled={roleEditorSaving}>
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            </View>

            <View style={styles.roleEditorOptions}>
              {(['family', 'friend'] as const).map((role) => {
                const selected = roleEditorValue === role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => setRoleEditorValue(role)}
                    disabled={roleEditorSaving}
                    style={[styles.roleEditorOption, selected && styles.roleEditorOptionActive]}
                  >
                    <View style={styles.roleEditorOptionCopy}>
                      <Text style={styles.roleEditorOptionTitle}>{roleLabels[role]}</Text>
                      <Text style={styles.roleEditorOptionDescription}>
                        {role === 'family'
                          ? 'Can view full details and manage shared medical items.'
                          : 'Limited to emergency card visibility.'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      color={selected ? '#2f565f' : '#94a3b8'}
                    />
                  </Pressable>
                );
              })}
            </View>

            {roleError ? <Text style={styles.formError}>{roleError}</Text> : null}

            <View style={styles.sheetActions}>
              <AnimatedButton
                style={styles.secondaryButton}
                onPress={closeRoleEditor}
                disabled={roleEditorSaving}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </AnimatedButton>
              <AnimatedButton
                style={[styles.primaryButton, (!roleEditorHasChanges || roleEditorSaving) && styles.buttonDisabled]}
                onPress={submitRoleEditor}
                disabled={!roleEditorHasChanges || roleEditorSaving}
              >
                <Text style={styles.primaryButtonText}>{roleEditorSaving ? 'Saving...' : 'Save'}</Text>
              </AnimatedButton>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={isEmergencyOpen} animationType="fade">
        <Animated.View
          entering={FadeIn}
          style={[
            styles.modalOverlay,
            styles.emergencyOverlay,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 0),
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setIsEmergencyOpen(false);
              setEmergencyError(null);
              setIsEmergencyEditing(false);
            }}
          />
          <Animated.View
            entering={SlideInDown.springify()}
            style={[
              styles.emergencySheet,
              {
                height: height - insets.top - insets.bottom - 24,
                maxHeight: height - insets.top - insets.bottom - 24,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.emergencyHeader}>
              <View style={styles.emergencyTitleWrap}>
                <Text style={styles.sheetTitle}>{emergencyOwnerLabel}</Text>
                {isViewingExternalCard && (
                  <Text style={styles.sheetSubtitle}>Viewing a shared emergency card.</Text>
                )}
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => {
                  setIsEmergencyOpen(false);
                  setEmergencyError(null);
                  setIsEmergencyEditing(false);
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            </View>

            <View style={styles.emergencyToggleRow}>
              <AnimatedButton
                onPress={() => {
                  setIsEmergencyEditing(false);
                  if (isEmergencyEditing) {
                    setEmergencyError(null);
                  }
                }}
                style={[
                  styles.emergencyToggleButton,
                  !isEmergencyEditing && styles.emergencyToggleButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.emergencyToggleText,
                    !isEmergencyEditing && styles.emergencyToggleTextActive,
                  ]}
                >
                  Card preview
                </Text>
              </AnimatedButton>
              {!isViewingExternalCard && (
                <AnimatedButton
                  onPress={() => setIsEmergencyEditing(true)}
                  style={[
                    styles.emergencyToggleButton,
                    isEmergencyEditing && styles.emergencyToggleButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.emergencyToggleText,
                      isEmergencyEditing && styles.emergencyToggleTextActive,
                    ]}
                  >
                    Edit card
                  </Text>
                </AnimatedButton>
              )}
            </View>

            {isViewingExternalCard && (
              <Text style={styles.emergencyHint}>Editing is disabled for shared cards.</Text>
            )}

            {isEmergencyLoading ? (
              <View style={styles.emergencyLoading}>
                <Text style={styles.emergencyLoadingText}>Loading emergency card...</Text>
              </View>
            ) : emergencyError && !isEmergencyEditing ? (
              <View style={styles.emergencyError}>
                <Text style={styles.emergencyErrorText}>{emergencyError}</Text>
              </View>
            ) : isEmergencyEditing && !isViewingExternalCard ? (
              <Animated.View
                key="edit"
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.emergencyBody}
              >
                <ScrollView
                  style={styles.emergencyScrollView}
                  contentContainerStyle={styles.emergencyContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                >
                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Personal</Text>
                    <Text style={styles.formLabel}>Full legal name</Text>
                    <TextInput
                      value={emergencyCard.name}
                      onChangeText={(value) => handleEmergencyChange('name', value)}
                      placeholder="Full legal name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <View style={styles.formRow}>
                      <View style={styles.formColumn}>
                        <Text style={styles.formLabel}>Age</Text>
                        <TextInput
                          value={emergencyCard.age}
                          onChangeText={(value) => handleEmergencyChange('age', value)}
                          keyboardType="number-pad"
                          placeholder="Age"
                          placeholderTextColor="#94a3b8"
                          style={styles.sheetInput}
                        />
                      </View>
                      <View style={styles.formColumn}>
                        <Text style={styles.formLabel}>Date of birth</Text>
                        <TextInput
                          value={emergencyCard.date_of_birth}
                          onChangeText={(value) =>
                            handleEmergencyChange('date_of_birth', value)
                          }
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#94a3b8"
                          style={styles.sheetInput}
                        />
                      </View>
                    </View>
                    <Text style={styles.formLabel}>Blood group</Text>
                    <TextInput
                      value={emergencyCard.blood_group}
                      onChangeText={(value) => handleEmergencyChange('blood_group', value)}
                      placeholder="Blood group"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <View style={styles.switchRow}>
                      <Text style={styles.formLabel}>Photo ID on file</Text>
                      <Switch
                        value={emergencyCard.photo_id_on_file}
                        onValueChange={(value) =>
                          handleEmergencyChange('photo_id_on_file', value)
                        }
                        trackColor={{ false: '#e2e8f0', true: '#2f565f' }}
                        thumbColor={emergencyCard.photo_id_on_file ? '#ffffff' : '#f8fafc'}
                      />
                    </View>
                    <Text style={styles.formLabel}>Photo ID last 4 digits</Text>
                    <TextInput
                      value={emergencyCard.photo_id_last4}
                      onChangeText={(value) => handleEmergencyChange('photo_id_last4', value)}
                      placeholder="1234"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Emergency contact</Text>
                    <Text style={styles.formLabel}>Contact name</Text>
                    <TextInput
                      value={emergencyCard.emergency_contact_name}
                      onChangeText={(value) =>
                        handleEmergencyChange('emergency_contact_name', value)
                      }
                      placeholder="Contact name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Contact phone</Text>
                    <TextInput
                      value={emergencyCard.emergency_contact_phone}
                      onChangeText={(value) =>
                        handleEmergencyChange('emergency_contact_phone', value)
                      }
                      placeholder="+1 555 000 0000"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      style={styles.sheetInput}
                    />
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Insurance</Text>
                    <Text style={styles.formLabel}>Insurer name</Text>
                    <TextInput
                      value={emergencyCard.insurer_name}
                      onChangeText={(value) => handleEmergencyChange('insurer_name', value)}
                      placeholder="Insurer name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Plan type</Text>
                    <TextInput
                      value={emergencyCard.plan_type}
                      onChangeText={(value) => handleEmergencyChange('plan_type', value)}
                      placeholder="Plan type"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>TPA/Helpline</Text>
                    <TextInput
                      value={emergencyCard.tpa_helpline}
                      onChangeText={(value) => handleEmergencyChange('tpa_helpline', value)}
                      placeholder="TPA/Helpline"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Insurance last 4 digits</Text>
                    <TextInput
                      value={emergencyCard.insurance_last4}
                      onChangeText={(value) => handleEmergencyChange('insurance_last4', value)}
                      placeholder="1234"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Medical details</Text>
                    <Text style={styles.formLabel}>Preferred hospital</Text>
                    <TextInput
                      value={emergencyCard.preferred_hospital}
                      onChangeText={(value) =>
                        handleEmergencyChange('preferred_hospital', value)
                      }
                      placeholder="Preferred hospital"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Critical allergies</Text>
                    <TextInput
                      value={emergencyCard.critical_allergies}
                      onChangeText={(value) =>
                        handleEmergencyChange('critical_allergies', value)
                      }
                      placeholder="Allergies"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Chronic conditions</Text>
                    <TextInput
                      value={emergencyCard.chronic_conditions}
                      onChangeText={(value) =>
                        handleEmergencyChange('chronic_conditions', value)
                      }
                      placeholder="Chronic conditions"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Current meds</Text>
                    <TextInput
                      value={emergencyCard.current_meds}
                      onChangeText={(value) => handleEmergencyChange('current_meds', value)}
                      placeholder="Current meds"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Emergency instructions</Text>
                    <TextInput
                      value={emergencyCard.emergency_instructions}
                      onChangeText={(value) =>
                        handleEmergencyChange('emergency_instructions', value)
                      }
                      placeholder="Instructions"
                      placeholderTextColor="#94a3b8"
                      style={[styles.sheetInput, styles.textArea]}
                      multiline
                    />
                  </View>

                  {emergencyError && (
                    <Text style={styles.formError}>{emergencyError}</Text>
                  )}

                  <View style={styles.formActions}>
                    <AnimatedButton
                      style={styles.secondaryButton}
                      onPress={async () => {
                        setIsEmergencyEditing(false);
                        const ownerProfileId = emergencyCardOwner?.profileId;
                        if (ownerProfileId) {
                          await loadEmergencyCard(ownerProfileId);
                        }
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton
                      style={[styles.primaryButton, isSavingEmergency && styles.buttonDisabled]}
                      onPress={handleEmergencySave}
                      disabled={isSavingEmergency}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isSavingEmergency ? 'Saving...' : 'Save card'}
                      </Text>
                    </AnimatedButton>
                  </View>
                </ScrollView>
              </Animated.View>
            ) : (
              <Animated.View
                key="preview"
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.emergencyBody}
              >
                <ScrollView
                  style={styles.emergencyScrollView}
                  contentContainerStyle={styles.emergencyContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                >
                  <View style={styles.previewCard}>
                    <Text style={styles.previewEyebrow}>Emergency ID</Text>
                    <Text style={styles.previewName}>
                      {emergencyCard.name || 'Full legal name'}
                    </Text>
                    <View style={styles.previewMetaRow}>
                      <Text style={styles.previewMetaText}>
                        Age: {emergencyCard.age || '—'}
                      </Text>
                      <Text style={styles.previewMetaText}>
                        DOB: {emergencyCard.date_of_birth || '—'}
                      </Text>
                      <Text style={styles.previewMetaText}>
                        Blood: {emergencyCard.blood_group || '—'}
                      </Text>
                    </View>
                    <Text style={styles.previewMetaText}>Photo ID: {photoIdLabel}</Text>
                  </View>

                  <View style={styles.previewContactCard}>
                    <Text style={styles.previewSectionTitle}>Emergency contact</Text>
                    <Text style={styles.previewContactName}>
                      {emergencyCard.emergency_contact_name || 'Not provided'}
                    </Text>
                    <Text style={styles.previewContactValue}>
                      {emergencyCard.emergency_contact_phone || '—'}
                    </Text>
                    {emergencyCard.emergency_contact_phone ? (
                      <AnimatedButton
                        onPress={() =>
                          Linking.openURL(`tel:${emergencyCard.emergency_contact_phone}`)
                        }
                        style={styles.callNowButton}
                      >
                        <Text style={styles.callNowButtonText}>Call now</Text>
                      </AnimatedButton>
                    ) : null}
                  </View>

                  <View style={styles.previewGrid}>
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>Preferred hospital</Text>
                      <Text style={styles.previewSectionValue}>
                        {emergencyCard.preferred_hospital || 'Not provided'}
                      </Text>
                    </View>
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>Insurance</Text>
                      <Text style={styles.previewSectionValue}>
                        {emergencyCard.insurer_name || 'Not provided'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        {emergencyCard.plan_type || 'Plan type'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        TPA/Helpline: {emergencyCard.tpa_helpline || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Last 4: {insuranceLast4Label}
                      </Text>
                    </View>
                    <View style={[styles.previewSection, styles.previewSectionWide]}>
                      <Text style={styles.previewSectionTitle}>Medical notes</Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Allergies: {emergencyCard.critical_allergies || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Chronic: {emergencyCard.chronic_conditions || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Meds: {emergencyCard.current_meds || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Instructions: {emergencyCard.emergency_instructions || '—'}
                      </Text>
                    </View>
                  </View>
                </ScrollView>
              </Animated.View>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(selectedMember) && memberDetailsOpen}
        animationType="fade"
      >
        <Animated.View
          entering={FadeIn}
          style={[
            styles.modalOverlay,
            styles.emergencyOverlay,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 0),
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMemberDetailsModal} />
          <Animated.View
            entering={SlideInDown.springify()}
            style={[
              styles.emergencySheet,
              {
                height: height - insets.top - insets.bottom - 24,
                maxHeight: height - insets.top - insets.bottom - 24,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.emergencyHeader}>
              <View style={styles.emergencyTitleWrap}>
                <Text style={styles.sheetTitle}>
                  {selectedMember?.displayName ? `${selectedMember.displayName}'s Details` : 'Member Details'}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeMemberDetailsModal}>
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            </View>

            {vaultPreviewFile ? (
              <View style={styles.memberDetailsPreviewContent}>
                <View style={styles.vaultPreviewHeader}>
                  <Pressable style={styles.vaultPreviewHeaderButton} onPress={closeVaultPreview}>
                    <MaterialCommunityIcons name="close" size={18} color="#1f2f33" />
                  </Pressable>
                  <Text style={styles.vaultPreviewTitle} numberOfLines={1}>
                    {vaultPreviewFile.name}
                  </Text>
                  <View style={styles.vaultPreviewHeaderSpacer} />
                </View>
                <View style={styles.vaultPreviewBody}>
                  {vaultPreviewLoading ? (
                    <View style={styles.vaultPreviewState}>
                      <ActivityIndicator size="small" color="#2f565f" />
                      <Text style={styles.vaultPreviewStateText}>Preparing preview...</Text>
                    </View>
                  ) : null}

                  {!vaultPreviewLoading && vaultPreviewError ? (
                    <View style={styles.vaultPreviewState}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#b91c1c" />
                      <Text style={styles.vaultPreviewErrorText}>{vaultPreviewError}</Text>
                    </View>
                  ) : null}

                  {!vaultPreviewLoading && !vaultPreviewError && vaultPreviewUrl && vaultPreviewType === 'image' ? (
                    <Image source={{ uri: vaultPreviewUrl }} resizeMode="contain" style={styles.vaultPreviewImage} />
                  ) : null}

                  {!vaultPreviewLoading && !vaultPreviewError && vaultPreviewUrl && vaultPreviewType === 'pdf' ? (
                    <Pdf
                      source={{ uri: vaultPreviewUrl }}
                      style={styles.vaultPreviewPdf}
                      onError={(error) => {
                        const message =
                          error && typeof error === 'object' && 'message' in error
                            ? String((error as { message?: unknown }).message ?? '')
                            : '';
                        setVaultPreviewError(message || 'Unable to load PDF.');
                      }}
                    />
                  ) : null}

                  {!vaultPreviewLoading && !vaultPreviewError && vaultPreviewUrl && vaultPreviewType === 'unknown' ? (
                    <View style={styles.vaultPreviewState}>
                      <MaterialCommunityIcons name="file-outline" size={22} color="#64748b" />
                      <Text style={styles.vaultPreviewStateText}>Preview not available for this file.</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <View style={styles.memberDetailsTabs}>
                  {(['personal', 'appointments', 'medications', 'vault'] as const).map((tab) => (
                    <Pressable
                      key={tab}
                      onPress={() => setMemberDetailsTab(tab)}
                      style={[
                        styles.memberDetailsTabItem,
                        memberDetailsTab === tab && styles.memberDetailsTabItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.memberDetailsTabText,
                          memberDetailsTab === tab && styles.memberDetailsTabTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {tab === 'personal' ? 'Personal' : tab === 'appointments' ? 'Appts' : tab === 'medications' ? 'Meds' : 'Vault'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {memberDetailsLoading ? (
                  <View style={styles.emergencyLoading}>
                    <Text style={styles.emergencyLoadingText}>Loading member details...</Text>
                  </View>
                ) : memberDetailsError ? (
                  <View style={styles.emergencyError}>
                    <Text style={styles.emergencyErrorText}>{memberDetailsError}</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.emergencyScrollView}
                    contentContainerStyle={styles.emergencyContent}
                    showsVerticalScrollIndicator
                  >
                    {memberDetailsTab === 'personal' && (
                      <Animated.View entering={FadeIn} style={{ gap: 12 }}>
                        <View style={styles.formSection}>
                          <Text style={styles.sectionHeading}>Personal information</Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Name</Text>
                            <Text style={styles.detailValue}>{memberDetails?.personal?.display_name || '—'}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Phone</Text>
                            <Text style={styles.detailValue}>{memberDetails?.personal?.phone || '—'}</Text>
                          </View>
                          {memberDetails?.personal?.gender ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Gender</Text>
                              <Text style={styles.detailValue}>{memberDetails.personal.gender}</Text>
                            </View>
                          ) : null}
                          {memberDetails?.personal?.address ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Address</Text>
                              <Text style={styles.detailValue}>{memberDetails.personal.address}</Text>
                            </View>
                          ) : null}
                        </View>
                        {memberDetails?.health ? (
                          <View style={styles.formSection}>
                            <Text style={styles.sectionHeading}>Health profile</Text>
                            {memberDetails.health.date_of_birth ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Date of birth</Text>
                                <Text style={styles.detailValue}>{memberDetails.health.date_of_birth}</Text>
                              </View>
                            ) : null}
                            {memberDetails.health.blood_group ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Blood group</Text>
                                <Text style={styles.detailValue}>{memberDetails.health.blood_group}</Text>
                              </View>
                            ) : null}
                            {memberDetails.health.age != null ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Age</Text>
                                <Text style={styles.detailValue}>{memberDetails.health.age}</Text>
                              </View>
                            ) : null}
                            {memberDetails.health.allergies?.length ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Allergies</Text>
                                <Text style={styles.detailValue}>{memberDetails.health.allergies.join(', ')}</Text>
                              </View>
                            ) : null}
                            {memberDetails.health.current_diagnosed_condition?.length ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Current conditions</Text>
                                <Text style={styles.detailValue}>{memberDetails.health.current_diagnosed_condition.join(', ')}</Text>
                              </View>
                            ) : null}
                            {memberDetails.health.ongoing_treatments?.length ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Ongoing treatments</Text>
                                <Text style={styles.detailValue}>{memberDetails.health.ongoing_treatments.join(', ')}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </Animated.View>
                    )}

                {memberDetailsTab === 'appointments' && (
                  <Animated.View entering={FadeIn} style={{ gap: 12 }}>
                    <View style={styles.memberSectionHeader}>
                      <Text style={styles.sectionHeading}>Appointments</Text>
                      {canManageSelectedMemberMedicalData ? (
                        <AnimatedButton
                          onPress={openAddAppointmentEditor}
                          style={styles.memberManageButton}
                        >
                          <Text style={styles.memberManageButtonText}>Add</Text>
                        </AnimatedButton>
                      ) : (
                        <Text style={styles.roleSublabel}>Read-only</Text>
                      )}
                    </View>
                    {!memberDetails?.appointments?.length ? (
                      <EmptyStatePreset preset="appointments" />
                    ) : (
                      memberDetails.appointments.map((appt) => {
                        const detailFields = getAppointmentTypeFields(appt.type || '');
                        return (
                          <View key={appt.id} style={styles.formSection}>
                            <View style={styles.memberItemHeader}>
                              <Text style={styles.memberItemTitle}>{appt.title || appt.type || 'Appointment'}</Text>
                              {canManageSelectedMemberMedicalData ? (
                                <View style={styles.memberItemActions}>
                                  <AnimatedButton
                                    onPress={() => openEditAppointmentEditor(appt)}
                                    style={styles.memberItemEditButton}
                                  >
                                    <Text style={styles.memberItemEditText}>Edit</Text>
                                  </AnimatedButton>
                                  <AnimatedButton
                                    onPress={() => confirmDeleteAppointment(appt)}
                                    style={styles.memberItemDeleteButton}
                                  >
                                    <Text style={styles.memberItemDeleteText}>Delete</Text>
                                  </AnimatedButton>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Date</Text>
                              <Text style={styles.detailValue}>{normalizeAppointmentDate(appt.date) || appt.date || '—'}</Text>
                            </View>
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Time</Text>
                              <Text style={styles.detailValue}>{formatAppointmentTime(appt.time)}</Text>
                            </View>
                            {appt.type ? (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Type</Text>
                                <Text style={styles.detailValue}>{appt.type}</Text>
                              </View>
                            ) : null}
                            {detailFields
                              .filter((field) => Boolean(appt[field.name]))
                              .map((field) => (
                                <View key={field.name} style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>{field.label}</Text>
                                  <Text style={styles.detailValue}>{appt[field.name]}</Text>
                                </View>
                              ))}
                          </View>
                        );
                      })
                    )}
                  </Animated.View>
                )}

                {memberDetailsTab === 'medications' && (
                  <Animated.View entering={FadeIn} style={{ gap: 12 }}>
                    <View style={styles.memberSectionHeader}>
                      <Text style={styles.sectionHeading}>Medications</Text>
                      {canManageSelectedMemberMedicalData ? (
                        <AnimatedButton
                          onPress={openAddMedicationEditor}
                          style={styles.memberManageButton}
                        >
                          <Text style={styles.memberManageButtonText}>Add</Text>
                        </AnimatedButton>
                      ) : (
                        <Text style={styles.roleSublabel}>Read-only</Text>
                      )}
                    </View>
                    {!memberDetails?.medications?.length ? (
                      <EmptyStatePreset preset="medications" />
                    ) : (
                      memberDetails.medications.map((med) => (
                        <View key={med.id} style={styles.formSection}>
                          <View style={styles.memberItemHeader}>
                            <Text style={styles.memberItemTitle}>{med.name}</Text>
                            {canManageSelectedMemberMedicalData ? (
                              <View style={styles.memberItemActions}>
                                <AnimatedButton
                                  onPress={() => openEditMedicationEditor(med)}
                                  style={styles.memberItemEditButton}
                                >
                                  <Text style={styles.memberItemEditText}>Edit</Text>
                                </AnimatedButton>
                                <AnimatedButton
                                  onPress={() => confirmDeleteMedication(med)}
                                  style={styles.memberItemDeleteButton}
                                >
                                  <Text style={styles.memberItemDeleteText}>Delete</Text>
                                </AnimatedButton>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Dosage</Text>
                            <Text style={styles.detailValue}>{med.dosage || '—'}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Frequency</Text>
                            <Text style={styles.detailValue}>{getMedicationFrequencyLabel(med.frequency)}</Text>
                          </View>
                          {med.purpose ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Purpose</Text>
                              <Text style={styles.detailValue}>{med.purpose}</Text>
                            </View>
                          ) : null}
                          {med.startDate ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Start</Text>
                              <Text style={styles.detailValue}>{med.startDate}</Text>
                            </View>
                          ) : null}
                          {med.endDate ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>End</Text>
                              <Text style={styles.detailValue}>{med.endDate}</Text>
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}
                  </Animated.View>
                )}

                {memberDetailsTab === 'vault' && (
                  <Animated.View entering={FadeIn} style={{ gap: 12 }}>
                    <View style={styles.memberSectionHeader}>
                      <Text style={styles.sectionHeading}>Vault</Text>
                      {canManageSelectedMemberVault ? (
                        <AnimatedButton onPress={openVaultUploadModal} style={styles.memberManageButton}>
                          <Text style={styles.memberManageButtonText}>Add</Text>
                        </AnimatedButton>
                      ) : (
                        <Text style={styles.roleSublabel}>Read-only</Text>
                      )}
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.vaultCategoryRow}
                    >
                      {(['all', 'reports', 'prescriptions', 'insurance', 'bills'] as const).map((cat) => (
                        <Pressable
                          key={cat}
                          onPress={() => setVaultCategory(cat)}
                          style={[
                            styles.vaultCategoryChip,
                            vaultCategory === cat && styles.vaultCategoryChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vaultCategoryChipText,
                              vaultCategory === cat && styles.vaultCategoryChipTextActive,
                            ]}
                          >
                            {vaultCategoryLabels[cat]}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <TextInput
                      value={vaultSearchQuery}
                      onChangeText={setVaultSearchQuery}
                      placeholder="Search files"
                      placeholderTextColor="#94a3b8"
                      style={styles.vaultSearchInput}
                    />
                    {vaultUploadError ? (
                      <View style={styles.emergencyError}>
                        <Text style={styles.emergencyErrorText}>{vaultUploadError}</Text>
                      </View>
                    ) : null}
                    {vaultLoading ? (
                      <View style={styles.emergencyLoading}>
                        <Text style={styles.emergencyLoadingText}>Loading files...</Text>
                      </View>
                    ) : vaultError ? (
                      <View style={styles.emergencyError}>
                        <Text style={styles.emergencyErrorText}>{vaultError}</Text>
                      </View>
                    ) : !filteredVaultFiles.length ? (
                      <EmptyStatePreset preset="files" />
                    ) : (
                      filteredVaultFiles.map((file) => {
                        const fileKey = vaultFileKey(file);
                        const isOpening = vaultOpeningKey === fileKey;
                        const isRenaming = vaultRenamingKey === fileKey;
                        const isDeleting = vaultDeletingKey === fileKey;
                        return (
                          <Pressable
                            key={fileKey}
                            onPress={() => handleOpenVaultFile(file)}
                            style={({ pressed }) => [
                              styles.formSection,
                              styles.vaultFileCard,
                              pressed && styles.vaultFileCardPressed,
                            ]}
                            disabled={isDeleting}
                          >
                            <View style={styles.vaultFileHeader}>
                              <View style={styles.vaultFileMeta}>
                                <MaterialCommunityIcons
                                  name="file-document-outline"
                                  size={18}
                                  color="#2f565f"
                                  style={{ marginRight: 8 }}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.memberName} numberOfLines={1}>{file.name}</Text>
                                  <Text style={styles.roleSublabel}>
                                    {vaultCategoryLabels[file.folder]} · {formatVaultDate(file.created_at)}
                                  </Text>
                                </View>
                              </View>
                              {canManageSelectedMemberVault ? (
                                <Pressable
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    openVaultActionMenu(file);
                                  }}
                                  hitSlop={8}
                                  style={styles.vaultMenuButton}
                                  disabled={isRenaming || isDeleting}
                                >
                                  <MaterialCommunityIcons name="dots-vertical" size={18} color="#475569" />
                                </Pressable>
                              ) : null}
                            </View>
                            <Text style={styles.vaultStatusText}>
                              {isOpening
                                ? 'Opening...'
                                : isRenaming
                                  ? 'Updating...'
                                  : isDeleting
                                    ? 'Deleting...'
                                    : 'Tap to view'}
                            </Text>
                          </Pressable>
                        );
                      })
                    )}
                  </Animated.View>
                )}
              </ScrollView>
            )}
              </>
            )}

            {appointmentEditorOpen ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.inlineEditorOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeAppointmentEditor} />
                <KeyboardAvoidingView
                  style={styles.inlineEditorKeyboard}
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                  <Animated.View
                    entering={FadeInDown.springify()}
                    style={[styles.inlineEditorCard, { maxHeight: modalMaxHeight }]}
                  >
                  <View style={styles.inlineEditorHeader}>
                    <Text style={styles.inlineEditorTitle}>
                      {appointmentEditorMode === 'add' ? 'Add Appointment' : 'Edit Appointment'}
                    </Text>
                    <Pressable style={styles.closeButton} onPress={closeAppointmentEditor}>
                      <MaterialCommunityIcons name="close" size={18} color="#475569" />
                    </Pressable>
                  </View>

                  <ScrollView
                    style={[styles.inlineEditorScroll, { maxHeight: inlineEditorScrollMaxHeight }]}
                    contentContainerStyle={styles.inlineEditorContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.formLabel}>Title</Text>
                    <TextInput
                      value={appointmentEditorDraft.title}
                      onChangeText={(value) =>
                        setAppointmentEditorDraft((prev) => ({ ...prev, title: value }))
                      }
                      onFocus={() => setAppointmentTypePickerOpen(false)}
                      placeholder="Appointment title"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
                    <TextInput
                      value={appointmentEditorDraft.date}
                      onChangeText={(value) =>
                        setAppointmentEditorDraft((prev) => ({ ...prev, date: value }))
                      }
                      onFocus={() => setAppointmentTypePickerOpen(false)}
                      placeholder="2026-02-23"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    <Text style={styles.formLabel}>Time</Text>
                    <View style={styles.timePickerCard}>
                      <View style={styles.timePickerRow}>
                        <TextInput
                          value={appointmentTimeParts.hour}
                          onChangeText={(value) =>
                            updateAppointmentTime({ hour: clampTimePart(value, 12) })
                          }
                          onFocus={() => setAppointmentTypePickerOpen(false)}
                          placeholder="HH"
                          keyboardType="number-pad"
                          maxLength={2}
                          placeholderTextColor="#94a3b8"
                          style={styles.timePartInput}
                        />
                        <Text style={styles.timeColon}>:</Text>
                        <TextInput
                          value={appointmentTimeParts.minute}
                          onChangeText={(value) =>
                            updateAppointmentTime({ minute: clampTimePart(value, 59) })
                          }
                          onBlur={() => {
                            if (!appointmentTimeParts.minute) return;
                            updateAppointmentTime({ minute: appointmentTimeParts.minute.padStart(2, '0') });
                          }}
                          onFocus={() => setAppointmentTypePickerOpen(false)}
                          placeholder="MM"
                          keyboardType="number-pad"
                          maxLength={2}
                          placeholderTextColor="#94a3b8"
                          style={styles.timePartInput}
                        />
                        <View style={styles.timePeriodColumn}>
                          <Pressable
                            onPress={() => updateAppointmentTime({ period: 'AM' })}
                            style={[
                              styles.timePeriodButton,
                              appointmentTimeParts.period === 'AM' && styles.timePeriodButtonActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.timePeriodButtonText,
                                appointmentTimeParts.period === 'AM' && styles.timePeriodButtonTextActive,
                              ]}
                            >
                              AM
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => updateAppointmentTime({ period: 'PM' })}
                            style={[
                              styles.timePeriodButton,
                              appointmentTimeParts.period === 'PM' && styles.timePeriodButtonActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.timePeriodButtonText,
                                appointmentTimeParts.period === 'PM' && styles.timePeriodButtonTextActive,
                              ]}
                            >
                              PM
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.timeSelectionHint}>
                        {appointmentTimeParts.hour && appointmentTimeParts.minute && appointmentTimeParts.period
                          ? `Selected: ${appointmentTimeParts.hour.padStart(2, '0')}:${appointmentTimeParts.minute.padStart(2, '0')} ${appointmentTimeParts.period}`
                          : 'Select a time for the appointment'}
                      </Text>
                    </View>

                    <Text style={styles.formLabel}>Type</Text>
                    <View style={styles.frequencyPickerContainer}>
                      <Pressable
                        onPress={() => setAppointmentTypePickerOpen((prev) => !prev)}
                        style={[
                          styles.dropdownField,
                          appointmentTypePickerOpen && styles.dropdownFieldActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownFieldText,
                            !appointmentEditorDraft.type && styles.dropdownPlaceholderText,
                          ]}
                        >
                          {appointmentEditorDraft.type || 'Select type'}
                        </Text>
                        <MaterialCommunityIcons
                          name={appointmentTypePickerOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color="#64748b"
                        />
                      </Pressable>
                      {appointmentTypePickerOpen ? (
                        <View style={styles.dropdownMenu}>
                          <ScrollView
                            style={styles.dropdownMenuScroll}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                          >
                            {appointmentTypeOptions.map((option) => {
                              const isSelected = option === appointmentEditorDraft.type;
                              return (
                                <Pressable
                                  key={option}
                                  onPress={() => handleAppointmentTypeSelect(option)}
                                  style={[
                                    styles.dropdownOption,
                                    isSelected && styles.dropdownOptionActive,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownOptionText,
                                      isSelected && styles.dropdownOptionTextActive,
                                    ]}
                                  >
                                    {option}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>

                    {activeAppointmentTypeFields.length > 0 ? (
                      <View style={styles.additionalDetailsCard}>
                        <Text style={styles.additionalDetailsTitle}>Additional details</Text>
                        <View style={styles.additionalDetailsFields}>
                          {activeAppointmentTypeFields.map((field) => (
                            <View key={field.name}>
                              <Text style={styles.formLabel}>{field.label}</Text>
                              <TextInput
                                value={appointmentEditorDraft.extras[field.name] || ''}
                                onChangeText={(value) => handleAppointmentExtraFieldChange(field.name, value)}
                                onFocus={() => setAppointmentTypePickerOpen(false)}
                                placeholder={field.placeholder}
                                placeholderTextColor="#94a3b8"
                                multiline={field.type === 'textarea'}
                                style={[styles.sheetInput, field.type === 'textarea' && styles.textArea]}
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {appointmentEditorError ? (
                      <Text style={styles.formError}>{appointmentEditorError}</Text>
                    ) : null}
                  </ScrollView>

                  <View style={styles.inlineEditorActions}>
                    <AnimatedButton style={styles.secondaryButton} onPress={closeAppointmentEditor}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton
                      style={[styles.primaryButton, appointmentEditorSaving && styles.buttonDisabled]}
                      onPress={submitAppointmentEditor}
                      disabled={appointmentEditorSaving}
                    >
                      <Text style={styles.primaryButtonText}>
                        {appointmentEditorSaving
                          ? 'Saving...'
                          : appointmentEditorMode === 'add'
                            ? 'Add'
                            : 'Save'}
                      </Text>
                    </AnimatedButton>
                  </View>
                  </Animated.View>
                </KeyboardAvoidingView>
              </Animated.View>
            ) : null}

            {medicationEditorOpen ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.inlineEditorOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeMedicationEditor} />
                <KeyboardAvoidingView
                  style={styles.inlineEditorKeyboard}
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                  <Animated.View
                    entering={FadeInDown.springify()}
                    style={[styles.inlineEditorCard, { maxHeight: modalMaxHeight }]}
                  >
                  <View style={styles.inlineEditorHeader}>
                    <Text style={styles.inlineEditorTitle}>
                      {medicationEditorMode === 'add' ? 'Add Medication' : 'Edit Medication'}
                    </Text>
                    <Pressable style={styles.closeButton} onPress={closeMedicationEditor}>
                      <MaterialCommunityIcons name="close" size={18} color="#475569" />
                    </Pressable>
                  </View>

                  <ScrollView
                    style={[styles.inlineEditorScroll, { maxHeight: inlineEditorScrollMaxHeight }]}
                    contentContainerStyle={styles.inlineEditorContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.formLabel}>Name</Text>
                    <TextInput
                      value={medicationEditorDraft.name}
                      onChangeText={(value) =>
                        setMedicationEditorDraft((prev) => ({ ...prev, name: value }))
                      }
                      onFocus={() => setMedicationFrequencyPickerOpen(false)}
                      placeholder="Medication name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    <Text style={styles.formLabel}>Dosage</Text>
                    <TextInput
                      value={medicationEditorDraft.dosage}
                      onChangeText={(value) =>
                        setMedicationEditorDraft((prev) => ({ ...prev, dosage: value }))
                      }
                      onFocus={() => setMedicationFrequencyPickerOpen(false)}
                      placeholder="e.g. 500mg"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    <Text style={styles.formLabel}>Frequency</Text>
                    <View style={styles.frequencyPickerContainer}>
                      <Pressable
                        onPress={() => setMedicationFrequencyPickerOpen((prev) => !prev)}
                        style={[
                          styles.dropdownField,
                          medicationFrequencyPickerOpen && styles.dropdownFieldActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownFieldText,
                            !medicationEditorDraft.frequency && styles.dropdownPlaceholderText,
                          ]}
                        >
                          {selectedMedicationFrequency?.label ||
                            medicationEditorDraft.frequency ||
                            'Select frequency'}
                        </Text>
                        <MaterialCommunityIcons
                          name={medicationFrequencyPickerOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color="#64748b"
                        />
                      </Pressable>
                      {medicationFrequencyPickerOpen ? (
                        <View style={styles.dropdownMenu}>
                          <ScrollView
                            style={styles.dropdownMenuScroll}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                          >
                            {medicationFrequencyOptions.map((option) => {
                              const isSelected = option.value === medicationEditorDraft.frequency;
                              return (
                                <Pressable
                                  key={option.value}
                                  onPress={() => handleMedicationFrequencySelect(option.value)}
                                  style={[
                                    styles.dropdownOption,
                                    isSelected && styles.dropdownOptionActive,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownOptionText,
                                      isSelected && styles.dropdownOptionTextActive,
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.formLabel}>Purpose (optional)</Text>
                    <TextInput
                      value={medicationEditorDraft.purpose}
                      onChangeText={(value) =>
                        setMedicationEditorDraft((prev) => ({ ...prev, purpose: value }))
                      }
                      onFocus={() => setMedicationFrequencyPickerOpen(false)}
                      placeholder="Purpose"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    <Text style={styles.formLabel}>Times/day</Text>
                    <TextInput
                      value={medicationEditorDraft.timesPerDay}
                      onChangeText={(value) =>
                        setMedicationEditorDraft((prev) => ({ ...prev, timesPerDay: value }))
                      }
                      onFocus={() => setMedicationFrequencyPickerOpen(false)}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor="#94a3b8"
                      editable={!isMedicationTimesPerDayLocked}
                      style={[styles.sheetInput, isMedicationTimesPerDayLocked && styles.sheetInputDisabled]}
                    />

                    <Text style={styles.formLabel}>Start date (YYYY-MM-DD)</Text>
                    <TextInput
                      value={medicationEditorDraft.startDate}
                      onChangeText={(value) =>
                        setMedicationEditorDraft((prev) => ({ ...prev, startDate: value }))
                      }
                      onFocus={() => setMedicationFrequencyPickerOpen(false)}
                      placeholder="2026-02-23"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    <Text style={styles.formLabel}>End date (optional)</Text>
                    <TextInput
                      value={medicationEditorDraft.endDate}
                      onChangeText={(value) =>
                        setMedicationEditorDraft((prev) => ({ ...prev, endDate: value }))
                      }
                      onFocus={() => setMedicationFrequencyPickerOpen(false)}
                      placeholder="2026-03-23"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />

                    {medicationEditorError ? (
                      <Text style={styles.formError}>{medicationEditorError}</Text>
                    ) : null}
                  </ScrollView>

                  <View style={styles.inlineEditorActions}>
                    <AnimatedButton style={styles.secondaryButton} onPress={closeMedicationEditor}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton
                      style={[styles.primaryButton, medicationEditorSaving && styles.buttonDisabled]}
                      onPress={submitMedicationEditor}
                      disabled={medicationEditorSaving}
                    >
                      <Text style={styles.primaryButtonText}>
                        {medicationEditorSaving
                          ? 'Saving...'
                          : medicationEditorMode === 'add'
                            ? 'Add'
                            : 'Save'}
                      </Text>
                    </AnimatedButton>
                  </View>
                  </Animated.View>
                </KeyboardAvoidingView>
              </Animated.View>
            ) : null}

            {vaultUploadModalOpen ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.inlineEditorOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeVaultUploadModal} />
                <KeyboardAvoidingView
                  style={styles.inlineEditorKeyboard}
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                  <Animated.View
                    entering={FadeInDown.springify()}
                    style={[styles.inlineEditorCard, { maxHeight: modalMaxHeight }]}
                  >
                  <View style={styles.inlineEditorHeader}>
                    <Text style={styles.inlineEditorTitle}>Upload Document</Text>
                    <Pressable style={styles.closeButton} onPress={closeVaultUploadModal}>
                      <MaterialCommunityIcons name="close" size={18} color="#475569" />
                    </Pressable>
                  </View>

                  <ScrollView
                    style={[styles.inlineEditorScroll, { maxHeight: inlineEditorScrollMaxHeight }]}
                    contentContainerStyle={styles.inlineEditorContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.formLabel}>Category</Text>
                    <View style={styles.vaultFolderPickerRow}>
                      {(['reports', 'prescriptions', 'insurance', 'bills'] as const).map((folder) => (
                        <Pressable
                          key={folder}
                          onPress={() => setVaultUploadFolder(folder)}
                          style={[
                            styles.vaultFolderOption,
                            vaultUploadFolder === folder && styles.vaultFolderOptionActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vaultFolderOptionText,
                              vaultUploadFolder === folder && styles.vaultFolderOptionTextActive,
                            ]}
                          >
                            {vaultCategoryLabels[folder]}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.formLabel}>File</Text>
                    <AnimatedButton onPress={handlePickVaultUploadFile} style={styles.vaultPickerButton}>
                      <Text style={styles.vaultPickerButtonText}>Choose file</Text>
                    </AnimatedButton>
                    <Text style={styles.vaultSelectedFile} numberOfLines={1}>
                      {vaultUploadFile?.name || 'No file selected'}
                    </Text>

                    <Text style={styles.formLabel}>File name</Text>
                    <TextInput
                      value={vaultUploadName}
                      onChangeText={setVaultUploadName}
                      placeholder="Enter file name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.roleSublabel}>File extension is preserved automatically.</Text>

                    {vaultUploadError ? (
                      <Text style={styles.formError}>{vaultUploadError}</Text>
                    ) : null}
                  </ScrollView>

                  <View style={styles.inlineEditorActions}>
                    <AnimatedButton style={styles.secondaryButton} onPress={closeVaultUploadModal}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton
                      style={[
                        styles.primaryButton,
                        (vaultUploading || !vaultUploadFile) && styles.buttonDisabled,
                      ]}
                      onPress={submitVaultUpload}
                      disabled={vaultUploading || !vaultUploadFile}
                    >
                      <Text style={styles.primaryButtonText}>
                        {vaultUploading ? 'Uploading...' : 'Upload'}
                      </Text>
                    </AnimatedButton>
                  </View>
                  </Animated.View>
                </KeyboardAvoidingView>
              </Animated.View>
            ) : null}

            {vaultRenameFile ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.inlineEditorOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeVaultRenameModal} />
                <KeyboardAvoidingView
                  style={styles.inlineEditorKeyboard}
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                  <Animated.View
                    entering={FadeInDown.springify()}
                    style={[styles.inlineEditorCard, { maxHeight: modalMaxHeight }]}
                  >
                  <View style={styles.inlineEditorHeader}>
                    <Text style={styles.inlineEditorTitle}>Edit File Name</Text>
                    <Pressable style={styles.closeButton} onPress={closeVaultRenameModal}>
                      <MaterialCommunityIcons name="close" size={18} color="#475569" />
                    </Pressable>
                  </View>

                  <View style={styles.inlineEditorContent}>
                    <Text style={styles.roleSublabel} numberOfLines={2}>
                      Current: {vaultRenameFile.name}
                    </Text>
                    <Text style={styles.formLabel}>New name</Text>
                    <TextInput
                      value={vaultRenameValue}
                      onChangeText={setVaultRenameValue}
                      placeholder="Enter file name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.roleSublabel}>
                      Extension: .{vaultFileExtension(vaultRenameFile.name) || 'none'}
                    </Text>
                  </View>

                  <View style={styles.inlineEditorActions}>
                    <AnimatedButton style={styles.secondaryButton} onPress={closeVaultRenameModal}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton
                      style={[
                        styles.primaryButton,
                        (vaultRenamingKey === vaultFileKey(vaultRenameFile) || !vaultRenameValue.trim()) &&
                          styles.buttonDisabled,
                      ]}
                      onPress={submitVaultRename}
                      disabled={vaultRenamingKey === vaultFileKey(vaultRenameFile) || !vaultRenameValue.trim()}
                    >
                      <Text style={styles.primaryButtonText}>
                        {vaultRenamingKey === vaultFileKey(vaultRenameFile) ? 'Saving...' : 'Save'}
                      </Text>
                    </AnimatedButton>
                  </View>
                  </Animated.View>
                </KeyboardAvoidingView>
              </Animated.View>
            ) : null}

            {vaultActionMenuFile ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.inlineEditorOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeVaultActionMenu} />
                <Animated.View entering={FadeInDown.springify()} style={styles.vaultActionSheet}>
                  <Text style={styles.vaultActionTitle} numberOfLines={2}>
                    {vaultActionMenuFile.name}
                  </Text>
                  <Pressable
                    onPress={() => openVaultRenameModal(vaultActionMenuFile)}
                    style={styles.vaultActionItem}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color="#2f565f" />
                    <Text style={styles.vaultActionItemText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      closeVaultActionMenu();
                      confirmVaultDelete(vaultActionMenuFile);
                    }}
                    style={[styles.vaultActionItem, styles.vaultActionItemDanger]}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b91c1c" />
                    <Text style={[styles.vaultActionItemText, styles.vaultActionItemDangerText]}>
                      Delete
                    </Text>
                  </Pressable>
                  <Pressable onPress={closeVaultActionMenu} style={styles.vaultActionCancel}>
                    <Text style={styles.vaultActionCancelText}>Cancel</Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            ) : null}

          </Animated.View>
        </Animated.View>
      </Modal>

    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f5f8f9',
  },
  screenContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 0,
    paddingBottom: 0,
  },
  innerContent: {
    flex: 1,
    width: '100%',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2f565f',
    backgroundColor: '#ffffff',
    shadowColor: '#2f565f',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inviteButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  inviteButtonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e4eef0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    padding: 5,
    gap: 5,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    position: 'relative',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 5,
    left: '2.5%',
    width: '47.5%',
    height: 44,
    backgroundColor: '#2f565f',
    borderRadius: 10,
    zIndex: 0,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  segmentActive: {
    // Background is handled by the indicator, so we don't need it here
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  segmentLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  segmentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  emergencyCardWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#2f565f',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  emergencyCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyCardText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 16,
    letterSpacing: 0.3,
  },
  section: {
    gap: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  pendingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#c2d7db',
    backgroundColor: '#f0f6f6',
  },
  pendingButtonWithBadge: {
    borderColor: '#2f565f',
    backgroundColor: '#e8f0f0',
  },
  pendingButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  pendingBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2f565f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  memberList: {
    gap: 14,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1eaec',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  memberAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#2f565f',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2f565f',
    letterSpacing: 0.5,
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f1a1c',
    letterSpacing: -0.2,
  },
  pendingStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  removeButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.2,
  },
  viewButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#c2d7db',
    backgroundColor: '#f0f6f6',
    minWidth: 88,
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#2f565f',
    shadowColor: '#2f565f',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  acceptButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  declineButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  declineButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  declineButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  emptyState: {
    padding: 48,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e1eaec',
    borderStyle: 'dashed',
    backgroundColor: '#fafcfc',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: -0.2,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalKeyboard: {
    width: '100%',
    alignItems: 'center',
  },
  modalCardCentered: {
    borderRadius: 24,
    width: '100%',
    shadowOffset: { width: 0, height: 8 },
  },
  emergencyOverlay: {
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  inviteSheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    gap: 20,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  invitePhoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteCountryCode: {
    minWidth: 70,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  inviteCountryCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2f33',
  },
  invitePhoneInput: {
    flex: 1,
  },
  countryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  countryModalContent: {
    backgroundColor: '#ffffff',
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
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  countryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  countryModalDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f766e',
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
    borderBottomColor: '#e5e7eb',
  },
  countryItemPressed: {
    transform: [{ scale: 0.98 }],
  },
  countryItemText: {
    fontSize: 16,
    color: '#334155',
  },
  pendingSheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    overflow: 'hidden',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  pendingSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  pendingEmpty: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 12,
  },
  pendingSheetScroll: {
    width: '100%',
  },
  pendingSheetContent: {
    gap: 14,
    paddingBottom: 24,
  },
  pendingCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e1eaec',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  pendingInfo: {
    flex: 1,
    gap: 4,
  },
  pendingActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  pendingActionSingle: {
    alignSelf: 'flex-end',
  },
  emergencySheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 16,
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  emergencyToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  emergencyToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  emergencyToggleButtonActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  emergencyToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  emergencyToggleTextActive: {
    color: '#ffffff',
  },
  emergencyHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  emergencyBody: {
    flex: 1,
  },
  emergencyTitleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: '#d8e3e6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f1a1c',
    backgroundColor: '#f7fbfb',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sheetInputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  frequencyPickerContainer: {
    gap: 8,
  },
  dropdownField: {
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fafcfc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dropdownFieldActive: {
    borderColor: '#2f565f',
    backgroundColor: '#f6fbfb',
  },
  dropdownFieldText: {
    flex: 1,
    fontSize: 15,
    color: '#0f1a1c',
  },
  dropdownPlaceholderText: {
    color: '#94a3b8',
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#d7e0e4',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  dropdownMenuScroll: {
    maxHeight: 210,
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  dropdownOptionActive: {
    backgroundColor: '#e8f0f0',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#334155',
  },
  dropdownOptionTextActive: {
    color: '#2f565f',
    fontWeight: '700',
  },
  timePickerCard: {
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    padding: 12,
    gap: 10,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timePartInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    borderRadius: 14,
    backgroundColor: '#f7fbfb',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timeColon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748b',
  },
  timePeriodColumn: {
    width: 64,
    gap: 6,
  },
  timePeriodButton: {
    borderWidth: 1,
    borderColor: '#d7e0e4',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  timePeriodButtonActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  timePeriodButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  timePeriodButtonTextActive: {
    color: '#ffffff',
  },
  timeSelectionHint: {
    fontSize: 12,
    color: '#64748b',
  },
  additionalDetailsCard: {
    borderWidth: 1,
    borderColor: '#bce3e3',
    borderRadius: 14,
    backgroundColor: '#edf8f8',
    padding: 12,
    gap: 10,
  },
  additionalDetailsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#2f565f',
    textTransform: 'uppercase',
  },
  additionalDetailsFields: {
    gap: 10,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2f565f',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2f565f',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#fafcfc',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  inlineEditorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    paddingHorizontal: 12,
    zIndex: 30,
  },
  inlineEditorKeyboard: {
    width: '100%',
  },
  inlineEditorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inlineEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  inlineEditorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  inlineEditorScroll: {
    maxHeight: 380,
  },
  inlineEditorContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  inlineEditorActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  emergencyLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emergencyLoadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  emergencyError: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
  },
  emergencyErrorText: {
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
  },
  emergencyScrollView: {
    flex: 1,
    minHeight: 0,
  },
  emergencyContent: {
    paddingBottom: 24,
    gap: 16,
  },
  formSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formColumn: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  formError: {
    fontSize: 13,
    color: '#b91c1c',
    textAlign: 'center',
  },
  previewCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#f9fbfb',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  previewEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2f565f',
  },
  previewName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  previewMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewMetaText: {
    fontSize: 13,
    color: '#475569',
  },
  previewContactCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  previewContactName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  previewContactValue: {
    fontSize: 13,
    color: '#475569',
  },
  callNowButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e11d48',
    shadowColor: '#e11d48',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  callNowButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewSection: {
    width: '48%',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  previewSectionWide: {
    width: '100%',
  },
  previewSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  previewSectionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  previewSectionSubvalue: {
    fontSize: 12,
    color: '#475569',
  },
  emergencySection: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  memberSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  memberManageButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#2f565f',
    backgroundColor: '#ffffff',
  },
  memberManageButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  memberItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  memberItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  memberItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  memberItemEditButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#ffffff',
  },
  memberItemEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2f565f',
  },
  memberItemDeleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    backgroundColor: '#fff7f7',
  },
  memberItemDeleteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    textAlign: 'right',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#e1eaec',
    borderRadius: 6,
  },
  roleRow: {
    gap: 4,
    marginTop: 2,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  roleSublabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  roleEditButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#ffffff',
  },
  roleEditButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2f565f',
  },
  rolePicker: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  roleOption: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#fafcfc',
  },
  roleOptionActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  roleOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  roleOptionTextActive: {
    color: '#ffffff',
  },
  rolePrimaryHint: {
    fontSize: 11,
    color: '#d97706',
    marginTop: 2,
  },
  roleEditorSheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    gap: 16,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  roleEditorOptions: {
    gap: 10,
  },
  roleEditorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    borderRadius: 14,
    backgroundColor: '#fafcfc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  roleEditorOptionActive: {
    borderColor: '#8fb7ba',
    backgroundColor: '#eef6f6',
  },
  roleEditorOptionCopy: {
    flex: 1,
    gap: 2,
  },
  roleEditorOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  roleEditorOptionDescription: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
  memberDetailsTabs: {
    flexDirection: 'row',
    backgroundColor: '#f0f4f5',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  memberDetailsTabItem: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberDetailsTabItemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  memberDetailsTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  memberDetailsTabTextActive: {
    color: '#0f1a1c',
    fontWeight: '700',
  },
  vaultCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  vaultCategoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#fafcfc',
  },
  vaultCategoryChipActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  vaultCategoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  vaultCategoryChipTextActive: {
    color: '#ffffff',
  },
  vaultSearchInput: {
    borderWidth: 1,
    borderColor: '#d8e3e6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f7fbfb',
  },
  vaultFileCard: {
    gap: 8,
  },
  vaultFileCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  vaultFileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  vaultFileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vaultMenuButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  vaultStatusText: {
    fontSize: 12,
    color: '#64748b',
    paddingLeft: 26,
  },
  vaultOpenButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  vaultOpenButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  vaultFolderPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vaultFolderOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#fafcfc',
  },
  vaultFolderOptionActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  vaultFolderOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  vaultFolderOptionTextActive: {
    color: '#ffffff',
  },
  vaultPickerButton: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2f565f',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  vaultPickerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
  },
  vaultSelectedFile: {
    fontSize: 12,
    color: '#64748b',
  },
  vaultActionSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  vaultActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  vaultActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fafcfc',
  },
  vaultActionItemDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fff7f7',
  },
  vaultActionItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
  },
  vaultActionItemDangerText: {
    color: '#b91c1c',
  },
  vaultActionCancel: {
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  vaultActionCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  memberDetailsPreviewContent: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#eef3f3',
    borderRadius: 18,
    padding: 12,
  },
  vaultPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  vaultPreviewHeaderButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f6',
  },
  vaultPreviewHeaderSpacer: {
    width: 36,
    height: 36,
  },
  vaultPreviewTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2f33',
  },
  vaultPreviewBody: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7e0e4',
    backgroundColor: '#ffffff',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaultPreviewState: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 20,
    gap: 8,
  },
  vaultPreviewStateText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  vaultPreviewErrorText: {
    fontSize: 13,
    color: '#b91c1c',
    textAlign: 'center',
  },
  vaultPreviewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  vaultPreviewPdf: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
});
