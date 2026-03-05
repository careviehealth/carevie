import type { SupabaseClient } from '@supabase/supabase-js';

export type CareCircleActivityDomain = 'vault' | 'medication' | 'appointment';
export type CareCircleActivityAction = 'upload' | 'rename' | 'delete' | 'add' | 'update';

type ActivityEntity = {
  id?: string | null;
  label?: string | null;
};

type LogCareCircleActivityInput = {
  adminClient: SupabaseClient;
  profileId: string;
  actorUserId: string;
  actorProfileId?: string | null;
  actorDisplayName?: string | null;
  domain: CareCircleActivityDomain;
  action: CareCircleActivityAction;
  entity?: ActivityEntity;
  metadata?: Record<string, unknown>;
};

type ActorProfileRow = {
  display_name: string | null;
  name: string | null;
  is_primary: boolean | null;
  created_at: string | null;
};

const parseDate = (value: string | null) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
};

const sanitizeText = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const pickDisplayName = (rows: ActorProfileRow[]) => {
  if (!rows.length) return null;
  const preferred = [...rows].sort((a, b) => {
    const primaryDiff = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
    if (primaryDiff !== 0) return primaryDiff;
    return parseDate(a.created_at) - parseDate(b.created_at);
  })[0];
  return sanitizeText(preferred.display_name) ?? sanitizeText(preferred.name);
};

const isMissingAuthColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST204' || error?.message?.toLowerCase().includes('auth_id');

const resolveActorDisplayNameFromProfileId = async (
  adminClient: SupabaseClient,
  actorUserId: string,
  actorProfileId: string
) => {
  const byAuth = await adminClient
    .from('profiles')
    .select('display_name, name')
    .eq('id', actorProfileId)
    .eq('auth_id', actorUserId)
    .maybeSingle();

  if (!byAuth.error && byAuth.data) {
    return sanitizeText(byAuth.data.display_name) ?? sanitizeText(byAuth.data.name);
  }

  if (byAuth.error && !isMissingAuthColumnError(byAuth.error) && byAuth.error.code !== 'PGRST116') {
    return null;
  }

  const byUser = await adminClient
    .from('profiles')
    .select('display_name, name')
    .eq('id', actorProfileId)
    .eq('user_id', actorUserId)
    .maybeSingle();

  if (byUser.error || !byUser.data) {
    return null;
  }

  return sanitizeText(byUser.data.display_name) ?? sanitizeText(byUser.data.name);
};

const resolveActorDisplayName = async (
  adminClient: SupabaseClient,
  actorUserId: string,
  actorProfileId?: string | null
) => {
  const preferredProfileId = sanitizeText(actorProfileId);
  if (preferredProfileId) {
    const preferredName = await resolveActorDisplayNameFromProfileId(
      adminClient,
      actorUserId,
      preferredProfileId
    );
    if (preferredName) {
      return preferredName;
    }
  }

  const byAuth = await adminClient
    .from('profiles')
    .select('display_name, name, is_primary, created_at')
    .eq('auth_id', actorUserId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(20);

  if (!byAuth.error && Array.isArray(byAuth.data) && byAuth.data.length > 0) {
    return pickDisplayName(byAuth.data as ActorProfileRow[]);
  }

  if (byAuth.error && !isMissingAuthColumnError(byAuth.error) && byAuth.error.code !== 'PGRST116') {
    return null;
  }

  const byUser = await adminClient
    .from('profiles')
    .select('display_name, name, is_primary, created_at')
    .eq('user_id', actorUserId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(20);

  if (byUser.error || !Array.isArray(byUser.data) || byUser.data.length === 0) {
    return null;
  }

  return pickDisplayName(byUser.data as ActorProfileRow[]);
};

export async function logCareCircleActivity({
  adminClient,
  profileId,
  actorUserId,
  actorProfileId,
  actorDisplayName,
  domain,
  action,
  entity,
  metadata,
}: LogCareCircleActivityInput): Promise<void> {
  if (!profileId || !actorUserId) return;

  try {
    const resolvedActorDisplayName =
      sanitizeText(actorDisplayName) ??
      (await resolveActorDisplayName(adminClient, actorUserId, actorProfileId));
    const payload = {
      profile_id: profileId,
      source: 'care_circle',
      domain,
      action,
      actor_user_id: actorUserId,
      actor_display_name: resolvedActorDisplayName,
      entity_id: sanitizeText(entity?.id),
      entity_label: sanitizeText(entity?.label),
      metadata: metadata ?? {},
    };

    const { error } = await adminClient.from('profile_activity_logs').insert(payload);
    if (error) {
      console.error('Failed to write care circle activity log:', error);
    }
  } catch (error) {
    console.error('Failed to write care circle activity log:', error);
  }
}
