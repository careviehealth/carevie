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

type AppointmentRecord = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  [key: string]: string;
};

type AuthorizedAppointmentAccess = {
  adminClient: SupabaseClient;
  ownerProfileId: string;
  ownerUserId: string;
  actorUserId: string;
};

type AppointmentUpsertPayload = {
  linkId?: string;
  actorProfileId?: string;
  appointment?: Record<string, unknown>;
};

type AppointmentDeletePayload = {
  linkId?: string;
  actorProfileId?: string;
  appointmentId?: string;
};

type ActivityMetadataValue = string | number | boolean | null;

type ActivityMetadataChange = {
  field: string;
  label: string;
  before: ActivityMetadataValue;
  after: ActivityMetadataValue;
};

const APPOINTMENT_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  type: 'Type',
  date: 'Date',
  time: 'Time',
  doctorName: 'Doctor name',
  specialty: 'Specialty',
  hospitalName: 'Hospital or clinic',
  reason: 'Reason',
  testName: 'Test name',
  labName: 'Lab name',
  instructions: 'Instructions',
  department: 'Department',
  therapyType: 'Therapy type',
  therapistName: 'Therapist name',
  location: 'Location',
  previousDoctor: 'Previous doctor',
  previousVisitReason: 'Previous visit reason',
  description: 'Description',
  contactPerson: 'Contact person',
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

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getAppointmentFieldLabel = (field: string) => {
  if (APPOINTMENT_FIELD_LABELS[field]) {
    return APPOINTMENT_FIELD_LABELS[field];
  }
  const normalized = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return toTitleCase(normalized || field);
};

const buildAppointmentChanges = (
  previousAppointment: AppointmentRecord,
  nextAppointment: AppointmentRecord
): ActivityMetadataChange[] => {
  const keys = Array.from(
    new Set([...Object.keys(previousAppointment), ...Object.keys(nextAppointment)])
  ).filter((key) => key !== 'id');
  const prioritized = ['title', 'type', 'date', 'time'];
  const orderedKeys = [
    ...prioritized.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !prioritized.includes(key)).sort(),
  ];
  const changes: ActivityMetadataChange[] = [];
  orderedKeys.forEach((key) => {
    appendChange(
      changes,
      key,
      getAppointmentFieldLabel(key),
      previousAppointment[key],
      nextAppointment[key]
    );
  });
  return changes;
};

const normalizeDateInput = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
    parsed.getDate()
  ).padStart(2, '0')}`;
};

const normalizeTimeInput = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const strictMatch = /^(\d{2}):(\d{2})$/.exec(trimmed);
  if (strictMatch) {
    const hour = Number(strictMatch[1]);
    const minute = Number(strictMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  const fallbackMatch = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!fallbackMatch) return '';
  const hour = Number(fallbackMatch[1]);
  const minute = Number(fallbackMatch[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

const normalizeAppointmentRecord = (value: unknown): AppointmentRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const type = typeof row.type === 'string' ? row.type.trim() : '';
  const date = normalizeDateInput(row.date);
  const time = normalizeTimeInput(row.time);

  if (!id || !title || !type || !date || !time) return null;

  const extras = Object.entries(row).reduce<Record<string, string>>((acc, [key, entryValue]) => {
    if (key === 'id' || key === 'title' || key === 'type' || key === 'date' || key === 'time') {
      return acc;
    }
    if (typeof entryValue === 'string') {
      acc[key] = entryValue.trim();
    }
    return acc;
  }, {});

  return {
    id,
    title,
    type,
    date,
    time,
    ...extras,
  };
};

const parseAppointmentRecords = (value: unknown) =>
  parseJsonArray(value, 'appointments')
    .map(normalizeAppointmentRecord)
    .filter((entry): entry is AppointmentRecord => entry !== null);

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

const getAuthorizedAppointmentAccess = async (
  request: Request,
  linkId: string
): Promise<{ access: AuthorizedAppointmentAccess | null; response: NextResponse | null }> => {
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

const loadAppointmentContext = async (access: AuthorizedAppointmentAccess) => {
  const { data, error } = await access.adminClient
    .from('user_appointments')
    .select('profile_id, user_id, appointments')
    .eq('profile_id', access.ownerProfileId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    return { appointments: [] as AppointmentRecord[], ownerUserId: access.ownerUserId, error };
  }

  return {
    appointments: parseAppointmentRecords(data?.appointments),
    ownerUserId:
      typeof data?.user_id === 'string' && data.user_id.trim()
        ? data.user_id.trim()
        : access.ownerUserId,
    error: null,
  };
};

const saveAppointmentList = async (
  access: AuthorizedAppointmentAccess,
  ownerUserId: string,
  appointments: AppointmentRecord[]
) => {
  return access.adminClient.from('user_appointments').upsert(
    {
      profile_id: access.ownerProfileId,
      user_id: ownerUserId,
      appointments,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' }
  );
};

export async function POST(request: Request) {
  try {
    let payload: AppointmentUpsertPayload;
    try {
      payload = (await request.json()) as AppointmentUpsertPayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const input = payload.appointment;
    if (!linkId || !input || typeof input !== 'object') {
      return NextResponse.json({ message: 'linkId and appointment are required.' }, { status: 400 });
    }

    const normalized = normalizeAppointmentRecord({
      ...input,
      id: typeof input.id === 'string' && input.id.trim() ? input.id : crypto.randomUUID(),
    });
    if (!normalized) {
      return NextResponse.json(
        { message: 'Appointment requires id, title, type, date, and time.' },
        { status: 400 }
      );
    }

    const { access, response } = await getAuthorizedAppointmentAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const context = await loadAppointmentContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    if (context.appointments.some((entry) => entry.id === normalized.id)) {
      return NextResponse.json({ message: 'Appointment ID already exists.' }, { status: 409 });
    }

    const nextAppointments = [...context.appointments, normalized];
    const { error: saveError } = await saveAppointmentList(access, context.ownerUserId, nextAppointments);

    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'appointment',
      action: 'add',
      entity: {
        id: normalized.id,
        label: normalized.title,
      },
      metadata: {
        title: normalized.title,
        type: normalized.type,
        date: normalized.date,
        time: normalized.time,
      },
    });

    return NextResponse.json({
      appointment: normalized,
      appointments: nextAppointments,
    });
  } catch (error) {
    console.error('Error adding care circle appointment:', error);
    return NextResponse.json({ message: 'Failed to add appointment' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    let payload: AppointmentUpsertPayload;
    try {
      payload = (await request.json()) as AppointmentUpsertPayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const input = payload.appointment;
    if (!linkId || !input || typeof input !== 'object') {
      return NextResponse.json({ message: 'linkId and appointment are required.' }, { status: 400 });
    }

    const normalized = normalizeAppointmentRecord(input);
    if (!normalized) {
      return NextResponse.json(
        { message: 'Appointment requires id, title, type, date, and time.' },
        { status: 400 }
      );
    }

    const { access, response } = await getAuthorizedAppointmentAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const context = await loadAppointmentContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    const existing = context.appointments.find((entry) => entry.id === normalized.id);
    if (!existing) {
      return NextResponse.json({ message: 'Appointment not found.' }, { status: 404 });
    }

    const nextAppointments = context.appointments.map((entry) =>
      entry.id === normalized.id ? normalized : entry
    );
    const { error: saveError } = await saveAppointmentList(access, context.ownerUserId, nextAppointments);

    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    const appointmentChanges = buildAppointmentChanges(existing, normalized);

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'appointment',
      action: 'update',
      entity: {
        id: normalized.id,
        label: normalized.title,
      },
      metadata: {
        title: normalized.title,
        type: normalized.type,
        date: normalized.date,
        time: normalized.time,
        changes: appointmentChanges,
        changeCount: appointmentChanges.length,
      },
    });

    return NextResponse.json({
      appointment: normalized,
      appointments: nextAppointments,
    });
  } catch (error) {
    console.error('Error updating care circle appointment:', error);
    return NextResponse.json({ message: 'Failed to update appointment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    let payload: AppointmentDeletePayload;
    try {
      payload = (await request.json()) as AppointmentDeletePayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const requestedActorProfileId = normalizeActorProfileId(payload.actorProfileId);
    const appointmentId = payload.appointmentId?.trim();
    if (!linkId || !appointmentId) {
      return NextResponse.json({ message: 'linkId and appointmentId are required.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedAppointmentAccess(request, linkId);
    if (response || !access) {
      return response!;
    }
    const actorProfileId = await resolveActorProfileId(
      access.adminClient,
      access.actorUserId,
      requestedActorProfileId
    );

    const context = await loadAppointmentContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    const deletedAppointment = context.appointments.find((entry) => entry.id === appointmentId);
    const nextAppointments = context.appointments.filter((entry) => entry.id !== appointmentId);
    if (nextAppointments.length === context.appointments.length) {
      return NextResponse.json({ message: 'Appointment not found.' }, { status: 404 });
    }

    const { error: saveError } = await saveAppointmentList(access, context.ownerUserId, nextAppointments);

    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    await logCareCircleActivity({
      adminClient: access.adminClient,
      profileId: access.ownerProfileId,
      actorUserId: access.actorUserId,
      actorProfileId,
      domain: 'appointment',
      action: 'delete',
      entity: {
        id: appointmentId,
        label: deletedAppointment?.title ?? null,
      },
      metadata: {
        title: deletedAppointment?.title ?? null,
        type: deletedAppointment?.type ?? null,
        date: deletedAppointment?.date ?? null,
        time: deletedAppointment?.time ?? null,
      },
    });

    return NextResponse.json({
      deleted: true,
      appointments: nextAppointments,
    });
  } catch (error) {
    console.error('Error deleting care circle appointment:', error);
    return NextResponse.json({ message: 'Failed to delete appointment' }, { status: 500 });
  }
}
