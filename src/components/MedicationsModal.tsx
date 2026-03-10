// MedicationsModal.tsx
"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MEDICATION_MEAL_OPTIONS,
  countMedicationMealTiming,
  deriveMedicationMealTiming,
  formatMedicationDosage,
  formatMedicationFrequencyLabel,
  formatMedicationMealTimingSummary,
  getMedicationDoseStatesForDate,
  normalizeMedicationDosage,
  resolveMedicationTimesPerDay,
  type MedicationLog as SharedMedicationLog,
  type MedicationMealKey,
  type MedicationReminderSlot,
  type MedicationRecord as SharedMedication,
} from "@/lib/medications";
import {
  modalOverlayMotion,
  modalOverlayTransition,
  modalSurfaceMotion,
  modalSurfaceTransition,
} from "@/components/modalMotion";

export type MedicationLog = SharedMedicationLog;
export type Medication = SharedMedication & { id: string };

type Props = {
  data: Medication[];
  onAdd: (medication: Medication) => Promise<void> | void;
  onUpdate: (medication: Medication) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onLogDose?: (
    medicationId: string,
    taken: boolean,
    slotKey?: MedicationReminderSlot["key"]
  ) => Promise<void> | void;
};

export function MedicationsModal({ data, onAdd, onUpdate, onDelete, onLogDose }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showListView, setShowListView] = useState(false);

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [purpose, setPurpose] = useState("");
  const [mealTiming, setMealTiming] = useState<Medication["mealTiming"]>({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const reminderWindowMs = 90 * 60 * 1000;

  // Auto-set start date to today for new medications
  useEffect(() => {
    if (showForm && !editingId && !startDate) {
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
    }
  }, [showForm, editingId, startDate]);

  const resetForm = () => {
    setName("");
    setDosage("");
    setPurpose("");
    setMealTiming({});
    setStartDate("");
    setEndDate("");
    setEditingId(null);
  };

  const handleEdit = (medication: Medication) => {
    setName(medication.name);
    setDosage(formatMedicationDosage(medication.dosage));
    setPurpose(medication.purpose || "");
    setMealTiming(deriveMedicationMealTiming(medication.mealTiming, medication.frequency));

    setStartDate(medication.startDate || "");
    setEndDate(medication.endDate || "");
    setEditingId(medication.id);
    setShowForm(true);
  };

  const handleMealSelection = (meal: MedicationMealKey, checked: boolean) => {
    setMealTiming((prev) => {
      if (!checked) {
        const updated = { ...prev };
        delete updated[meal];
        return updated;
      }
      return { ...prev, [meal]: prev?.[meal] || "before" };
    });
  };

  const handleMealTimingChange = (
    meal: MedicationMealKey,
    value: "before" | "after"
  ) => {
    setMealTiming((prev) => ({ ...prev, [meal]: value }));
  };

  const handleSave = async () => {
    const selectedMealCount = countMedicationMealTiming(mealTiming);

    if (!name.trim() || !dosage.trim() || selectedMealCount === 0) {
      alert("Please fill Medication Name, Dosage, and select at least one meal timing.");
      return;
    }

    setSaving(true);
    try {
      const frequencySummary = formatMedicationMealTimingSummary(mealTiming);

      const medicationData: Medication = {
        id: editingId || crypto.randomUUID(),
        name: name.trim(),
        dosage: normalizeMedicationDosage(dosage),
        purpose: purpose.trim(),
        frequency: frequencySummary,
        timesPerDay: resolveMedicationTimesPerDay(frequencySummary, selectedMealCount, mealTiming),
        mealTiming: selectedMealCount > 0 ? mealTiming : undefined,
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

  const handleLogDose = async (
    medicationId: string,
    taken: boolean,
    slotKey?: MedicationReminderSlot["key"]
  ) => {
    if (onLogDose) {
      await onLogDose(medicationId, taken, slotKey);
    }
  };

  const getTodayProgress = (medication: Medication) => {
    const doseStates = getMedicationDoseStatesForDate(medication, new Date(), reminderWindowMs);
    if (doseStates.length > 0) {
      const taken = doseStates.filter((dose) => dose.status === "taken").length;
      const target = doseStates.length;
      return {
        taken,
        target,
        percentage: target > 0 ? Math.min((taken / target) * 100, 100) : 100,
      };
    }

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

  const getDoseStatusClasses = (status: "taken" | "due" | "upcoming" | "missed") => {
    switch (status) {
      case "taken":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "due":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "missed":
        return "bg-rose-100 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getDoseStatusLabel = (status: "taken" | "due" | "upcoming" | "missed") => {
    switch (status) {
      case "taken":
        return "Taken";
      case "due":
        return "Due now";
      case "missed":
        return "Missed";
      default:
        return "Upcoming";
    }
  };

  const formatTableDate = (value?: string) => {
    if (!value) return "Not set";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getEndDateDetail = (medication: Medication) => {
    if (!medication.endDate) return "";
    const daysRemaining = getDaysRemaining(medication);
    if (daysRemaining === null) return "";
    if (daysRemaining > 0) {
      return `Ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
    }
    if (daysRemaining === 0) return "Ends today";
    return `Ended ${formatTableDate(medication.endDate)}`;
  };

  const getMealColumnLabel = (medication: Medication, meal: MedicationMealKey) => {
    const mealTiming = deriveMedicationMealTiming(medication.mealTiming, medication.frequency);
    const timing = mealTiming[meal];
    if (!timing) return "-";
    return timing === "before" ? "Before" : "After";
  };

  // Split medications
  const now = new Date();

  const activeMedications = data.filter((med) => {
    if (!med.endDate) return true;
    const end = new Date(med.endDate);
    return now <= end;
  });

  const totalScheduledDoses = activeMedications.reduce(
    (total, medication) =>
      total +
      Math.max(
        resolveMedicationTimesPerDay(
          medication.frequency,
          medication.timesPerDay,
          medication.mealTiming
        ),
        0
      ),
    0
  );

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 pr-12 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-2xl font-bold">Medications</h2>

        <div className="flex flex-wrap items-center gap-2">
          {!showForm && (
            <button
              onClick={() => setShowListView(true)}
              className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:self-auto"
            >
              View List
            </button>
          )}
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
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-8 p-6 rounded-2xl border bg-slate-50 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ... all form fields remain the same as before ... */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Medication Name</label>
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
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
              <label className="block text-sm font-medium text-slate-700 mb-3">Meal Timing</label>
              <div className="space-y-3">
                {MEDICATION_MEAL_OPTIONS.map((meal) => {
                  const isSelected = Boolean(mealTiming?.[meal.key]);
                  return (
                    <div key={meal.key} className="flex items-center justify-between gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleMealSelection(meal.key, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        {meal.label}
                      </label>

                      {isSelected && (
                        <select
                          value={mealTiming?.[meal.key]}
                          onChange={(e) =>
                            handleMealTimingChange(meal.key, e.target.value as "before" | "after")
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 outline-none"
                        >
                          <option value="before">Before</option>
                          <option value="after">After</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
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

      {/* Content area – only one shown at a time */}
      {!showForm && (
        <div>
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Current medications</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Review your active prescriptions and track each scheduled dose for today.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:justify-end">
                <div className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap">
                  {activeMedications.length} active
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap">
                  {totalScheduledDoses} daily doses
                </div>
              </div>
            </div>
          </div>

          {activeMedications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-slate-500">
              No active medications at the moment
            </div>
          ) : (
            <div className="space-y-4">
              {activeMedications.map((m) => {
                const progress = getTodayProgress(m);
                const doseStates = getMedicationDoseStatesForDate(m, now, reminderWindowMs);
                const hasStructuredDoseStates = doseStates.length > 0;
                const remainingStructuredDoses = doseStates.filter((dose) => dose.status !== "taken");

                return (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900">{m.name}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {formatMedicationDosage(m.dosage)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-600">
                          {formatMedicationFrequencyLabel(m.frequency, m.mealTiming)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          {m.purpose ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                              {m.purpose}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => handleEdit(m)}
                          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(m.id)}
                          className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {m.timesPerDay !== 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Today&apos;s progress</span>
                            <span className="text-xs font-medium text-slate-700">
                              {progress.taken} / {progress.target}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full ${
                                progress.percentage === 100 ? "bg-emerald-500" : "bg-teal-500"
                              } transition-all duration-500`}
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>

                          {hasStructuredDoseStates ? (
                            <div className="mt-3 space-y-1.5">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Today&apos;s doses
                              </div>
                              {doseStates.map((dose) => (
                                <div
                                  key={`${m.id}-${dose.key}`}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-800">{dose.label}</div>
                                    <div className="text-xs text-slate-500">
                                      {dose.context} at{" "}
                                      {dose.slotTime.toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getDoseStatusClasses(
                                        dose.status
                                      )}`}
                                    >
                                      {getDoseStatusLabel(dose.status)}
                                    </span>
                                    {dose.status !== "taken" && onLogDose ? (
                                      <button
                                        onClick={() => handleLogDose(m.id, true, dose.key)}
                                        className="rounded-md bg-teal-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-700"
                                      >
                                        Mark taken
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                              {remainingStructuredDoses.length === 0 ? (
                                <div className="pt-1 text-sm font-medium text-emerald-600">
                                  All doses completed today
                                </div>
                              ) : null}
                            </div>
                          ) : progress.taken < progress.target && onLogDose ? (
                            <button
                              onClick={() => handleLogDose(m.id, true)}
                              className="mt-3 w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
                            >
                              ✓ Mark dose taken
                            </button>
                          ) : null}

                          {progress.percentage === 100 && !hasStructuredDoseStates && (
                            <div className="pt-1 text-sm font-medium text-emerald-600">
                              All doses completed today
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showListView ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4"
            onClick={() => setShowListView(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Medication list view"
            {...modalOverlayMotion}
            transition={modalOverlayTransition}
          >
            <motion.div
              className="flex w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              {...modalSurfaceMotion}
              transition={modalSurfaceTransition}
            >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Current medication list</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                    <span className="whitespace-nowrap">{activeMedications.length} active</span>
                    <span className="text-slate-300">•</span>
                    <span className="whitespace-nowrap">{totalScheduledDoses} daily doses</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setShowListView(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            {activeMedications.length === 0 ? (
              <div className="px-6 py-16 text-center text-slate-500">
                No active medications to show in the list.
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
                    <colgroup>
                      <col className="w-[34%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-[27%]" />
                    </colgroup>
                    <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Medication</th>
                        <th className="px-5 py-3">Breakfast</th>
                        <th className="px-5 py-3">Lunch</th>
                        <th className="px-5 py-3">Dinner</th>
                        <th className="px-5 py-3">Started</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeMedications.map((medication) => {
                        return (
                          <tr key={`list-${medication.id}`} className="align-top">
                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-slate-900">{medication.name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                                  {formatMedicationDosage(medication.dosage)}
                                </span>
                                {medication.purpose?.trim() ? <span>{medication.purpose.trim()}</span> : null}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate-700">
                              {getMealColumnLabel(medication, "breakfast")}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate-700">
                              {getMealColumnLabel(medication, "lunch")}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate-700">
                              {getMealColumnLabel(medication, "dinner")}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="text-slate-800">{formatTableDate(medication.startDate)}</div>
                              {getEndDateDetail(medication) ? (
                                <div className="mt-1 text-sm text-slate-500">
                                  {getEndDateDetail(medication)}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
