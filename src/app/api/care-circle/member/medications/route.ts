import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';
import { logCareCircleActivity } from '@/lib/careCircleActivityLogs';

type CareCircleRole = 'family' | 'friend';

type LinkRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  relationship: string | null;
  profile_id: string | null;
};

type MedicationLog = {
  medicationId: string;
  timestamp: string;
  taken: boolean;
};

type MedicationRecord = {
  id: string;
  name: string;
  dosage: string;
  purpose?: string;
  frequency: string;
  timesPerDay?: number;
  startDate?: string;
  endDate?: string;
  logs?: MedicationLog[];
};

type AuthorizedMedicationAccess = {
  adminClient: SupabaseClient;
  ownerProfileId: string;
  ownerUserId: string;
  actorUserId: string;
};

type MedicationUpsertPayload = {
  linkId?: string;
  actorProfileId?: string;
  medication?: Record<string, unknown>;
};

type MedicationDeletePayload = {
  linkId?: string;
  actorProfileId?: string;
  medicationId?: string;
};

type ActivityMetadataValue = string | number | boolean | null;

type ActivityMetadataChange = {
  field: string;
  label: string;
  before: ActivityMetadataValue;
  after: ActivityMetadataValue;
};

const normalizeCareCircleRole = (value: string | null | undefined): CareCircleRole => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (normalized === 'family') return 'family';
  return 'friend';
};

const canManageMedicalData = (role: CareCircleRole) => role === 'family';

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

const formatDateOnly = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate()
  ).padStart(2, '0')}`;

const normalizeDateInput = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return formatDateOnly(parsed);
};

const normalizeTimesPerDay = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.floor(numeric);
};

const normalizeActivityMetadataValue = (value: unknown): ActivityMetadataValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') return value;
  return null;
};

const appendChange = (
  changes: ActivityMetadataChange[],
  field: string,
  label: string,
  before: unknown,
  after: unknown
) => {
  const normalizedBefore = normalizeActivityMetadataValue(before);
  const normalizedAfter = normalizeActivityMetadataValue(after);
  if (normalizedBefore === normalizedAfter) return;
  changes.push({
    field,
    label,
    before: normalizedBefore,
    after: normalizedAfter,
  });
};

const buildMedicationChanges = (
  previousMedication: MedicationRecord,
  nextMedication: MedicationRecord
): ActivityMetadataChange[] => {
  const changes: ActivityMetadataChange[] = [];
  appendChange(changes, 'name', 'Name', previousMedication.name, nextMedication.name);
  appendChange(changes, 'dosage', 'Dosage', previousMedication.dosage, nextMedication.dosage);
  appendChange(
    changes,
    'frequency',
    'Frequency',
    previousMedication.frequency,
    nextMedication.frequency
  );
  appendChange(changes, 'purpose', 'Purpose', previousMedication.purpose, nextMedication.purpose);
  appendChange(
    changes,
    'timesPerDay',
    'Times per day',
    previousMedication.timesPerDay,
    nextMedication.timesPerDay
  );
  appendChange(
    changes,
    'startDate',
    'Start date',
    previousMedication.startDate,
    nextMedication.startDate
  );
  appendChange(changes, 'endDate', 'End date', previousMedication.endDate, nextMedication.endDate);
  return changes;
};

const normalizeMedicationLog = (value: unknown): MedicationLog | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const medicationId = typeof row.medicationId === 'string' ? row.medicationId.trim() : '';
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp.trim() : '';
  const taken = typeof row.taken === 'boolean' ? row.taken : null;

  if (!medicationId || !timestamp || taken === null) return null;
  return { medicationId, timestamp, taken };
};

const parseJsonArray = (value: unknown, fallbackKey: string) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[fallbackKey])) {
    return (value as Record<string, unknown>)[fallbackKey] as unknown[];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as Record<string, unknown>)[fallbackKey])
      ) {
        return (parsed as Record<string, unknown>)[fallbackKey] as unknown[];
      }
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeMedicationRecord = (value: unknown): MedicationRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const dosage = typeof row.dosage === 'string' ? row.dosage.trim() : '';
  const frequency = typeof row.frequency === 'string' ? row.frequency.trim() : '';
  const purpose = typeof row.purpose === 'string' ? row.purpose.trim() : '';
  const timesPerDay = normalizeTimesPerDay(row.timesPerDay);
  const startDate = normalizeDateInput(row.startDate);
  const endDate = normalizeDateInput(row.endDate);
  const logs = Array.isArray(row.logs)
    ? row.logs.map(normalizeMedicationLog).filter((entry): entry is MedicationLog => entry !== null)
    : [];

  if (!id || !name || !dosage || !frequency) return null;

  return {
    id,
    name,
    dosage,
    frequency,
    purpose: purpose || undefined,
    timesPerDay,
    startDate,
    endDate,
    logs,
  };
};

const parseMedicationRecords = (value: unknown) =>
  parseJsonArray(value, 'medications')
    .map(normalizeMedicationRecord)
    .filter((entry): entry is MedicationRecord => entry !== null);

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

const getAuthorizedMedicationAccess = async (
  request: Request,
  linkId: string
): Promise<{ access: AuthorizedMedicationAccess | null; response: NextResponse | null }> => {
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
    link.recipient_id === user.id && link.status === 'accepted' && canManageMedicalData(role);

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
      ownerUserId: link.requester_id,
      actorUserId: user.id,
    },
    response: null,
  };
};

const loadMedicationContext = async (access: AuthorizedMedicationAccess) => {
  const { data, error } = await access.adminClient
    .from('user_medications')
    .select('profile_id, user_id, medications')
    .eq('profile_id', access.ownerProfileId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    return { medications: [] as MedicationRecord[], ownerUserId: access.ownerUserId, error };
  }

  return {
    medications: parseMedicationRecords(data?.medications),
    ownerUserId:
      typeof data?.user_id === 'string' && data.user_id.trim()
        ? data.user_id.trim()
        : access.ownerUserId,
    error: null,
  };
};

const saveMedicationList = async (
  access: AuthorizedMedicationAccess,
  ownerUserId: string,
  medications: MedicationRecord[]
) => {
  return access.adminClient.from('user_medications').upsert(
    {
      profile_id: access.ownerProfileId,
      user_id: ownerUserId,
      medications,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' }
  );
};

export async function POST(request: Request) {
  try {
    let payload: MedicationUpsertPayload;
    try {
      payload = (await request.json()) as MedicationUpsertPayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const input = payload.medication;
    if (!linkId || !input || typeof input !== 'object') {
      return NextResponse.json({ message: 'linkId and medication are required.' }, { status: 400 });
    }

    const medicationInput = input as Record<string, unknown>;
    const name = typeof medicationInput.name === 'string' ? medicationInput.name.trim() : '';
    const dosage = typeof medicationInput.dosage === 'string' ? medicationInput.dosage.trim() : '';
    const frequency =
      typeof medicationInput.frequency === 'string' ? medicationInput.frequency.trim() : '';
    const purpose = typeof medicationInput.purpose === 'string' ? medicationInput.purpose.trim() : '';
    const timesPerDay = normalizeTimesPerDay(medicationInput.timesPerDay);
    const startDate = normalizeDateInput(medicationInput.startDate) ?? formatDateOnly(new Date());
    const endDate = normalizeDateInput(medicationInput.endDate);
    const logs = Array.isArray(medicationInput.logs)
      ? medicationInput.logs
          .map(normalizeMedicationLog)
          .filter((entry): entry is MedicationLog => entry !== null)
      : [];

    if (!name || !dosage || !frequency) {
      return NextResponse.json(
        { message: 'Medication name, dosage, and frequency are required.' },
        { status: 400 }
      );
    }

    const medicationId =
      typeof medicationInput.id === 'string' && medicationInput.id.trim()
        ? medicationInput.id.trim()
        : crypto.randomUUID();

    const { access, response } = await getAuthorizedMedicationAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const context = await loadMedicationContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    if (context.medications.some((entry) => entry.id === medicationId)) {
      return NextResponse.json({ message: 'Medication ID already exists.' }, { status: 409 });
    }

    const nextMedication: MedicationRecord = {
      id: medicationId,
      name,
      dosage,
      frequency,
      purpose: purpose || undefined,
      timesPerDay: timesPerDay ?? 1,
      startDate,
      endDate,
      logs,
    };

    const nextMedications = [...context.medications, nextMedication];
    const { error: saveError } = await saveMedicationList(access, context.ownerUserId, nextMedications);

    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'medication',
      action: 'add',
      entity: {
        id: nextMedication.id,
        label: nextMedication.name,
      },
      metadata: {
        name: nextMedication.name,
        dosage: nextMedication.dosage,
        frequency: nextMedication.frequency,
        timesPerDay: nextMedication.timesPerDay ?? null,
        startDate: nextMedication.startDate ?? null,
        endDate: nextMedication.endDate ?? null,
      },
    });

    return NextResponse.json({
      medication: nextMedication,
      medications: nextMedications,
    });
  } catch (error) {
    console.error('Error adding care circle medication:', error);
    return NextResponse.json({ message: 'Failed to add medication' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    let payload: MedicationUpsertPayload;
    try {
      payload = (await request.json()) as MedicationUpsertPayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const input = payload.medication;
    if (!linkId || !input || typeof input !== 'object') {
      return NextResponse.json({ message: 'linkId and medication are required.' }, { status: 400 });
    }

    const medicationInput = input as Record<string, unknown>;
    const medicationId =
      typeof medicationInput.id === 'string' && medicationInput.id.trim()
        ? medicationInput.id.trim()
        : '';
    if (!medicationId) {
      return NextResponse.json({ message: 'medication.id is required.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedMedicationAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const context = await loadMedicationContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    const existing = context.medications.find((entry) => entry.id === medicationId);
    if (!existing) {
      return NextResponse.json({ message: 'Medication not found.' }, { status: 404 });
    }

    const hasPurposeField = Object.prototype.hasOwnProperty.call(medicationInput, 'purpose');
    const hasTimesField = Object.prototype.hasOwnProperty.call(medicationInput, 'timesPerDay');
    const hasStartDateField = Object.prototype.hasOwnProperty.call(medicationInput, 'startDate');
    const hasEndDateField = Object.prototype.hasOwnProperty.call(medicationInput, 'endDate');
    const hasLogsField = Object.prototype.hasOwnProperty.call(medicationInput, 'logs');

    const nameInput = typeof medicationInput.name === 'string' ? medicationInput.name.trim() : '';
    const dosageInput =
      typeof medicationInput.dosage === 'string' ? medicationInput.dosage.trim() : '';
    const frequencyInput =
      typeof medicationInput.frequency === 'string' ? medicationInput.frequency.trim() : '';

    const name = nameInput || existing.name;
    const dosage = dosageInput || existing.dosage;
    const frequency = frequencyInput || existing.frequency;

    if (!name || !dosage || !frequency) {
      return NextResponse.json(
        { message: 'Medication name, dosage, and frequency are required.' },
        { status: 400 }
      );
    }

    const purpose = hasPurposeField
      ? typeof medicationInput.purpose === 'string' && medicationInput.purpose.trim()
        ? medicationInput.purpose.trim()
        : undefined
      : existing.purpose;
    const timesPerDay = hasTimesField
      ? normalizeTimesPerDay(medicationInput.timesPerDay)
      : existing.timesPerDay;
    const startDate = hasStartDateField
      ? normalizeDateInput(medicationInput.startDate)
      : existing.startDate;
    const endDate = hasEndDateField ? normalizeDateInput(medicationInput.endDate) : existing.endDate;
    const logs = hasLogsField
      ? Array.isArray(medicationInput.logs)
        ? medicationInput.logs
            .map(normalizeMedicationLog)
            .filter((entry): entry is MedicationLog => entry !== null)
        : []
      : existing.logs ?? [];

    const updatedMedication: MedicationRecord = {
      ...existing,
      name,
      dosage,
      frequency,
      purpose,
      timesPerDay,
      startDate,
      endDate,
      logs,
    };

    const nextMedications = context.medications.map((entry) =>
      entry.id === medicationId ? updatedMedication : entry
    );

    const { error: saveError } = await saveMedicationList(access, context.ownerUserId, nextMedications);
    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    const medicationChanges = buildMedicationChanges(existing, updatedMedication);

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'medication',
      action: 'update',
      entity: {
        id: updatedMedication.id,
        label: updatedMedication.name,
      },
      metadata: {
        name: updatedMedication.name,
        dosage: updatedMedication.dosage,
        frequency: updatedMedication.frequency,
        timesPerDay: updatedMedication.timesPerDay ?? null,
        startDate: updatedMedication.startDate ?? null,
        endDate: updatedMedication.endDate ?? null,
        changes: medicationChanges,
        changeCount: medicationChanges.length,
      },
    });

    return NextResponse.json({
      medication: updatedMedication,
      medications: nextMedications,
    });
  } catch (error) {
    console.error('Error updating care circle medication:', error);
    return NextResponse.json({ message: 'Failed to update medication' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    let payload: MedicationDeletePayload;
    try {
      payload = (await request.json()) as MedicationDeletePayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const medicationId = payload.medicationId?.trim();
    if (!linkId || !medicationId) {
      return NextResponse.json({ message: 'linkId and medicationId are required.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedMedicationAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const context = await loadMedicationContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    const deletedMedication = context.medications.find((entry) => entry.id === medicationId);
    const nextMedications = context.medications.filter((entry) => entry.id !== medicationId);
    if (nextMedications.length === context.medications.length) {
      return NextResponse.json({ message: 'Medication not found.' }, { status: 404 });
    }

    const { error: saveError } = await saveMedicationList(access, context.ownerUserId, nextMedications);
    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'medication',
      action: 'delete',
      entity: {
        id: medicationId,
        label: deletedMedication?.name ?? null,
      },
      metadata: {
        name: deletedMedication?.name ?? null,
        dosage: deletedMedication?.dosage ?? null,
        frequency: deletedMedication?.frequency ?? null,
        startDate: deletedMedication?.startDate ?? null,
      },
    });

    return NextResponse.json({ deleted: true, medications: nextMedications });
  } catch (error) {
    console.error('Error deleting care circle medication:', error);
    return NextResponse.json({ message: 'Failed to delete medication' }, { status: 500 });
  }
}
