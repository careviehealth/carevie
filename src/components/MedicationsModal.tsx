// MedicationsModal.tsx
"use client";

import { useState, useEffect } from "react";

export type MedicationLog = {
  medicationId: string;
  timestamp: string;
  taken: boolean;
};

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  purpose: string;
  frequency: string;
  timesPerDay?: number;
  startDate?: string;
  endDate?: string;
  logs?: MedicationLog[];
};

type Props = {
  data: Medication[];
  onAdd: (medication: Medication) => Promise<void> | void;
  onUpdate: (medication: Medication) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onLogDose?: (medicationId: string, taken: boolean) => Promise<void> | void;
};

export function MedicationsModal({ data, onAdd, onUpdate, onDelete, onLogDose }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showReminders, setShowReminders] = useState(false);

  // New state: which list to show
  const [activeTab, setActiveTab] = useState<"current" | "completed">("current");

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [purpose, setPurpose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [timesPerDay, setTimesPerDay] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const frequencyOptions = [
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

  // Auto-set start date to today for new medications
  useEffect(() => {
    if (showForm && !editingId && !startDate) {
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
    }
  }, [showForm, editingId, startDate]);

  // Reminder check – stop reminding after end date
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const upcomingMeds = data.filter((med) => {
        if (!med.timesPerDay || !med.startDate || med.timesPerDay === 0) return false;

        if (med.endDate) {
          const end = new Date(med.endDate);
          const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (nowDateOnly > endDateOnly) return false;
        }

        const medLogs = med.logs || [];
        const todayLogs = medLogs.filter(
          (log) => new Date(log.timestamp).toDateString() === now.toDateString() && log.taken
        );

        return todayLogs.length < (med.timesPerDay || 1);
      });

      setShowReminders(upcomingMeds.length > 0);
    };

    checkReminders();
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [data]);

  const resetForm = () => {
    setName("");
    setDosage("");
    setPurpose("");
    setFrequency("");
    setTimesPerDay("1");
    setStartDate("");
    setEndDate("");
    setEditingId(null);
  };

  const handleEdit = (medication: Medication) => {
    setName(medication.name);
    setDosage(medication.dosage);
    setPurpose(medication.purpose);

    const matchingOption = frequencyOptions.find((opt) => opt.value === medication.frequency);
    if (matchingOption) {
      setFrequency(matchingOption.value);
      setTimesPerDay(matchingOption.times.toString());
    } else {
      setFrequency(medication.frequency);
      setTimesPerDay((medication.timesPerDay || 1).toString());
    }

    setStartDate(medication.startDate || "");
    setEndDate(medication.endDate || "");
    setEditingId(medication.id);
    setShowForm(true);
  };

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    const selected = frequencyOptions.find((opt) => opt.value === value);
    if (selected) {
      setTimesPerDay(selected.times.toString());
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !dosage.trim() || !frequency.trim()) {
      alert("Please fill Name, Dosage, and Frequency.");
      return;
    }

    setSaving(true);
    try {
      const selectedFreq = frequencyOptions.find((opt) => opt.value === frequency);
      const finalTimesPerDay = selectedFreq ? selectedFreq.times : parseInt(timesPerDay) || 1;

      const medicationData: Medication = {
        id: editingId || crypto.randomUUID(),
        name: name.trim(),
        dosage: dosage.trim(),
        purpose: purpose.trim(),
        frequency: frequency.trim(),
        timesPerDay: finalTimesPerDay,
        startDate: startDate || new Date().toISOString().split("T")[0],
        endDate: endDate || undefined,
        logs: editingId ? data.find((m) => m.id === editingId)?.logs || [] : [],
      };

      if (editingId) {
        await onUpdate(medicationData);
      } else {
        await onAdd(medicationData);
      }
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLogDose = async (medicationId: string, taken: boolean) => {
    if (onLogDose) {
      await onLogDose(medicationId, taken);
    }
  };

  const getTodayProgress = (medication: Medication) => {
    if (medication.timesPerDay === 0) {
      return { taken: 0, target: 0, percentage: 100 };
    }

    const today = new Date().toDateString();
    const medLogs = medication.logs || [];
    const todayLogs = medLogs.filter(
      (log) => new Date(log.timestamp).toDateString() === today && log.taken
    );
    const target = medication.timesPerDay || 1;
    return {
      taken: todayLogs.length,
      target,
      percentage: Math.min((todayLogs.length / target) * 100, 100),
    };
  };

  const getDaysRemaining = (medication: Medication) => {
    if (!medication.endDate) return null;
    const end = new Date(medication.endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Split medications
  const now = new Date();

  const activeMedications = data.filter((med) => {
    if (!med.endDate) return true;
    const end = new Date(med.endDate);
    return now <= end;
  });

  const pastMedications = data.filter((med) => {
    if (!med.endDate) return false;
    const end = new Date(med.endDate);
    return now > end;
  });

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 pr-12 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-2xl font-bold">Medications</h2>

        <button
          onClick={() => {
            setShowForm((v) => !v);
            if (!showForm) resetForm();
          }}
          className="self-start rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 sm:self-auto"
        >
          {showForm ? "Close Form" : "+ Add Medication"}
        </button>
      </div>

      {/* Reminders */}
      {showReminders && (
        <div className="mb-6 p-5 rounded-2xl bg-amber-50 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-amber-900">🔔 Medication Reminders</h3>
            <button
              onClick={() => setShowReminders(false)}
              className="text-amber-700 hover:text-amber-900 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
          <p className="text-sm text-amber-800">
            You have medications due today. Check your progress below.
          </p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-8 p-6 rounded-2xl border bg-slate-50 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ... all form fields remain the same as before ... */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white" placeholder="e.g., Paracetamol" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Dosage</label>
              <input value={dosage} onChange={(e) => setDosage(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white" placeholder="e.g., 500mg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Purpose (optional)</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white" placeholder="e.g., Pain relief" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Frequency</label>
              <select value={frequency} onChange={(e) => handleFrequencyChange(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white">
                <option value="">Select frequency</option>
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Times per Day</label>
              <input type="number" min="0" max="10" value={timesPerDay} onChange={(e) => setTimesPerDay(e.target.value)} disabled={frequencyOptions.some(opt => opt.value === frequency)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white disabled:bg-slate-100" placeholder="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-500 outline-none bg-white" />
            </div>
            <div className="md:col-span-2 flex justify-end gap-4 pt-4">
              <button onClick={() => { resetForm(); setShowForm(false); }} className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition" disabled={saving}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition disabled:opacity-60">
                {saving ? (editingId ? "Updating..." : "Saving...") : editingId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab / Toggle buttons */}
      {!showForm && (
        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => setActiveTab("current")}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === "current"
                ? "border-b-2 border-teal-600 text-teal-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Current Medications
            {activeMedications.length > 0 && (
              <span className="ml-2 text-sm bg-slate-100 px-2 py-0.5 rounded-full">
                {activeMedications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === "completed"
                ? "border-b-2 border-teal-600 text-teal-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Completed Courses
            {pastMedications.length > 0 && (
              <span className="ml-2 text-sm bg-slate-100 px-2 py-0.5 rounded-full">
                {pastMedications.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Content area – only one shown at a time */}
      {!showForm && (
        <div>
          {activeTab === "current" ? (
            <>
              {activeMedications.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No active medications at the moment
                </div>
              ) : (
                <div className="space-y-4">
                  {activeMedications.map((m) => {
                    const progress = getTodayProgress(m);
                    const daysRemaining = getDaysRemaining(m);

                    return (
                      <div key={m.id} className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-teal-300 transition shadow-sm">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <p className="font-semibold text-lg">{m.name}</p>
                            <p className="text-sm text-slate-600 mt-0.5">
                              {m.dosage} • {m.frequency}
                              {m.purpose && <span className="ml-1.5">• {m.purpose}</span>}
                            </p>
                            {daysRemaining !== null && (
                              <p className="text-xs text-slate-500 mt-1">
                                {daysRemaining > 0
                                  ? `${daysRemaining} days remaining`
                                  : daysRemaining === 0
                                  ? "Ends today"
                                  : "Course completed"}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(m)} className="px-3 py-1.5 rounded-lg border border-teal-200 text-teal-700 text-sm font-medium hover:bg-teal-50">Edit</button>
                            <button onClick={() => onDelete(m.id)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50">Delete</button>
                          </div>
                        </div>

                        {m.timesPerDay !== 0 && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Today&apos;s progress</span>
                              <span className="font-medium">{progress.taken} / {progress.target}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${progress.percentage === 100 ? "bg-green-500" : "bg-teal-500"} transition-all duration-500`} style={{ width: `${progress.percentage}%` }} />
                            </div>

                            {progress.taken < progress.target && onLogDose && (
                              <button onClick={() => handleLogDose(m.id, true)} className="w-full mt-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition">
                                ✓ Mark dose taken
                              </button>
                            )}

                            {progress.percentage === 100 && (
                              <div className="flex items-center justify-center gap-2 text-green-600 text-sm font-medium mt-2">
                                <span>✓</span> All doses completed today
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {pastMedications.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No completed courses yet
                </div>
              ) : (
                <div className="space-y-4">
                  {pastMedications.map((m) => (
                    <div key={m.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition opacity-90 hover:opacity-100">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-lg text-slate-700">{m.name}</p>
                          <p className="text-sm text-slate-600 mt-0.5">
                            {m.dosage} • {m.frequency}
                            {m.purpose && <span className="ml-1.5">• {m.purpose}</span>}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Ended on {new Date(m.endDate!).toLocaleDateString("en-IN")}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleEdit(m)} className="px-3 py-1.5 rounded-lg border border-teal-200 text-teal-700 text-sm font-medium hover:bg-teal-50">View</button>
                          <button onClick={() => onDelete(m.id)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50">Delete</button>
                        </div>
                      </div>
                      <div className="mt-4 text-sm text-slate-500 italic">
                        Course completed • No active reminders
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
