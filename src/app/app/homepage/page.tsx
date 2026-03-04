"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/createClient";
import { AppointmentsModal } from "@/components/AppointmentsModal";
import { EmergencyContactsModal, type EmergencyContact } from "@/components/EmergencyContactsModal";
import { MedicalTeamModal, type Doctor } from "@/components/MedicalTeamModal";
import { MedicationsModal, type Medication } from "@/components/MedicationsModal";
import { MedicalSummaryModal } from "@/components/MedicalSummaryModal";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useAppProfile } from "@/components/AppProfileProvider";
import {
  Calendar,
  Users,
  Stethoscope,
  Pill,
  AlertCircle,
  Bell,
  X,
} from "lucide-react";

/* =======================
   TYPES
======================= */

type Appointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  [key: string]: string;
};

type CacheEntry<T> = {
  ts: number;
  value: T;
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

type RawMedicationLog = {
  medicationId?: unknown;
  timestamp?: unknown;
  taken?: unknown;
};

type RawMedication = {
  id?: unknown;
  name?: unknown;
  dosage?: unknown;
  purpose?: unknown;
  frequency?: unknown;
  timesPerDay?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  logs?: unknown;
};

const HOME_CACHE_TTL_MS = 5 * 60 * 1000;
const homeCacheKey = (cacheOwnerId: string, key: string) => `vytara:home:${cacheOwnerId}:${key}`;

const readHomeCache = <T,>(cacheOwnerId: string, key: string): T | null => {
  if (!cacheOwnerId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(homeCacheKey(cacheOwnerId, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > HOME_CACHE_TTL_MS) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
};

const writeHomeCache = <T,>(cacheOwnerId: string, key: string, value: T) => {
  if (!cacheOwnerId || typeof window === "undefined") return;
  const entry: CacheEntry<T> = { ts: Date.now(), value };
  window.localStorage.setItem(homeCacheKey(cacheOwnerId, key), JSON.stringify(entry));
};

const medicationFrequencyTimes: Record<string, number> = {
  once_daily: 1,
  twice_daily: 2,
  three_times_daily: 3,
  four_times_daily: 4,
  every_4_hours: 6,
  every_6_hours: 4,
  every_8_hours: 3,
  every_12_hours: 2,
  as_needed: 0,
  with_meals: 3,
  before_bed: 1,
};

const APPOINTMENT_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  type: "Type",
  date: "Date",
  time: "Time",
  doctorName: "Doctor name",
  specialty: "Specialty",
  hospitalName: "Hospital or clinic",
  reason: "Reason",
  testName: "Test name",
  labName: "Lab name",
  instructions: "Instructions",
  department: "Department",
  therapyType: "Therapy type",
  therapistName: "Therapist name",
  location: "Location",
  previousDoctor: "Previous doctor",
  previousVisitReason: "Previous visit reason",
  description: "Description",
  contactPerson: "Contact person",
};

const MEDICATION_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  dosage: "Dosage",
  purpose: "Purpose",
  frequency: "Frequency",
  timesPerDay: "Times per day",
  startDate: "Start date",
  endDate: "End date",
};

const normalizeActivityMetadataValue = (value: unknown): ActivityMetadataValue => {
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

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getAppointmentActivityFieldLabel = (field: string) => {
  if (APPOINTMENT_ACTIVITY_FIELD_LABELS[field]) {
    return APPOINTMENT_ACTIVITY_FIELD_LABELS[field];
  }
  const normalized = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return toTitleCase(normalized || field);
};

const buildAppointmentActivityChanges = (
  previousAppointment: Appointment,
  nextAppointment: Appointment
): ActivityMetadataChange[] => {
  const keys = Array.from(
    new Set([...Object.keys(previousAppointment), ...Object.keys(nextAppointment)])
  ).filter((key) => key !== "id");
  const prioritized = ["title", "type", "date", "time"];
  const orderedKeys = [
    ...prioritized.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !prioritized.includes(key)).sort(),
  ];
  return orderedKeys
    .map((key) => {
      const before = normalizeActivityMetadataValue(previousAppointment[key]);
      const after = normalizeActivityMetadataValue(nextAppointment[key]);
      if (before === after) return null;
      return {
        field: key,
        label: getAppointmentActivityFieldLabel(key),
        before,
        after,
      };
    })
    .filter((entry): entry is ActivityMetadataChange => entry !== null);
};

const getMedicationActivityFieldLabel = (field: string) => {
  if (MEDICATION_ACTIVITY_FIELD_LABELS[field]) {
    return MEDICATION_ACTIVITY_FIELD_LABELS[field];
  }
  const normalized = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return toTitleCase(normalized || field);
};

const buildMedicationActivityChanges = (
  previousMedication: Medication,
  nextMedication: Medication
): ActivityMetadataChange[] => {
  const fields = [
    "name",
    "dosage",
    "purpose",
    "frequency",
    "timesPerDay",
    "startDate",
    "endDate",
  ] as const;
  return fields.reduce<ActivityMetadataChange[]>((changes, field) => {
      const before = normalizeActivityMetadataValue(previousMedication[field] ?? null);
      const after = normalizeActivityMetadataValue(nextMedication[field] ?? null);
      if (before === after) return changes;
      changes.push({
        field,
        label: getMedicationActivityFieldLabel(field),
        before,
        after,
      });
      return changes;
    }, []);
};

const resolveTimesPerDay = (frequency: string, value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return medicationFrequencyTimes[frequency] ?? 1;
};

const normalizeMedicationList = (value: unknown): Medication[] => {
  if (!Array.isArray(value)) return [];
  const todayDate = new Date().toISOString().split("T")[0];
  return value
    .map((entry) => {
      const med = (entry || {}) as RawMedication;
      const id =
        typeof med.id === "string" && med.id.trim() ? med.id.trim() : crypto.randomUUID();
      const frequency = typeof med.frequency === "string" ? med.frequency.trim() : "";
      const rawLogs = Array.isArray(med.logs) ? (med.logs as RawMedicationLog[]) : [];
      const logs = rawLogs
        .map((log) => ({
          medicationId:
            typeof log.medicationId === "string" && log.medicationId.trim()
              ? log.medicationId.trim()
              : id,
          timestamp: typeof log.timestamp === "string" ? log.timestamp.trim() : "",
          taken: typeof log.taken === "boolean" ? log.taken : null,
        }))
        .filter(
          (log): log is { medicationId: string; timestamp: string; taken: boolean } =>
            Boolean(log.timestamp) && log.taken !== null
        );

      return {
        id,
        name: typeof med.name === "string" ? med.name.trim() : "",
        dosage: typeof med.dosage === "string" ? med.dosage.trim() : "",
        purpose: typeof med.purpose === "string" ? med.purpose.trim() : "",
        frequency,
        timesPerDay: resolveTimesPerDay(frequency, med.timesPerDay),
        startDate:
          typeof med.startDate === "string" && med.startDate.trim()
            ? med.startDate.trim()
            : todayDate,
        endDate:
          typeof med.endDate === "string" && med.endDate.trim() ? med.endDate.trim() : undefined,
        logs,
      };
    })
    .filter((med) => med.name && med.dosage && med.frequency);
};

const getErrorMessage = (error: unknown, fallback = "Please try again.") => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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

/* =======================
   PAGE COMPONENT
======================= */

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">
          Loading...
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");
  const { selectedProfile } = useAppProfile();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");

  const [name, setName] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [medicalTeam, setMedicalTeam] = useState<Doctor[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isSendingSOS, setIsSendingSOS] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [hasUnreadSummary, setHasUnreadSummary] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [greeting, setGreeting] = useState("Good Morning");
  const profileId = selectedProfile?.id ?? "";
  const cacheOwnerId = profileId || userId;

  useEffect(() => {
    setHasUnreadSummary(false);
  }, [profileId]);

  useEffect(() => {
    if (!openParam) return;

    const sectionMap: Record<string, string> = {
      calendar: "calendar",
      emergency: "emergency",
      doctors: "doctors",
      medications: "medications",
    };
    const targetSection = sectionMap[openParam];

    if (targetSection) {
      setIsNotificationsOpen(false);
      setActiveSection(targetSection);
    }

    router.replace("/app/homepage", { scroll: false });
  }, [openParam, router]);

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) {
        setGreeting("Good Morning");
      } else if (hour < 18) {
        setGreeting("Good Afternoon");
      } else {
        setGreeting("Good Evening");
      }
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60_000);
    return () => clearInterval(interval);
  }, []);

  /* =======================
     AUTH USER SETUP
  ======================= */

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const nextUserId = session?.user?.id ?? "";
      setUserId((prev) => (prev === nextUserId ? prev : nextUserId));
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? "";
      setUserId((prev) => (prev === nextUserId ? prev : nextUserId));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  /* =======================
     PROFILE DISPLAY NAME
  ======================= */

  useEffect(() => {
    if (!cacheOwnerId) return;

    const cachedDisplayName = readHomeCache<string>(cacheOwnerId, "display_name");
    if (cachedDisplayName) {
      setName(cachedDisplayName);
    }

    const resolvedName =
      selectedProfile?.display_name?.trim() ||
      selectedProfile?.name?.trim() ||
      "";
    if (resolvedName) {
      setName(resolvedName);
      writeHomeCache(cacheOwnerId, "display_name", resolvedName);
      return;
    }

    setName("");
  }, [cacheOwnerId, selectedProfile?.display_name, selectedProfile?.name]);

  /* =======================
     FETCH EMERGENCY CONTACTS FROM DB (JSONB)
  ======================= */

  useEffect(() => {
    if (!userId || !profileId) {
      setEmergencyContacts([]);
      return;
    }

    const fetchEmergencyContacts = async () => {
      const cachedContacts = readHomeCache<EmergencyContact[]>(cacheOwnerId, "emergency_contacts");
      if (cachedContacts) {
        setEmergencyContacts(cachedContacts);
      }

      const { data, error } = await supabase
        .from("user_emergency_contacts")
        .select("contacts")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST116") {
          setEmergencyContacts([]);
        } else {
          if (process.env.NODE_ENV !== 'production') {
            console.error("Emergency fetch error:", error);
          }
          setEmergencyContacts([]);
        }
        return;
      }

      setEmergencyContacts(data?.contacts || []);
      writeHomeCache(cacheOwnerId, "emergency_contacts", data?.contacts || []);
    };

    fetchEmergencyContacts();
  }, [cacheOwnerId, profileId, userId]);

  /* =======================
     FETCH MEDICAL TEAM FROM DB (JSONB)
  ======================= */

  useEffect(() => {
    if (!userId || !profileId) {
      setMedicalTeam([]);
      return;
    }

    async function fetchMedicalTeam() {
      const cachedTeam = readHomeCache<Doctor[]>(cacheOwnerId, "medical_team");
      if (cachedTeam) {
        setMedicalTeam(cachedTeam);
      }

      const { data, error } = await supabase
        .from("user_medical_team")
        .select("doctors")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error) {
        if (error.code !== "PGRST116") {
          if (process.env.NODE_ENV !== 'production') {
            console.error("Medical team fetch error:", error);
          }
        }
        setMedicalTeam([]);
        return;
      }

      setMedicalTeam(data?.doctors || []);
      writeHomeCache(cacheOwnerId, "medical_team", data?.doctors || []);
    }

    fetchMedicalTeam();
  }, [cacheOwnerId, profileId, userId]);

  /* =======================
     FETCH MEDICATIONS FROM DB (JSONB)
  ======================= */

  useEffect(() => {
    if (!userId || !profileId) {
      setMedications([]);
      return;
    }

    async function fetchMedications() {
      const cachedMeds = readHomeCache<Medication[]>(cacheOwnerId, "medications");
      if (cachedMeds) {
        setMedications(normalizeMedicationList(cachedMeds));
      }

      const { data, error } = await supabase
        .from("user_medications")
        .select("medications")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error) {
        if (error.code !== "PGRST116") {
          if (process.env.NODE_ENV !== 'production') {
            console.error("Medications fetch error:", error);
          }
        }
        setMedications([]);
        return;
      }

      const rawMedicationList = data?.medications || [];
      const normalizedMedications = normalizeMedicationList(rawMedicationList);
      setMedications(normalizedMedications);
      writeHomeCache(cacheOwnerId, "medications", normalizedMedications);

      const shouldRepair =
        JSON.stringify(rawMedicationList || []) !== JSON.stringify(normalizedMedications);
      if (shouldRepair) {
        const { error: repairError } = await supabase
          .from("user_medications")
          .upsert(
            {
              profile_id: profileId,
              user_id: userId,
              medications: normalizedMedications,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "profile_id" }
          );
        if (repairError) {
          if (process.env.NODE_ENV !== 'production') {
            console.error("Medications repair error:", repairError);
          }
        }
      }
    }

    fetchMedications();
  }, [cacheOwnerId, profileId, userId]);

  /* =======================
     FETCH APPOINTMENTS FROM DB (JSONB)
  ======================= */

  useEffect(() => {
    if (!userId || !profileId) {
      setAppointments([]);
      return;
    }

    async function fetchAppointments() {
      const cachedAppointments = readHomeCache<Appointment[]>(cacheOwnerId, "appointments");
      if (cachedAppointments) {
        setAppointments(cachedAppointments);
      }

      const { data, error } = await supabase
        .from("user_appointments")
        .select("appointments")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error) {
        if (error.code !== "PGRST116") {
          if (process.env.NODE_ENV !== 'production') {
            console.error("Appointments fetch error:", error);
          }
        }
        setAppointments([]);
        return;
      }

      setAppointments(data?.appointments || []);
      writeHomeCache(cacheOwnerId, "appointments", data?.appointments || []);
    }

    fetchAppointments();
  }, [cacheOwnerId, profileId, userId]);

  /* =======================
     APPOINTMENTS: ADD / UPDATE / DELETE
  ======================= */

  const handleAddAppointment = async (appointment: Appointment) => {
    if (!userId || !profileId) return;

    const existingAppointment = appointments.find((a) => a.id === appointment.id) ?? null;
    let updatedAppointments: Appointment[];
    const isUpdate = Boolean(existingAppointment);

    if (isUpdate) {
      updatedAppointments = appointments.map((a) =>
        a.id === appointment.id ? appointment : a
      );
    } else {
      updatedAppointments = [...appointments, appointment];
    }

    const { error } = await supabase
      .from("user_appointments")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          appointments: updatedAppointments,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Save appointment error:", error);
      }
      alert("Failed to save appointment");
      return;
    }

    const appointmentChanges =
      isUpdate && existingAppointment
        ? buildAppointmentActivityChanges(existingAppointment, appointment)
        : [];
    const metadata: Record<string, unknown> = {
      id: appointment.id,
      title: appointment.title || null,
      type: appointment.type || null,
      date: appointment.date || null,
      time: appointment.time || null,
    };
    if (isUpdate) {
      metadata.changes = appointmentChanges;
      metadata.changeCount = appointmentChanges.length;
    }

    void logProfileActivity({
      profileId,
      domain: "appointment",
      action: isUpdate ? "update" : "add",
      entity: {
        id: appointment.id,
        label: appointment.title || appointment.type || "Appointment",
      },
      metadata,
    });

    setAppointments(updatedAppointments);
    writeHomeCache(cacheOwnerId, "appointments", updatedAppointments);
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = confirm("Delete this appointment?");
    if (!confirmed) return;

    const deletedAppointment = appointments.find((a) => a.id === id) ?? null;
    const updatedAppointments = appointments.filter((a) => a.id !== id);

    const { error } = await supabase
      .from("user_appointments")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          appointments: updatedAppointments,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Delete appointment error:", error);
      }
      alert("Failed to delete appointment");
      return;
    }

    void logProfileActivity({
      profileId,
      domain: "appointment",
      action: "delete",
      entity: {
        id,
        label: deletedAppointment?.title || deletedAppointment?.type || "Appointment",
      },
      metadata: {
        id,
        title: deletedAppointment?.title || null,
        type: deletedAppointment?.type || null,
        date: deletedAppointment?.date || null,
        time: deletedAppointment?.time || null,
      },
    });

    setAppointments(updatedAppointments);
    writeHomeCache(cacheOwnerId, "appointments", updatedAppointments);
  };

  /* =======================
     EMERGENCY CONTACTS: ADD / DELETE
  ======================= */

  const addEmergencyContact = async (contact: EmergencyContact) => {
    if (!userId || !profileId) return;

    if (!contact.name.trim() || !contact.phone.trim() || !contact.relation.trim()) {
      alert("Please fill Name, Phone and Relation.");
      return;
    }

    const newContact = {
      id: crypto.randomUUID(),
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      relation: contact.relation.trim(),
    };

    const updatedContacts = [...emergencyContacts, newContact];

    const { error } = await supabase
      .from("user_emergency_contacts")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          contacts: updatedContacts,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Add emergency contact error:", error);
      }
      alert("Failed to add contact. Please try again.");
      return;
    }

    setEmergencyContacts(updatedContacts);
    writeHomeCache(cacheOwnerId, "emergency_contacts", updatedContacts);
  };

  const deleteEmergencyContact = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = confirm("Delete this emergency contact?");
    if (!confirmed) return;

    const updatedContacts = emergencyContacts.filter((c) => c.id !== id);

    const { error } = await supabase
      .from("user_emergency_contacts")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          contacts: updatedContacts,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Delete emergency contact error:", error);
      }
      alert("Failed to delete contact. Please try again.");
      return;
    }

    setEmergencyContacts(updatedContacts);
    writeHomeCache(cacheOwnerId, "emergency_contacts", updatedContacts);
  };

  /* =======================
     MEDICAL TEAM: ADD / EDIT / DELETE
  ======================= */

  const addDoctor = async (doctor: Doctor) => {
    if (!userId || !profileId) return;

    if (!doctor.name.trim() || !doctor.number.trim() || !doctor.speciality.trim()) {
      alert("Please fill all fields.");
      return;
    }

    const newDoctor = {
      id: crypto.randomUUID(),
      name: doctor.name.trim(),
      number: doctor.number.trim(),
      speciality: doctor.speciality.trim(),
    };

    const updatedDoctors = [...medicalTeam, newDoctor];

    const { error } = await supabase
      .from("user_medical_team")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          doctors: updatedDoctors,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Add doctor error:", error);
      }
      alert("Failed to add doctor. Please try again.");
      return;
    }

    setMedicalTeam(updatedDoctors);
    writeHomeCache(cacheOwnerId, "medical_team", updatedDoctors);
  };

  const updateDoctor = async (doctor: Doctor) => {
    if (!userId || !profileId) return;

    if (!doctor.name.trim() || !doctor.number.trim() || !doctor.speciality.trim()) {
      alert("Please fill all fields.");
      return;
    }

    const updatedDoctors = medicalTeam.map((d) =>
      d.id === doctor.id ? doctor : d
    );

    const { error } = await supabase
      .from("user_medical_team")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          doctors: updatedDoctors,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Update doctor error:", error);
      }
      alert("Failed to update doctor. Please try again.");
      return;
    }

    setMedicalTeam(updatedDoctors);
    writeHomeCache(cacheOwnerId, "medical_team", updatedDoctors);
  };

  const deleteDoctor = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = confirm("Delete this doctor?");
    if (!confirmed) return;

    const updatedDoctors = medicalTeam.filter((d) => d.id !== id);

    const { error } = await supabase
      .from("user_medical_team")
      .upsert(
        {
          profile_id: profileId,
          user_id: userId,
          doctors: updatedDoctors,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Delete doctor error:", error);
      }
      alert("Failed to delete doctor. Please try again.");
      return;
    }

    setMedicalTeam(updatedDoctors);
    writeHomeCache(cacheOwnerId, "medical_team", updatedDoctors);
  };

  /* =======================
     MEDICATIONS: ADD / EDIT / DELETE
  ======================= */

  const addMedication = async (medication: Medication) => {
    if (!userId || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      alert("Please fill Name, Dosage, and Frequency.");
      return;
    }

    const newMedication: Medication = {
      id: crypto.randomUUID(),
      name: medication.name.trim(),
      dosage: medication.dosage.trim(),
      purpose: medication.purpose.trim(),
      frequency: medication.frequency.trim(),
      timesPerDay: medication.timesPerDay || 1,
      startDate: medication.startDate || new Date().toISOString().split('T')[0],
      endDate: medication.endDate || undefined,
      logs: [], // Initialize with empty logs array
    };

    const updatedMedications = [...medications, newMedication];

    try {
      const { error } = await supabase
        .from("user_medications")
        .upsert(
          {
            profile_id: profileId,
            user_id: userId,
            medications: updatedMedications,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "profile_id",
          }
        );

      if (error) throw error;

      void logProfileActivity({
        profileId,
        domain: "medication",
        action: "add",
        entity: {
          id: newMedication.id,
          label: newMedication.name,
        },
        metadata: {
          id: newMedication.id,
          name: newMedication.name,
          dosage: newMedication.dosage,
          frequency: newMedication.frequency,
          startDate: newMedication.startDate ?? null,
        },
      });

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Add medication error:", error);
      }
      alert(`Failed to add medication: ${getErrorMessage(error)}`);
    }
  };

  const updateMedication = async (medication: Medication) => {
    if (!userId || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      alert("Please fill Name, Dosage, and Frequency.");
      return;
    }

    const existingMedication = medications.find((m) => m.id === medication.id) ?? null;
    const medicationId = medication.id || existingMedication?.id || "";
    if (!medicationId) {
      alert("Medication ID is missing. Please reopen and try again.");
      return;
    }
    const normalizedMedication: Medication = {
      ...medication,
      id: medicationId,
      name: medication.name.trim(),
      dosage: medication.dosage.trim(),
      purpose: (medication.purpose || "").trim(),
      frequency: medication.frequency.trim(),
      timesPerDay:
        typeof medication.timesPerDay === "number" && medication.timesPerDay >= 0
          ? medication.timesPerDay
          : resolveTimesPerDay(medication.frequency.trim(), medication.timesPerDay),
      startDate: medication.startDate || undefined,
      endDate: medication.endDate || undefined,
      logs: Array.isArray(medication.logs) ? medication.logs : existingMedication?.logs || [],
    };

    const updatedMedications = medications.map((m) =>
      m.id === medicationId ? normalizedMedication : m
    );

    try {
      const { error } = await supabase
        .from("user_medications")
        .upsert(
          {
            profile_id: profileId,
            user_id: userId,
            medications: updatedMedications,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "profile_id",
          }
        );

      if (error) throw error;

      const medicationChanges = existingMedication
        ? buildMedicationActivityChanges(existingMedication, normalizedMedication)
        : [];

      void logProfileActivity({
        profileId,
        domain: "medication",
        action: "update",
        entity: {
          id: normalizedMedication.id,
          label: normalizedMedication.name,
        },
        metadata: {
          id: normalizedMedication.id,
          name: normalizedMedication.name,
          dosage: normalizedMedication.dosage,
          purpose: normalizedMedication.purpose ?? null,
          frequency: normalizedMedication.frequency,
          timesPerDay: normalizedMedication.timesPerDay ?? null,
          startDate: normalizedMedication.startDate ?? null,
          endDate: normalizedMedication.endDate ?? null,
          changes: medicationChanges,
          changeCount: medicationChanges.length,
        },
      });

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Update medication error:", error);
      }
      alert(`Failed to update medication: ${getErrorMessage(error)}`);
    }
  };

  const deleteMedication = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = confirm("Delete this medication?");
    if (!confirmed) return;

    const deletedMedication = medications.find((m) => m.id === id) ?? null;
    const updatedMedications = medications.filter((m) => m.id !== id);

    try {
      const { error } = await supabase
        .from("user_medications")
        .upsert(
          {
            profile_id: profileId,
            user_id: userId,
            medications: updatedMedications,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "profile_id",
          }
        );

      if (error) throw error;

      void logProfileActivity({
        profileId,
        domain: "medication",
        action: "delete",
        entity: {
          id,
          label: deletedMedication?.name ?? "Medication",
        },
        metadata: {
          id,
          name: deletedMedication?.name ?? null,
        },
      });

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Delete medication error:", error);
      }
      alert(`Failed to delete medication: ${getErrorMessage(error)}`);
    }
  };

  /* =======================
     MEDICATION LOG DOSE
  ======================= */

  const handleLogDose = async (medicationId: string, taken: boolean) => {
    if (!userId || !profileId) return;

    const newLog = {
      medicationId,
      timestamp: new Date().toISOString(),
      taken,
    };

    const updatedMedications = medications.map((m) => {
      if (m.id === medicationId) {
        return {
          ...m,
          logs: [...(m.logs || []), newLog],
        };
      }
      return m;
    });

    try {
      const { error } = await supabase
        .from("user_medications")
        .upsert(
          {
            profile_id: profileId,
            user_id: userId,
            medications: updatedMedications,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "profile_id",
          }
        );

      if (error) throw error;

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Failed to log dose:", error);
      }
      alert(`Failed to log dose: ${getErrorMessage(error)}`);
    }
  };

  /* =======================
     SOS HANDLER
  ======================= */

  const handleSOS = async () => {
    if (!emergencyContacts || emergencyContacts.length === 0) {
      alert(
        "Please set up emergency contacts first before using SOS.\n\nClick on 'Emergency Contacts' card to add your emergency contacts."
      );
      setActiveSection("emergency");
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to send an SOS alert to all your emergency contacts?\n\nThis will send an emergency message to:\n" +
        emergencyContacts.map((c) => `• ${c.name} (${c.phone})`).join("\n")
    );

    if (!confirmed) return;

    setIsSendingSOS(true);

    try {
      const response = await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emergencyContacts: emergencyContacts,
          userName: name || "A user",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || "Failed to send SOS alert";
        throw new Error(errorMessage);
      }

      alert(
        `✅ SOS Alert Sent Successfully!\n\n${data.message}\n\nYour emergency contacts have been notified.`
      );
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("SOS error:", error);
      }
      const message = getErrorMessage(error, "Failed to send SOS alert. Please try again.");
      const errorMessage =
        message === "Please enter a valid number"
          ? "Please enter a valid number"
          : message;
      alert(`❌ ${errorMessage}`);
    } finally {
      setIsSendingSOS(false);
    }
  };

  /* =======================
     UI
  ======================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 text-slate-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        {/* HERO */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          {/* Left Column */}
          <div className="space-y-8">
            <div>
              <span className="inline-block bg-teal-500 text-white px-4 py-1 rounded-full text-sm font-semibold mb-6">
                Health Companion
              </span>

              <h2
                className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight"
                style={{
                  background:
                    "linear-gradient(90deg, var(--hero-greeting-from), var(--hero-greeting-to))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {greeting}, {name}
              </h2>

              <p className="text-slate-600 text-lg max-w-md">
                Designed with empathy. Built for clarity. Ready when you need it.
              </p>
            </div>

            {/* Mobile-only Notification Button (above Get Summary button) */}
            <div className="lg:hidden">
              <NotificationsPanel userId={userId} profileId={profileId} appointments={appointments} />
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setIsSummaryModalOpen(true)}
                disabled={!profileId}
                data-tour="home-get-summary"
                className={`px-10 py-5 text-lg rounded-2xl font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl ${
                  profileId
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed text-gray-200"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>Get Summary</span>
                  {hasUnreadSummary && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1 text-xs font-black text-amber-700">
                      !
                    </span>
                  )}
                </span>
              </button>

              <button
                onClick={handleSOS}
                disabled={isSendingSOS}
                data-tour="home-sos"
                className={`px-10 py-5 text-lg rounded-2xl font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl disabled:hover:scale-100 ${
                  isSendingSOS
                    ? "bg-red-400 cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600"
                } text-white ${isSendingSOS ? "" : "animate-sos-pulse"}`}
              >
                <span className="flex items-center gap-3">
                  <AlertCircle size={22} />
                  <span>{isSendingSOS ? "Sending..." : "SOS"}</span>
                </span>
              </button>
            </div>

            <div className="mt-6 lg:hidden">
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(true)}
                data-tour="home-notifications-mobile"
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              >
                <Bell size={18} className="text-teal-600" />
                Notifications
              </button>
            </div>
          </div>

          {/* Desktop Notification Panel */}
          <div className="hidden lg:block" data-tour="home-notifications-desktop">
            <NotificationsPanel userId={userId} profileId={profileId} appointments={appointments} />
          </div>
        </div>

        {/* MODALS */}
        {isNotificationsOpen && (
          <Modal onClose={() => setIsNotificationsOpen(false)}>
            <NotificationsPanel
              userId={userId}
              profileId={profileId}
              appointments={appointments}
              variant="modal"
            />
          </Modal>
        )}

        {activeSection === "calendar" && (
          <AppointmentsModal
            appointments={appointments}
            onClose={() => setActiveSection(null)}
            onAddAppointment={handleAddAppointment}
            onDeleteAppointment={handleDeleteAppointment}
          />
        )}

        {activeSection && activeSection !== "calendar" && (
          <Modal onClose={() => setActiveSection(null)}>
            {activeSection === "emergency" && (
              <EmergencyContactsModal
                data={emergencyContacts}
                onAdd={addEmergencyContact}
                onDelete={deleteEmergencyContact}
              />
            )}

            {activeSection === "doctors" && (
              <MedicalTeamModal
                data={medicalTeam}
                onAdd={addDoctor}
                onUpdate={updateDoctor}
                onDelete={deleteDoctor}
              />
            )}

            {activeSection === "medications" && (
              <MedicationsModal
                data={medications}
                onAdd={addMedication}
                onUpdate={updateMedication}
                onDelete={deleteMedication}
                onLogDose={handleLogDose}
              />
            )}
          </Modal>
        )}

        {/* MEDICAL SUMMARY MODAL */}
        <MedicalSummaryModal
          isOpen={isSummaryModalOpen}
          onClose={() => setIsSummaryModalOpen(false)}
          folderType="reports"
          userId={profileId}
          onSummaryReady={() => setHasUnreadSummary(true)}
          onSummaryViewed={() => setHasUnreadSummary(false)}
        />

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-tour="home-quick-cards">
          <Card
            title="Appointments"
            icon={Calendar}
            onClick={() => setActiveSection("calendar")}
          />
          <Card
            title="Emergency Contacts"
            icon={Users}
            onClick={() => setActiveSection("emergency")}
          />
          <Card
            title="Medical Team"
            icon={Stethoscope}
            onClick={() => setActiveSection("doctors")}
          />
          <Card
            title="Medications"
            icon={Pill}
            onClick={() => setActiveSection("medications")}
          />
        </div>
      </main>
    </div>
  );
}

/* =======================
   MODAL WRAPPER
======================= */

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 z-10"
        >
          <X />
        </button>
        {children}
      </div>
    </div>
  );
}

/* =======================
   CARD COMPONENT
======================= */

function Card({
  title,
  icon: Icon,
  onClick,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-3xl p-6 shadow-lg hover:shadow-xl hover:scale-105 transition cursor-pointer border"
    >
      <div className="w-14 h-14 mx-auto mb-4 bg-teal-100 rounded-full flex items-center justify-center">
        <Icon size={24} className="text-teal-600" />
      </div>
      <h3 className="font-bold text-center">{title}</h3>
      <p className="text-xs text-slate-500 text-center mt-2">View details</p>
    </div>
  );
}
