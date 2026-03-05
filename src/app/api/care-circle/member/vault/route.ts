import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';
import { logCareCircleActivity } from '@/lib/careCircleActivityLogs';

const CARE_CIRCLE_FOLDERS = ['reports', 'prescriptions', 'insurance', 'bills'] as const;
type CareCircleFolder = (typeof CARE_CIRCLE_FOLDERS)[number];
type CareCircleRole = 'family' | 'friend';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'heic',
  'heif',
  'avif',
  'ico',
]);

type LinkRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  relationship: string | null;
  profile_id: string | null;
};

type VaultFile = {
  name: string;
  created_at: string | null;
  folder: CareCircleFolder;
  url: string | null;
};

type AuthorizedVaultAccess = {
  adminClient: SupabaseClient;
  ownerProfileId: string;
  actorUserId: string;
};

type RenamePayload = {
  linkId?: string;
  actorProfileId?: string;
  folder?: string;
  name?: string;
  nextName?: string;
};

type DeletePayload = {
  linkId?: string;
  actorProfileId?: string;
  folder?: string;
  name?: string;
};

const normalizeCareCircleRole = (value: string | null | undefined): CareCircleRole => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (normalized === 'family') return 'family';
  return 'friend';
};

const canReadMedicalData = (role: CareCircleRole) => role === 'family';

const isMissingAuthColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST204' || error?.message?.toLowerCase().includes('auth_id');

const normalizeActorProfileId = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const resolveActorProfileId = async (
  adminClient: SupabaseClient,
  actorUserId: string,
  requestedActorProfileId: string | null
) => {
  if (!requestedActorProfileId) return null;

  const byAuth = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', requestedActorProfileId)
    .eq('auth_id', actorUserId)
    .maybeSingle();

  if (!byAuth.error && byAuth.data?.id) {
    return byAuth.data.id;
  }

  if (byAuth.error && !isMissingAuthColumnError(byAuth.error) && byAuth.error.code !== 'PGRST116') {
    return null;
  }

  const byUser = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', requestedActorProfileId)
    .eq('user_id', actorUserId)
    .maybeSingle();

  if (byUser.error || !byUser.data?.id) {
    return null;
  }

  return byUser.data.id;
};

const isVaultFolder = (value: string | null | undefined): value is CareCircleFolder =>
  typeof value === 'string' && CARE_CIRCLE_FOLDERS.includes(value as CareCircleFolder);

const trimStringField = (value: FormDataEntryValue | string | null | undefined) =>
  typeof value === 'string' ? value.trim() : '';

const isValidStorageFileName = (value: string | null | undefined) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('/') || trimmed.includes('\\')) return false;
  if (trimmed === '.' || trimmed === '..') return false;
  return true;
};

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

const getFileExtension = (name: string) => {
  const parts = name.split('.');
  if (parts.length <= 1) return '';
  return (parts.pop() ?? '').trim();
};

const isAllowedUploadType = (file: File) => {
  if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
    return true;
  }
  const extension = getFileExtension(file.name).toLowerCase();
  return extension === 'pdf' || ALLOWED_IMAGE_EXTENSIONS.has(extension);
};

const buildStoragePath = (profileId: string, folder: CareCircleFolder, fileName: string) =>
  `${profileId}/${folder}/${fileName}`;

const getStorageErrorStatus = (error: { statusCode?: unknown }) => {
  if (typeof error.statusCode === 'number' && Number.isFinite(error.statusCode)) {
    return error.statusCode;
  }
  if (typeof error.statusCode === 'string') {
    const parsed = Number(error.statusCode);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

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

const getAuthorizedVaultAccess = async (
  request: Request,
  linkId: string
): Promise<{ access: AuthorizedVaultAccess | null; response: NextResponse | null }> => {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      access: null,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      access: null,
      response: NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 }),
    };
  }

  const { data: linkRow, error: linkError } = await adminClient
    .from('care_circle_links')
    .select('id, requester_id, recipient_id, status, relationship, profile_id')
    .eq('id', linkId)
    .maybeSingle();

  if (linkError && linkError.code !== 'PGRST116') {
    return {
      access: null,
      response: NextResponse.json({ message: linkError.message }, { status: 500 }),
    };
  }

  const link = linkRow as LinkRow | null;
  if (!link) {
    return {
      access: null,
      response: NextResponse.json({ message: 'Care circle link not found.' }, { status: 404 }),
    };
  }

  const role = normalizeCareCircleRole(link.relationship);
  const isAuthorizedRecipient =
    link.recipient_id === user.id && link.status === 'accepted' && canReadMedicalData(role);

  if (!isAuthorizedRecipient) {
    return {
      access: null,
      response: NextResponse.json(
        { message: 'Not allowed for this care circle member.' },
        { status: 403 }
      ),
    };
  }

  if (!link.profile_id) {
    return {
      access: null,
      response: NextResponse.json({ message: 'Owner profile is not available.' }, { status: 404 }),
    };
  }

  return {
    access: {
      adminClient,
      ownerProfileId: link.profile_id,
      actorUserId: user.id,
    },
    response: null,
  };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const linkId = url.searchParams.get('linkId')?.trim();
    const category = (url.searchParams.get('category') || 'all') as CareCircleFolder | 'all';
    const includeSignedParam = url.searchParams.get('includeSigned');
    const includeSigned =
      includeSignedParam === null
        ? true
        : !['0', 'false', 'no'].includes(includeSignedParam.toLowerCase());
    const limitParam = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : null;
    const sinceParam = url.searchParams.get('since');
    const sinceTime = sinceParam ? new Date(sinceParam).getTime() : null;

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedVaultAccess(request, linkId);
    if (response || !access) {
      return response!;
    }

    const folders =
      category === 'all'
        ? [...CARE_CIRCLE_FOLDERS]
        : isVaultFolder(category)
        ? [category]
        : [];

    if (folders.length === 0) {
      return NextResponse.json({ files: [] satisfies VaultFile[] });
    }

    const results: VaultFile[] = [];

    for (const folder of folders) {
      const { data } = await access.adminClient.storage
        .from('medical-vault')
        .list(`${access.ownerProfileId}/${folder}`, {
          sortBy: { column: 'created_at', order: 'desc' },
          ...(limit ? { limit } : {}),
        });

      if (!data?.length) continue;

      for (const file of data) {
        if (sinceTime && (!file.created_at || new Date(file.created_at).getTime() < sinceTime)) {
          continue;
        }

        const path = buildStoragePath(access.ownerProfileId, folder, file.name);
        const { data: signed } = includeSigned
          ? await access.adminClient.storage.from('medical-vault').createSignedUrl(path, 60)
          : { data: null };

        results.push({
          name: file.name,
          created_at: file.created_at ?? null,
          folder,
          url: signed?.signedUrl ?? null,
        });
      }
    }

    results.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error('Error fetching care circle vault files:', error);
    return NextResponse.json({ message: 'Failed to fetch vault files' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const linkId = trimStringField(formData.get('linkId'));
    const folder = trimStringField(formData.get('folder'));
    const rawFileName = trimStringField(formData.get('fileName'));
    const requestedActorProfileId = normalizeActorProfileId(formData.get('actorProfileId'));
    const file = formData.get('file');

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }
    if (!isVaultFolder(folder)) {
      return NextResponse.json({ message: 'Invalid folder.' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'A file is required.' }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ message: 'File is empty.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { message: 'File is too large. Maximum allowed size is 10MB.' },
        { status: 400 }
      );
    }
    if (!isAllowedUploadType(file)) {
      return NextResponse.json({ message: 'Only PDF and image files are allowed.' }, { status: 400 });
    }

    const baseFromInput = stripExtension(rawFileName || '').trim();
    const fallbackBase = stripExtension(file.name).trim() || 'untitled';
    const fileExt = getFileExtension(file.name);
    const finalBase = baseFromInput || fallbackBase;
    const finalName = fileExt ? `${finalBase}.${fileExt}` : finalBase;
    if (!isValidStorageFileName(finalName)) {
      return NextResponse.json({ message: 'Invalid file name.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedVaultAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const targetPath = buildStoragePath(access.ownerProfileId, folder, finalName);
    const { data, error } = await access.adminClient.storage.from('medical-vault').upload(targetPath, file, {
      upsert: false,
      contentType: file.type || undefined,
    });

    if (error) {
      const statusCode = getStorageErrorStatus(error as { statusCode?: unknown });
      const status = statusCode === 409 ? 409 : 500;
      return NextResponse.json(
        { message: status === 409 ? 'A file with this name already exists.' : error.message },
        { status }
      );
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'vault',
      action: 'upload',
      entity: {
        id: targetPath,
        label: finalName,
      },
      metadata: {
        folder,
        fileName: finalName,
        path: data?.path ?? targetPath,
      },
    });

    return NextResponse.json({
      file: {
        name: finalName,
        folder,
        created_at: new Date().toISOString(),
        path: data?.path ?? targetPath,
      },
    });
  } catch (error) {
    console.error('Error uploading care circle vault file:', error);
    return NextResponse.json({ message: 'Failed to upload vault file' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    let payload: RenamePayload;
    try {
      payload = (await request.json()) as RenamePayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const folder = payload.folder?.trim();
    const currentName = payload.name?.trim() ?? '';
    const nextName = payload.nextName?.trim() ?? '';

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }
    if (!isVaultFolder(folder)) {
      return NextResponse.json({ message: 'Invalid folder.' }, { status: 400 });
    }
    if (!isValidStorageFileName(currentName) || !isValidStorageFileName(nextName)) {
      return NextResponse.json({ message: 'Invalid file name.' }, { status: 400 });
    }
    if (currentName === nextName) {
      return NextResponse.json({ message: 'Please choose a different name.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedVaultAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const currentPath = buildStoragePath(access.ownerProfileId, folder, currentName);
    const nextPath = buildStoragePath(access.ownerProfileId, folder, nextName);
    const { error } = await access.adminClient.storage.from('medical-vault').move(currentPath, nextPath);

    if (error) {
      const statusCode = getStorageErrorStatus(error as { statusCode?: unknown });
      const status = statusCode === 409 ? 409 : 500;
      return NextResponse.json(
        { message: status === 409 ? 'A file with this name already exists.' : error.message },
        { status }
      );
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'vault',
      action: 'rename',
      entity: {
        id: nextPath,
        label: nextName,
      },
      metadata: {
        folder,
        fromName: currentName,
        toName: nextName,
      },
    });

    return NextResponse.json({
      file: {
        name: nextName,
        folder,
      },
    });
  } catch (error) {
    console.error('Error renaming care circle vault file:', error);
    return NextResponse.json({ message: 'Failed to rename vault file' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    let payload: DeletePayload;
    try {
      payload = (await request.json()) as DeletePayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const folder = payload.folder?.trim();
    const fileName = payload.name?.trim() ?? '';

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }
    if (!isVaultFolder(folder)) {
      return NextResponse.json({ message: 'Invalid folder.' }, { status: 400 });
    }
    if (!isValidStorageFileName(fileName)) {
      return NextResponse.json({ message: 'Invalid file name.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedVaultAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const path = buildStoragePath(access.ownerProfileId, folder, fileName);
    const { error } = await access.adminClient.storage.from('medical-vault').remove([path]);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'vault',
      action: 'delete',
      entity: {
        id: path,
        label: fileName,
      },
      metadata: {
        folder,
        fileName,
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting care circle vault file:', error);
    return NextResponse.json({ message: 'Failed to delete vault file' }, { status: 500 });
  }
}
