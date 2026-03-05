import { supabase } from './createClient';
import { MedicalFolder } from '@/constants/medicalFolders';

export async function uploadMedicalFile(
  profileId: string,
  folder: MedicalFolder,
  file: File,
  fileName?: string
) {
  const rawName = fileName?.trim() || file.name;
  const safeName = rawName.replace(/[\\/]/g, '-');
  const filePath = `${profileId}/${folder}/${safeName}`;

  return supabase.storage
    .from('medical-vault')
    .upload(filePath, file, { upsert: false });
}

export async function listMedicalFiles(
  profileId: string,
  folder: MedicalFolder
) {
  return supabase.storage
    .from('medical-vault')
    .list(`${profileId}/${folder}`, {
      sortBy: { column: 'created_at', order: 'desc' },
    });
}

export async function deleteMedicalFile(path: string) {
  return supabase.storage
    .from('medical-vault')
    .remove([path]);
}

export async function getSignedUrl(path: string) {
  return supabase.storage
    .from('medical-vault')
    .createSignedUrl(path, 60);
}
