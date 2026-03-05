import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';

const MEDICAL_VAULT_BUCKET = 'medical-vault';
const STORAGE_LIST_PAGE_SIZE = 100;
const STORAGE_OBJECTS_PAGE_SIZE = 1000;
const STORAGE_REMOVE_BATCH_SIZE = 100;
const STORAGE_CLEANUP_MAX_PASSES = 3;

type DeleteProfilePayload = {
  profileId?: unknown;
};

const isMissingAuthColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST204' || error?.message?.toLowerCase().includes('auth_id');

const createAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
};

type StorageObjectRow = {
  name: string | null;
};

const normalizeStoragePath = (value: string | null | undefined) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const listVaultPathsFromStorageTable = async (adminClient: SupabaseClient, profileId: string) => {
  const names = new Set<string>();

  let from = 0;
  while (true) {
    const to = from + STORAGE_OBJECTS_PAGE_SIZE - 1;
    const { data, error } = await adminClient
      .schema('storage')
      .from('objects')
      .select('name')
      .eq('bucket_id', MEDICAL_VAULT_BUCKET)
      .like('name', `${profileId}/%`)
      .order('name', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Unable to read vault objects.');
    }

    const rows = (data ?? []) as StorageObjectRow[];
    rows.forEach((row) => {
      const name = normalizeStoragePath(row.name);
      if (name) {
        names.add(name);
      }
    });

    if (rows.length < STORAGE_OBJECTS_PAGE_SIZE) {
      break;
    }

    from += STORAGE_OBJECTS_PAGE_SIZE;
  }

  const { data: rootObjectRows, error: rootObjectError } = await adminClient
    .schema('storage')
    .from('objects')
    .select('name')
    .eq('bucket_id', MEDICAL_VAULT_BUCKET)
    .eq('name', profileId);

  if (rootObjectError) {
    throw new Error(rootObjectError.message || 'Unable to read vault root object.');
  }

  (rootObjectRows as StorageObjectRow[] | null | undefined)?.forEach((row) => {
    const name = normalizeStoragePath(row.name);
    if (name) {
      names.add(name);
    }
  });

  return Array.from(names);
};

type StorageListEntry = {
  id?: string | null;
  name?: string | null;
  metadata?: unknown;
};

const isStorageFileEntry = (entry: StorageListEntry) => {
  if (typeof entry.id === 'string' && entry.id.trim().length > 0) {
    return true;
  }
  if (entry.id === null) {
    return false;
  }
  return Boolean(entry.metadata && typeof entry.metadata === 'object');
};

const listVaultPathsViaRecursiveList = async (adminClient: SupabaseClient, profileId: string) => {
  const bucket = adminClient.storage.from(MEDICAL_VAULT_BUCKET);
  const paths = new Set<string>();
  const foldersToVisit = [profileId];

  while (foldersToVisit.length > 0) {
    const currentPrefix = foldersToVisit.shift();
    if (!currentPrefix) {
      continue;
    }

    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(currentPrefix, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) {
        throw new Error(error.message || 'Unable to list vault files.');
      }

      const entries = (data ?? []) as StorageListEntry[];
      for (const entry of entries) {
        const name = normalizeStoragePath(entry.name ?? '');
        if (!name) continue;
        const fullPath = `${currentPrefix}/${name}`;

        if (isStorageFileEntry(entry)) {
          paths.add(fullPath);
          continue;
        }

        foldersToVisit.push(fullPath);
      }

      if (entries.length < STORAGE_LIST_PAGE_SIZE) {
        break;
      }

      offset += STORAGE_LIST_PAGE_SIZE;
    }
  }

  return Array.from(paths);
};

const listVaultPathsForProfile = async (adminClient: SupabaseClient, profileId: string) => {
  let tablePaths: string[] | null = null;
  let recursivePaths: string[] | null = null;

  try {
    tablePaths = await listVaultPathsFromStorageTable(adminClient, profileId);
  } catch (error) {
    console.warn('Storage-table listing failed during vault cleanup:', error);
  }

  try {
    recursivePaths = await listVaultPathsViaRecursiveList(adminClient, profileId);
  } catch (error) {
    console.warn('Recursive storage listing failed during vault cleanup:', error);
  }

  if (!tablePaths && !recursivePaths) {
    throw new Error('Unable to enumerate vault files for cleanup.');
  }

  const allPaths = new Set<string>([...(tablePaths ?? []), ...(recursivePaths ?? [])]);
  return Array.from(allPaths);
};

const removeVaultPaths = async (adminClient: SupabaseClient, paths: string[]) => {
  if (paths.length === 0) return;

  const bucket = adminClient.storage.from(MEDICAL_VAULT_BUCKET);
  for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await bucket.remove(batch);
    if (error) {
      throw new Error(error.message || 'Unable to remove vault files.');
    }
  }
};

const hasVaultEntries = async (adminClient: SupabaseClient, profileId: string) => {
  const bucket = adminClient.storage.from(MEDICAL_VAULT_BUCKET);
  const { data, error } = await bucket.list(profileId, {
    limit: 1,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    throw new Error(error.message || 'Unable to verify vault cleanup.');
  }

  return (data ?? []).length > 0;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteProfilePayload | null;
    const profileId = typeof body?.profileId === 'string' ? body.profileId.trim() : '';

    if (!profileId) {
      return NextResponse.json({ message: 'profileId is required.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    let profileRecord: { id: string; is_primary: boolean | null } | null = null;

    const { data: ownedByAuth, error: ownedByAuthError } = await adminClient
      .from('profiles')
      .select('id, is_primary')
      .eq('id', profileId)
      .eq('auth_id', user.id)
      .maybeSingle();

    if (ownedByAuthError && ownedByAuthError.code !== 'PGRST116' && !isMissingAuthColumnError(ownedByAuthError)) {
      return NextResponse.json({ message: ownedByAuthError.message }, { status: 500 });
    }

    if (ownedByAuth?.id) {
      profileRecord = {
        id: ownedByAuth.id,
        is_primary: Boolean(ownedByAuth.is_primary),
      };
    }

    if (!profileRecord) {
      const { data: ownedByUser, error: ownedByUserError } = await adminClient
        .from('profiles')
        .select('id, is_primary')
        .eq('id', profileId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownedByUserError && ownedByUserError.code !== 'PGRST116') {
        return NextResponse.json({ message: ownedByUserError.message }, { status: 500 });
      }

      if (ownedByUser?.id) {
        profileRecord = {
          id: ownedByUser.id,
          is_primary: Boolean(ownedByUser.is_primary),
        };
      }
    }

    if (!profileRecord) {
      return NextResponse.json({ message: 'Not allowed for this profile.' }, { status: 403 });
    }

    if (profileRecord.is_primary) {
      return NextResponse.json({ message: 'Primary profile cannot be deleted.' }, { status: 400 });
    }

    const removedPaths = new Set<string>();
    let cleanupPass = 0;
    let remainingVaultPaths: string[] = [];

    while (cleanupPass < STORAGE_CLEANUP_MAX_PASSES) {
      cleanupPass += 1;
      const vaultPaths = await listVaultPathsForProfile(adminClient, profileRecord.id);

      if (vaultPaths.length === 0) {
        break;
      }

      vaultPaths.forEach((path) => removedPaths.add(path));
      await removeVaultPaths(adminClient, vaultPaths);
    }

    remainingVaultPaths = await listVaultPathsForProfile(adminClient, profileRecord.id);
    const stillHasVaultEntries =
      remainingVaultPaths.length > 0 || (await hasVaultEntries(adminClient, profileRecord.id));

    if (stillHasVaultEntries) {
      const sample = remainingVaultPaths.slice(0, 5);
      console.error('Profile delete blocked due to incomplete vault cleanup.', {
        profileId: profileRecord.id,
        remainingCount: remainingVaultPaths.length,
        sample,
      });
      return NextResponse.json(
        {
          message: 'Could not fully remove vault files. Please retry deletion.',
          remainingVaultFiles: remainingVaultPaths.length,
          sample,
        },
        { status: 500 }
      );
    }

    const { error: deleteError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', profileRecord.id);

    if (deleteError) {
      return NextResponse.json({ message: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      deleted: true,
      removedVaultFiles: removedPaths.size,
    });
  } catch (error) {
    console.error('Error deleting profile:', error);
    return NextResponse.json({ message: 'Failed to delete profile.' }, { status: 500 });
  }
}
