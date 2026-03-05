export const medicalFolders = ['reports', 'prescriptions', 'insurance', 'bills'] as const;

export type MedicalFolder = (typeof medicalFolders)[number];
