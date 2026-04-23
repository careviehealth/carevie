//EmergencyContactsModal.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from "@/lib/countries";
import { toast } from "@/components/AppNotifier";

export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relation: string;
};

type Props = {
  data: EmergencyContact[];
  onAdd: (contact: EmergencyContact) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
};

export function EmergencyContactsModal({ data, onAdd, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement | null>(null);
  const countryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!countryDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = countryDropdownRef.current?.contains(target);
      const inPortal = document.getElementById("emergency-country-dropdown")?.contains(target);
      if (!inTrigger && !inPortal) setCountryDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [countryDropdownOpen]);

  useEffect(() => {
    if (!countryDropdownOpen || !countryTriggerRef.current) return;
    const el = countryTriggerRef.current;
    const rect = el.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, [countryDropdownOpen]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setRelation("");
    setSelectedCountry(DEFAULT_COUNTRY);
  };

  const handleSave = async () => {
    if (!name.trim() || !relation.trim()) {
      toast.warning("Missing info", "Please enter a valid name and relation.");
      return;
    }
    const digitsOnly = phone.replace(/\D/g, "");
    const isIndia = selectedCountry.code === "IN";
    const minLen = isIndia ? INDIA_PHONE_DIGITS : 10;
    if (digitsOnly.length < minLen || digitsOnly.length > PHONE_MAX_DIGITS) {
      toast.warning(
        "Invalid phone number",
        isIndia
          ? "Please enter a valid 10-digit phone number."
          : "Please enter a valid phone number (10–15 digits)."
      );
      return;
    }

    const fullPhone = `${selectedCountry.dialCode}${digitsOnly}`;

    setSaving(true);
    try {
      await onAdd({
        id: "",
        name: name.trim(),
        phone: fullPhone,
        relation: relation.trim(),
      });
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold">Emergency Contacts</h2>

        <button
          onClick={() => {
            setShowForm((v) => !v);
            if (!showForm) resetForm();
          }}
          className="mt-6 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {showForm ? "Close" : "+ Add Contact"}
        </button>
      </div>

      {showForm && (
        <div className="mb-5 p-4 rounded-2xl border bg-slate-50">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 bg-white"
                placeholder="e.g., Mom / John Doe"
              />
            </div>

            <div ref={countryDropdownRef} className="relative">
              <label className="text-sm font-medium text-slate-700">Phone</label>
              <div className="mt-2 flex border border-slate-200 bg-white rounded-xl focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500">
                <div className="relative shrink-0">
                  <button
                    ref={countryTriggerRef}
                    type="button"
                    onClick={() => setCountryDropdownOpen((v) => !v)}
                    className="flex items-center gap-1 px-3 py-3 bg-slate-100 border-r border-slate-200 rounded-l-xl text-slate-700 font-semibold text-sm hover:bg-slate-200 focus:outline-none min-w-[5.5rem]"
                    aria-label="Country code"
                    aria-expanded={countryDropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <span>{selectedCountry.dialCode}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${countryDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {countryDropdownOpen &&
                    createPortal(
                      <div
                        id="emergency-country-dropdown"
                        className="vytara-theme-content fixed z-[9999] w-64 bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden"
                        role="listbox"
                        style={{
                          top: dropdownPosition.top,
                          left: dropdownPosition.left,
                        }}
                      >
                        <div className="max-h-[280px] overflow-y-auto overscroll-contain py-1">
                          {COUNTRIES.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              role="option"
                              aria-selected={c.code === selectedCountry.code}
                              onClick={() => {
                                setSelectedCountry(c);
                                setCountryDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${c.code === selectedCountry.code ? "bg-teal-50 text-teal-800 font-semibold" : "text-slate-700"}`}
                            >
                              {c.name} ({c.dialCode})
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, "");
                    if (digitsOnly.length <= PHONE_MAX_DIGITS) setPhone(digitsOnly);
                  }}
                  className="flex-1 min-w-0 px-4 py-3 text-sm outline-none border-0 bg-white rounded-r-xl"
                  placeholder="e.g., 9876543210"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Relation
              </label>
              <input
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 bg-white"
                placeholder="e.g., Parent / Friend / Spouse"
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
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!data.length ? (
        <p className="text-slate-600">No emergency contacts found.</p>
      ) : (
        <div className="space-y-2">
          {data.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl bg-slate-50 border hover:bg-slate-100 transition flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-slate-500">
                  {c.relation} • {c.phone}
                </p>
              </div>

              <button
                onClick={() => onDelete(c.id)}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                title="Delete contact"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
