import { vaultApi } from '@/api';
import type { MedicalFolder } from '@/constants/medicalFolders';

export const vaultRepository = {
  listFiles: (profileId: string, folder: MedicalFolder) => vaultApi.listFiles(profileId, folder),
};
