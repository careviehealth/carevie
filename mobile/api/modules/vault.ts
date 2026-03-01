import { supabase } from '@/lib/supabase';
import type { MedicalFolder } from '@/constants/medicalFolders';

export type VaultFile = {
  name: string;
  created_at: string;
};

const sanitizeFileName = (name: string) => {
  const trimmed = name.trim();
  const safe = trimmed.replace(/[\\/]/g, '-');
  return safe || 'untitled';
};

const loadBlobFromUri = async (uri: string): Promise<Blob> => {
  try {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to read selected file (${response.status}).`);
    }
    return await response.blob();
  } catch {
    return await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        if (xhr.response) {
          resolve(xhr.response as Blob);
          return;
        }
        reject(new Error('Unable to read selected file.'));
      };
      xhr.onerror = () => reject(new Error('Unable to read selected file.'));
      xhr.responseType = 'blob';
      xhr.open('GET', uri, true);
      xhr.send();
    });
  }
};

// NOTE: These are stubs. In many apps you'd use Supabase Storage APIs
// and signed URLs behind an API. This keeps the interface stable.
export const vaultApi = {
  listFiles: async (profileId: string, folder: MedicalFolder) => {
    const { data, error } = await supabase.storage
      .from('medical-vault')
      .list(`${profileId}/${folder}`, {
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) return { data: null, error };

    return {
      data: (data ?? []).map((file) => ({
        name: file.name,
        created_at: file.created_at ?? new Date().toISOString(),
      })) as VaultFile[],
      error: null,
    };
  },
  getSignedUrl: async (path: string, expiresInSeconds = 60 * 5) => {
    const { data, error } = await supabase.storage
      .from('medical-vault')
      .createSignedUrl(path, expiresInSeconds);
    if (error) return { data: null, error };
    return { data, error: null };
  },
  uploadFile: async (
    profileId: string,
    folder: MedicalFolder,
    file: { uri: string; name: string; mimeType?: string | null },
    targetName?: string
  ) => {
    try {
      const blob = await loadBlobFromUri(file.uri);
      const name = sanitizeFileName(targetName ?? file.name);
      const path = `${profileId}/${folder}/${name}`;
      const { data, error } = await supabase.storage.from('medical-vault').upload(path, blob, {
        contentType: file.mimeType ?? undefined,
        upsert: false,
      });
      if (error) return { data: null, error };
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Unable to upload file.',
        },
      };
    }
  },
  deleteFile: async (path: string) => {
    const { data, error } = await supabase.storage.from('medical-vault').remove([path]);
    if (error) return { data: null, error };
    return { data, error: null };
  },
  renameFile: async (fromPath: string, toPath: string) => {
    const { data, error } = await supabase.storage.from('medical-vault').move(fromPath, toPath);
    if (error) return { data: null, error };
    return { data, error: null };
  },
};
