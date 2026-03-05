import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { MotiView } from 'moti';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { Screen } from '@/components/Screen';
import { MedicationsModal, type Medication } from '@/components/MedicationsModal';
import { SkeletonProfileHeader, SkeletonKPIRow, Skeleton, SkeletonListItem } from '@/components/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/lib/toast';
import { profileRepository } from '@/repositories/profileRepository';
import { supabase, type User } from '@/lib/supabase';

// --- Types (aligned with web profile) ---
type PastSurgery = { name: string; month: number | null; year: number | null };
type FamilyMedicalHistory = { disease: string; relation: string };

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i);

const BLOOD_OPTIONS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const RELATION_OPTIONS = [
  'Mother',
  'Father',
  'Maternal Grandparents',
  'Paternal Grandparents',
  'Siblings (Brother/Sister)',
  'Children',
  'Niece/Nephew',
  'Aunts/Uncles',
  'First Cousins',
];

function formatMonthYear(month: number | null, year: number | null): string {
  if (!month || !year) return 'Date not set';
  const label = MONTH_OPTIONS.find((o) => o.value === month)?.label ?? String(month);
  return `${label} ${year}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

const createMedicationId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function normalizeMedication(item: unknown): Medication {
  const record = (item ?? {}) as Record<string, unknown>;
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : createMedicationId(),
    name: typeof record.name === 'string' ? record.name : '',
    dosage: typeof record.dosage === 'string' ? record.dosage : '',
    frequency: typeof record.frequency === 'string' ? record.frequency : '',
    purpose: typeof record.purpose === 'string' ? record.purpose : '',
    timesPerDay: typeof record.timesPerDay === 'number' ? record.timesPerDay : undefined,
    startDate: typeof record.startDate === 'string' ? record.startDate : undefined,
    endDate: typeof record.endDate === 'string' ? record.endDate : undefined,
    logs: Array.isArray(record.logs) ? (record.logs as Medication['logs']) : undefined,
  };
}

function resolveAuthDisplayName(user: User | null): string {
  if (!user) return '';
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidateKeys = ['full_name', 'name', 'user_name', 'display_name', 'displayName'];
  for (const key of candidateKeys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return user.phone ?? '';
}

// Display DOB as DD-MM-YYYY; accept ISO (YYYY-MM-DD) from DB.
function formatDOBDisplay(isoDate: string | null | undefined): string {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const trimmed = isoDate.trim();
  if (!trimmed) return '';
  // Already DD-MM-YYYY (e.g. 31-12-1990)
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) return trimmed;
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return `${iso[3].padStart(2, '0')}-${iso[2].padStart(2, '0')}-${iso[1]}`;
  return trimmed;
}

// Parse DD-MM-YYYY or YYYY-MM-DD to ISO (YYYY-MM-DD) for DB.
function parseDOBToISO(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const ddmmyyyy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return trimmed;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedCard({
  children,
  onPress,
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  delay?: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={[styles.card, style]}
    >
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.cardPressed}>
          {children}
        </Pressable>
      ) : (
        children
      )}
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { selectedProfile } = useProfile();
  const userId = user?.id ?? '';
  const profileId = selectedProfile?.id ?? '';

  const [loading, setLoading] = useState(true);

  // Profile-level personal fields (stored on profiles)
  const [userName, setUserName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [address, setAddress] = useState('');
  const [bmi, setBmi] = useState('');
  const [age, setAge] = useState('');

  // Health arrays (mostly from health table; medications from user_medications)
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergy, setAllergy] = useState<string[]>([]);
  const [treatment, setTreatment] = useState<string[]>([]);
  const [currentMedications, setCurrentMedications] = useState<Medication[]>([]);
  const [previousDiagnosedCondition, setPreviousDiagnosedCondition] = useState<string[]>([]);
  const [childhoodIllness, setChildhoodIllness] = useState<string[]>([]);
  const [longTermTreatments, setLongTermTreatments] = useState<string[]>([]);
  const [pastSurgeries, setPastSurgeries] = useState<PastSurgery[]>([]);
  const [familyMedicalHistory, setFamilyMedicalHistory] = useState<FamilyMedicalHistory[]>([]);

  // Modals
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const [currentMedicalModalOpen, setCurrentMedicalModalOpen] = useState(false);
  const [pastMedicalModalOpen, setPastMedicalModalOpen] = useState(false);
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [medicationsModalOpen, setMedicationsModalOpen] = useState(false);

  // Drafts for modals
  const [personalDraft, setPersonalDraft] = useState({
    userName: '',
    gender: '',
    dob: '',
    phoneNumber: '',
    bloodGroup: '',
    address: '',
  });

  // Fetch from DB: profile-level fields from profiles + health fields from health
  const loadProfile = useCallback(async (showSpinner = true) => {
    if (!userId || !profileId) return;
    if (showSpinner) setLoading(true);
    try {
      const fallbackDisplayName = resolveAuthDisplayName(user);
      if (fallbackDisplayName) {
        setUserName((prev) => prev || fallbackDisplayName);
      }
      // Session phone first (web does this in init + onAuthStateChange)
      const sessionPhone = user?.phone ?? '';
      if (sessionPhone) setPhoneNumber((p) => p || sessionPhone);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name, display_name, phone, gender, address')
        .eq('id', profileId)
        .maybeSingle();

      if (profileError) {
        console.warn('Profile fields fetch error', profileError);
      }
      if (profileData) {
        const displayName = profileData.display_name?.trim() || profileData.name?.trim() || '';
        if (displayName) setUserName(displayName);
        setPhoneNumber((p) => profileData.phone || p || '');
        setGender((p) => profileData.gender || p || '');
        setAddress((p) => profileData.address || p || '');
      }

      // Health: same select as web - NOW FILTERED BY PROFILE_ID
      const { data: healthData, error: healthError } = await supabase
        .from('health')
        .select(
          'date_of_birth, blood_group, current_diagnosed_condition, allergies, ongoing_treatments, bmi, age, previous_diagnosed_conditions, past_surgeries, childhood_illness, long_term_treatments, family_history'
        )
        .eq('profile_id', profileId)
        .maybeSingle();

      if (healthError) {
        console.warn('Profile health fetch error', healthError);
      }
      if (healthData) {
        setDob(healthData.date_of_birth ?? '');
        setBloodGroup(healthData.blood_group ?? '');
        setBmi(healthData.bmi != null ? String(healthData.bmi) : '');
        setAge(healthData.age != null ? String(healthData.age) : '');
        setConditions((healthData.current_diagnosed_condition as string[]) ?? []);
        setAllergy((healthData.allergies as string[]) ?? []);
        setTreatment((healthData.ongoing_treatments as string[]) ?? []);
        setPreviousDiagnosedCondition((healthData.previous_diagnosed_conditions as string[]) ?? []);
        setPastSurgeries((healthData.past_surgeries as PastSurgery[]) ?? []);
        setChildhoodIllness((healthData.childhood_illness as string[]) ?? []);
        setLongTermTreatments((healthData.long_term_treatments as string[]) ?? []);
        const fam = (healthData.family_history as { familyMedicalHistory?: FamilyMedicalHistory[] } | null)?.familyMedicalHistory;
        setFamilyMedicalHistory(Array.isArray(fam) ? fam : []);
      }
    } catch (e) {
      console.warn('Profile load error', e);
    } finally {
      setLoading(false);
    }
  }, [user, userId, profileId, user?.phone]);

  useEffect(() => {
    if (!isFocused) return;
    loadProfile();
  }, [isFocused, loadProfile]);

  useEffect(() => {
    if (!user?.id || !profileId) {
      setCurrentMedications([]);
      return;
    }
    if (!isFocused) return;

    let isActive = true;

    const loadMedications = async () => {
      const { data, error } = await supabase
        .from('user_medications')
        .select('medications')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Medications fetch error:', error);
        }
        setCurrentMedications([]);
        return;
      }

      const meds = Array.isArray(data?.medications)
        ? data?.medications.map(normalizeMedication)
        : [];
      setCurrentMedications(meds);
    };

    loadMedications();

    return () => {
      isActive = false;
    };
  }, [isFocused, user?.id, profileId]);

  const initials = useMemo(() => getInitials(userName || 'Profile'), [userName]);
  const genderBadgeStyle = useMemo(() => {
    const g = gender.trim().toLowerCase();
    if (g === 'male') return styles.badgeMale;
    if (g === 'female') return styles.badgeFemale;
    return styles.badgeNeutral;
  }, [gender]);

  const openPersonalModal = () => {
    setPersonalDraft({
      userName,
      gender,
      dob: formatDOBDisplay(dob),
      phoneNumber,
      bloodGroup,
      address,
    });
    setPersonalModalOpen(true);
  };

  const savePersonal = async () => {
    if (!profileId || !userId) {
      toast.error('Error', 'Please select a profile first.');
      return;
    }
    const dobISO = parseDOBToISO(personalDraft.dob);
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        display_name: personalDraft.userName.trim() || null,
        phone: personalDraft.phoneNumber.trim() || null,
        gender: personalDraft.gender.trim() || null,
        address: personalDraft.address.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);
    const { error: healthError } = await supabase
      .from('health')
      .update({
        date_of_birth: dobISO || null,
        blood_group: personalDraft.bloodGroup.trim() || null,
      })
      .eq('profile_id', profileId);

    if (profileError || healthError) {
      toast.error('Error', (profileError ?? healthError)?.message ?? 'Failed to save');
      return;
    }
    setUserName(personalDraft.userName.trim());
    setGender(personalDraft.gender);
    setDob(dobISO);
    setPhoneNumber(personalDraft.phoneNumber);
    setBloodGroup(personalDraft.bloodGroup);
    setAddress(personalDraft.address);
    setPersonalModalOpen(false);
    toast.success('Saved', 'Personal information updated.');
  };

  const saveCurrentMedical = async () => {
    if (!profileId || !userId) {
      toast.error('Error', 'Please select a profile first.');
      return;
    }
    const existing = await profileRepository.getHealthProfile(profileId);
    const base = (existing as Record<string, unknown>) ?? {};
    const healthData = {
      profile_id: profileId, // Use profile_id instead of user_id
      user_id: userId, // Keep user_id for reference
      current_diagnosed_condition: conditions.map((c) => c.trim()).filter(Boolean),
      allergies: allergy.map((a) => a.trim()).filter(Boolean),
      ongoing_treatments: treatment.map((t) => t.trim()).filter(Boolean),
      date_of_birth: base.date_of_birth ?? dob,
      blood_group: base.blood_group ?? bloodGroup,
      bmi: base.bmi,
      age: base.age,
      previous_diagnosed_conditions: base.previous_diagnosed_conditions ?? previousDiagnosedCondition,
      past_surgeries: base.past_surgeries ?? pastSurgeries,
      childhood_illness: base.childhood_illness ?? childhoodIllness,
      long_term_treatments: base.long_term_treatments ?? longTermTreatments,
    };
    const { error } = await supabase.from('health').upsert(healthData, { onConflict: 'profile_id' });
    if (error) {
      toast.error('Error', error.message);
      return;
    }
    setCurrentMedicalModalOpen(false);
    toast.success('Saved', 'Current medical status updated.');
  };

  const addMedication = async (medication: Medication) => {
    if (!user?.id || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      toast.warning('Missing info', 'Please fill Name, Dosage, and Frequency.');
      return;
    }

    const newMedication: Medication = {
      id: createMedicationId(),
      name: medication.name.trim(),
      dosage: medication.dosage.trim(),
      purpose: medication.purpose.trim(),
      frequency: medication.frequency.trim(),
      timesPerDay: medication.timesPerDay || 1,
      startDate: medication.startDate || new Date().toISOString().split('T')[0],
      endDate: medication.endDate || undefined,
      logs: [],
    };

    const updatedMedications = [...currentMedications, newMedication];

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId, // Use profile_id instead of user_id
          user_id: user.id, // Keep user_id for reference
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setCurrentMedications(updatedMedications);
    } catch (error: any) {
      console.error('Add medication error:', error);
      toast.error('Save failed', error?.message || 'Please try again.');
    }
  };

  const updateMedication = async (medication: Medication) => {
    if (!user?.id || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      toast.warning('Missing info', 'Please fill Name, Dosage, and Frequency.');
      return;
    }

    const updatedMedications = currentMedications.map((m) => (m.id === medication.id ? medication : m));

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId, // Use profile_id instead of user_id
          user_id: user.id, // Keep user_id for reference
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setCurrentMedications(updatedMedications);
    } catch (error: any) {
      console.error('Update medication error:', error);
      toast.error('Update failed', error?.message || 'Please try again.');
    }
  };

  const deleteMedication = async (id: string) => {
    if (!user?.id || !profileId) return;

    const updatedMedications = currentMedications.filter((m) => m.id !== id);

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId, // Use profile_id instead of user_id
          user_id: user.id, // Keep user_id for reference
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setCurrentMedications(updatedMedications);
    } catch (error: any) {
      console.error('Delete medication error:', error);
      toast.error('Delete failed', error?.message || 'Please try again.');
    }
  };

  const logMedicationDose = async (medicationId: string, taken: boolean) => {
    if (!user?.id || !profileId) return;

    const newLog = {
      medicationId,
      timestamp: new Date().toISOString(),
      taken,
    };

    const updatedMedications = currentMedications.map((m) => {
      if (m.id === medicationId) {
        return {
          ...m,
          logs: [...(m.logs || []), newLog],
        };
      }
      return m;
    });

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId, // Use profile_id instead of user_id
          user_id: user.id, // Keep user_id for reference
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setCurrentMedications(updatedMedications);
    } catch (error: any) {
      console.error('Failed to log dose:', error);
      toast.error('Log failed', error?.message || 'Please try again.');
    }
  };

  const savePastMedical = async () => {
    if (!profileId || !userId) {
      toast.error('Error', 'Please select a profile first.');
      return;
    }
    const existing = await profileRepository.getHealthProfile(profileId);
    const base = (existing as Record<string, unknown>) ?? {};
    const pastData = {
      profile_id: profileId, // Use profile_id instead of user_id
      user_id: userId, // Keep user_id for reference
      previous_diagnosed_conditions: previousDiagnosedCondition.map((c) => c.trim()).filter(Boolean),
      past_surgeries: pastSurgeries
        .map((s) => ({ name: s.name.trim(), month: s.month ?? null, year: s.year ?? null }))
        .filter((s) => s.name),
      childhood_illness: childhoodIllness.map((c) => c.trim()).filter(Boolean),
      long_term_treatments: longTermTreatments.map((t) => t.trim()).filter(Boolean),
      date_of_birth: base.date_of_birth ?? dob,
      blood_group: base.blood_group ?? bloodGroup,
      bmi: base.bmi,
      age: base.age,
      current_diagnosed_condition: base.current_diagnosed_condition ?? conditions,
      allergies: base.allergies ?? allergy,
      ongoing_treatments: base.ongoing_treatments ?? treatment,
    };
    const { error } = await supabase.from('health').upsert(pastData, { onConflict: 'profile_id' });
    if (error) {
      toast.error('Error', error.message);
      return;
    }
    setPastMedicalModalOpen(false);
    toast.success('Saved', 'Past medical history updated.');
  };

  const saveFamily = async () => {
    if (!profileId || !userId) {
      toast.error('Error', 'Please select a profile first.');
      return;
    }
    const { error } = await supabase
      .from('health')
      .upsert(
        {
          profile_id: profileId, // Use profile_id instead of user_id
          user_id: userId, // Keep user_id for reference
          family_history: { familyMedicalHistory },
        },
        { onConflict: 'profile_id' }
      );
    if (error) {
      toast.error('Error', error.message);
      return;
    }
    setFamilyModalOpen(false);
    toast.success('Saved', 'Family medical history updated.');
  };

  const exportProfilePdf = async () => {
    try {
      const list = (items: string[]) =>
        items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p>None</p>';
      const meds =
        currentMedications.length > 0
          ? `<ul>${currentMedications
            .map(
              (m) =>
                `<li><strong>${escapeHtml(m.name)}</strong> — ${escapeHtml(
                  m.dosage || '—'
                )} · ${escapeHtml(m.frequency || '—')}${m.purpose ? ` · ${escapeHtml(m.purpose)}` : ''}</li>`
            )
            .join('')}</ul>`
          : '<p>None</p>';
      const surgeries =
        pastSurgeries.length > 0
          ? `<ul>${pastSurgeries
            .map(
              (s) =>
                `<li><strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(
                  formatMonthYear(s.month, s.year)
                )}</li>`
            )
            .join('')}</ul>`
          : '<p>None</p>';
      const family =
        familyMedicalHistory.length > 0
          ? `<ul>${familyMedicalHistory
            .map(
              (f) =>
                `<li><strong>${escapeHtml(f.relation)}</strong>: ${escapeHtml(f.disease)}</li>`
            )
            .join('')}</ul>`
          : '<p>None</p>';

      const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Arial, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
            .page { padding: 24px; }
            .header {
              background: linear-gradient(135deg, #14b8a6, #0f766e);
              color: #fff;
              padding: 24px;
              border-radius: 16px;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .logo {
              width: 44px;
              height: 44px;
              border-radius: 12px;
              background: rgba(255,255,255,0.18);
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              font-size: 22px;
              letter-spacing: 0.5px;
            }
            .brand-text { font-size: 20px; font-weight: 700; }
            .title { font-size: 22px; font-weight: 700; margin-top: 10px; }
            .subtitle { font-size: 12px; opacity: 0.9; margin-top: 6px; }
            h2 { margin-top: 22px; color: #0f172a; }
            h3 { margin: 12px 0 6px; font-size: 14px; color: #0f172a; }
            .muted { color: #64748b; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              padding: 14px;
              margin-top: 10px;
              background: #fff;
              box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
            }
            ul { margin: 6px 0 0 18px; }
            p { margin: 6px 0; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="brand">
                <div class="logo">V</div>
                <div class="brand-text">G1</div>
              </div>
              <div class="title">Medical Information Report</div>
              <div class="subtitle">Generated on ${escapeHtml(new Date().toLocaleDateString('en-US'))}</div>
            </div>

            <h2>Personal Information</h2>
            <div class="card grid">
              <div><strong>Name:</strong> ${escapeHtml(userName || '—')}</div>
              <div><strong>Gender:</strong> ${escapeHtml(gender || '—')}</div>
              <div><strong>Date of Birth:</strong> ${escapeHtml(formatDOBDisplay(dob) || '—')}</div>
              <div><strong>Phone:</strong> ${escapeHtml(phoneNumber || '—')}</div>
              <div><strong>Blood Group:</strong> ${escapeHtml(bloodGroup || '—')}</div>
              <div><strong>Address:</strong> ${escapeHtml(address || '—')}</div>
              <div><strong>BMI:</strong> ${escapeHtml(bmi || '—')}</div>
              <div><strong>Age:</strong> ${escapeHtml(age || '—')}</div>
            </div>

            <h2>Current Medical Status</h2>
            <div class="card">
              <h3>Current conditions</h3>
              ${list(conditions)}
              <h3>Allergies</h3>
              ${list(allergy)}
              <h3>Ongoing treatments</h3>
              ${list(treatment)}
              <h3>Current medications</h3>
              ${meds}
            </div>

            <h2>Past Medical History</h2>
            <div class="card">
              <h3>Previous conditions</h3>
              ${list(previousDiagnosedCondition)}
              <h3>Past surgeries</h3>
              ${surgeries}
              <h3>Childhood illness</h3>
              ${list(childhoodIllness)}
              <h3>Long-term treatments</h3>
              ${list(longTermTreatments)}
            </div>

            <h2>Family Medical History</h2>
            <div class="card">
              ${family}
            </div>
          </div>
        </body>
      </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF' });
      } else {
        toast.success('Exported', `PDF saved to: ${uri}`);
      }
    } catch (error: any) {
      console.error('Export PDF error:', error);
      toast.error('Export failed', error?.message || 'Unable to export PDF.');
    }
  };

  if (!userId) {
    return (
      <Screen
        contentContainerStyle={styles.screenContent}
        safeAreaEdges={['left', 'right', 'bottom']}
      >
        <View style={styles.centered}>
          <Text style={styles.subtitle}>Sign in to view your profile.</Text>
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#eef3f3' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60 }}>
          <SkeletonProfileHeader />
          <SkeletonKPIRow />
          <View style={{ marginTop: 24 }}>
            <Skeleton width={120} height={16} style={{ marginBottom: 12 }} />
            <SkeletonListItem />
            <SkeletonListItem />
          </View>
          <View style={{ marginTop: 20 }}>
            <Skeleton width={140} height={16} style={{ marginBottom: 12 }} />
            <SkeletonListItem />
            <SkeletonListItem />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      innerStyle={styles.screenInner}
      safeAreaEdges={['left', 'right', 'bottom']}
    >
      <View style={styles.pageHeaderRow}>
        <Text style={styles.pageTitle}>Profile</Text>
        <Pressable
          onPress={exportProfilePdf}
          style={({ pressed }) => [styles.exportTopButton, pressed && styles.exportTopButtonPressed]}
        >
          <MaterialCommunityIcons name="file-pdf-box" size={22} color="#111827" />
          <Text style={styles.exportTopText}>Export PDF</Text>
        </Pressable>
      </View>
      {/* Header card: avatar, name, contact info, edit + export */}
      <AnimatedCard delay={0}>
        <View style={styles.headerCardRow}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{userName || 'No name'}</Text>
            {gender ? (
              <View style={[styles.badge, genderBadgeStyle]}>
                <Text style={styles.badgeText}>{gender}</Text>
              </View>
            ) : null}
            {phoneNumber ? (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="phone-outline" size={14} color="#5a6b72" />
                <Text style={styles.infoText} numberOfLines={1}>{phoneNumber}</Text>
              </View>
            ) : null}
            {dob ? (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="calendar-outline" size={14} color="#5a6b72" />
                <Text style={styles.infoText}>{formatDOBDisplay(dob)}</Text>
              </View>
            ) : null}
            {address ? (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="map-marker-outline" size={14} color="#5a6b72" />
                <Text style={styles.infoText} numberOfLines={2}>{address}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={openPersonalModal}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <MaterialCommunityIcons name="pencil" size={20} color="#0f766e" />
            </Pressable>
          </View>
        </View>
      </AnimatedCard>

      {/* KPI row */}
      <View style={styles.kpiRow}>
        <Animated.View entering={FadeInDown.delay(80).springify()} style={[styles.kpiCard, styles.kpiBlood]}>
          <MaterialCommunityIcons name="water" size={18} color="#b91c1c" />
          <Text style={styles.kpiLabel}>Blood</Text>
          <Text style={styles.kpiValue} adjustsFontSizeToFit numberOfLines={1}>{bloodGroup || '—'}</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120).springify()} style={[styles.kpiCard, styles.kpiBmi]}>
          <MaterialCommunityIcons name="counter" size={18} color="#1d4ed8" />
          <Text style={styles.kpiLabel}>BMI</Text>
          <Text style={styles.kpiValue} adjustsFontSizeToFit numberOfLines={1}>
            {bmi ? (
              <>
                {bmi}
                <Text style={styles.kpiUnit}> kg/m²</Text>
              </>
            ) : (
              '—'
            )}
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(160).springify()} style={[styles.kpiCard, styles.kpiAge]}>
          <MaterialCommunityIcons name="calendar-check" size={18} color="#6b21a8" />
          <Text style={styles.kpiLabel}>Age</Text>
          <Text style={styles.kpiValue} adjustsFontSizeToFit numberOfLines={1}>{age || '—'}</Text>
        </Animated.View>
      </View>

      {/* Health onboarding — step-by-step setup */}
      <AnimatedCard delay={180}>
        <Pressable
          onPress={() => router.push('/health-onboarding')}
          style={({ pressed }) => [styles.healthOnboardingCard, pressed && styles.healthOnboardingCardPressed]}
        >
          <View style={styles.healthOnboardingIconWrap}>
            <MaterialCommunityIcons name="clipboard-plus-outline" size={24} color="#0f766e" />
          </View>
          <View style={styles.healthOnboardingTextWrap}>
            <Text style={styles.healthOnboardingTitle}>Set up health profile</Text>
            <Text style={styles.healthOnboardingSubtitle}>
              Answer a few questions to build your medical profile securely.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#64748b" />
        </Pressable>
      </AnimatedCard>

      {/* Current Medical Status */}
      <AnimatedCard delay={200}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconRed}>
            <MaterialCommunityIcons name="heart-pulse" size={20} color="#b91c1c" />
          </View>
          <Text style={styles.sectionTitle}>Current Medical Status</Text>
          <Pressable
            onPress={() => setCurrentMedicalModalOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <MaterialCommunityIcons name="pencil" size={18} color="#0f766e" />
          </Pressable>
        </View>
        <View style={styles.sectionBody}>
          <SectionLabel label="Current conditions" />
          <TagList items={conditions} emptyLabel="No conditions" variant="red" />
          <SectionLabel label="Allergies" />
          <TagList items={allergy} emptyLabel="No allergies" variant="red" />
          <SectionLabel label="Ongoing treatments" />
          <TagList items={treatment} emptyLabel="None" variant="red" />
          <SectionLabel label="Current medication" />
          {currentMedications.length === 0 ? (
            <Text style={styles.emptyText}>No medications</Text>
          ) : (
            currentMedications.map((med, i) => (
              <View key={i} style={styles.medRow}>
                <MaterialCommunityIcons name="pill" size={16} color="#0f766e" />
                <View style={styles.medInfo}>
                  <Text style={styles.medName}>{med.name}</Text>
                  <Text style={styles.medMeta}>Dosage: {med.dosage || '—'} · {med.frequency || '—'}</Text>
                </View>
              </View>
            ))
          )}
          <Pressable
            onPress={() => setMedicationsModalOpen(true)}
            style={({ pressed }) => [styles.manageButton, pressed && styles.manageButtonPressed]}
          >
            <MaterialCommunityIcons name="pill" size={16} color="#ffffff" />
            <Text style={styles.manageButtonText}>Manage medications</Text>
          </Pressable>
        </View>
      </AnimatedCard>

      {/* Past Medical History */}
      <AnimatedCard delay={240}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconBlue}>
            <MaterialCommunityIcons name="history" size={20} color="#1d4ed8" />
          </View>
          <Text style={styles.sectionTitle}>Past Medical History</Text>
          <Pressable
            onPress={() => setPastMedicalModalOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <MaterialCommunityIcons name="pencil" size={18} color="#0f766e" />
          </Pressable>
        </View>
        <View style={styles.sectionBody}>
          <SectionLabel label="Previous conditions" />
          <TagList items={previousDiagnosedCondition} emptyLabel="None" variant="red" />
          <SectionLabel label="Past surgeries" />
          {pastSurgeries.length === 0 ? (
            <Text style={styles.emptyText}>None</Text>
          ) : (
            pastSurgeries.map((s, i) => (
              <View key={i} style={styles.surgeryRow}>
                <Text style={styles.surgeryName}>{s.name}</Text>
                <Text style={styles.surgeryDate}>{formatMonthYear(s.month, s.year)}</Text>
              </View>
            ))
          )}
          <SectionLabel label="Childhood illness" />
          <TagList items={childhoodIllness} emptyLabel="None" variant="red" />
          <SectionLabel label="Long-term treatments" />
          <TagList items={longTermTreatments} emptyLabel="None" variant="red" />
        </View>
      </AnimatedCard>

      {/* Family Medical History */}
      <AnimatedCard delay={280}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconGreen}>
            <MaterialCommunityIcons name="account-group" size={20} color="#15803d" />
          </View>
          <Text style={styles.sectionTitle}>Family Medical History</Text>
          <Pressable
            onPress={() => setFamilyModalOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <MaterialCommunityIcons name="pencil" size={18} color="#0f766e" />
          </Pressable>
        </View>
        <View style={styles.sectionBody}>
          {familyMedicalHistory.length === 0 ? (
            <Text style={styles.emptyText}>No family history added</Text>
          ) : (
            familyMedicalHistory.map((f, i) => (
              <View key={i} style={styles.familyRow}>
                <Text style={styles.familyRelation}>{f.relation}</Text>
                <Text style={styles.familyDisease}>{f.disease}</Text>
              </View>
            ))
          )}
        </View>
      </AnimatedCard>

      <View style={styles.bottomPad} />

      {/* Modals */}
      <PersonalInfoModal
        visible={personalModalOpen}
        draft={personalDraft}
        setDraft={setPersonalDraft}
        bmi={bmi}
        onClose={() => setPersonalModalOpen(false)}
        onSave={savePersonal}
      />
      <CurrentMedicalModal
        visible={currentMedicalModalOpen}
        conditions={conditions}
        setConditions={setConditions}
        allergy={allergy}
        setAllergy={setAllergy}
        treatment={treatment}
        setTreatment={setTreatment}
        onClose={() => setCurrentMedicalModalOpen(false)}
        onSave={saveCurrentMedical}
      />
      <MedicationsModal
        visible={medicationsModalOpen}
        medications={currentMedications}
        onClose={() => setMedicationsModalOpen(false)}
        onAdd={addMedication}
        onUpdate={updateMedication}
        onDelete={deleteMedication}
        onLogDose={logMedicationDose}
      />
      <PastMedicalModal
        visible={pastMedicalModalOpen}
        previousDiagnosedCondition={previousDiagnosedCondition}
        setPreviousDiagnosedCondition={setPreviousDiagnosedCondition}
        pastSurgeries={pastSurgeries}
        setPastSurgeries={setPastSurgeries}
        childhoodIllness={childhoodIllness}
        setChildhoodIllness={setChildhoodIllness}
        longTermTreatments={longTermTreatments}
        setLongTermTreatments={setLongTermTreatments}
        onClose={() => setPastMedicalModalOpen(false)}
        onSave={savePastMedical}
      />
      <FamilyHistoryModal
        visible={familyModalOpen}
        familyMedicalHistory={familyMedicalHistory}
        setFamilyMedicalHistory={setFamilyMedicalHistory}
        onClose={() => setFamilyModalOpen(false)}
        onSave={saveFamily}
      />
    </Screen>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>;
}

function TagList({
  items,
  emptyLabel,
  variant = 'red',
}: {
  items: string[];
  emptyLabel: string;
  variant?: 'red' | 'blue';
}) {
  const tagStyle = variant === 'red' ? styles.tagRed : styles.tagBlue;
  if (items.length === 0) {
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }
  return (
    <View style={styles.tagWrap}>
      {items.map((item, i) => (
        <View key={i} style={[styles.tag, tagStyle]}>
          <Text style={styles.tagText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

type PersonalDraft = {
  userName: string;
  gender: string;
  dob: string;
  phoneNumber: string;
  bloodGroup: string;
  address: string;
};

function PersonalInfoModal({
  visible,
  draft,
  setDraft,
  bmi,
  onClose,
  onSave,
}: {
  visible: boolean;
  draft: PersonalDraft;
  setDraft: React.Dispatch<React.SetStateAction<PersonalDraft>>;
  bmi: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [genderOpen, setGenderOpen] = useState(false);
  const [bloodOpen, setBloodOpen] = useState(false);
  const [dobOpen, setDobOpen] = useState(false);
  const [dobMonthOpen, setDobMonthOpen] = useState(false);
  const [dobYearOpen, setDobYearOpen] = useState(false);
  const [dobMonth, setDobMonth] = useState<number | null>(null);
  const [dobYear, setDobYear] = useState<number | null>(null);
  const [calendarKey, setCalendarKey] = useState(0);
  const [calendarCurrentOverride, setCalendarCurrentOverride] = useState<string | null>(null);

  const selectedDobIso = useMemo(() => parseDOBToISO(draft.dob), [draft.dob]);
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  useEffect(() => {
    if (!dobOpen) return;
    const source = selectedDobIso || todayIso;
    const [y, m] = source.split('-').map((part) => parseInt(part, 10));
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      setDobYear(y);
      setDobMonth(m);
    }
  }, [dobOpen, selectedDobIso, todayIso]);

  useEffect(() => {
    if (!dobOpen || !dobYear || !dobMonth) return;
    const next = `${dobYear}-${String(dobMonth).padStart(2, '0')}-01`;
    setCalendarCurrentOverride((prev) => (prev === next ? prev : next));
    setCalendarKey((k) => k + 1);
  }, [dobMonth, dobOpen, dobYear]);

  const markedDates = useMemo(() => {
    if (!selectedDobIso) return undefined;
    return {
      [selectedDobIso]: { selected: true, selectedColor: '#0f766e' },
    } as Record<string, { selected: boolean; selectedColor: string }>;
  }, [selectedDobIso]);
  const calendarCurrent = useMemo(() => {
    return calendarCurrentOverride || selectedDobIso || todayIso;
  }, [calendarCurrentOverride, selectedDobIso, todayIso]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <MotiView
          from={{ translateY: 100, opacity: 0.5 }}
          animate={{ translateY: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Personal Info</Text>
              <Pressable onPress={onClose} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <InputRow label="Full name" value={draft.userName} onChange={(v) => setDraft((p) => ({ ...p, userName: v }))} placeholder="Full name" />
            <Pressable onPress={() => setDobOpen(true)}>
              <View pointerEvents="none">
                <InputRow label="Date of birth" value={draft.dob} placeholder="DD-MM-YYYY" editable={false} />
              </View>
            </Pressable>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Gender</Text>
              <Pressable
                onPress={() => setGenderOpen(true)}
                style={styles.selectInput}
              >
                <Text
                  style={[
                    styles.selectInputText,
                    !draft.gender && styles.selectInputPlaceholder,
                  ]}
                >
                  {draft.gender || 'Male / Female / Other'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
              </Pressable>
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Blood group</Text>
              <Pressable
                onPress={() => setBloodOpen(true)}
                style={styles.selectInput}
              >
                <Text
                  style={[
                    styles.selectInputText,
                    !draft.bloodGroup && styles.selectInputPlaceholder,
                  ]}
                >
                  {draft.bloodGroup || 'e.g. O+'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
              </Pressable>
            </View>
            <InputRow label="Address" value={draft.address} onChange={(v) => setDraft((p) => ({ ...p, address: v }))} placeholder="Address" multiline />
            <InputRow label="Phone (read-only)" value={draft.phoneNumber} placeholder="Phone" editable={false} />
            <InputRow label="BMI (read-only)" value={bmi} editable={false} />
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.modalSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
          </Pressable>
        </MotiView>
      </Pressable>
      <Modal visible={genderOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setGenderOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select gender</Text>
              <Pressable onPress={() => setGenderOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <View style={styles.modalScroll}>
              {GENDER_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setDraft((p) => ({ ...p, gender: option }));
                    setGenderOpen(false);
                  }}
                  style={styles.selectRow}
                >
                  <Text style={styles.selectRowText}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={bloodOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setBloodOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select blood group</Text>
              <Pressable onPress={() => setBloodOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <View style={styles.modalScroll}>
              {BLOOD_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setDraft((p) => ({ ...p, bloodGroup: option }));
                    setBloodOpen(false);
                  }}
                  style={styles.selectRow}
                >
                  <Text style={styles.selectRowText}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={dobOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setDobOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date of birth</Text>
              <Pressable onPress={() => setDobOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <View style={styles.modalScroll}>
              <View style={styles.dobPickerRow}>
                <View style={styles.dobPickerCol}>
                  <Text style={styles.inputLabel}>Month</Text>
                  <Pressable
                    onPress={() => {
                      setDobMonthOpen((prev) => !prev);
                      setDobYearOpen(false);
                    }}
                    style={styles.selectInput}
                  >
                    <Text style={styles.selectInputText}>
                      {MONTH_OPTIONS.find((opt) => opt.value === dobMonth)?.label ?? 'Select month'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
                  </Pressable>
                  {dobMonthOpen ? (
                    <View style={styles.selectMenu}>
                      <ScrollView style={styles.selectMenuScroll} nestedScrollEnabled>
                        {MONTH_OPTIONS.map((opt) => (
                          <Pressable
                            key={opt.value}
                            onPress={() => {
                              setDobMonth(opt.value);
                              setDobMonthOpen(false);
                            }}
                            style={styles.selectRow}
                          >
                            <Text style={styles.selectRowText}>{opt.label}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
                <View style={styles.dobPickerCol}>
                  <Text style={styles.inputLabel}>Year</Text>
                  <Pressable
                    onPress={() => {
                      setDobYearOpen((prev) => !prev);
                      setDobMonthOpen(false);
                    }}
                    style={styles.selectInput}
                  >
                    <Text style={styles.selectInputText}>
                      {dobYear ?? 'Select year'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
                  </Pressable>
                  {dobYearOpen ? (
                    <View style={styles.selectMenu}>
                      <ScrollView style={styles.selectMenuScroll} nestedScrollEnabled>
                        {YEAR_OPTIONS.map((year) => (
                          <Pressable
                            key={year}
                            onPress={() => {
                              setDobYear(year);
                              setDobYearOpen(false);
                            }}
                            style={styles.selectRow}
                          >
                            <Text style={styles.selectRowText}>{year}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              </View>
              <Calendar
                key={`dob-cal-${calendarKey}`}
                current={calendarCurrent}
                markedDates={markedDates}
                onDayPress={(day) => {
                  setDraft((p) => ({ ...p, dob: formatDOBDisplay(day.dateString) }));
                  setDobMonth(day.month);
                  setDobYear(day.year);
                  setDobOpen(false);
                }}
                onMonthChange={(month) => {
                  setDobMonth(month.month);
                  setDobYear(month.year);
                }}
                maxDate={new Date().toISOString().split('T')[0]}
                theme={{
                  todayTextColor: '#0f766e',
                  selectedDayBackgroundColor: '#0f766e',
                  arrowColor: '#0f766e',
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </BlurView>
    </Modal>
  );
}

function InputRow({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  editable = true,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange ?? (() => { })}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        multiline={multiline}
        editable={editable}
      />
    </View>
  );
}

function CurrentMedicalModal({
  visible,
  conditions,
  setConditions,
  allergy,
  setAllergy,
  treatment,
  setTreatment,
  onClose,
  onSave,
}: {
  visible: boolean;
  conditions: string[];
  setConditions: React.Dispatch<React.SetStateAction<string[]>>;
  allergy: string[];
  setAllergy: React.Dispatch<React.SetStateAction<string[]>>;
  treatment: string[];
  setTreatment: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalValue, setAddModalValue] = useState('');
  const [addModalLabel, setAddModalLabel] = useState('');
  const [addModalPlaceholder, setAddModalPlaceholder] = useState('');
  const [addTarget, setAddTarget] = useState<'condition' | 'allergy' | 'treatment' | null>(null);

  const openAddModal = (target: 'condition' | 'allergy' | 'treatment') => {
    setAddTarget(target);
    if (target === 'condition') {
      setAddModalLabel('Add condition');
      setAddModalPlaceholder('e.g. Diabetes');
    } else if (target === 'allergy') {
      setAddModalLabel('Add allergy');
      setAddModalPlaceholder('e.g. Penicillin');
    } else {
      setAddModalLabel('Add treatment');
      setAddModalPlaceholder('e.g. Physiotherapy');
    }
    setAddModalValue('');
    setAddModalOpen(true);
  };

  const saveAddModal = () => {
    const value = addModalValue.trim();
    if (!value) {
      toast.warning('Missing info', 'Please enter a value.');
      return;
    }
    if (addTarget === 'condition') {
      setConditions((prev) => [...prev, value]);
    } else if (addTarget === 'allergy') {
      setAllergy((prev) => [...prev, value]);
    } else if (addTarget === 'treatment') {
      setTreatment((prev) => [...prev, value]);
    }
    setAddModalOpen(false);
    setAddTarget(null);
    setAddModalValue('');
  };

  const handleClose = () => {
    setAddModalOpen(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Current Medical Status</Text>
            <Pressable onPress={handleClose} style={styles.modalClose}>
              <MaterialCommunityIcons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalSectionHeading}>Conditions</Text>
            {conditions.map((c, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{c}</Text>
                  <Pressable onPress={() => setConditions((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => openAddModal('condition')} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add condition</Text>
            </Pressable>

            <Text style={styles.modalSectionHeading}>Allergies</Text>
            {allergy.map((a, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{a}</Text>
                  <Pressable onPress={() => setAllergy((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => openAddModal('allergy')} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add allergy</Text>
            </Pressable>

            <Text style={styles.modalSectionHeading}>Ongoing treatments</Text>
            {treatment.map((t, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{t}</Text>
                  <Pressable onPress={() => setTreatment((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => openAddModal('treatment')} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add treatment</Text>
            </Pressable>

          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable onPress={handleClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.modalSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <Modal visible={addModalOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setAddModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{addModalLabel}</Text>
              <Pressable onPress={() => setAddModalOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <View style={styles.modalScroll}>
              <InputRow
                label={addModalLabel}
                value={addModalValue}
                onChange={setAddModalValue}
                placeholder={addModalPlaceholder}
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable onPress={() => setAddModalOpen(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveAddModal} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function PastMedicalModal({
  visible,
  previousDiagnosedCondition,
  setPreviousDiagnosedCondition,
  pastSurgeries,
  setPastSurgeries,
  childhoodIllness,
  setChildhoodIllness,
  longTermTreatments,
  setLongTermTreatments,
  onClose,
  onSave,
}: {
  visible: boolean;
  previousDiagnosedCondition: string[];
  setPreviousDiagnosedCondition: React.Dispatch<React.SetStateAction<string[]>>;
  pastSurgeries: PastSurgery[];
  setPastSurgeries: React.Dispatch<React.SetStateAction<PastSurgery[]>>;
  childhoodIllness: string[];
  setChildhoodIllness: React.Dispatch<React.SetStateAction<string[]>>;
  longTermTreatments: string[];
  setLongTermTreatments: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalValue, setAddModalValue] = useState('');
  const [addModalLabel, setAddModalLabel] = useState('');
  const [addModalPlaceholder, setAddModalPlaceholder] = useState('');
  const [addTarget, setAddTarget] = useState<'previous' | 'childhood' | 'longTerm' | null>(null);
  const [surgeryModalOpen, setSurgeryModalOpen] = useState(false);
  const [surgeryName, setSurgeryName] = useState('');
  const [surgeryMonth, setSurgeryMonth] = useState<number | null>(null);
  const [surgeryYear, setSurgeryYear] = useState<number | null>(null);

  const openAddModal = (target: 'previous' | 'childhood' | 'longTerm') => {
    setAddTarget(target);
    if (target === 'previous') {
      setAddModalLabel('Add condition');
      setAddModalPlaceholder('e.g. Thyroid');
    } else if (target === 'childhood') {
      setAddModalLabel('Add childhood illness');
      setAddModalPlaceholder('e.g. Chickenpox');
    } else {
      setAddModalLabel('Add long-term treatment');
      setAddModalPlaceholder('e.g. Physical therapy');
    }
    setAddModalValue('');
    setAddModalOpen(true);
  };

  const saveAddModal = () => {
    const value = addModalValue.trim();
    if (!value) {
      toast.warning('Missing info', 'Please enter a value.');
      return;
    }
    if (addTarget === 'previous') {
      setPreviousDiagnosedCondition((prev) => [...prev, value]);
    } else if (addTarget === 'childhood') {
      setChildhoodIllness((prev) => [...prev, value]);
    } else if (addTarget === 'longTerm') {
      setLongTermTreatments((prev) => [...prev, value]);
    }
    setAddModalOpen(false);
    setAddTarget(null);
    setAddModalValue('');
  };

  const openSurgeryModal = () => {
    setSurgeryName('');
    setSurgeryMonth(null);
    setSurgeryYear(null);
    setSurgeryModalOpen(true);
  };

  const saveSurgeryModal = () => {
    const name = surgeryName.trim();
    if (!name) {
      toast.warning('Missing info', 'Please enter a surgery name.');
      return;
    }
    setPastSurgeries((prev) => [
      ...prev,
      { name, month: surgeryMonth ?? null, year: surgeryYear ?? null },
    ]);
    setSurgeryModalOpen(false);
    setSurgeryName('');
    setSurgeryMonth(null);
    setSurgeryYear(null);
  };

  const handleClose = () => {
    setAddModalOpen(false);
    setSurgeryModalOpen(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Past Medical History</Text>
            <Pressable onPress={handleClose} style={styles.modalClose}>
              <MaterialCommunityIcons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalSectionHeading}>Previous conditions</Text>
            {previousDiagnosedCondition.map((c, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{c}</Text>
                  <Pressable onPress={() => setPreviousDiagnosedCondition((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => openAddModal('previous')} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add condition</Text>
            </Pressable>

            <Text style={styles.modalSectionHeading}>Past surgeries</Text>
            {pastSurgeries.map((s, i) => (
              <View key={i} style={styles.medBlock}>
                <View style={styles.surgeryHeaderRow}>
                  <Text style={styles.surgeryTitle}>{s.name}</Text>
                  <Pressable onPress={() => setPastSurgeries((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
                <Text style={styles.surgeryMeta}>{formatMonthYear(s.month, s.year)}</Text>
              </View>
            ))}
            <Pressable onPress={openSurgeryModal} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add surgery</Text>
            </Pressable>

            <Text style={styles.modalSectionHeading}>Childhood illness</Text>
            {childhoodIllness.map((c, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{c}</Text>
                  <Pressable onPress={() => setChildhoodIllness((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => openAddModal('childhood')} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add</Text>
            </Pressable>

            <Text style={styles.modalSectionHeading}>Long-term treatments</Text>
            {longTermTreatments.map((t, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{t}</Text>
                  <Pressable onPress={() => setLongTermTreatments((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => openAddModal('longTerm')} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable onPress={handleClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.modalSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <Modal visible={addModalOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setAddModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{addModalLabel}</Text>
              <Pressable onPress={() => setAddModalOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <View style={styles.modalScroll}>
              <InputRow
                label={addModalLabel}
                value={addModalValue}
                onChange={setAddModalValue}
                placeholder={addModalPlaceholder}
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable onPress={() => setAddModalOpen(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveAddModal} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={surgeryModalOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setSurgeryModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add surgery</Text>
              <Pressable onPress={() => setSurgeryModalOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <InputRow
                label="Surgery name"
                value={surgeryName}
                onChange={setSurgeryName}
                placeholder="Surgery name"
              />
              <Text style={styles.modalSectionHeading}>Month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {MONTH_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSurgeryMonth(opt.value)}
                    style={[styles.chip, surgeryMonth === opt.value && styles.chipSelected]}
                  >
                    <Text style={surgeryMonth === opt.value ? styles.chipTextSelected : styles.chipText}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.modalSectionHeading}>Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {YEAR_OPTIONS.slice(0, 30).map((y) => (
                  <Pressable
                    key={y}
                    onPress={() => setSurgeryYear(y)}
                    style={[styles.chip, surgeryYear === y && styles.chipSelected]}
                  >
                    <Text style={surgeryYear === y ? styles.chipTextSelected : styles.chipText}>{y}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable onPress={() => setSurgeryModalOpen(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveSurgeryModal} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function FamilyHistoryModal({
  visible,
  familyMedicalHistory,
  setFamilyMedicalHistory,
  onClose,
  onSave,
}: {
  visible: boolean;
  familyMedicalHistory: FamilyMedicalHistory[];
  setFamilyMedicalHistory: React.Dispatch<React.SetStateAction<FamilyMedicalHistory[]>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const [newDisease, setNewDisease] = useState('');
  const [newRelation, setNewRelation] = useState('');

  const openAddModal = () => {
    setNewDisease('');
    setNewRelation('');
    setRelationOpen(false);
    setAddModalOpen(true);
  };

  const saveAddModal = () => {
    const disease = newDisease.trim();
    const relation = newRelation.trim();
    if (!disease || !relation) {
      toast.warning('Missing info', 'Please enter disease and relation.');
      return;
    }
    setFamilyMedicalHistory((prev) => [...prev, { disease, relation }]);
    setRelationOpen(false);
    setAddModalOpen(false);
  };

  const handleClose = () => {
    setAddModalOpen(false);
    setRelationOpen(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Family Medical History</Text>
            <Pressable onPress={handleClose} style={styles.modalClose}>
              <MaterialCommunityIcons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {familyMedicalHistory.map((f, i) => (
              <View key={i} style={styles.listItemCard}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemText}>{f.disease}</Text>
                  <Pressable onPress={() => setFamilyMedicalHistory((prev) => prev.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#b91c1c" />
                  </Pressable>
                </View>
                <Text style={styles.familyItemMeta}>{f.relation}</Text>
              </View>
            ))}
            <Pressable onPress={openAddModal} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={20} color="#FF8000" />
              <Text style={styles.addRowText}>Add entry</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable onPress={handleClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.modalSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <Modal visible={addModalOpen} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setAddModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add family history</Text>
              <Pressable onPress={() => setAddModalOpen(false)} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={24} color="#374151" />
              </Pressable>
            </View>
            <View style={styles.modalScroll}>
              <InputRow
                label="Disease"
                value={newDisease}
                onChange={setNewDisease}
                placeholder="Disease"
              />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Relation</Text>
                <Pressable
                  onPress={() => setRelationOpen((prev) => !prev)}
                  style={styles.selectInput}
                >
                  <Text
                    style={[
                      styles.selectInputText,
                      !newRelation && styles.selectInputPlaceholder,
                    ]}
                  >
                    {newRelation || 'Select relation'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
                </Pressable>
              </View>
              {relationOpen ? (
                <View style={styles.selectMenu}>
                  <ScrollView style={styles.selectMenuScroll} nestedScrollEnabled>
                    {RELATION_OPTIONS.map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setNewRelation(option);
                          setRelationOpen(false);
                        }}
                        style={styles.selectRow}
                      >
                        <Text style={styles.selectRowText}>{option}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
            <View style={styles.modalFooter}>
              <Pressable onPress={() => setAddModalOpen(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveAddModal} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 0,
    paddingBottom: 16,
    justifyContent: 'flex-start',
  },
  screenInner: {
    width: '100%',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#1b2b2f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.98,
  },
  headerCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    marginRight: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ccf0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#99e0e0',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e5a5a',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeMale: { backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#93c5fd' },
  badgeFemale: { backgroundColor: '#fce7f3', borderWidth: 1, borderColor: '#f9a8d4' },
  badgeNeutral: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#4b5563',
    flex: 1,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#99e0e0',
  },
  iconButtonPressed: {
    opacity: 0.8,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
  },
  exportTopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  exportTopButtonPressed: { opacity: 0.85 },
  exportTopText: { fontSize: 12, color: '#111827', fontWeight: '600' },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  kpiBlood: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  kpiBmi: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  kpiAge: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6b7280',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 25,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  kpiUnit: { fontSize: 12, fontWeight: '400', color: '#6b7280' },
  healthOnboardingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.2)',
    backgroundColor: 'rgba(15, 118, 110, 0.06)',
    gap: 14,
  },
  healthOnboardingCardPressed: { opacity: 0.9 },
  healthOnboardingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 118, 110, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthOnboardingTextWrap: { flex: 1 },
  healthOnboardingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  healthOnboardingSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  sectionIconRed: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconBlue: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconGreen: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionBody: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 6,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  tagRed: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  tagBlue: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  medInfo: { flex: 1 },
  medName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  medMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  surgeryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  surgeryName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  surgeryDate: { fontSize: 12, color: '#6b7280' },
  familyRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  familyRelation: { fontSize: 14, fontWeight: '600', color: '#111827' },
  familyDisease: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  bottomPad: { height: 24 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalClose: {
    padding: 4,
  },
  modalScroll: {
    flexShrink: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalSave: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  modalSaveText: { color: '#fff', fontWeight: '700' },
  inputRow: { marginBottom: 14 },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f766e',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d8e3e6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f7fbfb',
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  selectRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  selectRowText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  selectMenu: { marginTop: 6 },
  selectMenuScroll: { maxHeight: 220 },
  selectInput: {
    borderWidth: 1,
    borderColor: '#d8e3e6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#f7fbfb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: { fontSize: 15, color: '#111827', flex: 1 },
  selectInputPlaceholder: { color: '#9ca3af' },
  dobPickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dobPickerCol: { flex: 1 },
  listInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  listItemCard: {
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listItemText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  addRowText: { color: '#FF8000', fontWeight: '600', fontSize: 14 },
  manageButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  manageButtonPressed: { opacity: 0.85 },
  manageButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  modalSectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF8000',
    marginTop: 8,
    marginBottom: 6,
  },
  medBlock: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  surgeryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  surgeryTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  surgeryMeta: { marginTop: 6, fontSize: 12, color: '#6b7280' },
  familyItemMeta: { marginTop: 6, fontSize: 12, color: '#6b7280' },
  surgeryPickers: { marginTop: 8, gap: 8 },
  pickerWrap: {},
  pickerLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    alignSelf: 'flex-start',
  },
  chipSelected: { backgroundColor: '#0f766e' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { fontSize: 13, color: '#fff', fontWeight: '600' },
  familyEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
});
