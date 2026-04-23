'use client'

import {
  User, Phone, Edit2,
  Droplet, Calculator, CalendarCheck,
  ChevronDown, Menu, X, Pill, LogOut, Calendar, Locate, Plus
} from 'lucide-react';
import { supabase } from '@/lib/createClient';
import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Silk from '@/components/Silk';
import jsPDF from 'jspdf';
import { toast } from '@/components/AppNotifier';
import { useAppProfile } from '@/components/AppProfileProvider';
import { syncRememberedAccountName } from '@/lib/rememberedAccount';
import {
  cmToFeetAndInches,
  computeBmiFromMetrics,
  decimalFeetToFeetAndInches,
  feetInchesToCm,
  feetInchesToDecimalFeet,
  inferHeightUnit,
  inferWeightUnit,
  kgToLbs,
  lbsToKg,
  sanitizeBoundedWholeNumberInput,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/healthMeasurements';
import {
  MEDICATION_MEAL_OPTIONS,
  countMedicationMealTiming,
  deriveMedicationMealTiming,
  formatMedicationDosage,
  formatMedicationFrequencyLabel,
  formatMedicationMealTimingSummary,
  normalizeMedicationDosage,
  resolveMedicationFrequency,
  resolveMedicationTimesPerDay,
  type MedicationLog as SharedMedicationLog,
  type MedicationMealKey,
  type MedicationRecord as SharedMedication,
} from '@/lib/medications';

type CacheEntry<T> = { ts: number; value: T };
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const profileCacheKey = (userId: string, key: string) => `vytara:profile:${userId}:${key}`;
const readProfileCache = <T,>(userId: string, key: string): T | null => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(profileCacheKey(userId, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > PROFILE_CACHE_TTL_MS) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
};
const writeProfileCache = <T,>(userId: string, key: string, value: T) => {
  if (!userId || typeof window === 'undefined') return;
  const entry: CacheEntry<T> = { ts: Date.now(), value };
  window.localStorage.setItem(profileCacheKey(userId, key), JSON.stringify(entry));
};

type ProfileActivityPayload = {
  profileId: string;
  domain: "vault" | "medication" | "appointment";
  action: "upload" | "rename" | "delete" | "add" | "update";
  entity?: {
    id?: string | null;
    label?: string | null;
  };
  metadata?: Record<string, unknown>;
};

type ActivityMetadataValue = string | number | boolean | null;

type ActivityMetadataChange = {
  field: string;
  label: string;
  before: ActivityMetadataValue;
  after: ActivityMetadataValue;
};

const logProfileActivity = async (payload: ProfileActivityPayload) => {
  try {
    await fetch("/api/profile/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking log write.
  }
};

export default function ProfilePageUI() {

  const router = useRouter();
  const { selectedProfile } = useAppProfile();
  const [isPersonalInfoModalOpen, setIsPersonalInfoModalOpen] = useState(false);
  const [isCurrentMedicalModalOpen, setIsCurrentMedicalModalOpen] = useState(false);
  const [isPastMedicalModalOpen, setIsPastMedicalModalOpen] = useState(false);
  const [isFamilyHistoryModalOpen, setIsFamilyHistoryModalOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const profileId = selectedProfile?.id ?? "";
  const cacheOwnerId = profileId || userId;

  {/* PERSONAL DATA */}
  const [userName, setUserName] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [address, setAddress] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("cm");
  const [weightKg, setWeightKg] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [bmi, setBmi] = useState("");
  const [age, setAge] = useState("");
  const [personalDraft, setPersonalDraft] = useState({
    userName: "",
    gender: "",
    dob: "",
    phoneNumber: "",
    bloodGroup: "",
    address: "",
    heightUnit: "cm" as HeightUnit,
    heightCm: "",
    heightFeet: "",
    heightInches: "",
    weightUnit: "kg" as WeightUnit,
    weightKg: "",
    weightLbs: "",
  });

  const normalizedGender = gender.trim().toLowerCase();
  const genderBadgeClasses =
    normalizedGender === 'male'
      ? 'bg-blue-100 text-blue-700 border-blue-200'
      : normalizedGender === 'female'
        ? 'bg-pink-100 text-pink-700 border-pink-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const nextUserId = session?.user?.id ?? '';
      setUserId((prev) => (prev === nextUserId ? prev : nextUserId));
      const phoneFromSession = session?.user?.phone ?? '';
      if (phoneFromSession) {
        setPhoneNumber((prev) => prev || phoneFromSession);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? '';
      setUserId((prev) => (prev === nextUserId ? prev : nextUserId));
      const phoneFromSession = session?.user?.phone ?? '';
      if (phoneFromSession) {
        setPhoneNumber((prev) => prev || phoneFromSession);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  {/* MEDICAL DATA */}
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergy, setAllergy] = useState<string[]>([]);
  const [treatment, setTreatment] = useState<string[]>([]);

  type MedicationLog = SharedMedicationLog;
  type Medication = SharedMedication;
  
  const [currentMedications, setCurrentMedications] = useState<Medication[]>([]);
  const [persistedCurrentMedications, setPersistedCurrentMedications] = useState<Medication[]>([]);

  {/* PAST MEDICAL HISTORY */}

  const [previousDiagnosedCondition, setPreviousDiagnosedCondition] = useState<string[]>([]);
  const [childhoodIllness, setChildhoodIllness] = useState<string[]>([]);
  const [longTermTreatments, setLongTermTreatments] = useState<string[]>([]);

  type PastSurgery = {
    name: string,
    month: number | null,
    year: number | null
  }

  const [pastSurgeries, setPastSurgeries] = useState<PastSurgery[]>([]);

  type FamilyMedicalHistory = {
    disease: string,
    relation: string,
  }

  const [familyMedicalHistory, setFamilyMedicalHistory] = useState<FamilyMedicalHistory[]>([]);
  type CurrentMedicalSection = "medications" | "conditions" | "allergies" | "treatments";
  type PastMedicalSection = "diagnoses" | "surgeries" | "childhood" | "longTerm";
  type MedicalDrawerState =
    | { domain: "current"; section: CurrentMedicalSection }
    | { domain: "past"; section: PastMedicalSection };
  const [activeCurrentSection, setActiveCurrentSection] = useState<CurrentMedicalSection>("medications");
  const [activePastSection, setActivePastSection] = useState<PastMedicalSection>("diagnoses");
  const [medicalDrawerState, setMedicalDrawerState] = useState<MedicalDrawerState | null>(null);

  const currentYear = new Date().getFullYear();
  const monthOptions = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];
  const yearOptions = Array.from({ length: currentYear - 1899 }, (_, idx) => currentYear - idx);
  const formatMonthYear = (month: number | null, year: number | null) => {
    if (!month || !year) return "Date not set";
    const label = monthOptions.find((opt) => opt.value === month)?.label ?? String(month);
    return `${label} ${year}`;
  };

  const getFrequencyLabel = (frequencyValue: string) =>
    formatMedicationFrequencyLabel(frequencyValue);
  const compactPreviewCount = 6;
  const detailedPreviewCount = 3;

  const cloneMedicationList = (items: Medication[]) =>
    items.map((medication) => ({
      ...medication,
      purpose: (medication.purpose || "").trim(),
      frequency: resolveMedicationFrequency(medication.frequency, medication.mealTiming),
      mealTiming: (() => {
        const nextMealTiming = deriveMedicationMealTiming(
          medication.mealTiming,
          medication.frequency
        );
        return Object.keys(nextMealTiming).length > 0 ? nextMealTiming : undefined;
      })(),
      timesPerDay: resolveMedicationTimesPerDay(
        medication.frequency,
        medication.timesPerDay,
        medication.mealTiming
      ),
      logs: Array.isArray(medication.logs) ? [...medication.logs] : [],
    }));

  type MedicationActivityRecord = {
    id: string;
    name: string;
    dosage: string;
    purpose: string;
    frequency: string;
    timesPerDay: number | null;
    startDate: string | null;
    endDate: string | null;
  };

  const medicationActivityFieldLabels: Record<string, string> = {
    name: "Name",
    dosage: "Dosage",
    purpose: "Purpose",
    frequency: "Frequency",
    timesPerDay: "Times per day",
    startDate: "Start date",
    endDate: "End date",
  };

  const normalizeMedicationActivityValue = (value: unknown): ActivityMetadataValue => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "boolean") return value;
    return null;
  };

  const normalizeMedicationForActivity = (
    medication: Medication,
    index: number
  ): MedicationActivityRecord => {
    const name = (medication.name || "").trim();
    const dosage = normalizeMedicationDosage(medication.dosage);
    const purpose = (medication.purpose || "").trim();
    const frequency = resolveMedicationFrequency(medication.frequency, medication.mealTiming);
    const startDate = (medication.startDate || "").trim() || null;
    const endDate = (medication.endDate || "").trim() || null;
    const timesPerDay =
      name || dosage || frequency || purpose || startDate || endDate
        ? resolveMedicationTimesPerDay(frequency, medication.timesPerDay, medication.mealTiming)
        : null;
    const fallbackKey = [name, dosage, frequency, startDate || "", endDate || ""]
      .map((entry) => entry.toLowerCase())
      .join("|");
    const id = (medication.id || "").trim() || `legacy-${index}-${fallbackKey || "medication"}`;

    return {
      id,
      name,
      dosage,
      purpose,
      frequency,
      timesPerDay,
      startDate,
      endDate,
    };
  };

  const getMedicationActivitySummary = (medication: MedicationActivityRecord) => {
    const name = medication.name || "Medication";
    const detailParts = [
      medication.dosage,
      medication.frequency ? formatMedicationFrequencyLabel(medication.frequency) : "",
    ].filter(Boolean);
    return detailParts.length > 0 ? `${name} (${detailParts.join(" · ")})` : name;
  };

  const buildMedicationRecordChanges = (
    previousMedication: MedicationActivityRecord,
    nextMedication: MedicationActivityRecord
  ): ActivityMetadataChange[] => {
    const medicationLabel = nextMedication.name || previousMedication.name || "Medication";
    return (
      ["name", "dosage", "purpose", "frequency", "timesPerDay", "startDate", "endDate"] as const
    )
      .map((field) => {
        const before = normalizeMedicationActivityValue(previousMedication[field]);
        const after = normalizeMedicationActivityValue(nextMedication[field]);
        if (before === after) return null;
        return {
          field: `${field}:${nextMedication.id}`,
          label: `${medicationLabel} ${medicationActivityFieldLabels[field]}`,
          before,
          after,
        };
      })
      .filter((entry): entry is ActivityMetadataChange => entry !== null);
  };

  const buildMedicationListActivityChanges = (
    previousMedications: Medication[],
    nextMedications: Medication[]
  ) => {
    const previousNormalized = previousMedications.map(normalizeMedicationForActivity);
    const nextNormalized = nextMedications.map(normalizeMedicationForActivity);
    const previousById = new Map(previousNormalized.map((medication) => [medication.id, medication]));
    const nextById = new Map(nextNormalized.map((medication) => [medication.id, medication]));

    const changes: ActivityMetadataChange[] = [];

    nextNormalized.forEach((nextMedication) => {
      const previousMedication = previousById.get(nextMedication.id);
      if (!previousMedication) {
        changes.push({
          field: `added:${nextMedication.id}`,
          label: "Added medication",
          before: "none",
          after: getMedicationActivitySummary(nextMedication),
        });
        return;
      }
      changes.push(...buildMedicationRecordChanges(previousMedication, nextMedication));
    });

    previousNormalized.forEach((previousMedication) => {
      if (nextById.has(previousMedication.id)) return;
      changes.push({
        field: `removed:${previousMedication.id}`,
        label: "Removed medication",
        before: getMedicationActivitySummary(previousMedication),
        after: "removed",
      });
    });

    return changes;
  };

  const updateCurrentMedicationAtIndex = (
    index: number,
    updater: (medication: Medication) => Medication
  ) => {
    setCurrentMedications((prev) =>
      prev.map((medication, medicationIndex) =>
        medicationIndex === index ? updater(medication) : medication
      )
    );
  };

  const handleCurrentMedicationMealSelection = (
    index: number,
    meal: MedicationMealKey,
    checked: boolean
  ) => {
    updateCurrentMedicationAtIndex(index, (medication) => {
      const nextMealTiming = {
        ...deriveMedicationMealTiming(medication.mealTiming, medication.frequency),
      };
      if (!checked) {
        delete nextMealTiming[meal];
      } else {
        nextMealTiming[meal] = nextMealTiming[meal] || "before";
      }
      return {
        ...medication,
        mealTiming: Object.keys(nextMealTiming).length > 0 ? nextMealTiming : undefined,
        frequency: formatMedicationMealTimingSummary(nextMealTiming),
        timesPerDay: countMedicationMealTiming(nextMealTiming),
      };
    });
  };

  const handleCurrentMedicationMealTimingChange = (
    index: number,
    meal: MedicationMealKey,
    value: "before" | "after"
  ) => {
    updateCurrentMedicationAtIndex(index, (medication) => {
      const nextMealTiming = {
        ...deriveMedicationMealTiming(medication.mealTiming, medication.frequency),
        [meal]: value,
      };
      return {
        ...medication,
        mealTiming: nextMealTiming,
        frequency: formatMedicationMealTimingSummary(nextMealTiming),
        timesPerDay: countMedicationMealTiming(nextMealTiming),
      };
    });
  };

  const parseNullablePositiveNumber = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return Number.NaN;
    return parsed;
  };

  const parseNullableWholeNumber = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (!/^\d+$/.test(trimmed)) return Number.NaN;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
    return parsed;
  };

  const computeAgeFromDob = (dobISO: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobISO)) return null;
    const birthDate = new Date(`${dobISO}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return null;
    const now = new Date();
    let computedAge = now.getFullYear() - birthDate.getFullYear();
    const monthDelta = now.getMonth() - birthDate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
      computedAge -= 1;
    }
    if (computedAge < 0 || computedAge > 130) return null;
    return computedAge;
  };

  const getPersonalDraftMeasurements = () => {
    if (personalDraft.heightUnit === "cm") {
      const parsedHeightCm = parseNullablePositiveNumber(personalDraft.heightCm);
      if (Number.isNaN(parsedHeightCm)) {
        return { error: "Please enter a valid height in cm." } as const;
      }

      if (personalDraft.weightUnit === "kg") {
        const parsedWeightKg = parseNullablePositiveNumber(personalDraft.weightKg);
        if (Number.isNaN(parsedWeightKg)) {
          return { error: "Please enter a valid weight in kg." } as const;
        }

        return {
          heightCm: parsedHeightCm,
          heightFt: null,
          weightKg: parsedWeightKg,
          weightLbs: null,
        } as const;
      }

      const parsedWeightLbs = parseNullablePositiveNumber(personalDraft.weightLbs);
      if (Number.isNaN(parsedWeightLbs)) {
        return { error: "Please enter a valid weight in lbs." } as const;
      }

      return {
        heightCm: parsedHeightCm,
        heightFt: null,
        weightKg: parsedWeightLbs !== null ? lbsToKg(parsedWeightLbs) : null,
        weightLbs: parsedWeightLbs,
      } as const;
    }

    const parsedHeightFeet = parseNullableWholeNumber(personalDraft.heightFeet);
    const parsedHeightInches = personalDraft.heightInches.trim()
      ? parseNullableWholeNumber(personalDraft.heightInches)
      : 0;
    if (
      Number.isNaN(parsedHeightFeet) ||
      Number.isNaN(parsedHeightInches) ||
      parsedHeightFeet === null ||
      parsedHeightInches === null ||
      parsedHeightInches >= 12 ||
      (parsedHeightFeet === 0 && parsedHeightInches === 0)
    ) {
      return { error: "Please enter a valid height in feet and inches." } as const;
    }

    if (personalDraft.weightUnit === "kg") {
      const parsedWeightKg = parseNullablePositiveNumber(personalDraft.weightKg);
      if (Number.isNaN(parsedWeightKg)) {
        return { error: "Please enter a valid weight in kg." } as const;
      }

      return {
        heightCm: feetInchesToCm(parsedHeightFeet, parsedHeightInches),
        heightFt: feetInchesToDecimalFeet(parsedHeightFeet, parsedHeightInches),
        weightKg: parsedWeightKg,
        weightLbs: null,
      } as const;
    }

    const parsedWeightLbs = parseNullablePositiveNumber(personalDraft.weightLbs);
    if (Number.isNaN(parsedWeightLbs)) {
      return { error: "Please enter a valid weight in lbs." } as const;
    }

    return {
      heightCm: feetInchesToCm(parsedHeightFeet, parsedHeightInches),
      heightFt: feetInchesToDecimalFeet(parsedHeightFeet, parsedHeightInches),
      weightKg: parsedWeightLbs !== null ? lbsToKg(parsedWeightLbs) : null,
      weightLbs: parsedWeightLbs,
    } as const;
  };

  const handlePersonalDraftHeightUnitChange = (nextUnit: HeightUnit) => {
    if (nextUnit === personalDraft.heightUnit) return;
    if (nextUnit === "ft_in") {
      const parsedHeightCm = parseNullablePositiveNumber(personalDraft.heightCm);
      if (parsedHeightCm && !Number.isNaN(parsedHeightCm)) {
        const converted = cmToFeetAndInches(parsedHeightCm);
        updatePersonalDraft({
          heightUnit: nextUnit,
          heightFeet: String(converted.feet),
          heightInches: String(converted.inches),
        });
        return;
      }
    } else {
      const parsedHeightFeet = parseNullableWholeNumber(personalDraft.heightFeet);
      const parsedHeightInches = personalDraft.heightInches.trim()
        ? parseNullableWholeNumber(personalDraft.heightInches)
        : 0;
      if (
        parsedHeightFeet !== null &&
        parsedHeightInches !== null &&
        !Number.isNaN(parsedHeightFeet) &&
        !Number.isNaN(parsedHeightInches) &&
        parsedHeightInches < 12
      ) {
        updatePersonalDraft({
          heightUnit: nextUnit,
          heightCm: String(feetInchesToCm(parsedHeightFeet, parsedHeightInches)),
        });
        return;
      }
    }
    updatePersonalDraft({ heightUnit: nextUnit });
  };

  const handlePersonalDraftWeightUnitChange = (nextUnit: WeightUnit) => {
    if (nextUnit === personalDraft.weightUnit) return;
    if (nextUnit === "lbs") {
      const parsedWeightKg = parseNullablePositiveNumber(personalDraft.weightKg);
      if (parsedWeightKg && !Number.isNaN(parsedWeightKg)) {
        updatePersonalDraft({
          weightUnit: nextUnit,
          weightLbs: String(kgToLbs(parsedWeightKg)),
        });
        return;
      }
    } else {
      const parsedWeightLbs = parseNullablePositiveNumber(personalDraft.weightLbs);
      if (parsedWeightLbs && !Number.isNaN(parsedWeightLbs)) {
        updatePersonalDraft({
          weightUnit: nextUnit,
          weightKg: String(lbsToKg(parsedWeightLbs)),
        });
        return;
      }
    }
    updatePersonalDraft({ weightUnit: nextUnit });
  };

  const openPersonalInfoModal = () => {
    const parsedHeightFt = parseNullablePositiveNumber(heightFt);
    const fallbackHeightCm = parseNullablePositiveNumber(heightCm);
    const heightParts =
      parsedHeightFt && !Number.isNaN(parsedHeightFt)
        ? decimalFeetToFeetAndInches(parsedHeightFt)
        : fallbackHeightCm && !Number.isNaN(fallbackHeightCm)
          ? cmToFeetAndInches(fallbackHeightCm)
          : { feet: 0, inches: 0 };

    setPersonalDraft({
      userName,
      gender,
      dob,
      phoneNumber,
      bloodGroup,
      address,
      heightUnit,
      heightCm,
      heightFeet: heightParts.feet ? String(heightParts.feet) : "",
      heightInches: heightParts.inches ? String(heightParts.inches) : "",
      weightUnit,
      weightKg,
      weightLbs,
    });
    setIsPersonalInfoModalOpen(true);
  };

  const updatePersonalDraft = (patch: Partial<typeof personalDraft>) => {
    setPersonalDraft((prev) => ({ ...prev, ...patch }));
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.text('Medical Information Report', 20, 30);

    // Personal Information
    doc.setFontSize(16);
    doc.text('Personal Information', 20, 50);
    doc.setFontSize(12);
    doc.text(`Name: ${userName}`, 20, 65);
    doc.text(`Gender: ${gender}`, 20, 75);
    doc.text(`Date of Birth: ${dob}`, 20, 85);
    doc.text(`Phone: ${phoneNumber}`, 20, 95);
    doc.text(`Blood Group: ${bloodGroup}`, 20, 105);
    doc.text(`Address: ${address}`, 20, 115);
    doc.text(`BMI: ${bmi}`, 20, 125);
    doc.text(`Age: ${age}`, 20, 135);

    let yPosition = 155;

    // Current Medical Status
    doc.setFontSize(16);
    doc.text('Current Medical Status', 20, yPosition);
    yPosition += 15;
    doc.setFontSize(12);

    if (conditions.length > 0) {
      doc.text('Current Diagnosed Conditions:', 20, yPosition);
      yPosition += 10;
      conditions.forEach(condition => {
        doc.text(`- ${condition}`, 30, yPosition);
        yPosition += 10;
      });
    }

    if (allergy.length > 0) {
      doc.text('Allergies:', 20, yPosition);
      yPosition += 10;
      allergy.forEach(allergyItem => {
        doc.text(`- ${allergyItem}`, 30, yPosition);
        yPosition += 10;
      });
    }

    if (treatment.length > 0) {
      doc.text('Ongoing Treatments:', 20, yPosition);
      yPosition += 10;
      treatment.forEach(treat => {
        doc.text(`- ${treat}`, 30, yPosition);
        yPosition += 10;
      });
    }

    if (currentMedications.length > 0) {
      doc.text('Current Medications:', 20, yPosition);
      yPosition += 10;
      currentMedications.forEach(med => {
        doc.text(`- ${med.name} (${formatMedicationDosage(med.dosage)}, ${med.frequency})`, 30, yPosition);
        yPosition += 10;
      });
    }

    // Past Medical History
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 30;
    }

    doc.setFontSize(16);
    doc.text('Past Medical History', 20, yPosition);
    yPosition += 15;
    doc.setFontSize(12);

    if (previousDiagnosedCondition.length > 0) {
      doc.text('Previous Diagnosed Conditions:', 20, yPosition);
      yPosition += 10;
      previousDiagnosedCondition.forEach(condition => {
        doc.text(`- ${condition}`, 30, yPosition);
        yPosition += 10;
      });
    }

    if (pastSurgeries.length > 0) {
      doc.text('Past Surgeries:', 20, yPosition);
      yPosition += 10;
      pastSurgeries.forEach(surgery => {
        doc.text(`- ${surgery.name} (${formatMonthYear(surgery.month, surgery.year)})`, 30, yPosition);
        yPosition += 10;
      });
    }

    if (childhoodIllness.length > 0) {
      doc.text('Childhood Illnesses:', 20, yPosition);
      yPosition += 10;
      childhoodIllness.forEach(illness => {
        doc.text(`- ${illness}`, 30, yPosition);
        yPosition += 10;
      });
    }

    if (longTermTreatments.length > 0) {
      doc.text('Long Term Treatments:', 20, yPosition);
      yPosition += 10;
      longTermTreatments.forEach(treatment => {
        doc.text(`- ${treatment}`, 30, yPosition);
        yPosition += 10;
      });
    }

    // Family Medical History
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 30;
    }

    doc.setFontSize(16);
    doc.text('Family Medical History', 20, yPosition);
    yPosition += 15;
    doc.setFontSize(12);

    if (familyMedicalHistory.length > 0) {
      familyMedicalHistory.forEach(history => {
        doc.text(`${history.relation}: ${history.disease}`, 20, yPosition);
        yPosition += 10;
      });
    }

    // Save the PDF
    doc.save('medical-information.pdf');
  };

useEffect(() => {
    async function fetchPersonalData(){
      if (!userId || !profileId) return;

      const cachedPersonal = readProfileCache<{
        display_name: string | null;
        phone: string | null;
        gender: string | null;
        address: string | null;
      }>(cacheOwnerId, 'personal');
      if (cachedPersonal) {
        if (cachedPersonal.display_name) {
          setUserName(cachedPersonal.display_name);
        }
        setPhoneNumber((prev) => cachedPersonal.phone || prev || '');
        setGender((prev) => cachedPersonal.gender || prev || '');
        setAddress((prev) => cachedPersonal.address || prev || '');
      }

      const profileName =
        selectedProfile?.display_name?.trim() ||
        selectedProfile?.name?.trim() ||
        '';
      if (profileName) {
        setUserName(profileName);
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, name, phone, gender, address")
        .eq("id", profileId)
        .maybeSingle();

      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.log("Error: ", error);
        }
        return;
      }

      if (data) {
        const resolvedName = data.display_name?.trim() || data.name?.trim() || "";
        if (resolvedName) {
          setUserName(resolvedName);
        }
        setPhoneNumber((prev) => data.phone || prev || "");
        setGender((prev) => data.gender || prev || "");
        setAddress((prev) => data.address || prev || "");
        writeProfileCache(cacheOwnerId, 'personal', {
          display_name: resolvedName || null,
          phone: data.phone ?? null,
          gender: data.gender ?? null,
          address: data.address ?? null,
        });
      }
    }
    fetchPersonalData();
  }, [cacheOwnerId, profileId, selectedProfile?.display_name, selectedProfile?.name, userId]);



  useEffect(() => {
    async function fetchHealthData(){
      if (!userId || !profileId) return;
      const cachedHealth = readProfileCache<{
        date_of_birth: string | null;
        blood_group: string | null;
        current_diagnosed_condition: string[] | null;
        allergies: string[] | null;
        ongoing_treatments: string[] | null;
        medications: Medication[] | null;
        current_medication: Medication[] | null;
        height_cm: number | string | null;
        height_ft: number | string | null;
        weight_kg: number | string | null;
        weight_lbs: number | string | null;
        bmi: number | string | null;
        age: number | string | null;
        previous_diagnosed_conditions: string[] | null;
        past_surgeries: PastSurgery[] | null;
        childhood_illness: string[] | null;
        long_term_treatments: string[] | null;
      }>(cacheOwnerId, 'health');
      if (cachedHealth) {
        setConditions(cachedHealth.current_diagnosed_condition || []);
        setAllergy(cachedHealth.allergies || []);
        setTreatment(cachedHealth.ongoing_treatments || []);
        const cachedMeds = Array.isArray(cachedHealth.medications)
          ? cachedHealth.medications
          : cachedHealth.current_medication || [];
        const clonedCachedMeds = cloneMedicationList(cachedMeds);
        setCurrentMedications(clonedCachedMeds);
        setPersistedCurrentMedications(clonedCachedMeds);
        setHeightCm(
          cachedHealth.height_cm !== null && cachedHealth.height_cm !== undefined
            ? String(cachedHealth.height_cm)
            : ''
        );
        setHeightFt(
          cachedHealth.height_ft !== null && cachedHealth.height_ft !== undefined
            ? String(cachedHealth.height_ft)
            : ''
        );
        setHeightUnit(inferHeightUnit(
          cachedHealth.height_ft !== null && cachedHealth.height_ft !== undefined
            ? Number(cachedHealth.height_ft)
            : null
        ));
        setWeightKg(
          cachedHealth.weight_kg !== null && cachedHealth.weight_kg !== undefined
            ? String(cachedHealth.weight_kg)
            : ''
        );
        setWeightLbs(
          cachedHealth.weight_lbs !== null && cachedHealth.weight_lbs !== undefined
            ? String(cachedHealth.weight_lbs)
            : ''
        );
        setWeightUnit(inferWeightUnit(
          cachedHealth.weight_lbs !== null && cachedHealth.weight_lbs !== undefined
            ? Number(cachedHealth.weight_lbs)
            : null
        ));
        setBmi(
          cachedHealth.bmi !== null && cachedHealth.bmi !== undefined
            ? String(cachedHealth.bmi)
            : ''
        );
        setAge(
          cachedHealth.age !== null && cachedHealth.age !== undefined
            ? String(cachedHealth.age)
            : ''
        );
        setBloodGroup(cachedHealth.blood_group || '');
        setDob(cachedHealth.date_of_birth || '');
        setPreviousDiagnosedCondition(cachedHealth.previous_diagnosed_conditions || []);
        setPastSurgeries(cachedHealth.past_surgeries || []);
        setChildhoodIllness(cachedHealth.childhood_illness || []);
        setLongTermTreatments(cachedHealth.long_term_treatments || []);
      }
      const [{ data, error }, { data: medicationData, error: medicationError }] = await Promise.all([
        supabase
          .from("health")
          .select(`
            date_of_birth,
            blood_group,
            current_diagnosed_condition,
            allergies,
            ongoing_treatments,
            current_medication,
            height_cm,
            height_ft,
            weight_kg,
            weight_lbs,
            bmi,
            age,
            previous_diagnosed_conditions,
            past_surgeries,
            childhood_illness,
            long_term_treatments
          `)
          .eq("profile_id", profileId)
          .maybeSingle(),
        supabase
          .from("user_medications")
          .select("medications")
          .eq("profile_id", profileId)
          .maybeSingle(),
      ]);

      if (error){
        if (process.env.NODE_ENV !== 'production') {
          console.log("Error: ", error);
        }
      }
      const medicationErrorCode =
        typeof medicationError === "object" &&
        medicationError !== null &&
        "code" in medicationError &&
        typeof medicationError.code === "string"
          ? medicationError.code
          : "";

      if (medicationErrorCode && medicationErrorCode !== "PGRST116") {
        if (process.env.NODE_ENV !== 'production') {
          console.log("Medication fetch error: ", medicationError);
        }
      }

      const medicationListFromTable = Array.isArray(medicationData?.medications)
        ? (medicationData.medications as Medication[])
        : [];
      const legacyMedicationList = (data?.current_medication as Medication[]) || [];
      const useLegacyMedicationList =
        medicationListFromTable.length === 0 &&
        (!medicationData || medicationErrorCode === "PGRST116") &&
        legacyMedicationList.length > 0;
      const resolvedMedicationList = useLegacyMedicationList
        ? legacyMedicationList
        : medicationListFromTable;
      const clonedResolvedMedicationList = cloneMedicationList(resolvedMedicationList);
      setCurrentMedications(clonedResolvedMedicationList);
      setPersistedCurrentMedications(clonedResolvedMedicationList);

      if (data){
        setConditions((data.current_diagnosed_condition as string[]) || []);
        setAllergy((data.allergies as string[]) || []);
        setTreatment((data.ongoing_treatments as string[]) || []);
        setHeightCm(
          data.height_cm !== null && data.height_cm !== undefined ? String(data.height_cm) : ""
        );
        setHeightFt(
          data.height_ft !== null && data.height_ft !== undefined ? String(data.height_ft) : ""
        );
        setHeightUnit(inferHeightUnit(data.height_ft ?? null));
        setWeightKg(
          data.weight_kg !== null && data.weight_kg !== undefined ? String(data.weight_kg) : ""
        );
        setWeightLbs(
          data.weight_lbs !== null && data.weight_lbs !== undefined ? String(data.weight_lbs) : ""
        );
        setWeightUnit(inferWeightUnit(data.weight_lbs ?? null));
        setBmi(data.bmi !== null && data.bmi !== undefined ? String(data.bmi) : "");
        setAge(data.age !== null && data.age !== undefined ? String(data.age) : "");
        setBloodGroup(data.blood_group || "");
        setDob(data.date_of_birth || "");

        setPreviousDiagnosedCondition((data.previous_diagnosed_conditions as string[]) || []);
        setPastSurgeries((data.past_surgeries as PastSurgery[]) || []);
        setChildhoodIllness((data.childhood_illness as string[]) || []);
        setLongTermTreatments((data.long_term_treatments as string[]) || []);
        writeProfileCache(cacheOwnerId, 'health', {
          date_of_birth: data.date_of_birth ?? null,
          blood_group: data.blood_group ?? null,
          current_diagnosed_condition: (data.current_diagnosed_condition as string[]) || [],
          allergies: (data.allergies as string[]) || [],
          ongoing_treatments: (data.ongoing_treatments as string[]) || [],
          medications: resolvedMedicationList,
          current_medication: legacyMedicationList,
          height_cm: data.height_cm ?? null,
          height_ft: data.height_ft ?? null,
          weight_kg: data.weight_kg ?? null,
          weight_lbs: data.weight_lbs ?? null,
          bmi: data.bmi ?? null,
          age: data.age ?? null,
          previous_diagnosed_conditions: (data.previous_diagnosed_conditions as string[]) || [],
          past_surgeries: (data.past_surgeries as PastSurgery[]) || [],
          childhood_illness: (data.childhood_illness as string[]) || [],
          long_term_treatments: (data.long_term_treatments as string[]) || [],
        });
      }
    }
    fetchHealthData();
  }, [cacheOwnerId, profileId, userId]);

  useEffect(() => {
    async function fetchFamilyHealthData() {
      if (!userId || !profileId) return;
      const cachedFamilyHistory = readProfileCache<FamilyMedicalHistory[]>(cacheOwnerId, 'family_history');
      if (cachedFamilyHistory) {
        setFamilyMedicalHistory(cachedFamilyHistory);
      }
      const { data, error } = await supabase
        .from("health")
        .select("family_history")
        .eq("profile_id", profileId)
        .maybeSingle();

      if ( error ) { 
        if (process.env.NODE_ENV !== 'production') {
          console.log("Error: ", error);
        }
      }

      if (data && data.family_history) {
        setFamilyMedicalHistory(data.family_history.familyMedicalHistory || []);
        writeProfileCache(cacheOwnerId, 'family_history', data.family_history.familyMedicalHistory || []);
      }
    }
    fetchFamilyHealthData();
  }, [cacheOwnerId, profileId, userId]);

  const currentSectionLabels: Record<CurrentMedicalSection, string> = {
    medications: "Medications",
    conditions: "Conditions",
    allergies: "Allergies",
    treatments: "Treatments",
  };
  const pastSectionLabels: Record<PastMedicalSection, string> = {
    diagnoses: "Diagnoses",
    surgeries: "Surgeries",
    childhood: "Childhood",
    longTerm: "Long-term",
  };
  const currentSectionCounts: Record<CurrentMedicalSection, number> = {
    medications: currentMedications.length,
    conditions: conditions.length,
    allergies: allergy.length,
    treatments: treatment.length,
  };
  const pastSectionCounts: Record<PastMedicalSection, number> = {
    diagnoses: previousDiagnosedCondition.length,
    surgeries: pastSurgeries.length,
    childhood: childhoodIllness.length,
    longTerm: longTermTreatments.length,
  };
  const currentSectionTabs: Array<{ key: CurrentMedicalSection; label: string; count: number }> = [
    { key: "medications", label: currentSectionLabels.medications, count: currentSectionCounts.medications },
    { key: "conditions", label: currentSectionLabels.conditions, count: currentSectionCounts.conditions },
    { key: "allergies", label: currentSectionLabels.allergies, count: currentSectionCounts.allergies },
    { key: "treatments", label: currentSectionLabels.treatments, count: currentSectionCounts.treatments },
  ];
  const pastSectionTabs: Array<{ key: PastMedicalSection; label: string; count: number }> = [
    { key: "diagnoses", label: pastSectionLabels.diagnoses, count: pastSectionCounts.diagnoses },
    { key: "surgeries", label: pastSectionLabels.surgeries, count: pastSectionCounts.surgeries },
    { key: "childhood", label: pastSectionLabels.childhood, count: pastSectionCounts.childhood },
    { key: "longTerm", label: pastSectionLabels.longTerm, count: pastSectionCounts.longTerm },
  ];

  const renderChipPreview = (
    items: string[],
    emptyMessage: string,
    keyPrefix: string,
    itemLabel: string
  ) => {
    if (items.length === 0) {
      return <p className="text-sm text-gray-400">{emptyMessage}</p>;
    }
    const preview = items.slice(0, compactPreviewCount);
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {preview.map((item, index) => (
            <span
              key={`${keyPrefix}-${item}-${index}`}
              className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100"
            >
              {item}
            </span>
          ))}
        </div>
        {items.length > compactPreviewCount ? (
          <p className="mt-2 text-xs text-gray-500">
            +{items.length - compactPreviewCount} more {itemLabel} in full details
          </p>
        ) : null}
      </>
    );
  };

  const renderChipFullList = (items: string[], emptyMessage: string, keyPrefix: string) => {
    if (items.length === 0) {
      return <p className="text-sm text-gray-400">{emptyMessage}</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={`${keyPrefix}-${item}-${index}`}
            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100"
          >
            {item}
          </span>
        ))}
      </div>
    );
  };

  const renderMedicationCards = (items: Medication[]) => {
    if (items.length === 0) {
      return <p className="text-sm text-gray-400">No current medications added</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((current, index) => (
          <div
            key={`${current.id || current.name || "medication"}-${index}`}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
                <Pill className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-700">{current.name || "Medication"}</p>
                <p className="text-xs text-gray-500">
                  Dosage: {formatMedicationDosage(current.dosage) || "Not specified"}
                </p>
                <p className="text-xs text-gray-500">
                  Frequency: {current.frequency ? getFrequencyLabel(current.frequency) : "Not specified"}
                </p>
                {current.purpose ? (
                  <p className="text-xs text-gray-500">Purpose: {current.purpose}</p>
                ) : null}
              </div>
            </div>
            <span className="text-sm font-medium text-gray-500 bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100">
              {current.frequency ? getFrequencyLabel(current.frequency) : "As directed"}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderSurgeryCards = (items: PastSurgery[]) => {
    if (items.length === 0) {
      return <p className="text-sm text-gray-400">No past surgeries added</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((surgery, index) => (
          <div
            key={`${surgery.name}-${surgery.month}-${surgery.year}-${index}`}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
          >
            <div>
              <p className="font-bold text-gray-700">{surgery.name || "Surgery"}</p>
              <p className="text-xs text-gray-500">Date: {formatMonthYear(surgery.month, surgery.year)}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCurrentSectionPreview = () => {
    switch (activeCurrentSection) {
      case "medications":
        return (
          <>
            {renderMedicationCards(currentMedications.slice(0, detailedPreviewCount))}
            {currentMedications.length > detailedPreviewCount ? (
              <p className="mt-2 text-xs text-gray-500">
                +{currentMedications.length - detailedPreviewCount} more medications in full details
              </p>
            ) : null}
          </>
        );
      case "conditions":
        return renderChipPreview(conditions, "No conditions added", "conditions", "conditions");
      case "allergies":
        return renderChipPreview(allergy, "No allergies added", "allergies", "allergies");
      case "treatments":
        return renderChipPreview(treatment, "No ongoing treatments", "treatments", "treatments");
      default:
        return null;
    }
  };

  const renderPastSectionPreview = () => {
    switch (activePastSection) {
      case "diagnoses":
        return renderChipPreview(
          previousDiagnosedCondition,
          "No previous conditions added",
          "past-diagnoses",
          "diagnoses"
        );
      case "surgeries":
        return (
          <>
            {renderSurgeryCards(pastSurgeries.slice(0, detailedPreviewCount))}
            {pastSurgeries.length > detailedPreviewCount ? (
              <p className="mt-2 text-xs text-gray-500">
                +{pastSurgeries.length - detailedPreviewCount} more surgeries in full details
              </p>
            ) : null}
          </>
        );
      case "childhood":
        return renderChipPreview(
          childhoodIllness,
          "No childhood illnesses added",
          "past-childhood",
          "childhood illnesses"
        );
      case "longTerm":
        return renderChipPreview(
          longTermTreatments,
          "No long-term treatments added",
          "past-long-term",
          "long-term treatments"
        );
      default:
        return null;
    }
  };

  const renderMedicalDrawerContent = () => {
    if (!medicalDrawerState) return null;
    if (medicalDrawerState.domain === "current") {
      switch (medicalDrawerState.section) {
        case "medications":
          return renderMedicationCards(currentMedications);
        case "conditions":
          return renderChipFullList(conditions, "No conditions added", "drawer-conditions");
        case "allergies":
          return renderChipFullList(allergy, "No allergies added", "drawer-allergies");
        case "treatments":
          return renderChipFullList(treatment, "No ongoing treatments", "drawer-treatments");
        default:
          return null;
      }
    }
    switch (medicalDrawerState.section) {
      case "diagnoses":
        return renderChipFullList(
          previousDiagnosedCondition,
          "No previous conditions added",
          "drawer-past-diagnoses"
        );
      case "surgeries":
        return renderSurgeryCards(pastSurgeries);
      case "childhood":
        return renderChipFullList(
          childhoodIllness,
          "No childhood illnesses added",
          "drawer-past-childhood"
        );
      case "longTerm":
        return renderChipFullList(
          longTermTreatments,
          "No long-term treatments added",
          "drawer-past-long-term"
        );
      default:
        return null;
    }
  };

  const currentSectionTotal = currentSectionCounts[activeCurrentSection];
  const pastSectionTotal = pastSectionCounts[activePastSection];
  const drawerTitle = medicalDrawerState
    ? medicalDrawerState.domain === "current"
      ? currentSectionLabels[medicalDrawerState.section]
      : pastSectionLabels[medicalDrawerState.section]
    : "";
  const drawerTotal = medicalDrawerState
    ? medicalDrawerState.domain === "current"
      ? currentSectionCounts[medicalDrawerState.section]
      : pastSectionCounts[medicalDrawerState.section]
    : 0;

  return (
    <div className="min-h-screen pb-10 font-sans relative bg-gradient-to-br from-[var(--theme-background)] via-[var(--theme-surface)] to-[var(--theme-background)] text-[var(--theme-text)]">

      {/* Navbar */}
      

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
          
          {/* Left: Basic Info & KPIs */}
          <div
            className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-xl shadow-slate-900/10 border border-slate-200/80 flex flex-col h-full relative overflow-hidden"
            data-tour="profile-overview"
          >
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-40 h-40 sm:w-64 sm:h-64 bg-gradient-to-br from-[var(--theme-accent)] to-[var(--theme-surface)] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-80 pointer-events-none"></div>

            {/* Edit and Export Buttons */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button
                onClick={exportToPDF}
                className="px-4 py-2 bg-[var(--theme-button-primary)] text-white text-xs font-semibold uppercase tracking-wide rounded-full shadow-sm transition hover:bg-[var(--theme-button-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-button-primary)]"
                title="Export as PDF"
              >
                Export as PDF
              </button>
              <button
                onClick={openPersonalInfoModal}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[var(--theme-button-primary)] hover:bg-[var(--theme-surface)] rounded-full border border-gray-200 shadow-sm transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Info */}
            <div className="flex flex-col md:flex-row items-start gap-6 mb-8 mt-2 relative z-0">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center border-[4px] border-white shadow-lg shrink-0">
                  <User className="w-8 h-8 sm:w-10 sm:h-10 text-teal-700/80" />
                </div>
              </div>

              <div className="flex-1 w-full pt-2">
                <div className="mb-4">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">{userName}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full border ${genderBadgeClasses}`}
                    >
                      {gender}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600 group hover:text-teal-600 transition">
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-teal-50 flex items-center justify-center">
                      <Phone className="w-3 h-3" />
                    </div>
                    <span>{phoneNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 group hover:text-teal-600 transition">
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-teal-50 flex items-center justify-center">
                      <Calendar className="w-3 h-3" />
                    </div>
                    <span>{dob}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 group hover:text-teal-600 transition">
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-teal-50 flex items-center justify-center">
                      <Locate className="w-3 h-3" />
                    </div>
                    <span className='break-words whitespace-normal'>{address}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* KPI 1 */}
              <div className="bg-[var(--theme-surface)] p-4 rounded-2xl border border-[var(--theme-border)] hover:border-[var(--theme-button-primary)] transition shadow-sm group">
                <p className="text-[10px] text-[var(--theme-button-primary)] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Droplet className="w-3 h-3 fill-[var(--theme-button-primary)] text-[var(--theme-button-primary)] group-hover:scale-110 transition" /> Blood
                </p>
                <p className="text-2xl font-bold text-[var(--theme-text)]">{bloodGroup}</p>
              </div>
               
              {/* KPI 2 */}
              <div className="bg-[var(--theme-surface)] p-4 rounded-2xl border border-[var(--theme-border)] hover:border-[var(--theme-button-primary)] transition shadow-sm group">
                <p className="text-[10px] text-[var(--theme-button-primary)] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calculator className="w-3 h-3 text-[var(--theme-button-primary)] group-hover:scale-110 transition" /> BMI
                </p>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-bold text-[var(--theme-text)]">{bmi}</p>
                  <span className="text-[10px] text-[var(--theme-text-secondary)] font-medium">kg/m²</span>
                </div>
              </div>

              {/* KPI 3 */}
              <div className="bg-[var(--theme-surface)] p-4 rounded-2xl border border-[var(--theme-border)] hover:border-[var(--theme-button-primary)] transition shadow-sm group">
                <p className="text-[10px] text-[var(--theme-button-primary)] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CalendarCheck className="w-3 h-3 text-[var(--theme-button-primary)] group-hover:scale-110 transition" /> Age
                </p>
                <p className="text-2xl font-bold text-[var(--theme-text)]">{age || "—"}</p>
              </div>
            </div>
          </div>

          {/* Right: Family Medical History */}
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-900/10 border border-slate-200/80 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Family Medical History</h3>
              <button
                onClick={() => setIsFamilyHistoryModalOpen(true)}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[var(--theme-button-primary)] hover:bg-[var(--theme-surface)] rounded-full border border-gray-200 shadow-sm transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {familyMedicalHistory.length > 0 ? (
              <div className="space-y-2">
                {familyMedicalHistory.map((history, index) => (
                  <div
                    key={`${history.relation}-${history.disease}-${index}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <div>
                      <p className="font-bold text-gray-700">{history.relation || "Relation not set"}</p>
                      <p className="text-xs text-gray-500">Disease: {history.disease || "Not specified"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400 italic">No family medical history added</p>
              </div>
            )}
          </div>

        </div>

        {/* Medical Information Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
          {/* Current Medical Status */}
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-900/10 border border-slate-200/80 self-start">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Current Medical Status</h3>
              <button
                onClick={() => setIsCurrentMedicalModalOpen(true)}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[var(--theme-button-primary)] hover:bg-[var(--theme-surface)] rounded-full border border-gray-200 shadow-sm transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {currentSectionTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCurrentSection(tab.key)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
                    activeCurrentSection === tab.key
                      ? "bg-[var(--theme-button-primary)] text-white border-[var(--theme-button-primary)]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[var(--theme-button-primary)] hover:text-[var(--theme-button-primary)]"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-h-[190px]">
              {renderCurrentSectionPreview()}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {currentSectionTotal} {currentSectionLabels[activeCurrentSection].toLowerCase()} recorded
              </p>
              <button
                type="button"
                onClick={() =>
                  setMedicalDrawerState({
                    domain: "current",
                    section: activeCurrentSection,
                  })
                }
                disabled={currentSectionTotal === 0}
                className="text-xs font-semibold text-[var(--theme-button-primary)] hover:text-[var(--theme-button-secondary)] transition disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                View full details
              </button>
            </div>
          </div>

          {/* Past Medical History */}
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-900/10 border border-slate-200/80 self-start">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Past Medical History</h3>
              <button
                onClick={() => setIsPastMedicalModalOpen(true)}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[var(--theme-button-primary)] hover:bg-[var(--theme-surface)] rounded-full border border-gray-200 shadow-sm transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {pastSectionTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActivePastSection(tab.key)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
                    activePastSection === tab.key
                      ? "bg-[var(--theme-button-primary)] text-white border-[var(--theme-button-primary)]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[var(--theme-button-primary)] hover:text-[var(--theme-button-primary)]"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-h-[190px]">
              {renderPastSectionPreview()}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {pastSectionTotal} {pastSectionLabels[activePastSection].toLowerCase()} recorded
              </p>
              <button
                type="button"
                onClick={() =>
                  setMedicalDrawerState({
                    domain: "past",
                    section: activePastSection,
                  })
                }
                disabled={pastSectionTotal === 0}
                className="text-xs font-semibold text-[var(--theme-button-primary)] hover:text-[var(--theme-button-secondary)] transition disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                View full details
              </button>
            </div>
          </div>
        </div>

        {/* Medical Details Modal */}
        {medicalDrawerState && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setMedicalDrawerState(null)}
              className="absolute inset-0 bg-black/40"
              aria-label="Close medical details modal"
            />
            <aside className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
                    {medicalDrawerState.domain === "current" ? "Current Medical Status" : "Past Medical History"}
                  </p>
                  <h3 className="text-xl font-bold text-gray-800">{drawerTitle}</h3>
                  <p className="text-sm text-gray-500">
                    {drawerTotal} {drawerTotal === 1 ? "record" : "records"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMedicalDrawerState(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {renderMedicalDrawerContent()}
              </div>
            </aside>
          </div>
        )}

        {/* Personal Info Modal */}
        {isPersonalInfoModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Edit Personal Information</h3>
                <button 
                  onClick={() => setIsPersonalInfoModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!profileId || !userId) {
                    toast.warning("No profile selected", "Please select a profile first.");
                    return;
                  }
                  const measurements = getPersonalDraftMeasurements();
                  if ("error" in measurements) {
                    toast.warning("Invalid measurements", measurements.error);
                    return;
                  }
                  const computedAge = computeAgeFromDob(personalDraft.dob);
                  const computedBmi = computeBmiFromMetrics(
                    measurements.heightCm,
                    measurements.weightKg
                  );
                  const personalData = {
                    display_name: personalDraft.userName,
                    phone: personalDraft.phoneNumber,
                    gender: personalDraft.gender,
                    address: personalDraft.address,
                  };
                  const { error: profileError } = await supabase
                    .from("profiles")
                    .update(personalData)
                    .eq("id", profileId);
                  if (profileError) {
                    toast.error("Save failed", profileError.message);
                    return;
                  }
                  const normalizedMedications = currentMedications
                    .map((med) => {
                      const normalizedMealTiming = deriveMedicationMealTiming(
                        med.mealTiming,
                        med.frequency
                      );
                      const frequencyValue = resolveMedicationFrequency(
                        med.frequency,
                        normalizedMealTiming
                      );
                      return {
                        id: med.id?.trim() || crypto.randomUUID(),
                        name: (med.name || "").trim(),
                        dosage: normalizeMedicationDosage(med.dosage),
                        purpose: (med.purpose || "").trim(),
                        frequency: frequencyValue,
                        mealTiming:
                          Object.keys(normalizedMealTiming).length > 0
                            ? normalizedMealTiming
                            : undefined,
                        timesPerDay: resolveMedicationTimesPerDay(
                          frequencyValue,
                          med.timesPerDay,
                          normalizedMealTiming
                        ),
                        startDate: med.startDate || new Date().toISOString().split("T")[0],
                        endDate: med.endDate || undefined,
                        logs: Array.isArray(med.logs) ? med.logs : [],
                      };
                    })
                    .filter((med) => med.name && med.dosage && med.frequency);
                  const healthResponse = await fetch("/api/health-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      profileId,
                      dateOfBirth: personalDraft.dob,
                      bloodGroup: personalDraft.bloodGroup,
                      heightUnit: personalDraft.heightUnit,
                      heightCm: measurements.heightCm,
                      heightFeet:
                        personalDraft.heightUnit === "ft_in"
                          ? parseNullableWholeNumber(personalDraft.heightFeet)
                          : null,
                      heightInches:
                        personalDraft.heightUnit === "ft_in"
                          ? parseNullableWholeNumber(personalDraft.heightInches)
                          : null,
                      weightUnit: personalDraft.weightUnit,
                      weightKg: measurements.weightKg,
                      weightLbs:
                        personalDraft.weightUnit === "lbs"
                          ? parseNullablePositiveNumber(personalDraft.weightLbs)
                          : null,
                      currentDiagnosedCondition: conditions.map((item) => item.trim()).filter(Boolean),
                      allergies: allergy.map((item) => item.trim()).filter(Boolean),
                      ongoingTreatments: treatment.map((item) => item.trim()).filter(Boolean),
                      currentMedication: normalizedMedications,
                      previousDiagnosedConditions: previousDiagnosedCondition.map((item) => item.trim()).filter(Boolean),
                      pastSurgeries,
                      childhoodIllness: childhoodIllness.map((item) => item.trim()).filter(Boolean),
                      longTermTreatments: longTermTreatments.map((item) => item.trim()).filter(Boolean),
                    }),
                  });
                  const healthPayload = (await healthResponse.json().catch(() => null)) as
                    | { error?: string; message?: string }
                    | null;
                  if (!healthResponse.ok) {
                    toast.error(
                      "Save failed",
                      healthPayload?.message || healthPayload?.error || "Failed to save health profile."
                    );
                  } else {
                    if (selectedProfile?.is_primary && personalDraft.userName.trim()) {
                      syncRememberedAccountName(userId, personalDraft.userName.trim());
                    }
                    setUserName(personalDraft.userName);
                    setGender(personalDraft.gender);
                    setDob(personalDraft.dob);
                    setPhoneNumber(personalDraft.phoneNumber);
                    setBloodGroup(personalDraft.bloodGroup);
                    setAddress(personalDraft.address);
                    setHeightCm(measurements.heightCm !== null ? String(measurements.heightCm) : "");
                    setHeightFt(measurements.heightFt !== null ? String(measurements.heightFt) : "");
                    setHeightUnit(personalDraft.heightUnit);
                    setWeightKg(measurements.weightKg !== null ? String(measurements.weightKg) : "");
                    setWeightLbs(measurements.weightLbs !== null ? String(measurements.weightLbs) : "");
                    setWeightUnit(personalDraft.weightUnit);
                    setAge(computedAge !== null ? String(computedAge) : "");
                    setBmi(computedBmi !== null ? String(computedBmi) : "");
                    setIsPersonalInfoModalOpen(false);
                    toast.success("Saved", "Personal information updated successfully.");
                  }
                }}>
                  <div className="space-y-4">
                    <h3 className="text-[var(--theme-button-primary)] mb-4">Basic Personal Information</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[var(--theme-button-primary)] mb-2">Full Name *</label>
                        <input
                          value={personalDraft.userName}
                          onChange={(e) => updatePersonalDraft({ userName: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          placeholder="Full Name"
                        />
                      </div>

                      <div>
                        <label className="block text-[var(--theme-button-primary)] mb-2">Date of Birth *</label>
                        <input
                          type="date"
                          value={personalDraft.dob}
                          onChange={(e) => updatePersonalDraft({ dob: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[var(--theme-button-primary)] mb-2">Gender *</label>
                        <select
                          value={personalDraft.gender}
                          onChange={(e) => updatePersonalDraft({ gender: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                        >
                          <option>Select Gender</option>
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[var(--theme-button-primary)] mb-2">Blood Group *</label>  
                        <select
                          value={personalDraft.bloodGroup}
                          onChange={(e) => updatePersonalDraft({ bloodGroup: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                        >
                          <option>Select Blood Group</option>
                          <option>A+</option>
                          <option>A−</option>
                          <option>B+</option>
                          <option>B−</option>
                          <option>AB+</option>
                          <option>AB−</option>
                          <option>O+</option>
                          <option>O−</option>
                        </select>
                      </div>
                      
                      <div className="md:col-span-2">
                        <label className="block text-[var(--theme-button-primary)] mb-2">Address *</label>
                        <textarea
                          value={personalDraft.address}
                          onChange={(e) => updatePersonalDraft({ address: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          placeholder="Address"
                        />
                      </div>

                      <div>
                        <label className="block text-[var(--theme-button-primary)] mb-2">Contact Number *</label>
                        <input
                          type="tel"
                          value={personalDraft.phoneNumber}
                          onChange={(e) => updatePersonalDraft({ phoneNumber: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          placeholder="eg: 1234567890"
                        />
                      </div>

                      <div>
                        <label className="block text-[var(--theme-button-primary)] mb-2">Height</label>
                        <div className="flex gap-2 mb-3">
                          {(["cm", "ft_in"] as HeightUnit[]).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => handlePersonalDraftHeightUnitChange(unit)}
                              className={`px-3 py-2 rounded-full border text-sm font-semibold transition ${
                                personalDraft.heightUnit === unit
                                  ? "bg-blue-50 text-blue-700 border-blue-300"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                              }`}
                            >
                              {unit === "cm" ? "cm" : "ft/in"}
                            </button>
                          ))}
                        </div>
                        {personalDraft.heightUnit === "cm" ? (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={personalDraft.heightCm}
                            onChange={(e) => updatePersonalDraft({ heightCm: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                            placeholder="eg: 170"
                          />
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={personalDraft.heightFeet}
                              onChange={(e) => updatePersonalDraft({ heightFeet: e.target.value.replace(/\D/g, "") })}
                              className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                              placeholder="Feet"
                            />
                            <input
                              type="number"
                              min="0"
                              max="11"
                              step="1"
                              value={personalDraft.heightInches}
                              onChange={(e) =>
                                updatePersonalDraft({
                                  heightInches: sanitizeBoundedWholeNumberInput(e.target.value, 11),
                                })
                              }
                              className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                              placeholder="Inches"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[var(--theme-button-primary)] mb-2">Weight</label>
                        <div className="flex gap-2 mb-3">
                          {(["kg", "lbs"] as WeightUnit[]).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => handlePersonalDraftWeightUnitChange(unit)}
                              className={`px-3 py-2 rounded-full border text-sm font-semibold transition ${
                                personalDraft.weightUnit === unit
                                  ? "bg-blue-50 text-blue-700 border-blue-300"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={personalDraft.weightUnit === "kg" ? personalDraft.weightKg : personalDraft.weightLbs}
                          onChange={(e) =>
                            personalDraft.weightUnit === "kg"
                              ? updatePersonalDraft({ weightKg: e.target.value })
                              : updatePersonalDraft({ weightLbs: e.target.value })
                          }
                          className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          placeholder={personalDraft.weightUnit === "kg" ? "eg: 65" : "eg: 143"}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsPersonalInfoModalOpen(false)}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-[var(--theme-button-primary)] text-white rounded-lg hover:bg-[var(--theme-button-secondary)] transition"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Current Medical Status Modal */}
        {isCurrentMedicalModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Edit Current Medical Status</h3>
                <button 
                  onClick={() => setIsCurrentMedicalModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!profileId || !userId) {
                    toast.warning("No profile selected", "Please select a profile first.");
                    return;
                  }
                  const todayDate = new Date().toISOString().split("T")[0];
                  const hasIncompleteMedication = currentMedications.some((med) => {
                    const normalizedMealTiming = deriveMedicationMealTiming(
                      med.mealTiming,
                      med.frequency
                    );
                    const normalizedFrequency = resolveMedicationFrequency(
                      med.frequency,
                      normalizedMealTiming
                    );
                    const hasAnyValue =
                      med.name.trim() ||
                      med.dosage.trim() ||
                      normalizedFrequency ||
                      med.purpose?.trim() ||
                      countMedicationMealTiming(normalizedMealTiming) > 0;
                    if (!hasAnyValue) return false;
                    return (
                      !med.name.trim() ||
                      !med.dosage.trim() ||
                      countMedicationMealTiming(normalizedMealTiming) === 0
                    );
                  });
                  if (hasIncompleteMedication) {
                    toast.warning(
                      "Missing medication details",
                      "Please fill Medication Name, Dosage, and meal timing for each medication."
                    );
                    return;
                  }

                  const normalizedMedications = currentMedications
                    .map((med) => {
                      const normalizedMealTiming = deriveMedicationMealTiming(
                        med.mealTiming,
                        med.frequency
                      );
                      const frequencyValue = resolveMedicationFrequency(
                        med.frequency,
                        normalizedMealTiming
                      );
                      const resolvedTimesPerDay = resolveMedicationTimesPerDay(
                        frequencyValue,
                        med.timesPerDay,
                        normalizedMealTiming
                      );
                      return {
                        id: med.id?.trim() || crypto.randomUUID(),
                        name: (med.name || "").trim(),
                        dosage: normalizeMedicationDosage(med.dosage),
                        purpose: (med.purpose || "").trim(),
                        frequency: frequencyValue,
                        mealTiming:
                          Object.keys(normalizedMealTiming).length > 0
                            ? normalizedMealTiming
                            : undefined,
                        timesPerDay: resolvedTimesPerDay,
                        startDate: med.startDate || todayDate,
                        endDate: med.endDate || undefined,
                        logs: Array.isArray(med.logs) ? med.logs : [],
                      };
                    })
                    .filter((med) => med.name && med.dosage && med.frequency);

                  const healthData = {
                    profile_id: profileId,
                    user_id: userId,
                    current_diagnosed_condition: conditions.map((item) => item.trim()).filter(Boolean),
                    allergies: allergy.map((item) => item.trim()).filter(Boolean),
                    ongoing_treatments: treatment.map((item) => item.trim()).filter(Boolean),
                  };

                  const [{ error: healthError }, { error: medicationError }] = await Promise.all([
                    supabase
                      .from("health")
                      .upsert(healthData, { onConflict: "profile_id" }),
                    supabase
                      .from("user_medications")
                      .upsert(
                        {
                          profile_id: profileId,
                          user_id: userId,
                          medications: normalizedMedications,
                          updated_at: new Date().toISOString(),
                        },
                        { onConflict: "profile_id" }
                      ),
                  ]);

                  if (healthError) {
                    toast.error("Save failed", healthError.message);
                  } else if (medicationError) {
                    toast.error("Save failed", medicationError.message);
                  } else {
                    const medicationChanges = buildMedicationListActivityChanges(
                      persistedCurrentMedications,
                      normalizedMedications
                    );
                    const latestMedication =
                      normalizedMedications[normalizedMedications.length - 1] ?? null;
                    void logProfileActivity({
                      profileId,
                      domain: "medication",
                      action: "update",
                      entity: {
                        id:
                          typeof latestMedication?.id === "string"
                            ? latestMedication.id
                            : null,
                        label:
                          typeof latestMedication?.name === "string"
                            ? latestMedication.name
                            : "Medication list",
                      },
                      metadata: {
                        name:
                          typeof latestMedication?.name === "string"
                            ? latestMedication.name
                            : "Medication list",
                        totalMedications: normalizedMedications.length,
                        changes: medicationChanges,
                        changeCount: medicationChanges.length,
                      },
                    });
                    setCurrentMedications(normalizedMedications);
                    setPersistedCurrentMedications(cloneMedicationList(normalizedMedications));
                    setIsCurrentMedicalModalOpen(false);
                    toast.success("Saved", "Health information updated successfully.");
                  }
                }}>
                  <div className="space-y-6">
                    {/* CONDITIONS */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Current Diagnosed Conditions</h3>
                      {conditions.map((cond, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            value={cond}
                            onChange={(e) => {
                              const updated = [...conditions];
                              updated[index] = e.target.value;
                              setConditions(updated);
                            }}
                            placeholder="e.g., Diabetes, Asthma"
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <button
                            type="button"
                            className="text-red-500"
                            onClick={() =>
                              setConditions(conditions.filter((_, i) => i !== index))
                            }
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setConditions([...conditions, ""])}
                        type="button"
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Condition
                      </button>
                    </div>

                    {/* MEDICATIONS */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Current Medications</h3>
                      {currentMedications.map((med, index) => (
                        <div
                          key={index}
                          className="p-4 border-2 border-[var(--theme-border)] rounded-lg bg-gray-50 space-y-3 relative"
                        >
                          <button
                            type="button"
                            className="absolute top-2 right-2 text-red-500"
                            onClick={() =>
                              setCurrentMedications(currentMedications.filter((_, i) => i !== index))
                            }
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[var(--theme-button-primary)] mb-2">Name</label>
                              <input
                                value={med.name || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = { ...updated[index], name: e.target.value };
                                  setCurrentMedications(updated);
                                }}
                                placeholder="e.g., Paracetamol"
                                className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[var(--theme-button-primary)] mb-2">Dosage</label>
                              <input
                                value={med.dosage || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = { ...updated[index], dosage: e.target.value };
                                  setCurrentMedications(updated);
                                }}
                                placeholder="e.g., 500 mg"
                                className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[var(--theme-button-primary)] mb-2">Purpose (optional)</label>
                              <input
                                value={med.purpose || ""}
                                onChange={(e) => {
                                  updateCurrentMedicationAtIndex(index, (current) => ({
                                    ...current,
                                    purpose: e.target.value,
                                  }));
                                }}
                                placeholder="e.g., Pain relief"
                                className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800 bg-white"
                              />
                            </div>
                            <div className="md:col-span-2 rounded-lg border-2 border-[var(--theme-border)] bg-white p-4">
                              <label className="block text-[var(--theme-button-primary)] mb-3">Meal Timing</label>
                              <div className="space-y-3">
                                {MEDICATION_MEAL_OPTIONS.map((meal) => {
                                  const derivedMealTiming = deriveMedicationMealTiming(
                                    med.mealTiming,
                                    med.frequency
                                  );
                                  const isSelected = Boolean(derivedMealTiming[meal.key]);
                                  return (
                                    <div key={meal.key} className="flex items-center justify-between gap-4">
                                      <label className="flex items-center gap-2 text-sm text-gray-800">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) =>
                                            handleCurrentMedicationMealSelection(
                                              index,
                                              meal.key,
                                              e.target.checked
                                            )
                                          }
                                          className="h-4 w-4 rounded border-[var(--theme-border)] text-[var(--theme-button-primary)] focus:ring-[var(--theme-button-primary)]"
                                        />
                                        {meal.label}
                                      </label>
                                      {isSelected ? (
                                        <select
                                          value={derivedMealTiming[meal.key]}
                                          onChange={(e) =>
                                            handleCurrentMedicationMealTimingChange(
                                              index,
                                              meal.key,
                                              e.target.value as "before" | "after"
                                            )
                                          }
                                          className="rounded-lg border-2 border-[var(--theme-border)] bg-white px-3 py-2 text-sm text-gray-800"
                                        >
                                          <option value="before">Before</option>
                                          <option value="after">After</option>
                                        </select>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <label className="block text-[var(--theme-button-primary)] mb-2">Start Date</label>
                              <input
                                type="date"
                                value={med.startDate || ""}
                                onChange={(e) => {
                                  updateCurrentMedicationAtIndex(index, (current) => ({
                                    ...current,
                                    startDate: e.target.value,
                                  }));
                                }}
                                className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800 bg-white"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-[var(--theme-button-primary)] mb-2">End Date (optional)</label>
                              <input
                                type="date"
                                value={med.endDate || ""}
                                onChange={(e) => {
                                  updateCurrentMedicationAtIndex(index, (current) => ({
                                    ...current,
                                    endDate: e.target.value || undefined,
                                  }));
                                }}
                                className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800 bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const todayDate = new Date().toISOString().split("T")[0];
                          setCurrentMedications([
                            ...currentMedications,
                            {
                              name: "",
                              dosage: "",
                              purpose: "",
                              frequency: "",
                              mealTiming: undefined,
                              timesPerDay: 0,
                              startDate: todayDate,
                              endDate: undefined,
                              logs: [],
                            },
                          ]);
                        }}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Medication
                      </button>
                    </div>

                    {/* ALLERGIES */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Allergies</h3>
                      {allergy.map((allergyItem, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            value={allergyItem}
                            onChange={(e) => {
                              const updated = [...allergy];
                              updated[index] = e.target.value;
                              setAllergy(updated);
                            }}
                            placeholder="e.g., Peanuts, Penicillin"
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <button
                            type="button"
                            className="text-red-500"
                            onClick={() =>
                              setAllergy(allergy.filter((_, i) => i !== index))
                            }
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAllergy([...allergy, ""])}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Allergy
                      </button>
                    </div>

                    {/* TREATMENTS */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Ongoing Treatments</h3>
                      {treatment.map((treat, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            value={treat}
                            onChange={(e) => {
                              const updated = [...treatment];
                              updated[index] = e.target.value;
                              setTreatment(updated);
                            }}
                            placeholder="e.g., Physiotherapy, Dialysis"
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <button
                            type="button"
                            className="text-red-500"
                            onClick={() =>
                              setTreatment(treatment.filter((_, i) => i !== index))
                            }
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTreatment([...treatment, ""])}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Treatment
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsCurrentMedicalModalOpen(false)}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-[var(--theme-button-primary)] text-white rounded-lg hover:bg-[var(--theme-button-secondary)] transition"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Past Medical History Modal */}
        {isPastMedicalModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Edit Past Medical History</h3>
                <button 
                  onClick={() => setIsPastMedicalModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!profileId || !userId) {
                    toast.warning("No profile selected", "Please select a profile first.");
                    return;
                  }
                  const pastData = {
                    profile_id: profileId,
                    user_id: userId,
                    previous_diagnosed_conditions: previousDiagnosedCondition.map((item) => item.trim()).filter(Boolean),
                    past_surgeries: pastSurgeries
                      .map((surg) => ({
                        name: surg.name.trim(),
                        month: surg.month ? Number(surg.month) : null,
                        year: surg.year ? Number(surg.year) : null,
                      }))
                      .filter((surg) => surg.name && surg.month && surg.year),
                    childhood_illness: childhoodIllness.map((item) => item.trim()).filter(Boolean),
                    long_term_treatments: longTermTreatments.map((item) => item.trim()).filter(Boolean),
                  };
                  const { error } = await supabase
                    .from("health")
                    .upsert(pastData, { onConflict: "profile_id" });
                  if (error) {
                    toast.error("Save failed", error.message);
                  } else {
                    setIsPastMedicalModalOpen(false);
                    toast.success("Saved", "Past medical history updated successfully.");
                  }
                }}>
                  <div className="space-y-6">
                    {/* PREVIOUSLY DIAGNOSED DISEASES */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Previously Diagnosed Diseases</h3>
                      {previousDiagnosedCondition.map((diag, index) => (
                        <div className="flex gap-2 items-center" key={index}>
                          <input
                            value={diag}
                            onChange={(e) => {
                              const updated = [...previousDiagnosedCondition];
                              updated[index] = e.target.value;
                              setPreviousDiagnosedCondition(updated);
                            }}
                            placeholder="e.g., Thyroid, Jaundice"
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPreviousDiagnosedCondition(previousDiagnosedCondition.filter((_, i) => i !== index))
                            }
                            className="text-[var(--theme-button-primary)]"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPreviousDiagnosedCondition([...previousDiagnosedCondition, ""])}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Diagnosed Condition
                      </button>
                    </div>

                    {/* PAST SURGERIES */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Past Surgeries</h3>
                      {pastSurgeries.map((surg, index) => (
                        <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-3 relative text-gray-800">
                          <button
                            type="button"
                            onClick={() => setPastSurgeries(pastSurgeries.filter((_, i) => i !== index))}
                            className="absolute top-2 right-2 text-red-500"
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <input
                            value={surg.name}
                            onChange={(e) => {
                              const updated = [...pastSurgeries];
                              updated[index].name = e.target.value;
                              setPastSurgeries(updated);
                            }}
                            placeholder="Surgery Name"
                            className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <select
                              value={surg.month ?? ""}
                              onChange={(e) => {
                                const updated = [...pastSurgeries];
                                updated[index].month = e.target.value ? Number(e.target.value) : null;
                                setPastSurgeries(updated);
                              }}
                              className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                            >
                              <option value="">Select Month</option>
                              {monthOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={surg.year ?? ""}
                              onChange={(e) => {
                                const updated = [...pastSurgeries];
                                updated[index].year = e.target.value ? Number(e.target.value) : null;
                                setPastSurgeries(updated);
                              }}
                              className="w-full px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                            >
                              <option value="">Select Year</option>
                              {yearOptions.map((year) => (
                                <option key={year} value={year}>
                                  {year}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPastSurgeries([...pastSurgeries, { name: "", month: null, year: null }])}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Surgery
                      </button>
                    </div>

                    {/* CHILDHOOD ILLNESSES */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Childhood Illnesses</h3>
                      {childhoodIllness.map((ill, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            value={ill}
                            onChange={(e) => {
                              const updated = [...childhoodIllness];
                              updated[index] = e.target.value;
                              setChildhoodIllness(updated);
                            }}
                            placeholder="e.g., Chickenpox"
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setChildhoodIllness(childhoodIllness.filter((_, i) => i !== index))
                            }
                            className="text-[var(--theme-button-primary)]"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setChildhoodIllness([...childhoodIllness, ""])}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Childhood Illness
                      </button>
                    </div>

                    {/* LONG-TERM TREATMENTS */}
                    <div className="space-y-4">
                      <h3 className="text-[var(--theme-button-primary)] mb-4">Long-Term Treatments (Previously Taken)</h3>
                      {longTermTreatments.map((treat, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            value={treat}
                            onChange={(e) => {
                              const updated = [...longTermTreatments];
                              updated[index] = e.target.value;
                              setLongTermTreatments(updated);
                            }}
                            placeholder="e.g., Physical Therapy"
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setLongTermTreatments(longTermTreatments.filter((_, i) => i !== index))
                            }
                            className="text-[var(--theme-button-primary)]"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setLongTermTreatments([...longTermTreatments, ""])}
                        className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Treatment
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsPastMedicalModalOpen(false)}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-[var(--theme-button-primary)] text-white rounded-lg hover:bg-[var(--theme-button-secondary)] transition"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Family Medical History Modal */}
        {isFamilyHistoryModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Edit Family Medical History</h3>
                <button 
                  onClick={() => setIsFamilyHistoryModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!profileId || !userId) {
                    toast.warning("No profile selected", "Please select a profile first.");
                    return;
                  }
                  const familyData = { familyMedicalHistory };
                  const { error } = await supabase
                    .from("health")
                    .upsert(
                      {
                        profile_id: profileId,
                        user_id: userId,
                        family_history: familyData,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: "profile_id" }
                    );
                  if (error) {
                    toast.error("Save failed", error.message);
                  } else {
                    setIsFamilyHistoryModalOpen(false);
                    toast.success("Saved", "Family medical history updated successfully.");
                  }
                }}>
                  <div className="space-y-6">
                    <h3 className="text-[var(--theme-button-primary)] mb-2">Family Medical History</h3>
                    {familyMedicalHistory.map((row, index) => (
                      <div key={index} className="flex gap-4 items-center relative">
                        <input
                          value={row.disease}
                          onChange={(e) => {
                            const updated = [...familyMedicalHistory];
                            updated[index].disease = e.target.value;
                            setFamilyMedicalHistory(updated);
                          }}
                          placeholder="e.g., Diabetes"
                          className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                        />
                        <select
                          value={row.relation}
                          onChange={(e) => {
                            const updated = [...familyMedicalHistory];
                            updated[index].relation = e.target.value;
                            setFamilyMedicalHistory(updated);
                          }}
                          className="flex-1 px-4 py-2 rounded-lg border-2 border-[var(--theme-border)] text-gray-800"
                        >
                          <option value="">Select Relation</option>
                          <option>Father</option>
                          <option>Mother</option>
                          <option>Brother</option>
                          <option>Sister</option>
                          <option>Grandparents</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setFamilyMedicalHistory(
                              familyMedicalHistory.filter((_, i) => i !== index)
                            );
                          }}
                          className="text-red-500"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setFamilyMedicalHistory([
                          ...familyMedicalHistory,
                          { disease: "", relation: "" },
                        ])
                      }
                      className="flex items-center gap-2 text-[var(--theme-button-primary)] cursor-pointer"
                    >
                      <Plus className="w-5 h-5" /> Add More
                    </button>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsFamilyHistoryModalOpen(false)}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-[var(--theme-button-primary)] text-white rounded-lg hover:bg-[var(--theme-button-secondary)] transition"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )} 
      </main>
    </div>
  );
}
