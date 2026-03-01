"use client";

import { useEffect, useState } from "react";
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
};

type CacheEntry<T> = {
  ts: number;
  value: T;
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

/* =======================
   PAGE COMPONENT
======================= */

export default function HomePage() {
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [greeting, setGreeting] = useState("Good Morning");
  const profileId = selectedProfile?.id ?? "";
  const cacheOwnerId = profileId || userId;

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
          console.error("Emergency fetch error:", error);
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
          console.error("Medical team fetch error:", error);
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
        setMedications(cachedMeds);
      }

      const { data, error } = await supabase
        .from("user_medications")
        .select("medications")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error) {
        if (error.code !== "PGRST116") {
          console.error("Medications fetch error:", error);
        }
        setMedications([]);
        return;
      }

      setMedications(data?.medications || []);
      writeHomeCache(cacheOwnerId, "medications", data?.medications || []);
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
          console.error("Appointments fetch error:", error);
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

    let updatedAppointments: Appointment[];

    const existingIndex = appointments.findIndex((a) => a.id === appointment.id);
    
    if (existingIndex !== -1) {
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
      console.error("Save appointment error:", error);
      alert("Failed to save appointment");
      return;
    }

    setAppointments(updatedAppointments);
    writeHomeCache(cacheOwnerId, "appointments", updatedAppointments);
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = confirm("Delete this appointment?");
    if (!confirmed) return;

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
      console.error("Delete appointment error:", error);
      alert("Failed to delete appointment");
      return;
    }

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
      console.error("Add emergency contact error:", error);
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
      console.error("Delete emergency contact error:", error);
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
      console.error("Add doctor error:", error);
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
      console.error("Update doctor error:", error);
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
      console.error("Delete doctor error:", error);
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

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: any) {
      console.error("Add medication error:", error);
      alert(`Failed to add medication: ${error.message || "Please try again."}`);
    }
  };

  const updateMedication = async (medication: Medication) => {
    if (!userId || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      alert("Please fill Name, Dosage, and Frequency.");
      return;
    }

    const updatedMedications = medications.map((m) =>
      m.id === medication.id ? medication : m
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

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: any) {
      console.error("Update medication error:", error);
      alert(`Failed to update medication: ${error.message || "Please try again."}`);
    }
  };

  const deleteMedication = async (id: string) => {
    if (!userId || !profileId) return;

    const confirmed = confirm("Delete this medication?");
    if (!confirmed) return;

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

      setMedications(updatedMedications);
      writeHomeCache(cacheOwnerId, "medications", updatedMedications);
    } catch (error: any) {
      console.error("Delete medication error:", error);
      alert(`Failed to delete medication: ${error.message || "Please try again."}`);
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
    } catch (error: any) {
      console.error("Failed to log dose:", error);
      alert(`Failed to log dose: ${error.message || "Please try again."}`);
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
    } catch (error: any) {
      console.error("SOS error:", error);
      const errorMessage =
        error.message === "Please enter a valid number"
          ? "Please enter a valid number"
          : error.message || "Failed to send SOS alert. Please try again.";
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
              <span className="inline-block text-white px-4 py-1 rounded-full text-sm font-semibold mb-6" style={{ backgroundColor: 'var(--theme-primary)' }}>
                Health Companion
              </span>

              <h2
                className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight"
                style={{
                  background: `linear-gradient(90deg, #4FD1A6, #FFBF69)`,
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
                className={`px-10 py-5 text-lg rounded-2xl font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl ${
                  profileId
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed text-gray-200"
                }`}
              >
                Get Summary
              </button>

              <button
                onClick={handleSOS}
                disabled={isSendingSOS}
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
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              >
                <Bell size={18} className="text-teal-600" />
                Notifications
              </button>
            </div>
          </div>

          {/* Desktop Notification Panel */}
          <div className="hidden lg:block">
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

        {activeSection && (
          <Modal onClose={() => setActiveSection(null)}>
            {activeSection === "calendar" && (
              <AppointmentsModal
                appointments={appointments}
                onClose={() => setActiveSection(null)}
                onAddAppointment={handleAddAppointment}
                onDeleteAppointment={handleDeleteAppointment}
              />
            )}

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
        />

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

function Card({ title, icon: Icon, onClick }: any) {
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
