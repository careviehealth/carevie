// src/constants/medicalFolders.ts

export const MEDICAL_FOLDERS = [
  "reports",
  "prescriptions",
  "insurance",
  "bills",
] as const;

// Type derived from the array above
export type MedicalFolder = (typeof MEDICAL_FOLDERS)[number];
