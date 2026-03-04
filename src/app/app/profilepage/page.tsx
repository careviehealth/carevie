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
import { useAppProfile } from '@/components/AppProfileProvider';

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
  const [weightKg, setWeightKg] = useState("");
  const [bmi, setBmi] = useState("");
  const [age, setAge] = useState("");
  const [personalDraft, setPersonalDraft] = useState({
    userName: "",
    gender: "",
    dob: "",
    phoneNumber: "",
    bloodGroup: "",
    address: "",
    heightCm: "",
    weightKg: "",
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

  type MedicationLog = {
    medicationId: string;
    timestamp: string;
    taken: boolean;
  };

  type Medication = {
    id?: string;
    name: string;
    dosage: string;
    frequency: string;
    purpose?: string;
    timesPerDay?: number;
    startDate?: string;
    endDate?: string;
    logs?: MedicationLog[];
  };
  
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
  const medicationFrequencyOptions = [
    { label: "Once daily", value: "once_daily", times: 1 },
    { label: "Twice daily", value: "twice_daily", times: 2 },
    { label: "Three times daily", value: "three_times_daily", times: 3 },
    { label: "Four times daily", value: "four_times_daily", times: 4 },
    { label: "Every 4 hours", value: "every_4_hours", times: 6 },
    { label: "Every 6 hours", value: "every_6_hours", times: 4 },
    { label: "Every 8 hours", value: "every_8_hours", times: 3 },
    { label: "Every 12 hours", value: "every_12_hours", times: 2 },
    { label: "As needed", value: "as_needed", times: 0 },
    { label: "With meals", value: "with_meals", times: 3 },
    { label: "Before bed", value: "before_bed", times: 1 },
  ];

  const formatMonthYear = (month: number | null, year: number | null) => {
    if (!month || !year) return "Date not set";
    const label = monthOptions.find((opt) => opt.value === month)?.label ?? String(month);
    return `${label} ${year}`;
  };

  const getFrequencyLabel = (frequencyValue: string) =>
    medicationFrequencyOptions.find((option) => option.value === frequencyValue)?.label ||
    frequencyValue;

  const getFrequencyTimesPerDay = (frequencyValue: string) =>
    medicationFrequencyOptions.find((option) => option.value === frequencyValue)?.times ?? 1;
  const compactPreviewCount = 6;
  const detailedPreviewCount = 3;

  const cloneMedicationList = (items: Medication[]) =>
    items.map((medication) => ({
      ...medication,
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
    const dosage = (medication.dosage || "").trim();
    const purpose = (medication.purpose || "").trim();
    const frequency = (medication.frequency || "").trim();
    const startDate = (medication.startDate || "").trim() || null;
    const endDate = (medication.endDate || "").trim() || null;
    const timesPerDay =
      typeof medication.timesPerDay === "number" && Number.isFinite(medication.timesPerDay)
        ? Math.max(0, Math.floor(medication.timesPerDay))
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
      medication.frequency ? getFrequencyLabel(medication.frequency) : "",
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

  const parseNullablePositiveNumber = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return Number.NaN;
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

  const computeBmiFromMetrics = (nextHeightCm: number | null, nextWeightKg: number | null): number | null => {
    if (!nextHeightCm || !nextWeightKg) return null;
    if (nextHeightCm < 50 || nextHeightCm > 260) return null;
    if (nextWeightKg < 10 || nextWeightKg > 400) return null;
    const h = nextHeightCm / 100;
    return Math.round((nextWeightKg / (h * h)) * 10) / 10;
  };

  const openPersonalInfoModal = () => {
    setPersonalDraft({
      userName,
      gender,
      dob,
      phoneNumber,
      bloodGroup,
      address,
      heightCm,
      weightKg,
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
        doc.text(`- ${med.name} (${med.dosage}, ${med.frequency})`, 30, yPosition);
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
        weight_kg: number | string | null;
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
        const clonedCachedMeds = cachedMeds.map((medication) => ({
          ...medication,
          logs: Array.isArray(medication.logs) ? [...medication.logs] : [],
        }));
        setCurrentMedications(clonedCachedMeds);
        setPersistedCurrentMedications(clonedCachedMeds);
        setHeightCm(
          cachedHealth.height_cm !== null && cachedHealth.height_cm !== undefined
            ? String(cachedHealth.height_cm)
            : ''
        );
        setWeightKg(
          cachedHealth.weight_kg !== null && cachedHealth.weight_kg !== undefined
            ? String(cachedHealth.weight_kg)
            : ''
        );
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
            weight_kg,
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
      const clonedResolvedMedicationList = resolvedMedicationList.map((medication) => ({
        ...medication,
        logs: Array.isArray(medication.logs) ? [...medication.logs] : [],
      }));
      setCurrentMedications(clonedResolvedMedicationList);
      setPersistedCurrentMedications(clonedResolvedMedicationList);

      if (data){
        setConditions((data.current_diagnosed_condition as string[]) || []);
        setAllergy((data.allergies as string[]) || []);
        setTreatment((data.ongoing_treatments as string[]) || []);
        setHeightCm(
          data.height_cm !== null && data.height_cm !== undefined ? String(data.height_cm) : ""
        );
        setWeightKg(
          data.weight_kg !== null && data.weight_kg !== undefined ? String(data.weight_kg) : ""
        );
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
          weight_kg: data.weight_kg ?? null,
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
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <Pill className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-700">{current.name || "Medication"}</p>
                <p className="text-xs text-gray-500">Dosage: {current.dosage || "Not specified"}</p>
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
    <div className="min-h-screen pb-10 font-sans relative bg-[#F5F5DC]">

      {/* Navbar */}
      

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
          
          {/* Left: Basic Info & KPIs */}
          <div
            className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-xl shadow-amber-900/20 border border-white/20 flex flex-col h-full relative overflow-hidden"
            data-tour="profile-overview"
          >
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-40 h-40 sm:w-64 sm:h-64 bg-gradient-to-br from-amber-50 to-brown-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-80 pointer-events-none"></div>

            {/* Edit and Export Buttons */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button
                onClick={exportToPDF}
                className="px-4 py-2 bg-[#8B4513] text-white text-xs font-semibold uppercase tracking-wide rounded-full shadow-sm transition hover:bg-[#A0522D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B4513]/40"
                title="Export as PDF"
              >
                Export as PDF
              </button>
              <button
                onClick={openPersonalInfoModal}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[#FF8000] hover:bg-orange-50 rounded-full border border-gray-200 shadow-sm transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Info */}
            <div className="flex flex-col md:flex-row items-start gap-6 mb-8 mt-2 relative z-0">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center border-[4px] border-white shadow-lg shrink-0">
                  <User className="w-8 h-8 sm:w-10 sm:h-10 text-amber-700/80" />
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
                  <div className="flex items-center gap-2 text-sm text-gray-600 group hover:text-amber-600 transition">
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-amber-50 flex items-center justify-center">
                      <Phone className="w-3 h-3" />
                    </div>
                    <span>{phoneNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 group hover:text-amber-600 transition">
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-amber-50 flex items-center justify-center">
                      <Calendar className="w-3 h-3" />
                    </div>
                    <span>{dob}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 group hover:text-amber-600 transition">
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-amber-50 flex items-center justify-center">
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
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-amber-900/20 border border-white/20 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Family Medical History</h3>
              <button
                onClick={() => setIsFamilyHistoryModalOpen(true)}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[#FF8000] hover:bg-orange-50 rounded-full border border-gray-200 shadow-sm transition"
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
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-amber-900/20 border border-white/20 self-start">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Current Medical Status</h3>
              <button
                onClick={() => setIsCurrentMedicalModalOpen(true)}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[#FF8000] hover:bg-orange-50 rounded-full border border-gray-200 shadow-sm transition"
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
                      ? "bg-[#8B4513] text-white border-[#8B4513]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#8B4513]/40 hover:text-[#8B4513]"
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
                className="text-xs font-semibold text-[#8B4513] hover:text-[#A0522D] transition disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                View full details
              </button>
            </div>
          </div>

          {/* Past Medical History */}
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-amber-900/20 border border-white/20 self-start">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Past Medical History</h3>
              <button
                onClick={() => setIsPastMedicalModalOpen(true)}
                className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-[#FF8000] hover:bg-orange-50 rounded-full border border-gray-200 shadow-sm transition"
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
                      ? "bg-[#8B4513] text-white border-[#8B4513]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#8B4513]/40 hover:text-[#8B4513]"
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
                className="text-xs font-semibold text-[#8B4513] hover:text-[#A0522D] transition disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                View full details
              </button>
            </div>
          </div>
        </div>

        {/* Medical Details Drawer */}
        {medicalDrawerState && (
          <div className="fixed inset-0 z-[60]">
            <button
              type="button"
              onClick={() => setMedicalDrawerState(null)}
              className="absolute inset-0 bg-black/40"
              aria-label="Close medical details drawer"
            />
            <aside className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-200 shadow-2xl flex flex-col">
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
                    alert("Please select a profile first.");
                    return;
                  }
                  const parsedHeightCm = parseNullablePositiveNumber(personalDraft.heightCm);
                  const parsedWeightKg = parseNullablePositiveNumber(personalDraft.weightKg);
                  if (Number.isNaN(parsedHeightCm)) {
                    alert("Please enter a valid height in cm.");
                    return;
                  }
                  if (Number.isNaN(parsedWeightKg)) {
                    alert("Please enter a valid weight in kg.");
                    return;
                  }
                  const computedAge = computeAgeFromDob(personalDraft.dob);
                  const computedBmi = computeBmiFromMetrics(parsedHeightCm, parsedWeightKg);
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
                  const { error: healthError } = await supabase
                    .from("health")
                    .upsert(
                      {
                        profile_id: profileId,
                        user_id: userId,
                        date_of_birth: personalDraft.dob,
                        blood_group: personalDraft.bloodGroup,
                        height_cm: parsedHeightCm,
                        weight_kg: parsedWeightKg,
                        age: computedAge,
                        bmi: computedBmi,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: "profile_id" }
                    );
                  if (profileError) {
                    alert("Error: " + profileError.message);
                  } else if (healthError) {
                    alert("Error: " + healthError.message);
                  } else {
                    setUserName(personalDraft.userName);
                    setGender(personalDraft.gender);
                    setDob(personalDraft.dob);
                    setPhoneNumber(personalDraft.phoneNumber);
                    setBloodGroup(personalDraft.bloodGroup);
                    setAddress(personalDraft.address);
                    setHeightCm(parsedHeightCm !== null ? String(parsedHeightCm) : "");
                    setWeightKg(parsedWeightKg !== null ? String(parsedWeightKg) : "");
                    setAge(computedAge !== null ? String(computedAge) : "");
                    setBmi(computedBmi !== null ? String(computedBmi) : "");
                    setIsPersonalInfoModalOpen(false);
                    alert("Personal information updated successfully!");
                  }
                }}>
                  <div className="space-y-4">
                    <h3 className="text-[#FF8000] mb-4">Basic Personal Information</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[#309898] mb-2">Full Name *</label>
                        <input
                          value={personalDraft.userName}
                          onChange={(e) => updatePersonalDraft({ userName: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          placeholder="Full Name"
                        />
                      </div>

                      <div>
                        <label className="block text-[#309898] mb-2">Date of Birth *</label>
                        <input
                          type="date"
                          value={personalDraft.dob}
                          onChange={(e) => updatePersonalDraft({ dob: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[#309898] mb-2">Gender *</label>
                        <select
                          value={personalDraft.gender}
                          onChange={(e) => updatePersonalDraft({ gender: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                        >
                          <option>Select Gender</option>
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#309898] mb-2">Blood Group *</label>  
                        <select
                          value={personalDraft.bloodGroup}
                          onChange={(e) => updatePersonalDraft({ bloodGroup: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                        <label className="block text-[#309898] mb-2">Address *</label>
                        <textarea
                          value={personalDraft.address}
                          onChange={(e) => updatePersonalDraft({ address: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          placeholder="Address"
                        />
                      </div>

                      <div>
                        <label className="block text-[#309898] mb-2">Contact Number *</label>
                        <input
                          type="tel"
                          value={personalDraft.phoneNumber}
                          onChange={(e) => updatePersonalDraft({ phoneNumber: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          placeholder="eg: 1234567890"
                        />
                      </div>

                      <div>
                        <label className="block text-[#309898] mb-2">Height (cm)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={personalDraft.heightCm}
                          onChange={(e) => updatePersonalDraft({ heightCm: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          placeholder="eg: 170"
                        />
                      </div>

                      <div>
                        <label className="block text-[#309898] mb-2">Weight (kg)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={personalDraft.weightKg}
                          onChange={(e) => updatePersonalDraft({ weightKg: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          placeholder="eg: 65"
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
                      className="px-6 py-2 bg-[#8B4513] text-white rounded-lg hover:bg-[#A0522D] transition"
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
                    alert("Please select a profile first.");
                    return;
                  }
                  const todayDate = new Date().toISOString().split("T")[0];
                  const hasIncompleteMedication = currentMedications.some((med) => {
                    const hasAnyValue = med.name.trim() || med.dosage.trim() || med.frequency.trim();
                    if (!hasAnyValue) return false;
                    return !med.name.trim() || !med.dosage.trim() || !med.frequency.trim();
                  });
                  if (hasIncompleteMedication) {
                    alert("Please fill Name, Dosage, and Frequency for each medication.");
                    return;
                  }

                  const normalizedMedications = currentMedications
                    .map((med) => {
                      const frequencyValue = (med.frequency || "").trim();
                      const resolvedTimesPerDay =
                        typeof med.timesPerDay === "number" && med.timesPerDay >= 0
                          ? med.timesPerDay
                          : getFrequencyTimesPerDay(frequencyValue);
                      return {
                        id: med.id?.trim() || crypto.randomUUID(),
                        name: (med.name || "").trim(),
                        dosage: (med.dosage || "").trim(),
                        purpose: (med.purpose || "").trim(),
                        frequency: frequencyValue,
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
                    alert("Error: " + healthError.message);
                  } else if (medicationError) {
                    alert("Error: " + medicationError.message);
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
                    alert("Health information updated successfully!");
                  }
                }}>
                  <div className="space-y-6">
                    {/* CONDITIONS */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Current Diagnosed Conditions</h3>
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
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Condition
                      </button>
                    </div>

                    {/* MEDICATIONS */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Current Medications</h3>
                      {currentMedications.map((med, index) => (
                        <div
                          key={index}
                          className="p-4 border-2 border-[#309898]/30 rounded-lg bg-gray-50 space-y-3 relative"
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
                              <label className="block text-[#309898] mb-2">Name</label>
                              <input
                                value={med.name || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = { ...updated[index], name: e.target.value };
                                  setCurrentMedications(updated);
                                }}
                                placeholder="e.g., Paracetamol"
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[#309898] mb-2">Dosage</label>
                              <input
                                value={med.dosage || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = { ...updated[index], dosage: e.target.value };
                                  setCurrentMedications(updated);
                                }}
                                placeholder="e.g., 500 mg"
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[#309898] mb-2">Purpose (optional)</label>
                              <input
                                value={med.purpose || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = { ...updated[index], purpose: e.target.value };
                                  setCurrentMedications(updated);
                                }}
                                placeholder="e.g., Pain relief"
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[#309898] mb-2">Frequency</label>
                              <select
                                value={med.frequency || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  const selectedFrequency = e.target.value;
                                  const selectedOption = medicationFrequencyOptions.find(
                                    (option) => option.value === selectedFrequency
                                  );
                                  updated[index] = {
                                    ...updated[index],
                                    frequency: selectedFrequency,
                                    timesPerDay: selectedOption?.times ?? updated[index].timesPerDay ?? 1,
                                  };
                                  setCurrentMedications(updated);
                                }}
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white"
                              >
                                <option value="">Select frequency</option>
                                {medicationFrequencyOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                                {med.frequency &&
                                !medicationFrequencyOptions.some(
                                  (option) => option.value === med.frequency
                                ) ? (
                                  <option value={med.frequency}>{med.frequency}</option>
                                ) : null}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[#309898] mb-2">Times per Day</label>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                value={String(
                                  typeof med.timesPerDay === "number"
                                    ? med.timesPerDay
                                    : getFrequencyTimesPerDay(med.frequency || "")
                                )}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  const parsed = Number(e.target.value);
                                  updated[index] = {
                                    ...updated[index],
                                    timesPerDay: Number.isFinite(parsed) && parsed >= 0 ? parsed : 1,
                                  };
                                  setCurrentMedications(updated);
                                }}
                                disabled={medicationFrequencyOptions.some(
                                  (option) => option.value === (med.frequency || "")
                                )}
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white disabled:bg-gray-100"
                                placeholder="1"
                              />
                            </div>
                            <div>
                              <label className="block text-[#309898] mb-2">Start Date</label>
                              <input
                                type="date"
                                value={med.startDate || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = { ...updated[index], startDate: e.target.value };
                                  setCurrentMedications(updated);
                                }}
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-[#309898] mb-2">End Date (optional)</label>
                              <input
                                type="date"
                                value={med.endDate || ""}
                                onChange={(e) => {
                                  const updated = [...currentMedications];
                                  updated[index] = {
                                    ...updated[index],
                                    endDate: e.target.value || undefined,
                                  };
                                  setCurrentMedications(updated);
                                }}
                                className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800 bg-white"
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
                              timesPerDay: 1,
                              startDate: todayDate,
                              endDate: undefined,
                              logs: [],
                            },
                          ]);
                        }}
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Medication
                      </button>
                    </div>

                    {/* ALLERGIES */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Allergies</h3>
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
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Allergy
                      </button>
                    </div>

                    {/* TREATMENTS */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Ongoing Treatments</h3>
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
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
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
                      className="px-6 py-2 bg-[#8B4513] text-white rounded-lg hover:bg-[#A0522D] transition"
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
                    alert("Please select a profile first.");
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
                    alert("Error: " + error.message);
                  } else {
                    setIsPastMedicalModalOpen(false);
                    alert("Past medical history updated successfully!");
                  }
                }}>
                  <div className="space-y-6">
                    {/* PREVIOUSLY DIAGNOSED DISEASES */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Previously Diagnosed Diseases</h3>
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
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPreviousDiagnosedCondition(previousDiagnosedCondition.filter((_, i) => i !== index))
                            }
                            className="text-[#FF8000]"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPreviousDiagnosedCondition([...previousDiagnosedCondition, ""])}
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Diagnosed Condition
                      </button>
                    </div>

                    {/* PAST SURGERIES */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Past Surgeries</h3>
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
                            className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <select
                              value={surg.month ?? ""}
                              onChange={(e) => {
                                const updated = [...pastSurgeries];
                                updated[index].month = e.target.value ? Number(e.target.value) : null;
                                setPastSurgeries(updated);
                              }}
                              className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                              className="w-full px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Surgery
                      </button>
                    </div>

                    {/* CHILDHOOD ILLNESSES */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Childhood Illnesses</h3>
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
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setChildhoodIllness(childhoodIllness.filter((_, i) => i !== index))
                            }
                            className="text-[#FF8000]"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setChildhoodIllness([...childhoodIllness, ""])}
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
                      >
                        <Plus className="w-5 h-5" /> Add Childhood Illness
                      </button>
                    </div>

                    {/* LONG-TERM TREATMENTS */}
                    <div className="space-y-4">
                      <h3 className="text-[#FF8000] mb-4">Long-Term Treatments (Previously Taken)</h3>
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
                            className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setLongTermTreatments(longTermTreatments.filter((_, i) => i !== index))
                            }
                            className="text-[#FF8000]"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setLongTermTreatments([...longTermTreatments, ""])}
                        className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
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
                      className="px-6 py-2 bg-[#FF8000] text-white rounded-lg hover:bg-[#309898] transition"
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
                    alert("Please select a profile first.");
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
                    alert("Error: " + error.message);
                  } else {
                    setIsFamilyHistoryModalOpen(false);
                    alert("Family medical history updated successfully!");
                  }
                }}>
                  <div className="space-y-6">
                    <h3 className="text-[#FF8000] mb-2">Family Medical History</h3>
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
                          className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
                        />
                        <select
                          value={row.relation}
                          onChange={(e) => {
                            const updated = [...familyMedicalHistory];
                            updated[index].relation = e.target.value;
                            setFamilyMedicalHistory(updated);
                          }}
                          className="flex-1 px-4 py-2 rounded-lg border-2 border-[#309898]/30 text-gray-800"
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
                      className="flex items-center gap-2 text-[#FF8000] cursor-pointer"
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
                      className="px-6 py-2 bg-[#8B4513] text-white rounded-lg hover:bg-[#A0522D] transition"
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
