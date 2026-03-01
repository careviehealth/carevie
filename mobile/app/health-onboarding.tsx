import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import { apiRequest } from '@/api/client';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';

// --- Types (aligned with web) ---
interface MedicationEntry {
  name: string;
  dosage: string;
  frequency: string;
}

interface PastSurgeryEntry {
  name: string;
  month: number | null;
  year: number | null;
}

interface Profile {
  displayName: string;
  dateOfBirth: string;
  bloodGroup: string;
  heightCm: number | null;
  weightKg: number | null;
  currentDiagnosedCondition: string[];
  allergies: string[];
  ongoingTreatments: string[];
  currentMedication: MedicationEntry[];
  previousDiagnosedConditions: string[];
  pastSurgeries: PastSurgeryEntry[];
  childhoodIllness: string[];
  longTermTreatments: string[];
}

type InputType =
  | 'text'
  | 'single-select'
  | 'date'
  | 'multi-text'
  | 'multi-medication'
  | 'multi-surgery';

interface QuestionConfig {
  key: keyof Profile;
  question: string;
  inputType: InputType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

const QUESTIONS: QuestionConfig[] = [
  {
    key: 'displayName',
    question: "What should we call you?",
    inputType: 'text',
    required: true,
    placeholder: 'e.g. John Doe',
  },
  {
    key: 'dateOfBirth',
    question: "What is your date of birth?",
    inputType: 'date',
    required: true,
  },
  {
    key: 'bloodGroup',
    question: "What is your blood group?",
    inputType: 'single-select',
    required: true,
    options: ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Unknown'],
  },
  {
    key: 'heightCm',
    question: "What is your height (in cm)?",
    inputType: 'text',
    required: true,
    placeholder: 'e.g. 175',
  },
  {
    key: 'weightKg',
    question: "What is your weight (in kg)?",
    inputType: 'text',
    required: true,
    placeholder: 'e.g. 83',
  },
  {
    key: 'currentDiagnosedCondition',
    question: 'Current diagnosed condition (if any)?',
    inputType: 'multi-text',
    placeholder: 'e.g. Asthma / Diabetes',
  },
  {
    key: 'allergies',
    question: 'Allergies (if any)?',
    inputType: 'multi-text',
    placeholder: 'e.g. Penicillin / Peanuts',
  },
  {
    key: 'ongoingTreatments',
    question: 'Ongoing treatments (if any)?',
    inputType: 'multi-text',
    placeholder: 'e.g. Physiotherapy',
  },
  {
    key: 'currentMedication',
    question: 'Current medication (if any)?',
    inputType: 'multi-medication',
  },
  {
    key: 'previousDiagnosedConditions',
    question: 'Previous diagnosed conditions?',
    inputType: 'multi-text',
    placeholder: 'e.g. Past hypertension',
  },
  {
    key: 'pastSurgeries',
    question: 'Past surgeries?',
    inputType: 'multi-surgery',
  },
  {
    key: 'childhoodIllness',
    question: 'Childhood illnesses?',
    inputType: 'multi-text',
    placeholder: 'e.g. Chickenpox',
  },
  {
    key: 'longTermTreatments',
    question: 'Long-term treatments (if any)?',
    inputType: 'multi-text',
    placeholder: 'e.g. Thyroid medication',
  },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const FREQUENCY_OPTIONS = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'Every 4 hours',
  'Every 6 hours',
  'Every 8 hours',
  'Every 12 hours',
  'As needed',
  'With meals',
  'Before bed',
];
const QUESTION_PREFIXES = [
  'Next up,',
  'Quick check:',
  'Alright,',
  'One more thing:',
  'Let’s continue —',
];
const ACKNOWLEDGEMENTS = ['Got it.', 'Thanks!', 'Understood.', 'Noted.', 'Perfect.'];

const sanitizeTextList = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
const isLeapYear = (year: number) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
const getMaxDayForMonth = (month: number | null, year: number | null) => {
  if (!month) return 31;
  if (month === 2) {
    if (!year) return 29;
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
};

export default function HealthOnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    newProfileId?: string | string[];
    previousProfileId?: string | string[];
    returnTo?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { selectedProfile, deleteProfile, selectProfile, refreshProfiles } = useProfile();

  const [step, setStep] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [dobParts, setDobParts] = useState({ day: '', month: '', year: '' });
  const [activeDobPicker, setActiveDobPicker] = useState<'day' | 'month' | 'year' | null>(null);
  const [activeSurgeryPicker, setActiveSurgeryPicker] = useState<{
    index: number;
    field: 'month' | 'year';
  } | null>(null);
  const [activeMedicationFrequencyPicker, setActiveMedicationFrequencyPicker] = useState<number | null>(null);
  const [medSubmitAttempted, setMedSubmitAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCancellingProfile, setIsCancellingProfile] = useState(false);

  const readParam = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value || '').trim();
  const newProfileId = readParam(params.newProfileId);
  const previousProfileId = readParam(params.previousProfileId);
  const returnToRaw = readParam(params.returnTo) || '/profile-selection';
  const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/profile-selection';
  const isNewProfileOnboarding = Boolean(newProfileId);

  const [profile, setProfile] = useState<Profile>({
    displayName: '',
    dateOfBirth: '',
    bloodGroup: '',
    heightCm: null,
    weightKg: null,
    currentDiagnosedCondition: [],
    allergies: [],
    ongoingTreatments: [],
    currentMedication: [],
    previousDiagnosedConditions: [],
    pastSurgeries: [],
    childhoodIllness: [],
    longTermTreatments: [],
  });

  const currentQ = QUESTIONS[step];
  const canSkip = step >= 4;
  const isRequired = !!currentQ?.required;
  const progressPercent = Math.min(100, Math.round((step / QUESTIONS.length) * 100));
  const selectedMonth = dobParts.month ? parseInt(dobParts.month, 10) : null;
  const selectedYear = dobParts.year ? parseInt(dobParts.year, 10) : null;
  const maxDobDay = getMaxDayForMonth(selectedMonth, selectedYear);
  const helperCopy = useMemo(() => {
    if (!currentQ) return '';
    switch (currentQ.inputType) {
      case 'date':
        return 'Select your birth date.';
      case 'single-select':
        return 'Choose one option.';
      case 'multi-text':
        return 'Add items one per line; optional.';
      case 'multi-medication':
        return 'Medication name, dosage, and frequency are required.';
      case 'multi-surgery':
        return 'Name, month and year for each.';
      default:
        return '';
    }
  }, [currentQ]);
  const canAddMultiText = (key: keyof Profile) => {
    const list = (profile[key] as string[]) ?? [];
    if (list.length === 0) return true;
    return list[list.length - 1].trim().length > 0;
  };
  const canAddMedication = () => {
    if (profile.currentMedication.length === 0) return true;
    const last = profile.currentMedication[profile.currentMedication.length - 1];
    return (
      last.name.trim().length > 0 &&
      last.dosage.trim().length > 0 &&
      last.frequency.trim().length > 0
    );
  };
  const isMedicationComplete = profile.currentMedication.length > 0 && profile.currentMedication.every(
    (item) =>
      item.name.trim().length > 0 &&
      item.dosage.trim().length > 0 &&
      item.frequency.trim().length > 0
  );
  const canAddSurgery = () => {
    if (profile.pastSurgeries.length === 0) return true;
    const last = profile.pastSurgeries[profile.pastSurgeries.length - 1];
    return last.name.trim().length > 0;
  };

  const reviewItems = useMemo(() => {
    const labels: Record<keyof Profile, string> = {
      displayName: 'Full name',
      dateOfBirth: 'Date of birth',
      bloodGroup: 'Blood group',
      heightCm: 'Height (cm)',
      weightKg: 'Weight (kg)',
      currentDiagnosedCondition: 'Current diagnosed condition',
      allergies: 'Allergies',
      ongoingTreatments: 'Ongoing treatments',
      currentMedication: 'Current medication',
      previousDiagnosedConditions: 'Previous diagnosed conditions',
      pastSurgeries: 'Past surgeries',
      childhoodIllness: 'Childhood illnesses',
      longTermTreatments: 'Long-term treatments',
    };

    const formatList = (values: string[]) => {
      const cleaned = sanitizeTextList(values);
      return cleaned.length ? cleaned.join(', ') : 'Not provided';
    };

    const formatValue = (key: keyof Profile) => {
      if (key === 'displayName') {
        return profile.displayName.trim() || 'Not provided';
      }
      if (key === 'dateOfBirth') {
        return profile.dateOfBirth || 'Not provided';
      }
      if (key === 'bloodGroup') {
        return profile.bloodGroup || 'Not provided';
      }
      if (key === 'heightCm') {
        return profile.heightCm != null ? String(profile.heightCm) : 'Not provided';
      }
      if (key === 'weightKg') {
        return profile.weightKg != null ? String(profile.weightKg) : 'Not provided';
      }
      if (key === 'currentDiagnosedCondition') {
        return formatList(profile.currentDiagnosedCondition);
      }
      if (key === 'allergies') {
        return formatList(profile.allergies);
      }
      if (key === 'ongoingTreatments') {
        return formatList(profile.ongoingTreatments);
      }
      if (key === 'previousDiagnosedConditions') {
        return formatList(profile.previousDiagnosedConditions);
      }
      if (key === 'childhoodIllness') {
        return formatList(profile.childhoodIllness);
      }
      if (key === 'longTermTreatments') {
        return formatList(profile.longTermTreatments);
      }
      if (key === 'currentMedication') {
        const meds = profile.currentMedication
          .map((item) => {
            const name = item.name?.trim();
            if (!name) return '';
            const details = [item.dosage?.trim(), item.frequency?.trim()].filter(Boolean).join(' • ');
            return details ? `${name} (${details})` : name;
          })
          .filter(Boolean);
        return meds.length ? meds.join('\n') : 'Not provided';
      }
      if (key === 'pastSurgeries') {
        const surgeries = profile.pastSurgeries
          .map((item) => {
            const name = item.name?.trim();
            if (!name) return '';
            const monthLabel = item.month
              ? MONTH_OPTIONS.find((opt) => opt.value === item.month)?.label
              : null;
            const yearLabel = item.year ? String(item.year) : null;
            const when = [monthLabel, yearLabel].filter(Boolean).join(' ');
            return when ? `${name} (${when})` : name;
          })
          .filter(Boolean);
        return surgeries.length ? surgeries.join('\n') : 'Not provided';
      }
      return 'Not provided';
    };

    return QUESTIONS.map((question) => ({
      label: labels[question.key] ?? question.question,
      value: formatValue(question.key),
    }));
  }, [profile]);

  const formatDobLabel = (dateString: string) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    if (!year || !month || !day) return dateString;
    const monthLabel = MONTH_OPTIONS.find(
      (opt) => String(opt.value).padStart(2, '0') === month
    )?.label;
    const dayNumber = parseInt(day, 10);
    if (!monthLabel || !Number.isFinite(dayNumber)) return dateString;
    return `${monthLabel} ${dayNumber}, ${year}`;
  };

  const formatMedicationForChat = (list: MedicationEntry[]) => {
    const formatted = list
      .map((item) => {
        const name = item.name?.trim();
        if (!name) return '';
        const details = [item.dosage?.trim(), item.frequency?.trim()].filter(Boolean).join(' • ');
        return details ? `${name} — ${details}` : name;
      })
      .filter(Boolean);
    return formatted.join('\n');
  };

  const formatSurgeryForChat = (list: PastSurgeryEntry[]) => {
    const formatted = list
      .map((item) => {
        const name = item.name?.trim();
        if (!name) return '';
        const monthLabel = item.month
          ? MONTH_OPTIONS.find((opt) => opt.value === item.month)?.label
          : null;
        const yearLabel = item.year ? String(item.year) : null;
        const when = [monthLabel, yearLabel].filter(Boolean).join(' ');
        return when ? `${name} (${when})` : name;
      })
      .filter(Boolean);
    return formatted.join('\n');
  };

  const formatAnswerForChat = (key: keyof Profile) => {
    if (key === 'displayName') return profile.displayName.trim();
    if (key === 'dateOfBirth') return profile.dateOfBirth ? formatDobLabel(profile.dateOfBirth) : '';
    if (key === 'bloodGroup') return profile.bloodGroup;
    if (key === 'heightCm') {
      return profile.heightCm != null ? `${profile.heightCm} cm` : '';
    }
    if (key === 'weightKg') {
      return profile.weightKg != null ? `${profile.weightKg} kg` : '';
    }
    if (key === 'currentDiagnosedCondition') {
      return sanitizeTextList(profile.currentDiagnosedCondition).join(', ');
    }
    if (key === 'allergies') {
      return sanitizeTextList(profile.allergies).join(', ');
    }
    if (key === 'ongoingTreatments') {
      return sanitizeTextList(profile.ongoingTreatments).join(', ');
    }
    if (key === 'previousDiagnosedConditions') {
      return sanitizeTextList(profile.previousDiagnosedConditions).join(', ');
    }
    if (key === 'childhoodIllness') {
      return sanitizeTextList(profile.childhoodIllness).join(', ');
    }
    if (key === 'longTermTreatments') {
      return sanitizeTextList(profile.longTermTreatments).join(', ');
    }
    if (key === 'currentMedication') {
      return formatMedicationForChat(profile.currentMedication);
    }
    if (key === 'pastSurgeries') {
      return formatSurgeryForChat(profile.pastSurgeries);
    }
    return '';
  };
  const getQuestionText = (question: QuestionConfig, index: number) => {
    if (index === 0) return `Welcome to G1. ${question.question}`;
    const prefix = QUESTION_PREFIXES[(index - 1) % QUESTION_PREFIXES.length];
    return `${prefix} ${question.question}`;
  };
  const getAcknowledgement = (question: QuestionConfig, answerText: string, index: number) => {
    const trimmed = answerText.trim();
    if (question.key === 'displayName' && trimmed && trimmed !== 'Skipped for now' && trimmed !== 'Not provided') {
      const firstName = trimmed.split(/\s+/)[0];
      return `Nice to meet you, ${firstName}.`;
    }
    return ACKNOWLEDGEMENTS[index % ACKNOWLEDGEMENTS.length];
  };

  useEffect(() => {
    if (!profile.dateOfBirth) return;
    const [y, m, d] = profile.dateOfBirth.split('-');
    if (y && m && d) setDobParts({ year: y, month: m, day: d });
  }, [profile.dateOfBirth]);

  useEffect(() => {
    if (isComplete) return undefined;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [step, isComplete]);

  useEffect(() => {
    if (isComplete) {
      const id = setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [isComplete]);

  useEffect(() => {
    if (!currentQ) return;
    if (currentQ.inputType === 'multi-text') {
      const key = currentQ.key as keyof Profile;
      const values = profile[key] as string[];
      if (values.length === 0) {
        setProfile((prev) => ({ ...prev, [key]: [''] } as Profile));
      }
    }
    if (currentQ.inputType === 'multi-medication' && profile.currentMedication.length === 0) {
      setProfile((prev) => ({
        ...prev,
        currentMedication: [{ name: '', dosage: '', frequency: '' }],
      }));
    }
    if (currentQ.inputType === 'multi-surgery' && profile.pastSurgeries.length === 0) {
      setProfile((prev) => ({
        ...prev,
        pastSurgeries: [{ name: '', month: null, year: null }],
      }));
    }
  }, [step]);

  const setAnswerOnProfile = (key: keyof Profile, raw: string) => {
    const trimmed = raw.trim();
    let value: unknown = trimmed;
    if (key === 'heightCm' || key === 'weightKg') {
      const n = Number(trimmed);
      value = Number.isFinite(n) ? n : null;
    }
    if (trimmed.toLowerCase() === 'skip') {
      value = key === 'heightCm' || key === 'weightKg' ? null : '';
    }
    setProfile((prev) => ({ ...prev, [key]: value } as Profile));
  };

  const validateRequired = (key: keyof Profile, raw: string) => {
    const trimmed = raw.trim();
    if (!isRequired) return true;
    if (key === 'dateOfBirth') return !!trimmed;
    if (key === 'bloodGroup') return !!trimmed;
    if (key === 'heightCm' || key === 'weightKg') {
      const n = Number(trimmed);
      return Number.isFinite(n) && n > 0;
    }
    return trimmed.length > 0;
  };

  const advanceStep = () => {
    const nextStep = step + 1;
    if (nextStep < QUESTIONS.length) {
      setStep(nextStep);
      setInputValue('');
    } else {
      setIsComplete(true);
    }
  };

  const handleSingleNext = (answer: string) => {
    if (!validateRequired(currentQ.key, answer)) return;
    setAnswerOnProfile(currentQ.key, answer);
    advanceStep();
  };

  const handleMultiTextNext = (key: keyof Profile) => {
    const raw = profile[key] as string[];
    const cleaned = sanitizeTextList(raw);
    setProfile((prev) => ({ ...prev, [key]: cleaned } as Profile));
    advanceStep();
  };

  const handleMedicationNext = () => {
    const cleaned = profile.currentMedication
      .map((item) => ({
        name: item.name.trim(),
        dosage: item.dosage.trim(),
        frequency: item.frequency.trim(),
      }))
      .filter((item) => item.name || item.dosage || item.frequency);
    if (!cleaned.length) {
      setMedSubmitAttempted(true);
      return;
    }
    if (!cleaned.every((item) => item.name && item.dosage && item.frequency)) {
      setMedSubmitAttempted(true);
      return;
    }
    setMedSubmitAttempted(false);
    setProfile((prev) => ({ ...prev, currentMedication: cleaned }));
    advanceStep();
  };

  const handleSurgeryNext = () => {
    const cleaned = profile.pastSurgeries.map((item) => ({
      name: item.name.trim(),
      month: item.month,
      year: item.year,
    }));
    const hasInvalid = cleaned.some((item) => {
      if (!item.name) return false;
      if (!item.month || !item.year) return true;
      if (item.month < 1 || item.month > 12) return true;
      if (item.year < 1900 || item.year > currentYear + 1) return true;
      return false;
    });
    if (hasInvalid) return;
    const normalized = cleaned.filter(
      (item) => item.name && item.month && item.year
    ) as PastSurgeryEntry[];
    setProfile((prev) => ({ ...prev, pastSurgeries: normalized }));
    advanceStep();
  };

  const handleTextSubmit = () => {
    if (isRequired && !inputValue.trim()) return;
    if (!inputValue.trim() && !canSkip) return;
    handleSingleNext(inputValue);
  };

  const updateDobParts = (next: Partial<typeof dobParts>) => {
    setDobParts((prev) => {
      const updated = { ...prev, ...next };
      const monthNumber = updated.month ? parseInt(updated.month, 10) : null;
      const yearNumber = updated.year ? parseInt(updated.year, 10) : null;
      const maxDay = getMaxDayForMonth(monthNumber, yearNumber);

      if (updated.day) {
        const dayNumber = parseInt(updated.day, 10);
        if (!Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > maxDay) {
          updated.day = '';
        }
      }

      if (updated.year && updated.month && updated.day) {
        setProfile((prevProfile) => ({
          ...prevProfile,
          dateOfBirth: `${updated.year}-${updated.month}-${updated.day}`,
        }));
      } else {
        setProfile((prevProfile) => ({
          ...prevProfile,
          dateOfBirth: '',
        }));
      }

      return updated;
    });
  };

  const handleSkip = () => {
    if (currentQ.inputType === 'multi-text') {
      setProfile((prev) => ({ ...prev, [currentQ.key]: [] } as Profile));
      advanceStep();
      return;
    }
    if (currentQ.inputType === 'multi-medication') {
      setProfile((prev) => ({ ...prev, currentMedication: [] }));
      advanceStep();
      return;
    }
    if (currentQ.inputType === 'multi-surgery') {
      setProfile((prev) => ({ ...prev, pastSurgeries: [] }));
      advanceStep();
      return;
    }
    handleSingleNext('Skip');
  };

  const goBackStep = () => {
    if (isComplete) {
      setIsComplete(false);
      setStep(QUESTIONS.length - 1);
      return;
    }
    if (step === 0) return;

    const prevStep = step - 1;
    const prevQ = QUESTIONS[prevStep];

    if (prevQ.inputType === 'text') {
      const value = profile[prevQ.key];
      if (typeof value === 'number') {
        setInputValue(Number.isFinite(value) ? String(value) : '');
      } else {
        setInputValue((value as string) ?? '');
      }
    } else {
      setInputValue('');
    }

    setStep(prevStep);
  };

  const discardNewProfileAndGoBack = async () => {
    if (!isNewProfileOnboarding || !newProfileId) {
      router.replace(returnTo as never);
      return;
    }

    try {
      setIsCancellingProfile(true);
      await deleteProfile(newProfileId);
      await refreshProfiles();

      if (previousProfileId) {
        try {
          await selectProfile(previousProfileId);
        } catch {
          // If previous profile is unavailable, provider fallback selection is used.
        }
      }

      router.replace(returnTo as never);
    } catch (error) {
      console.error('Discard profile error:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to go back right now. Please try again.';
      Alert.alert('Unable to go back', message);
    } finally {
      setIsCancellingProfile(false);
    }
  };

  const confirmDiscardNewProfile = () => {
    Alert.alert(
      'Go back?',
      'If you go back, this new profile will not be created.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Go back',
          style: 'destructive',
          onPress: () => {
            void discardNewProfileAndGoBack();
          },
        },
      ]
    );
  };

  const saveToDatabase = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);

      if (!selectedProfile) {
        setSaveError('No profile selected. Please select a profile first.');
        return;
      }

      const currentDiagnosedCondition = sanitizeTextList(profile.currentDiagnosedCondition);
      const allergies = sanitizeTextList(profile.allergies);
      const ongoingTreatments = sanitizeTextList(profile.ongoingTreatments);
      const currentMedication = profile.currentMedication
        .map((item) => ({
          name: item.name.trim(),
          dosage: item.dosage.trim(),
          frequency: item.frequency.trim(),
        }))
        .filter((item) => item.name && item.dosage && item.frequency);
      const previousDiagnosedConditions = sanitizeTextList(profile.previousDiagnosedConditions);
      const pastSurgeries = profile.pastSurgeries.filter(
        (item) => item.name && item.month && item.year
      );
      const childhoodIllness = sanitizeTextList(profile.childhoodIllness);
      const longTermTreatments = sanitizeTextList(profile.longTermTreatments);

      const healthPayload = {
        profileId: selectedProfile.id, // Include profile ID
        dateOfBirth: profile.dateOfBirth,
        bloodGroup: profile.bloodGroup,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        currentDiagnosedCondition,
        allergies,
        ongoingTreatments,
        currentMedication,
        previousDiagnosedConditions,
        pastSurgeries,
        childhoodIllness,
        longTermTreatments,
      };

      await apiRequest<{ ok: boolean }>('/api/health-profile', {
        method: 'POST',
        body: healthPayload,
      });

      // Update profile display_name in profiles table (not personal table)
      if (profile.displayName.trim()) {
        await supabase
          .from('profiles')
          .update({ display_name: profile.displayName.trim() })
          .eq('id', selectedProfile.id);
      }

      setIsSaved(true);
      setTimeout(() => router.replace('/home'), 400);
    } catch (e: unknown) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentQ && !isComplete) return null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2f565f', '#5a9a9c', '#7FCCA3']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 20}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => {
              if (isNewProfileOnboarding) {
                confirmDiscardNewProfile();
              } else if (step > 0 || isComplete) {
                goBackStep();
              } else {
                router.back();
              }
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color="#eef7f7" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.kicker}>Health Setup</Text>
            <Text style={styles.title}>
              {isComplete ? 'Review & save' : `Step ${step + 1} of ${QUESTIONS.length}`}
            </Text>
          </View>
          <View style={styles.badgeWrap}>
            {isNewProfileOnboarding && !isSaved ? (
              <Pressable
                style={({ pressed }) => [
                  styles.cancelProfileBtn,
                  pressed && styles.cancelProfileBtnPressed,
                  isCancellingProfile && styles.cancelProfileBtnDisabled,
                ]}
                onPress={confirmDiscardNewProfile}
                disabled={isCancellingProfile}
              >
                <Text style={styles.cancelProfileBtnText}>
                  {isCancellingProfile ? 'Going back…' : 'Go back'}
                </Text>
              </Pressable>
            ) : null}
            <View style={[styles.badge, isSaved && styles.badgeSaved]}>
              <Text style={styles.badgeText} numberOfLines={1} ellipsizeMode="clip">
                {isSaved ? 'Saved' : isComplete ? 'Review' : `${progressPercent}%`}
              </Text>
            </View>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressWrap}>
          <View style={styles.progressBg}>
            <Animated.View
              style={[styles.progressFill, { width: `${progressPercent}%` }]}
              entering={FadeInDown.duration(300)}
            />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!isComplete && currentQ && (
            <Animated.View
              entering={FadeInUp.duration(280).springify()}
              style={styles.card}
            >
              <View style={styles.chatThread}>
                {QUESTIONS.slice(0, step).map((question, index) => {
                  const answer = formatAnswerForChat(question.key);
                  const answerText =
                    answer || (question.required ? 'Not provided' : 'Skipped for now');
                  const isSkipped = answerText === 'Skipped for now';
                  return (
                    <Animated.View
                      key={`chat-${question.key}-${index}`}
                      style={styles.chatGroup}
                      entering={FadeIn.duration(220)}
                      layout={Layout.duration(180)}
                    >
                      <View style={styles.chatRow}>
                        <View style={styles.botBubble}>
                          <View style={styles.botHeader}>
                            <View style={styles.botAvatar}>
                              <Text style={styles.botAvatarText}>V</Text>
                            </View>
                            <Text style={styles.botLabel}>G1</Text>
                          </View>
                          <Text style={styles.botText}>{getQuestionText(question, index)}</Text>
                        </View>
                      </View>
                      <View style={styles.chatRowRight}>
                        <View style={styles.userAnswerBubble}>
                          <Text style={styles.userLabelAlt}>You</Text>
                          <Text style={styles.userAnswerText}>{answerText}</Text>
                        </View>
                      </View>
                      {!isSkipped && (
                        <View style={styles.chatRow}>
                          <View style={styles.botAckBubble}>
                            <Text style={styles.botAckText}>
                              {getAcknowledgement(question, answerText, index)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </Animated.View>
                  );
                })}

                <Animated.View
                  style={styles.chatRow}
                  entering={FadeIn.duration(240)}
                  layout={Layout.duration(180)}
                >
                  <View style={styles.botBubble}>
                    <View style={styles.botHeader}>
                      <View style={styles.botAvatar}>
                        <Text style={styles.botAvatarText}>V</Text>
                      </View>
                      <Text style={styles.botLabel}>G1</Text>
                    </View>
                    <Text style={styles.botText}>{getQuestionText(currentQ, step)}</Text>
                    {isRequired && (
                      <Text style={[styles.requiredHint, styles.botMeta]}>Required</Text>
                    )}
                    {helperCopy ? (
                      <Text style={[styles.helperText, styles.botMeta]}>{helperCopy}</Text>
                    ) : null}
                  </View>
                </Animated.View>

                <View style={styles.chatRowRight}>
                  <View style={styles.userComposer}>
                    <Text style={styles.userLabel}>You</Text>
                    {/* Text input (displayName, heightCm, weightKg) */}
                    {currentQ.inputType === 'text' && (
                      <>
                        <TextInput
                          style={styles.input}
                          value={inputValue}
                          onChangeText={setInputValue}
                          placeholder={currentQ.placeholder ?? 'Type here...'}
                          placeholderTextColor="#94a3b8"
                          autoCapitalize={currentQ.key === 'displayName' ? 'words' : 'none'}
                          keyboardType={
                            currentQ.key === 'heightCm' || currentQ.key === 'weightKg'
                              ? 'numeric'
                              : 'default'
                          }
                          returnKeyType="next"
                          onSubmitEditing={handleTextSubmit}
                        />
                        <Pressable
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            styles.sendBtn,
                            pressed && styles.primaryBtnPressed,
                          ]}
                          onPress={handleTextSubmit}
                        >
                          <Text style={styles.primaryBtnText}>Send</Text>
                          <MaterialCommunityIcons name="send" size={18} color="#fff" />
                        </Pressable>
                      </>
                    )}

                    {/* Date of birth — dropdown selectors */}
                    {currentQ.inputType === 'date' && (
                      <>
                        <View style={styles.dateRow}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.dateSelect,
                              pressed && styles.primaryBtnPressed,
                            ]}
                            onPress={() =>
                              setActiveDobPicker((prev) => (prev === 'month' ? null : 'month'))
                            }
                          >
                            <Text style={styles.dateSelectLabel}>Month</Text>
                            <View style={styles.dateSelectValueWrap}>
                              <Text style={styles.dateSelectValue}>
                                {dobParts.month
                                  ? MONTH_OPTIONS.find(
                                    (opt) => String(opt.value).padStart(2, '0') === dobParts.month
                                  )?.label
                                  : 'Select'}
                              </Text>
                              <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
                            </View>
                          </Pressable>

                          <Pressable
                            style={({ pressed }) => [
                              styles.dateSelect,
                              pressed && styles.primaryBtnPressed,
                            ]}
                            onPress={() =>
                              setActiveDobPicker((prev) => (prev === 'day' ? null : 'day'))
                            }
                          >
                            <Text style={styles.dateSelectLabel}>Day</Text>
                            <View style={styles.dateSelectValueWrap}>
                              <Text style={styles.dateSelectValue}>{dobParts.day || 'Select'}</Text>
                              <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
                            </View>
                          </Pressable>

                          <Pressable
                            style={({ pressed }) => [
                              styles.dateSelect,
                              pressed && styles.primaryBtnPressed,
                            ]}
                            onPress={() =>
                              setActiveDobPicker((prev) => (prev === 'year' ? null : 'year'))
                            }
                          >
                            <Text style={styles.dateSelectLabel}>Year</Text>
                            <View style={styles.dateSelectValueWrap}>
                              <Text style={styles.dateSelectValue}>{dobParts.year || 'Select'}</Text>
                              <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
                            </View>
                          </Pressable>
                        </View>

                        {activeDobPicker === 'month' && (
                          <Animated.View
                            entering={FadeInDown.duration(200)}
                            exiting={FadeOutUp.duration(180)}
                            style={styles.dateDropdown}
                          >
                            <ScrollView style={styles.dateDropdownList}>
                              {MONTH_OPTIONS.map((opt) => {
                                const value = String(opt.value).padStart(2, '0');
                                const isActive = dobParts.month === value;
                                return (
                                  <Pressable
                                    key={opt.value}
                                    style={({ pressed }) => [
                                      styles.dateOption,
                                      isActive && styles.dateOptionActive,
                                      pressed && styles.chipPressed,
                                    ]}
                                    onPress={() => {
                                      updateDobParts({ month: value });
                                      setActiveDobPicker(null);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.dateOptionText,
                                        isActive && styles.dateOptionTextActive,
                                      ]}
                                    >
                                      {opt.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </Animated.View>
                        )}

                        {activeDobPicker === 'day' && (
                          <Animated.View
                            entering={FadeInDown.duration(200)}
                            exiting={FadeOutUp.duration(180)}
                            style={styles.dateDropdown}
                          >
                            <ScrollView style={styles.dateDropdownList}>
                              {DAY_OPTIONS.filter((day) => day <= maxDobDay).map((day) => {
                                const value = String(day).padStart(2, '0');
                                const isActive = dobParts.day === value;
                                return (
                                  <Pressable
                                    key={day}
                                    style={({ pressed }) => [
                                      styles.dateOption,
                                      isActive && styles.dateOptionActive,
                                      pressed && styles.chipPressed,
                                    ]}
                                    onPress={() => {
                                      updateDobParts({ day: value });
                                      setActiveDobPicker(null);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.dateOptionText,
                                        isActive && styles.dateOptionTextActive,
                                      ]}
                                    >
                                      {day}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </Animated.View>
                        )}

                        {activeDobPicker === 'year' && (
                          <Animated.View
                            entering={FadeInDown.duration(200)}
                            exiting={FadeOutUp.duration(180)}
                            style={styles.dateDropdown}
                          >
                            <ScrollView style={styles.dateDropdownList}>
                              {YEAR_OPTIONS.map((year) => {
                                const value = String(year);
                                const isActive = dobParts.year === value;
                                return (
                                  <Pressable
                                    key={year}
                                    style={({ pressed }) => [
                                      styles.dateOption,
                                      isActive && styles.dateOptionActive,
                                      pressed && styles.chipPressed,
                                    ]}
                                    onPress={() => {
                                      updateDobParts({ year: value });
                                      setActiveDobPicker(null);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.dateOptionText,
                                        isActive && styles.dateOptionTextActive,
                                      ]}
                                    >
                                      {year}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </Animated.View>
                        )}

                        <Pressable
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            styles.sendBtn,
                            pressed && styles.primaryBtnPressed,
                          ]}
                          onPress={() => handleSingleNext(profile.dateOfBirth)}
                          disabled={!profile.dateOfBirth}
                        >
                          <Text style={styles.primaryBtnText}>Send</Text>
                          <MaterialCommunityIcons name="send" size={18} color="#fff" />
                        </Pressable>
                      </>
                    )}

                    {/* Single select (blood group) */}
                    {currentQ.inputType === 'single-select' && (
                      <>
                        <View style={styles.chipRow}>
                          {currentQ.options?.map((opt) => (
                            <Pressable
                              key={opt}
                              style={({ pressed }) => [
                                styles.chip,
                                profile.bloodGroup === opt && styles.chipActive,
                                pressed && styles.chipPressed,
                              ]}
                              onPress={() => setProfile((prev) => ({ ...prev, bloodGroup: opt }))}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  profile.bloodGroup === opt && styles.chipTextActive,
                                ]}
                              >
                                {opt}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <Pressable
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            styles.sendBtn,
                            pressed && styles.primaryBtnPressed,
                          ]}
                          onPress={() => handleSingleNext(profile.bloodGroup)}
                          disabled={!profile.bloodGroup}
                        >
                          <Text style={styles.primaryBtnText}>Send</Text>
                          <MaterialCommunityIcons name="send" size={18} color="#fff" />
                        </Pressable>
                      </>
                    )}

                    {/* Multi-text */}
                    {currentQ.inputType === 'multi-text' && (
                      <>
                        {(profile[currentQ.key] as string[]).map((value, index) => (
                          <View key={`${currentQ.key}-${index}`} style={styles.multiRow}>
                            <TextInput
                              style={[styles.input, styles.multiInput]}
                              value={value}
                              onChangeText={(text) => {
                                const next = [...(profile[currentQ.key] as string[])];
                                next[index] = text;
                                setProfile((prev) => ({ ...prev, [currentQ.key]: next } as Profile));
                              }}
                              placeholder={currentQ.placeholder ?? 'Type here...'}
                              placeholderTextColor="#94a3b8"
                            />
                            {index > 0 && (
                              <Pressable
                                style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
                                onPress={() => {
                                  const next = [...(profile[currentQ.key] as string[])];
                                  next.splice(index, 1);
                                  setProfile((prev) => ({ ...prev, [currentQ.key]: next } as Profile));
                                }}
                              >
                                <MaterialCommunityIcons name="close" size={20} color="#0f172a" />
                              </Pressable>
                            )}
                          </View>
                        ))}
                        <View style={styles.multiActions}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.addBtn,
                              !canAddMultiText(currentQ.key) && styles.addBtnDisabled,
                              pressed && styles.addBtnPressed,
                            ]}
                            onPress={() => {
                              const list = profile[currentQ.key] as string[];
                              setProfile((prev) => ({
                                ...prev,
                                [currentQ.key]: [...list, ''],
                              }) as Profile);
                            }}
                            disabled={!canAddMultiText(currentQ.key)}
                          >
                            <MaterialCommunityIcons name="plus" size={18} color="#0f766e" />
                            <Text style={styles.addBtnText}>Add another</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.primaryBtn,
                              styles.sendBtn,
                              pressed && styles.primaryBtnPressed,
                            ]}
                            onPress={() => handleMultiTextNext(currentQ.key)}
                          >
                            <Text style={styles.primaryBtnText}>Send</Text>
                            <MaterialCommunityIcons name="send" size={18} color="#fff" />
                          </Pressable>
                        </View>
                      </>
                    )}

                    {/* Multi-medication */}
                    {currentQ.inputType === 'multi-medication' && (
                      <>
                        {profile.currentMedication.map((item, index) => (
                          <View key={`med-${index}`} style={styles.medGroup}>
                            <Text style={styles.medLabel}>Medication {index + 1}</Text>
                            <View style={styles.medFieldGroup}>
                              <Text style={styles.medFieldLabel}>Name</Text>
                              <TextInput
                                style={styles.medInput}
                                value={item.name}
                                onChangeText={(text) => {
                                  const next = [...profile.currentMedication];
                                  next[index] = { ...next[index], name: text };
                                  setMedSubmitAttempted(false);
                                  setProfile((prev) => ({ ...prev, currentMedication: next }));
                                }}
                                placeholder="e.g., Paracetamol"
                                placeholderTextColor="#9bb0b5"
                              />
                            </View>
                            <View style={styles.medFieldGroup}>
                              <Text style={styles.medFieldLabel}>Dosage</Text>
                              <TextInput
                                style={styles.medInput}
                                value={item.dosage}
                                onChangeText={(text) => {
                                  const next = [...profile.currentMedication];
                                  next[index] = { ...next[index], dosage: text };
                                  setMedSubmitAttempted(false);
                                  setProfile((prev) => ({ ...prev, currentMedication: next }));
                                }}
                                placeholder="e.g., 500mg"
                                placeholderTextColor="#9bb0b5"
                              />
                            </View>
                            <View style={styles.medFieldGroup}>
                              <Text style={styles.medFieldLabel}>Frequency</Text>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.medSelect,
                                  pressed && styles.primaryBtnPressed,
                                ]}
                                onPress={() =>
                                  setActiveMedicationFrequencyPicker((prev) =>
                                    prev === index ? null : index
                                  )
                                }
                              >
                                <Text
                                  style={[
                                    styles.medSelectValue,
                                    !item.frequency && styles.medSelectPlaceholder,
                                  ]}
                                >
                                  {item.frequency || 'Select frequency'}
                                </Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
                              </Pressable>
                              {activeMedicationFrequencyPicker === index && (
                                <Animated.View
                                  entering={FadeInDown.duration(200)}
                                  exiting={FadeOutUp.duration(180)}
                                  style={styles.medDropdown}
                                >
                                  <ScrollView style={styles.medDropdownList}>
                                    {FREQUENCY_OPTIONS.map((label) => {
                                      const isActive = item.frequency === label;
                                      return (
                                        <Pressable
                                          key={label}
                                          style={({ pressed }) => [
                                            styles.medOption,
                                            isActive && styles.medOptionActive,
                                            pressed && styles.chipPressed,
                                          ]}
                                          onPress={() => {
                                            const next = [...profile.currentMedication];
                                            next[index] = {
                                              ...next[index],
                                              frequency: isActive ? '' : label,
                                            };
                                            setMedSubmitAttempted(false);
                                            setProfile((prev) => ({
                                              ...prev,
                                              currentMedication: next,
                                            }));
                                            setActiveMedicationFrequencyPicker(null);
                                          }}
                                        >
                                          <Text
                                            style={[
                                              styles.medOptionText,
                                              isActive && styles.medOptionTextActive,
                                            ]}
                                          >
                                            {label}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </Animated.View>
                              )}
                            </View>
                            {index > 0 && (
                              <Pressable
                                style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
                                onPress={() => {
                                  const next = profile.currentMedication.filter((_, i) => i !== index);
                                  setProfile((prev) => ({ ...prev, currentMedication: next }));
                                }}
                              >
                                <Text style={styles.removeBtnText}>Remove</Text>
                              </Pressable>
                            )}
                          </View>
                        ))}
                        {medSubmitAttempted && !isMedicationComplete && (
                          <Text style={styles.inlineHint}>Please complete all medication fields.</Text>
                        )}
                        <View style={styles.multiActions}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.addBtn,
                              !canAddMedication() && styles.addBtnDisabled,
                              pressed && styles.addBtnPressed,
                            ]}
                            onPress={() =>
                              setProfile((prev) => ({
                                ...prev,
                                currentMedication: [
                                  ...prev.currentMedication,
                                  { name: '', dosage: '', frequency: '' },
                                ],
                              }))
                            }
                            disabled={!canAddMedication()}
                          >
                            <MaterialCommunityIcons name="plus" size={18} color="#0f766e" />
                            <Text style={styles.addBtnText}>Add medication</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.primaryBtn,
                              styles.sendBtn,
                              pressed && styles.primaryBtnPressed,
                            ]}
                            onPress={handleMedicationNext}
                          >
                            <Text style={styles.primaryBtnText}>Send</Text>
                            <MaterialCommunityIcons name="send" size={18} color="#fff" />
                          </Pressable>
                        </View>
                      </>
                    )}

                    {/* Multi-surgery */}
                    {currentQ.inputType === 'multi-surgery' && (
                      <>
                        {profile.pastSurgeries.map((item, index) => (
                          <View key={`surg-${index}`} style={styles.medGroup}>
                            <Text style={styles.medLabel}>Surgery {index + 1}</Text>
                            <TextInput
                              style={styles.input}
                              value={item.name}
                              onChangeText={(text) => {
                                const next = [...profile.pastSurgeries];
                                next[index] = { ...next[index], name: text };
                                setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                              }}
                              placeholder="Surgery name"
                              placeholderTextColor="#94a3b8"
                            />
                            <View style={styles.surgeryDateRow}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.dateSelect,
                                  pressed && styles.primaryBtnPressed,
                                ]}
                                onPress={() =>
                                  setActiveSurgeryPicker((prev) =>
                                    prev?.index === index && prev.field === 'month'
                                      ? null
                                      : { index, field: 'month' }
                                  )
                                }
                              >
                                <Text style={styles.dateSelectLabel}>Month</Text>
                                <View style={styles.dateSelectValueWrap}>
                                  <Text style={styles.dateSelectValue}>
                                    {item.month
                                      ? MONTH_OPTIONS.find((opt) => opt.value === item.month)?.label
                                      : 'Select'}
                                  </Text>
                                  <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
                                </View>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.dateSelect,
                                  pressed && styles.primaryBtnPressed,
                                ]}
                                onPress={() =>
                                  setActiveSurgeryPicker((prev) =>
                                    prev?.index === index && prev.field === 'year'
                                      ? null
                                      : { index, field: 'year' }
                                  )
                                }
                              >
                                <Text style={styles.dateSelectLabel}>Year</Text>
                                <View style={styles.dateSelectValueWrap}>
                                  <Text style={styles.dateSelectValue}>
                                    {item.year ? String(item.year) : 'Select'}
                                  </Text>
                                  <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
                                </View>
                              </Pressable>
                            </View>
                            {activeSurgeryPicker?.index === index &&
                              activeSurgeryPicker.field === 'month' && (
                                <Animated.View
                                  entering={FadeInDown.duration(200)}
                                  exiting={FadeOutUp.duration(180)}
                                  style={styles.dateDropdown}
                                >
                                  <ScrollView style={styles.dateDropdownList}>
                                    {MONTH_OPTIONS.map((opt) => {
                                      const isActive = item.month === opt.value;
                                      return (
                                        <Pressable
                                          key={opt.value}
                                          style={({ pressed }) => [
                                            styles.dateOption,
                                            isActive && styles.dateOptionActive,
                                            pressed && styles.chipPressed,
                                          ]}
                                          onPress={() => {
                                            const next = [...profile.pastSurgeries];
                                            next[index] = { ...next[index], month: opt.value };
                                            setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                                            setActiveSurgeryPicker(null);
                                          }}
                                        >
                                          <Text
                                            style={[
                                              styles.dateOptionText,
                                              isActive && styles.dateOptionTextActive,
                                            ]}
                                          >
                                            {opt.label}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </Animated.View>
                              )}
                            {activeSurgeryPicker?.index === index &&
                              activeSurgeryPicker.field === 'year' && (
                                <Animated.View
                                  entering={FadeInDown.duration(200)}
                                  exiting={FadeOutUp.duration(180)}
                                  style={styles.dateDropdown}
                                >
                                  <ScrollView style={styles.dateDropdownList}>
                                    {YEAR_OPTIONS.map((year) => {
                                      const isActive = item.year === year;
                                      return (
                                        <Pressable
                                          key={year}
                                          style={({ pressed }) => [
                                            styles.dateOption,
                                            isActive && styles.dateOptionActive,
                                            pressed && styles.chipPressed,
                                          ]}
                                          onPress={() => {
                                            const next = [...profile.pastSurgeries];
                                            next[index] = { ...next[index], year };
                                            setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                                            setActiveSurgeryPicker(null);
                                          }}
                                        >
                                          <Text
                                            style={[
                                              styles.dateOptionText,
                                              isActive && styles.dateOptionTextActive,
                                            ]}
                                          >
                                            {year}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </Animated.View>
                              )}
                            {index > 0 && (
                              <Pressable
                                style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
                                onPress={() => {
                                  const next = profile.pastSurgeries.filter((_, i) => i !== index);
                                  setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                                }}
                              >
                                <Text style={styles.removeBtnText}>Remove</Text>
                              </Pressable>
                            )}
                          </View>
                        ))}
                        <View style={styles.multiActions}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.addBtn,
                              !canAddSurgery() && styles.addBtnDisabled,
                              pressed && styles.addBtnPressed,
                            ]}
                            onPress={() =>
                              setProfile((prev) => ({
                                ...prev,
                                pastSurgeries: [
                                  ...prev.pastSurgeries,
                                  { name: '', month: null, year: null },
                                ],
                              }))
                            }
                            disabled={!canAddSurgery()}
                          >
                            <MaterialCommunityIcons name="plus" size={18} color="#0f766e" />
                            <Text style={styles.addBtnText}>Add surgery</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.primaryBtn,
                              styles.sendBtn,
                              pressed && styles.primaryBtnPressed,
                            ]}
                            onPress={handleSurgeryNext}
                          >
                            <Text style={styles.primaryBtnText}>Send</Text>
                            <MaterialCommunityIcons name="send" size={18} color="#fff" />
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>

              {canSkip && currentQ.key !== 'weightKg' && (
                <Pressable
                  style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnPressed]}
                  onPress={handleSkip}
                >
                  <Text style={styles.skipBtnText}>Skip for now</Text>
                </Pressable>
              )}

              {step > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.stepBackBtn, pressed && styles.stepBackBtnPressed]}
                  onPress={goBackStep}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color="#0f766e" />
                  <Text style={styles.stepBackBtnText}>Back</Text>
                </Pressable>
              )}
            </Animated.View>
          )}

          {/* Complete: review & save */}
          {isComplete && (
            <Animated.View
              entering={FadeInUp.duration(300).springify()}
              style={styles.card}
            >
              <Text style={styles.question}>All set. Save your profile?</Text>
              <Text style={styles.helperText}>
                Your answers are stored securely. You can update them anytime in Profile.
              </Text>
              {saveError ? (
                <View style={styles.errorBanner}>
                  <MaterialCommunityIcons name="alert-circle" size={20} color="#b91c1c" />
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  (isSaving || isSaved) && styles.saveBtnDisabled,
                  pressed && !isSaving && !isSaved && styles.primaryBtnPressed,
                ]}
                onPress={saveToDatabase}
                disabled={isSaving || isSaved}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : isSaved ? (
                  <Text style={styles.primaryBtnText}>Saved ✓</Text>
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>Save profile</Text>
                    <MaterialCommunityIcons name="content-save" size={20} color="#fff" />
                  </>
                )}
              </Pressable>
              {reviewItems.length ? (
                <View style={styles.reviewSection}>
                  <Text style={styles.reviewTitle}>Review your answers</Text>
                  <View style={styles.reviewList}>
                    {reviewItems.map((item, index) => (
                      <View
                        key={`${item.label}-${index}`}
                        style={[
                          styles.reviewRow,
                          index === reviewItems.length - 1 && styles.reviewRowLast,
                        ]}
                      >
                        <Text style={styles.reviewLabel}>{item.label}</Text>
                        <Text style={styles.reviewValue}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  backBtnPressed: {
    opacity: 0.8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(238,247,247,0.9)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#eef7f7',
  },
  badgeWrap: {
    minWidth: 60,
    alignItems: 'flex-end',
    gap: 8,
  },
  cancelProfileBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  cancelProfileBtnPressed: {
    opacity: 0.85,
  },
  cancelProfileBtnDisabled: {
    opacity: 0.7,
  },
  cancelProfileBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#eef7f7',
  },
  badge: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  badgeSaved: {
    backgroundColor: 'rgba(127,204,163,0.5)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#eef7f7',
    textAlign: 'center',
  },
  progressWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  dateSelect: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.2)',
    backgroundColor: '#fff',
  },
  dateSelectLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  dateSelectValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateSelectValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  dateDropdown: {
    maxHeight: 200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.18)',
    backgroundColor: '#ffffff',
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  dateDropdownList: {
    paddingVertical: 6,
  },
  dateOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 8,
    borderRadius: 10,
  },
  dateOptionActive: {
    backgroundColor: 'rgba(15,118,110,0.12)',
  },
  dateOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  dateOptionTextActive: {
    color: '#0f766e',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.1)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  chatThread: {
    gap: 16,
    marginBottom: 10,
  },
  chatGroup: {
    gap: 10,
  },
  chatRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  chatRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  botBubble: {
    maxWidth: '92%',
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(15,118,110,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.18)',
  },
  botHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  botAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  botLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f766e',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  botText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 22,
  },
  botAckBubble: {
    maxWidth: '70%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15,118,110,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.12)',
  },
  botAckText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f766e',
  },
  botMeta: {
    marginTop: 8,
    marginBottom: 0,
  },
  userAnswerBubble: {
    maxWidth: '86%',
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#0f766e',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.4)',
  },
  userComposer: {
    width: '100%',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.12)',
  },
  userLabel: {
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  userLabelAlt: {
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  userAnswerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 20,
  },
  question: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  requiredHint: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '600',
    marginBottom: 14,
  },
  helperText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 14,
  },
  inlineHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    marginTop: -6,
    marginBottom: 10,
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.2)',
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 14,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    marginBottom: 10,
  },
  sendBtn: {
    alignSelf: 'flex-end',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 0,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.25)',
    backgroundColor: 'rgba(15,118,110,0.06)',
  },
  chipActive: {
    backgroundColor: 'rgba(15,118,110,0.2)',
    borderColor: '#0f766e',
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  chipTextActive: {
    color: '#0f766e',
    fontWeight: '700',
  },
  multiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  multiInput: {
    flex: 1,
    marginBottom: 0,
  },
  multiActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(15,118,110,0.35)',
    backgroundColor: 'rgba(15,118,110,0.06)',
  },
  addBtnPressed: {
    opacity: 0.8,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f766e',
  },
  removeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(15,118,110,0.1)',
    alignSelf: 'flex-start',
  },
  removeBtnPressed: {
    opacity: 0.8,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  medGroup: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,118,110,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.1)',
  },
  medLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f766e',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  medFieldGroup: {
    gap: 8,
    marginBottom: 10,
  },
  medFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#39484c',
  },
  medInput: {
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2f33',
  },
  medSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  medSelectValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2f33',
  },
  medSelectPlaceholder: {
    color: '#9bb0b5',
    fontWeight: '500',
  },
  medDropdown: {
    maxHeight: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#ffffff',
    marginTop: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  medDropdownList: {
    paddingVertical: 6,
  },
  medOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    borderRadius: 10,
  },
  medOptionActive: {
    backgroundColor: 'rgba(15,118,110,0.12)',
  },
  medOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2f33',
  },
  medOptionTextActive: {
    color: '#0f766e',
  },
  surgeryDateRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(15,118,110,0.3)',
    borderRadius: 12,
    marginTop: 6,
  },
  skipBtnPressed: {
    opacity: 0.8,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(185,28,28,0.1)',
    marginBottom: 14,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#0f766e',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  reviewSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,118,110,0.12)',
  },
  reviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  reviewList: {
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.1)',
    borderRadius: 14,
    backgroundColor: '#f8fbfb',
  },
  reviewRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,118,110,0.08)',
  },
  reviewRowLast: {
    borderBottomWidth: 0,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  stepBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.25)',
    backgroundColor: 'rgba(15,118,110,0.06)',
    marginTop: 10,
  },
  stepBackBtnPressed: {
    opacity: 0.8,
  },
  stepBackBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f766e',
  },
});
