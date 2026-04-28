"use client";

import { Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/createClient";
import { AppointmentsModal } from "@/components/AppointmentsModal";
import { BrowserNotificationManager } from "@/components/BrowserNotificationManager";
import { EmergencyContactsModal, type EmergencyContact } from "@/components/EmergencyContactsModal";
import { MedicalTeamModal, type Doctor } from "@/components/MedicalTeamModal";
import { MedicationsModal, type Medication } from "@/components/MedicationsModal";
import { MedicalSummaryModal } from "@/components/MedicalSummaryModal";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import PushSubscriptionManager from "@/components/PushSubscriptionManager";
import { useAppProfile } from "@/components/AppProfileProvider";
import { confirmDialog, toast } from "@/components/AppNotifier";
import QRModal from '@/components/QRModal';
import {
  modalOverlayMotion,
  modalOverlayTransition,
  modalSurfaceMotion,
  modalSurfaceTransition,
} from "@/components/modalMotion";
import {
  deriveMedicationMealTiming,
  normalizeMedicationDosage,
  getDueMedicationReminderSlots,
  normalizeMedicationReminderSlotKey,
  resolveMedicationFrequency,
  resolveMedicationTimesPerDay,
  type MedicationReminderSlot,
} from "@/lib/medications";
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
  slotKey?: unknown;
};

type RawMedication = {
  id?: unknown;
  name?: unknown;
  dosage?: unknown;
  purpose?: unknown;
  frequency?: unknown;
  mealTiming?: unknown;
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

const normalizeMedicationList = (value: unknown): Medication[] => {
  if (!Array.isArray(value)) return [];
  const todayDate = new Date().toISOString().split("T")[0];
  return value
    .map((entry) => {
      const med = (entry || {}) as RawMedication;
      const id =
        typeof med.id === "string" && med.id.trim() ? med.id.trim() : crypto.randomUUID();
      const frequency = resolveMedicationFrequency(med.frequency, med.mealTiming);
      const mealTiming = deriveMedicationMealTiming(med.mealTiming, med.frequency);
      const rawLogs = Array.isArray(med.logs) ? (med.logs as RawMedicationLog[]) : [];
      const logs = rawLogs.reduce<NonNullable<Medication["logs"]>>((acc, log) => {
        const timestamp = typeof log.timestamp === "string" ? log.timestamp.trim() : "";
        const taken = typeof log.taken === "boolean" ? log.taken : null;
        if (!timestamp || taken === null) return acc;

        acc.push({
          medicationId:
            typeof log.medicationId === "string" && log.medicationId.trim()
              ? log.medicationId.trim()
              : id,
          timestamp,
          taken,
          slotKey: normalizeMedicationReminderSlotKey(log.slotKey),
        });
        return acc;
      }, []);

      return {
        id,
        name: typeof med.name === "string" ? med.name.trim() : "",
        dosage: normalizeMedicationDosage(med.dosage),
        purpose: typeof med.purpose === "string" ? med.purpose.trim() : "",
        frequency,
        mealTiming: Object.keys(mealTiming).length > 0 ? mealTiming : undefined,
        timesPerDay: resolveMedicationTimesPerDay(frequency, med.timesPerDay, mealTiming),
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

const parseDateAtBoundary = (value?: string, boundary: "start" | "end" = "start") => {
  if (!value) return null;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return boundary === "end"
      ? new Date(year, month, day, 23, 59, 59, 999)
      : new Date(year, month, day, 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getLocalDateKey = (value = new Date()) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate()
  ).padStart(2, "0")}`;

const isUpdatedEndDateBeforeToday = (nextEndDate?: string, previousEndDate?: string) => {
  if (!nextEndDate || nextEndDate === (previousEndDate || "")) return false;

  const nextDate = parseDateAtBoundary(nextEndDate, "start");
  const today = parseDateAtBoundary(getLocalDateKey(), "start");
  if (!nextDate || !today) return false;

  return nextDate.getTime() < today.getTime();
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

type ReconcileNotificationsPayload = {
  profileId: string;
  kind: "medications" | "appointments";
  onlyMedicationId?: string;
  onlyAppointmentId?: string;
  cancelMedicationId?: string;
  cancelAppointmentId?: string;
  notifyImmediately?: boolean;
};

// Fire-and-forget: ask the server to regenerate the user's reminder schedule.
// Failures are logged but never block the user-facing mutation, since the
// nightly reconcile cron will eventually catch up.
const reconcileNotifications = async (payload: ReconcileNotificationsPayload) => {
  try {
    await fetch("/api/notifications/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore — the cron tick will reconcile on the next pass
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

  // QR state
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);


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
      toast.error("Save failed", "Failed to save appointment.");
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

    void reconcileNotifications({
      profileId,
      kind: "appointments",
      onlyAppointmentId: appointment.id,
      notifyImmediately: true,
    });

    setAppointments(updatedAppointments);
    writeHomeCache(cacheOwnerId, "appointments", updatedAppointments);
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = await confirmDialog({
      title: "Delete appointment?",
      description: "This appointment will be permanently removed.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
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
      toast.error("Delete failed", "Failed to delete appointment.");
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

    void reconcileNotifications({
      profileId,
      kind: "appointments",
      cancelAppointmentId: id,
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
      toast.warning("Missing info", "Please fill name, phone, and relation.");
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
      toast.error("Save failed", "Failed to add contact. Please try again.");
      return;
    }

    setEmergencyContacts(updatedContacts);
    writeHomeCache(cacheOwnerId, "emergency_contacts", updatedContacts);
  };

  const deleteEmergencyContact = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = await confirmDialog({
      title: "Delete emergency contact?",
      description: "This contact will be permanently removed.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
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
      toast.error("Delete failed", "Failed to delete contact. Please try again.");
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
      toast.warning("Missing info", "Please fill all fields.");
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
      toast.error("Save failed", "Failed to add doctor. Please try again.");
      return;
    }

    setMedicalTeam(updatedDoctors);
    writeHomeCache(cacheOwnerId, "medical_team", updatedDoctors);
  };

  const updateDoctor = async (doctor: Doctor) => {
    if (!userId || !profileId) return;

    if (!doctor.name.trim() || !doctor.number.trim() || !doctor.speciality.trim()) {
      toast.warning("Missing info", "Please fill all fields.");
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
      toast.error("Update failed", "Failed to update doctor. Please try again.");
      return;
    }

    setMedicalTeam(updatedDoctors);
    writeHomeCache(cacheOwnerId, "medical_team", updatedDoctors);
  };

  const deleteDoctor = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = await confirmDialog({
      title: "Delete doctor?",
      description: "This doctor will be permanently removed from your medical team.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
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
      toast.error("Delete failed", "Failed to delete doctor. Please try again.");
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

    const normalizedFrequency = resolveMedicationFrequency(
      medication.frequency,
      medication.mealTiming
    );
    const normalizedTimesPerDay = resolveMedicationTimesPerDay(
      normalizedFrequency,
      medication.timesPerDay,
      medication.mealTiming
    );
    const normalizedMealTiming = deriveMedicationMealTiming(
      medication.mealTiming,
      normalizedFrequency
    );

    if (!medication.name.trim() || !medication.dosage.trim() || !normalizedFrequency) {
      toast.warning(
        "Missing info",
        "Please fill Medication Name, Dosage, and select at least one meal timing."
      );
      return;
    }

    const newMedication: Medication = {
      id: crypto.randomUUID(),
      name: medication.name.trim(),
      dosage: normalizeMedicationDosage(medication.dosage),
      purpose: (medication.purpose || "").trim(),
      frequency: normalizedFrequency,
      mealTiming: Object.keys(normalizedMealTiming).length > 0 ? normalizedMealTiming : undefined,
      timesPerDay: normalizedTimesPerDay,
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

      void reconcileNotifications({
        profileId,
        kind: "medications",
        onlyMedicationId: newMedication.id,
      });

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Add medication error:", error);
      }
      toast.error("Save failed", getErrorMessage(error, "Failed to add medication."));
    }
  };

  const updateMedication = async (medication: Medication) => {
    if (!userId || !profileId) return;

    const normalizedFrequency = resolveMedicationFrequency(
      medication.frequency,
      medication.mealTiming
    );
    const normalizedTimesPerDay = resolveMedicationTimesPerDay(
      normalizedFrequency,
      medication.timesPerDay,
      medication.mealTiming
    );
    const normalizedMealTiming = deriveMedicationMealTiming(
      medication.mealTiming,
      normalizedFrequency
    );

    if (!medication.name.trim() || !medication.dosage.trim() || !normalizedFrequency) {
      toast.warning(
        "Missing info",
        "Please fill Medication Name, Dosage, and select at least one meal timing."
      );
      return;
    }

    const existingMedication = medications.find((m) => m.id === medication.id) ?? null;
    const medicationId = medication.id || existingMedication?.id || "";
    if (!medicationId) {
      toast.error("Missing medication", "Medication ID is missing. Please reopen and try again.");
      return;
    }
    if (isUpdatedEndDateBeforeToday(medication.endDate, existingMedication?.endDate)) {
      toast.warning("Invalid end date", "End date cannot be changed to a date before today.");
      return;
    }
    const normalizedMedication: Medication = {
      ...medication,
      id: medicationId,
      name: medication.name.trim(),
      dosage: normalizeMedicationDosage(medication.dosage),
      purpose: (medication.purpose || "").trim(),
      frequency: normalizedFrequency,
      mealTiming: Object.keys(normalizedMealTiming).length > 0 ? normalizedMealTiming : undefined,
      timesPerDay: normalizedTimesPerDay,
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

      void reconcileNotifications({
        profileId,
        kind: "medications",
        onlyMedicationId: normalizedMedication.id,
      });

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Update medication error:", error);
      }
      toast.error("Update failed", getErrorMessage(error, "Failed to update medication."));
    }
  };

  const deleteMedication = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = await confirmDialog({
      title: "Delete medication?",
      description: "This medication and its related reminders will be permanently removed.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
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

      void reconcileNotifications({
        profileId,
        kind: "medications",
        cancelMedicationId: id,
      });

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("Delete medication error:", error);
      }
      toast.error("Delete failed", getErrorMessage(error, "Failed to delete medication."));
    }
  };

  /* =======================
     MEDICATION LOG DOSE
  ======================= */

  const handleLogDose = async (
    medicationId: string,
    taken: boolean,
    slotKey?: MedicationReminderSlot["key"]
  ) => {
    if (!userId || !profileId) return;

    const medication = medications.find((entry) => entry.id === medicationId) ?? null;
    const dueSlots =
      taken && medication
        ? getDueMedicationReminderSlots(medication, new Date(), 90 * 60 * 1000)
        : [];
    const resolvedSlotKey = slotKey ?? dueSlots[0]?.key;

    if (taken && medication && resolvedSlotKey) {
      const alreadyLoggedToday = (medication.logs || []).some((log) => {
        if (!log.taken || log.slotKey !== resolvedSlotKey) return false;
        const parsed = new Date(log.timestamp);
        if (Number.isNaN(parsed.getTime())) return false;
        return parsed.toDateString() === new Date().toDateString();
      });
      if (alreadyLoggedToday) return;
    }

    const newLog = {
      medicationId,
      timestamp: new Date().toISOString(),
      taken,
      slotKey: resolvedSlotKey,
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
      toast.error("Log failed", getErrorMessage(error, "Failed to log dose."));
    }
  };

  /* =======================
     SOS HANDLER
  ======================= */

  const handleSOS = async () => {
    if (!emergencyContacts || emergencyContacts.length === 0) {
      toast.warning(
        "No emergency contacts",
        "Please set up emergency contacts first before using SOS.\n\nClick on 'Emergency Contacts' card to add your emergency contacts."
      );
      setActiveSection("emergency");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Send SOS alert?",
      description:
        "This will send an emergency message to:\n" +
        emergencyContacts.map((c) => `- ${c.name} (${c.phone})`).join("\n"),
      confirmLabel: "Send SOS",
      cancelLabel: "Cancel",
      variant: "danger",
    });

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

      toast.success(
        "SOS alert sent",
        `${data.message}\n\nYour emergency contacts have been notified.`
      );
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("SOS error:", error);
      }
      const message = getErrorMessage(error, "Failed to send SOS alert. Please try again.");
      toast.error("SOS failed", message);
    } finally {
      setIsSendingSOS(false);
    }
  };

  /* =======================
     QR SHARE HANDLER
  ======================= */

  const openQrModal = async () => {
    if (!profileId) return;
    setIsGeneratingLink(true);
    setShareLink("");
    setIsQrModalOpen(true);

    try {
      const res = await fetch("/api/share/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorDetail = data?.error || `Server responded with ${res.status}`;
        throw new Error(errorDetail);
      }

      if (!data.token) {
        throw new Error("No token received from backend");
      }

      const link = `${window.location.origin}/app/share/${data.token}`;
      setShareLink(link);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to generate share link", err);
      }
      toast.error(
        "QR generation failed",
        err instanceof Error ? err.message : "Could not generate a share link. Please try again."
      );
      setIsQrModalOpen(false);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  /* =======================
     UI
  ======================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 text-slate-900">
      <PushSubscriptionManager userId={userId || null} />
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
                className="inline-block text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight"
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
              <NotificationsPanel
                userId={userId}
                profileId={profileId}
                appointments={appointments}
                medications={medications}
              />
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setIsSummaryModalOpen(true)}
                disabled={!profileId}
                data-tour="home-get-summary"
                className={`px-10 py-5 text-lg rounded-2xl font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl ${profileId
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
                className={`px-10 py-5 text-lg rounded-2xl font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl disabled:hover:scale-100 ${isSendingSOS
                    ? "bg-red-400 cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600"
                  } text-white ${isSendingSOS ? "" : "animate-sos-pulse"}`}
              >
                <span className="flex items-center gap-3">
                  <AlertCircle size={22} />
                  <span>{isSendingSOS ? "Sending..." : "SOS"}</span>
                </span>
              </button>

              <button
                onClick={openQrModal}
                disabled={!profileId}
                className={`px-10 py-5 text-lg rounded-2xl font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl ${profileId
                    ? "bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed text-gray-200"
                  }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>📱 Share QR</span>
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
            <NotificationsPanel
              userId={userId}
              profileId={profileId}
              appointments={appointments}
              medications={medications}
            />
          </div>
        </div>

        {/* MODALS */}
        <AnimatePresence>
          {isNotificationsOpen ? (
            <Modal onClose={() => setIsNotificationsOpen(false)}>
              <NotificationsPanel
                userId={userId}
                profileId={profileId}
                appointments={appointments}
                medications={medications}
                variant="modal"
              />
            </Modal>
          ) : null}
        </AnimatePresence>

        <BrowserNotificationManager
          key={`browser-notifications:${userId}:${profileId ?? "account"}`}
          userId={userId}
          profileId={profileId}
          appointments={appointments}
          medications={medications}
        />

        <AnimatePresence>
          {activeSection === "calendar" ? (
            <AppointmentsModal
              appointments={appointments}
              onClose={() => setActiveSection(null)}
              onAddAppointment={handleAddAppointment}
              onDeleteAppointment={handleDeleteAppointment}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {activeSection && activeSection !== "calendar" ? (
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
          ) : null}
        </AnimatePresence>

        {/* MEDICAL SUMMARY MODAL */}
        <MedicalSummaryModal
          isOpen={isSummaryModalOpen}
          onClose={() => setIsSummaryModalOpen(false)}
          folderType="reports"
          userId={profileId}
          onSummaryReady={() => setHasUnreadSummary(true)}
          onSummaryViewed={() => setHasUnreadSummary(false)}
        />
        
        {/* QR MODAL */}
        <QRModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          title="Share Profile"
          shareLink={shareLink}
          isGenerating={isGeneratingLink}
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
    <motion.div
      onClick={onClose}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      {...modalOverlayMotion}
      transition={modalOverlayTransition}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
        {...modalSurfaceMotion}
        transition={modalSurfaceTransition}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 z-10"
        >
          <X />
        </button>
        {children}
      </motion.div>
    </motion.div>
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
