/* ======================================================
   Shared Health Profile Types
   Used by:
   - Health Onboarding
   - Edit Health Profile
   - API Routes
   - Supabase Inserts
====================================================== */

/* ---------- Core IDs ---------- */

export type ID = string;

/* ---------- Medication ---------- */

export interface Medication {
  id?: ID; // optional on client, generated in DB
  name: string;
  dosage: string;
  frequency: string;
  purpose?: string;
}

/* ---------- Past Surgery ---------- */

export interface PastSurgery {
  id?: ID;
  name: string;
  month: number; // 1–12
  year: number; // YYYY
}

/* ---------- Health Profile ---------- */

export interface HealthProfile {
  // Core (required during onboarding)
  dateOfBirth: string; // YYYY-MM-DD
  bloodGroup: string;
  heightCm: number;
  weightKg: number;

  // Multi-entry (optional)
  medications: Medication[];
  allergies: string[];
  ongoingTreatments: string[];
  previousDiagnosedConditions: string[];
  pastSurgeries: PastSurgery[];
  childhoodIllnesses: string[];
  longTermTreatments: string[];
}

/* ---------- API Payload ---------- */

export interface SaveHealthProfilePayload {
  profile: HealthProfile;
}

/* ---------- Edit Mode Helpers ---------- */

export interface Editable<T> {
  data: T;
  isDirty: boolean;
}