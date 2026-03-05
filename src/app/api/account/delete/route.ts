import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';

const MEDICAL_VAULT_BUCKET = 'medical-vault';
const STORAGE_LIST_PAGE_SIZE = 100;
const STORAGE_OBJECTS_PAGE_SIZE = 1000;
const STORAGE_REMOVE_BATCH_SIZE = 100;

type DeleteAccountPayload = {
  confirmation?: unknown;
};

type DbErrorLike = {
  code?: string;
  message?: string;
} | null;

type StorageObjectRow = {
  name: string | null;
};

type StorageListEntry = {
  id?: string | null;
  name?: string | null;
  metadata?: unknown;
};

type ProfileOwnershipRow = {
  id: string;
  user_id?: string | null;
  auth_id?: string | null;
};

const isMissingRelationError = (error: DbErrorLike) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  /relation .* does not exist/i.test(error?.message ?? '') ||
  /could not find the table/i.test(error?.message ?? '');

const isMissingColumnError = (error: DbErrorLike) =>
  error?.code === 'PGRST204' || /column .* does not exist/i.test(error?.message ?? '');

const isStorageFileEntry = (entry: StorageListEntry) => {
  if (typeof entry.id === 'string' && entry.id.trim().length > 0) {
    return true;
  }
  if (entry.id === null) {
    return false;
  }
  return Boolean(entry.metadata && typeof entry.metadata === 'object');
};

const createAdminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
};

const runDelete = async <T extends { error: DbErrorLike }>(label: string, operation: PromiseLike<T>) => {
  const { error } = await operation;
  if (error && !isMissingRelationError(error) && !isMissingColumnError(error)) {
    throw new Error(`${label}: ${error.message || 'Delete failed.'}`);
  }
};

const runSelect = async <T>(
  label: string,
  operation: PromiseLike<{ data: T | null; error: DbErrorLike }>
): Promise<T | null> => {
  const { data, error } = await operation;
  if (error && !isMissingRelationError(error) && !isMissingColumnError(error)) {
    throw new Error(`${label}: ${error.message || 'Read failed.'}`);
  }
  return data ?? null;
};

const toUniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));

const listProfilesForUser = async (adminClient: SupabaseClient, userId: string) => {
  const byId = new Map<string, ProfileOwnershipRow>();

  const rowsByAuthResponse = await adminClient
    .from('profiles')
    .select('id, user_id, auth_id')
    .eq('auth_id', userId);

  if (rowsByAuthResponse.error && !isMissingColumnError(rowsByAuthResponse.error) && !isMissingRelationError(rowsByAuthResponse.error)) {
    throw new Error(`profiles by auth_id: ${rowsByAuthResponse.error.message || 'Read failed.'}`);
  }

  (rowsByAuthResponse.data ?? []).forEach((row) => {
    if (row?.id) byId.set(row.id, row);
  });

  const rowsByUserResponse = await adminClient
    .from('profiles')
    .select('id, user_id, auth_id')
    .eq('user_id', userId);

  if (rowsByUserResponse.error && isMissingColumnError(rowsByUserResponse.error)) {
    const legacyRowsByUserResponse = await adminClient
      .from('profiles')
      .select('id, user_id')
      .eq('user_id', userId);

    if (
      legacyRowsByUserResponse.error &&
      !isMissingRelationError(legacyRowsByUserResponse.error) &&
      !isMissingColumnError(legacyRowsByUserResponse.error)
    ) {
      throw new Error(`profiles by user_id: ${legacyRowsByUserResponse.error.message || 'Read failed.'}`);
    }

    (legacyRowsByUserResponse.data ?? []).forEach((row) => {
      if (row?.id) byId.set(row.id, { id: row.id, user_id: row.user_id ?? null, auth_id: null });
    });
  } else {
    if (
      rowsByUserResponse.error &&
      !isMissingRelationError(rowsByUserResponse.error) &&
      !isMissingColumnError(rowsByUserResponse.error)
    ) {
      throw new Error(`profiles by user_id: ${rowsByUserResponse.error.message || 'Read failed.'}`);
    }
    (rowsByUserResponse.data ?? []).forEach((row) => {
      if (row?.id) byId.set(row.id, row);
    });
  }

  return Array.from(byId.values());
};

const listVaultPathsFromStorageTable = async (adminClient: SupabaseClient, ownerPrefix: string) => {
  const names = new Set<string>();
  let from = 0;

  while (true) {
    const to = from + STORAGE_OBJECTS_PAGE_SIZE - 1;
    const { data, error } = await adminClient
      .schema('storage')
      .from('objects')
      .select('name')
      .eq('bucket_id', MEDICAL_VAULT_BUCKET)
      .like('name', `${ownerPrefix}/%`)
      .order('name', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Unable to read vault objects from storage table.');
    }

    const rows = (data ?? []) as StorageObjectRow[];
    rows.forEach((row) => {
      const name = row.name?.trim();
      if (name) names.add(name);
    });

    if (rows.length < STORAGE_OBJECTS_PAGE_SIZE) {
      break;
    }
    from += STORAGE_OBJECTS_PAGE_SIZE;
  }

  const { data: rootRows, error: rootError } = await adminClient
    .schema('storage')
    .from('objects')
    .select('name')
    .eq('bucket_id', MEDICAL_VAULT_BUCKET)
    .eq('name', ownerPrefix);

  if (rootError) {
    throw new Error(rootError.message || 'Unable to read vault root object from storage table.');
  }

  (rootRows as StorageObjectRow[] | null | undefined)?.forEach((row) => {
    const name = row.name?.trim();
    if (name) names.add(name);
  });

  return Array.from(names);
};

const listVaultPathsViaRecursiveList = async (adminClient: SupabaseClient, ownerPrefix: string) => {
  const bucket = adminClient.storage.from(MEDICAL_VAULT_BUCKET);
  const paths = new Set<string>();
  const foldersToVisit = [ownerPrefix];

  while (foldersToVisit.length > 0) {
    const currentPrefix = foldersToVisit.shift();
    if (!currentPrefix) continue;

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
        const name = entry.name?.trim();
        if (!name) continue;
        const fullPath = `${currentPrefix}/${name}`;
        if (isStorageFileEntry(entry)) {
          paths.add(fullPath);
        } else {
          foldersToVisit.push(fullPath);
        }
      }

      if (entries.length < STORAGE_LIST_PAGE_SIZE) {
        break;
      }
      offset += STORAGE_LIST_PAGE_SIZE;
    }
  }

  return Array.from(paths);
};

const listVaultPathsForPrefix = async (adminClient: SupabaseClient, ownerPrefix: string) => {
  let tablePaths: string[] | null = null;
  let recursivePaths: string[] | null = null;

  try {
    tablePaths = await listVaultPathsFromStorageTable(adminClient, ownerPrefix);
  } catch {
    tablePaths = null;
  }

  try {
    recursivePaths = await listVaultPathsViaRecursiveList(adminClient, ownerPrefix);
  } catch {
    recursivePaths = null;
  }

  if (!tablePaths && !recursivePaths) {
    throw new Error('Unable to enumerate vault files for deletion.');
  }

  return Array.from(new Set([...(tablePaths ?? []), ...(recursivePaths ?? [])]));
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

const cleanupVaultForPrefixes = async (adminClient: SupabaseClient, ownerPrefixes: string[]) => {
  for (const ownerPrefix of ownerPrefixes) {
    const paths = await listVaultPathsForPrefix(adminClient, ownerPrefix);
    await removeVaultPaths(adminClient, paths);

    const remainingPaths = await listVaultPathsForPrefix(adminClient, ownerPrefix);
    if (remainingPaths.length > 0) {
      throw new Error(`Vault cleanup incomplete for owner prefix ${ownerPrefix}.`);
    }
  }
};

const deleteProfileScopedTables = async (
  adminClient: SupabaseClient,
  profileIds: string[],
  accountIds: string[],
  legacyTextOwnerKeys: string[]
) => {
  if (profileIds.length > 0) {
    await runDelete(
      'profile_activity_logs',
      adminClient.from('profile_activity_logs').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'care_emergency_cards.profile_id',
      adminClient.from('care_emergency_cards').delete().in('profile_id', profileIds)
    );
    await runDelete('health.profile_id', adminClient.from('health').delete().in('profile_id', profileIds));
    await runDelete(
      'user_appointments.profile_id',
      adminClient.from('user_appointments').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'user_emergency_contacts.profile_id',
      adminClient.from('user_emergency_contacts').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'user_medical_team.profile_id',
      adminClient.from('user_medical_team').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'user_medication_logs.profile_id',
      adminClient.from('user_medication_logs').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'user_medications.profile_id',
      adminClient.from('user_medications').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'medical_reports_processed.profile_id',
      adminClient.from('medical_reports_processed').delete().in('profile_id', profileIds)
    );
    await runDelete(
      'medical_summaries_cache.profile_id',
      adminClient.from('medical_summaries_cache').delete().in('profile_id', profileIds)
    );
    await runDelete('personal.profile_id', adminClient.from('personal').delete().in('profile_id', profileIds));
    await runDelete(
      'care_circle_links.profile_id',
      adminClient.from('care_circle_links').delete().in('profile_id', profileIds)
    );
  }

  for (const accountId of accountIds) {
    await runDelete(
      'care_emergency_cards.user_id',
      adminClient.from('care_emergency_cards').delete().eq('user_id', accountId)
    );
    await runDelete('health.user_id', adminClient.from('health').delete().eq('user_id', accountId));
    await runDelete(
      'user_appointments.user_id',
      adminClient.from('user_appointments').delete().eq('user_id', accountId)
    );
    await runDelete(
      'user_emergency_contacts.user_id',
      adminClient.from('user_emergency_contacts').delete().eq('user_id', accountId)
    );
    await runDelete(
      'user_medical_team.user_id',
      adminClient.from('user_medical_team').delete().eq('user_id', accountId)
    );
    await runDelete(
      'user_medication_logs.user_id',
      adminClient.from('user_medication_logs').delete().eq('user_id', accountId)
    );
    await runDelete(
      'user_medications.user_id',
      adminClient.from('user_medications').delete().eq('user_id', accountId)
    );
    await runDelete(
      'notification_states.user_id',
      adminClient.from('notification_states').delete().eq('user_id', accountId)
    );
    await runDelete(
      'remembered_devices.user_id',
      adminClient.from('remembered_devices').delete().eq('user_id', accountId)
    );
    await runDelete(
      'user_profile_preferences.user_id',
      adminClient.from('user_profile_preferences').delete().eq('user_id', accountId)
    );
    await runDelete('personal.id', adminClient.from('personal').delete().eq('id', accountId));
    await runDelete('user_profiles.user_id', adminClient.from('user_profiles').delete().eq('user_id', accountId));
  }

  for (const ownerKey of legacyTextOwnerKeys) {
    await runDelete(
      'medical_reports_processed.user_id',
      adminClient.from('medical_reports_processed').delete().eq('user_id', ownerKey)
    );
    await runDelete(
      'medical_summaries_cache.user_id',
      adminClient.from('medical_summaries_cache').delete().eq('user_id', ownerKey)
    );
  }
};

const collectUserFamilyIds = async (adminClient: SupabaseClient, userId: string) => {
  const ids = new Set<string>();

  const familyLinks = await runSelect<Array<{ family_id: string | null }>>(
    'family_links lookup',
    adminClient
      .from('family_links')
      .select('family_id')
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
  );

  familyLinks?.forEach((row) => {
    if (row.family_id) ids.add(row.family_id);
  });

  const familyMembers = await runSelect<Array<{ family_id: string | null }>>(
    'family_members lookup',
    adminClient.from('family_members').select('family_id').eq('user_id', userId)
  );

  familyMembers?.forEach((row) => {
    if (row.family_id) ids.add(row.family_id);
  });

  return Array.from(ids);
};

const cleanupOrphanFamilies = async (adminClient: SupabaseClient, familyIds: string[]) => {
  for (const familyId of familyIds) {
    const memberCountResult = await adminClient
      .from('family_members')
      .select('family_id', { head: true, count: 'exact' })
      .eq('family_id', familyId);

    if (
      memberCountResult.error &&
      !isMissingRelationError(memberCountResult.error) &&
      !isMissingColumnError(memberCountResult.error)
    ) {
      throw new Error(`family_members count: ${memberCountResult.error.message || 'Count failed.'}`);
    }

    if (memberCountResult.error) {
      continue;
    }

    if ((memberCountResult.count ?? 0) > 0) {
      continue;
    }

    await runDelete(
      'family_join_requests.family_id',
      adminClient.from('family_join_requests').delete().eq('family_id', familyId)
    );
    await runDelete(
      'family_links.family_id',
      adminClient.from('family_links').delete().eq('family_id', familyId)
    );
    await runDelete(
      'family_members.family_id',
      adminClient.from('family_members').delete().eq('family_id', familyId)
    );
    await runDelete('families.id', adminClient.from('families').delete().eq('id', familyId));
  }
};

const verifyNoRemainingOwnedProfiles = async (adminClient: SupabaseClient, userId: string) => {
  const rowsByAuth = await runSelect<Array<{ id: string }>>(
    'verify profiles by auth_id',
    adminClient.from('profiles').select('id').eq('auth_id', userId)
  );

  if ((rowsByAuth ?? []).length > 0) {
    throw new Error('Owned profiles still exist after cleanup (auth_id check).');
  }

  const rowsByUser = await runSelect<Array<{ id: string }>>(
    'verify profiles by user_id',
    adminClient.from('profiles').select('id').eq('user_id', userId)
  );

  if ((rowsByUser ?? []).length > 0) {
    throw new Error('Owned profiles still exist after cleanup (user_id check).');
  }
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteAccountPayload | null;
    const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim().toUpperCase() : '';

    if (confirmation !== 'DELETE') {
      return NextResponse.json(
        { message: 'Confirmation text is required to delete the account.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const ownedProfiles = await listProfilesForUser(adminClient, user.id);
    const profileIds = toUniqueStrings(ownedProfiles.map((row) => row.id));
    const accountIds = toUniqueStrings([
      user.id,
      ...ownedProfiles.map((row) => row.user_id ?? null),
      ...ownedProfiles.map((row) => row.auth_id ?? null),
    ]);
    const legacyTextOwnerKeys = toUniqueStrings([...profileIds, ...accountIds]);
    const vaultOwnerPrefixes = toUniqueStrings([...profileIds, ...accountIds]);

    await cleanupVaultForPrefixes(adminClient, vaultOwnerPrefixes);

    const touchedFamilyIds = await collectUserFamilyIds(adminClient, user.id);

    await runDelete(
      'care_circle_links.requester_recipient',
      adminClient.from('care_circle_links').delete().or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    );
    await runDelete(
      'family_links.requester_recipient',
      adminClient.from('family_links').delete().or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    );
    await runDelete('family_members.user_id', adminClient.from('family_members').delete().eq('user_id', user.id));
    await runDelete(
      'family_join_requests.requester',
      adminClient.from('family_join_requests').delete().eq('requester_id', user.id)
    );
    await runDelete(
      'family_join_requests.recipient',
      adminClient.from('family_join_requests').delete().eq('recipient_id', user.id)
    );

    await deleteProfileScopedTables(adminClient, profileIds, accountIds, legacyTextOwnerKeys);
    await runDelete('profiles.auth_id', adminClient.from('profiles').delete().eq('auth_id', user.id));
    await runDelete('profiles.user_id', adminClient.from('profiles').delete().eq('user_id', user.id));

    await cleanupOrphanFamilies(adminClient, touchedFamilyIds);
    await verifyNoRemainingOwnedProfiles(adminClient, user.id);

    const hardDelete = await adminClient.auth.admin.deleteUser(user.id);
    if (hardDelete.error) {
      const softDelete = await adminClient.auth.admin.deleteUser(user.id, true);
      if (softDelete.error) {
        console.error('Account deletion auth error:', hardDelete.error.message, softDelete.error.message);
        return NextResponse.json(
          { message: 'Failed to delete account completely. Please try again or contact support.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ message: 'Account deleted.', mode: 'soft' });
    }

    return NextResponse.json({ message: 'Account deleted.', mode: 'hard' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ message: 'Failed to delete account.' }, { status: 500 });
  }
}
