import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

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
};

type AppointmentUpsertPayload = {
  linkId?: string;
  appointment?: Record<string, unknown>;
};

type AppointmentDeletePayload = {
  linkId?: string;
  appointmentId?: string;
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

const getAuthenticatedUser = async (request: Request): Promise<User | null> => {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (!error && user) {
      return user;
    }

    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user) {
    return user;
  }

  return null;
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

    const context = await loadAppointmentContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    if (!context.appointments.some((entry) => entry.id === normalized.id)) {
      return NextResponse.json({ message: 'Appointment not found.' }, { status: 404 });
    }

    const nextAppointments = context.appointments.map((entry) =>
      entry.id === normalized.id ? normalized : entry
    );
    const { error: saveError } = await saveAppointmentList(access, context.ownerUserId, nextAppointments);

    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

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
    const appointmentId = payload.appointmentId?.trim();
    if (!linkId || !appointmentId) {
      return NextResponse.json({ message: 'linkId and appointmentId are required.' }, { status: 400 });
    }

    const { access, response } = await getAuthorizedAppointmentAccess(request, linkId);
    if (response || !access) {
      return response!;
    }

    const context = await loadAppointmentContext(access);
    if (context.error) {
      return NextResponse.json({ message: context.error.message }, { status: 500 });
    }

    const nextAppointments = context.appointments.filter((entry) => entry.id !== appointmentId);
    if (nextAppointments.length === context.appointments.length) {
      return NextResponse.json({ message: 'Appointment not found.' }, { status: 404 });
    }

    const { error: saveError } = await saveAppointmentList(access, context.ownerUserId, nextAppointments);

    if (saveError) {
      return NextResponse.json({ message: saveError.message }, { status: 500 });
    }

    return NextResponse.json({
      deleted: true,
      appointments: nextAppointments,
    });
  } catch (error) {
    console.error('Error deleting care circle appointment:', error);
    return NextResponse.json({ message: 'Failed to delete appointment' }, { status: 500 });
  }
}
