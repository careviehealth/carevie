//MedicalTeamModal.tsx
"use client";

import { useState } from "react";

export type Doctor = {
  id: string;
  name: string;
  number: string;
  speciality: string;
};

type Props = {
  data: Doctor[];
  onAdd: (doctor: Doctor) => Promise<void> | void;
  onUpdate: (doctor: Doctor) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
};

export function MedicalTeamModal({ data, onAdd, onUpdate, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [speciality, setSpeciality] = useState("");

  const resetForm = () => {
    setName("");
    setNumber("");
    setSpeciality("");
    setEditingId(null);
  };

  const handleEdit = (doctor: Doctor) => {
    setName(doctor.name);
    setNumber(doctor.number);
    setSpeciality(doctor.speciality);
    setEditingId(doctor.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !number.trim() || !speciality.trim()) {
      alert("Please fill all fields.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await onUpdate({
          id: editingId,
          name: name.trim(),
          number: number.trim(),
          speciality: speciality.trim(),
        });
      } else {
        await onAdd({
          id: "",
          name: name.trim(),
          number: number.trim(),
          speciality: speciality.trim(),
        });
      }
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold">Medical Team</h2>

        <button
          onClick={() => {
            setShowForm((v) => !v);
            if (!showForm) resetForm();
          }}
          className="mt-6 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {showForm ? "Close" : "+ Add Doctor"}
        </button>
      </div>

      {showForm && (
        <div className="mb-5 p-4 rounded-2xl border bg-slate-50">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label htmlFor="doctor-name" className="text-sm font-medium text-slate-700">Name</label>
              <input
                id="doctor-name"
                name="doctorName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 bg-white"
                placeholder="e.g., Dr. John Smith"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="doctor-number" className="text-sm font-medium text-slate-700">
                Phone Number
              </label>
              <input
                id="doctor-number"
                name="doctorPhone"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                type="tel"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 bg-white"
                placeholder="e.g., 9876543210"
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="doctor-speciality" className="text-sm font-medium text-slate-700">
                Speciality
              </label>
              <input
                id="doctor-speciality"
                name="speciality"
                value={speciality}
                onChange={(e) => setSpeciality(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 bg-white"
                placeholder="e.g., Cardiologist / General Physician"
                autoComplete="organization-title"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                disabled={saving}
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {saving
                  ? editingId
                    ? "Updating..."
                    : "Saving..."
                  : editingId
                  ? "Update"
                  : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!data.length ? (
        <p className="text-slate-600">No doctors added.</p>
      ) : (
        <div className="space-y-2">
          {data.map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-xl bg-slate-50 border hover:bg-slate-100 transition flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-semibold">{d.name}</p>
                <p className="text-sm text-slate-500">
                  {d.speciality} • {d.number}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(d)}
                  className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-600 hover:bg-teal-50"
                  title="Edit doctor"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(d.id)}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  title="Delete doctor"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}