// Care-circle event emitters. Wrap raw event facts (invite created, invite
// accepted, member or owner did something) and turn them into canonical
// notifications via dispatchNotification.
//
// Recipient model for `logAndNotifyCareCircleActivity`:
//   * the profile owner (if they didn't perform the action themselves) — they
//     want to know whenever a care-circle member touches their data
//   * every care-circle member with `activity_log` permission (if they didn't
//     perform the action themselves) — they opted in to seeing all activity
//     happening on the profile they care about
//
// Title copy is actor-aware so the recipient instantly knows *who* did *what*
// to *whose* profile.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  logCareCircleActivity,
  type CareCircleActivityAction,
  type CareCircleActivityDomain,
} from '@/lib/careCircleActivityLogs';
import { fetchCareCirclePermissionsMap } from '@/lib/careCirclePermissions';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import {
  careCircleInviteDedupeKey,
  careCircleMemberActivityDedupeKey,
  vaultDocumentUploadedDedupeKey,
} from '@/lib/notifications/dedupe';
import { ownerUserIdForProfile } from '@/lib/notifications/schedulers/recipients';

const safeError = (label: string, err: unknown) => {
  console.error(`[notifications/emitters/careCircle] ${label}:`, err);
};

const profileLabelFor = async (
  adminClient: SupabaseClient,
  profileId: string
): Promise<string | null> => {
  try {
    const { data } = await adminClient
      .from('profiles')
      .select('display_name, name')
      .eq('id', profileId)
      .maybeSingle();
    if (!data) return null;
    const dn = (data as { display_name?: string | null }).display_name;
    const n = (data as { name?: string | null }).name;
    return (typeof dn === 'string' && dn.trim()) || (typeof n === 'string' && n.trim()) || null;
  } catch {
    return null;
  }
};

const requesterDisplayName = async (
  adminClient: SupabaseClient,
  requesterId: string
): Promise<string> => {
  try {
    const { data } = await adminClient
      .from('profiles')
      .select('display_name, name, is_primary, created_at')
      .eq('auth_id', requesterId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = data as { display_name?: string | null; name?: string | null } | null;
    if (row) {
      const v = (row.display_name && row.display_name.trim()) || (row.name && row.name.trim());
      if (v) return v;
    }
  } catch {
    /* fall through */
  }
  try {
    const { data } = await adminClient
      .from('profiles')
      .select('display_name, name, is_primary, created_at')
      .eq('user_id', requesterId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = data as { display_name?: string | null; name?: string | null } | null;
    if (row) {
      const v = (row.display_name && row.display_name.trim()) || (row.name && row.name.trim());
      if (v) return v;
    }
  } catch {
    /* fall through */
  }
  return 'A care circle contact';
};

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const emitCareCircleInviteReceived = async (params: {
  adminClient: SupabaseClient;
  requesterId: string;
  recipientId: string;
  profileId: string;
  linkId: string;
}) => {
  try {
    const requesterName = await requesterDisplayName(params.adminClient, params.requesterId);
    const profileLabel = await profileLabelFor(params.adminClient, params.profileId);
    await dispatchNotification(params.adminClient, {
      userId: params.recipientId,
      profileId: params.profileId,
      category: 'care_circle_invite_received',
      title: `${requesterName} invited you to their care circle`,
      body: profileLabel
        ? `Tap to review the invite for ${profileLabel}.`
        : 'Tap to review the invite.',
      metadata: {
        requesterId: params.requesterId,
        linkId: params.linkId,
        profileId: params.profileId,
        requesterName,
        profileLabel,
      },
      sourceType: 'care_circle_link',
      sourceId: params.linkId,
      dedupeKey: careCircleInviteDedupeKey({
        recipientUserId: params.recipientId,
        inviteId: params.linkId,
        variant: 'received',
      }),
      deepLink: '/app/homepage?open=notifications',
    });
  } catch (err) {
    safeError('emitCareCircleInviteReceived', err);
  }
};

export const emitCareCircleInviteAccepted = async (params: {
  adminClient: SupabaseClient;
  requesterId: string;
  recipientId: string;
  profileId: string | null;
  linkId: string;
}) => {
  try {
    const recipientName = await requesterDisplayName(params.adminClient, params.recipientId);
    await dispatchNotification(params.adminClient, {
      userId: params.requesterId,
      profileId: params.profileId,
      category: 'care_circle_invite_accepted',
      title: `${recipientName} joined your care circle`,
      body: 'Tap to manage their access and permissions.',
      metadata: {
        recipientId: params.recipientId,
        linkId: params.linkId,
        recipientName,
      },
      sourceType: 'care_circle_link',
      sourceId: params.linkId,
      dedupeKey: careCircleInviteDedupeKey({
        recipientUserId: params.requesterId,
        inviteId: params.linkId,
        variant: 'accepted',
      }),
      deepLink: '/app/homepage?open=care-circle',
    });
  } catch (err) {
    safeError('emitCareCircleInviteAccepted', err);
  }
};

// ---------------------------------------------------------------------------
// Member / owner activity (logged via profile_activity_logs)
// ---------------------------------------------------------------------------

const ACTION_VERB: Record<CareCircleActivityAction, { past: string; noun: string }> = {
  add: { past: 'added', noun: 'added' },
  update: { past: 'updated', noun: 'updated' },
  delete: { past: 'removed', noun: 'removed' },
  upload: { past: 'uploaded', noun: 'uploaded' },
  rename: { past: 'renamed', noun: 'renamed' },
};

const DOMAIN_NOUN: Record<CareCircleActivityDomain, { singular: string; article: string }> = {
  vault: { singular: 'vault document', article: 'a' },
  medication: { singular: 'medication', article: 'a' },
  appointment: { singular: 'appointment', article: 'an' },
};

type ActivityCopy = {
  title: string;
  body: string;
  deepLink: string;
};

const buildActivityCopy = (params: {
  domain: CareCircleActivityDomain;
  action: CareCircleActivityAction;
  actorName: string;
  recipientIsOwner: boolean;
  ownerName: string | null;
  entityLabel: string | null;
  metadata?: Record<string, unknown>;
}): ActivityCopy => {
  const verb = ACTION_VERB[params.action] ?? { past: params.action, noun: params.action };
  const noun = DOMAIN_NOUN[params.domain];
  const subjectFor = params.recipientIsOwner
    ? ''
    : params.ownerName
      ? ` for ${params.ownerName}'s profile`
      : '';

  const entity = (params.entityLabel ?? '').trim();

  switch (params.domain) {
    case 'vault': {
      const folder =
        typeof params.metadata?.folder === 'string' && params.metadata.folder
          ? String(params.metadata.folder)
          : '';
      const title = `${params.actorName} ${verb.past} ${noun.article} ${noun.singular}`;
      const fileName = entity || 'a document';
      const folderClause = folder ? ` in ${folder}` : '';
      return {
        title,
        body: `${fileName}${folderClause}${subjectFor}.`,
        deepLink: folder ? `/app/vault?folder=${encodeURIComponent(folder)}` : '/app/vault',
      };
    }
    case 'medication': {
      const title = `${params.actorName} ${verb.past} ${noun.article} ${noun.singular}`;
      const body = entity ? `${entity}${subjectFor}.` : `Tap to view${subjectFor}.`;
      return {
        title,
        body,
        deepLink: '/app/homepage?open=medications',
      };
    }
    case 'appointment': {
      const title = `${params.actorName} ${verb.past} ${noun.article} ${noun.singular}`;
      const dateLabel =
        typeof params.metadata?.date === 'string' && params.metadata.date
          ? String(params.metadata.date)
          : '';
      const timeLabel =
        typeof params.metadata?.time === 'string' && params.metadata.time
          ? String(params.metadata.time)
          : '';
      const when = dateLabel && timeLabel ? ` · ${dateLabel} ${timeLabel}` : '';
      const body = entity ? `${entity}${when}${subjectFor}.` : `Tap to view${subjectFor}.`;
      return {
        title,
        body,
        deepLink: '/app/homepage?open=calendar',
      };
    }
  }
};

export type LogAndNotifyCareCircleActivityInput = Parameters<typeof logCareCircleActivity>[0];

// Drop-in replacement for logCareCircleActivity that also emits notifications
// to every care-circle stakeholder (owner + members with activity_log perm),
// excluding the actor. Best-effort: notification failures never block the
// activity log write itself.
export const logAndNotifyCareCircleActivity = async (
  input: LogAndNotifyCareCircleActivityInput
): Promise<void> => {
  await logCareCircleActivity(input);

  try {
    const ownerUserId = await ownerUserIdForProfile(input.adminClient, input.profileId);
    if (!ownerUserId) return;

    const actorName = input.actorDisplayName?.trim() || 'A care circle member';
    const ownerName = await profileLabelFor(input.adminClient, input.profileId);

    // Build the recipient set: owner (if not actor) + every accepted care
    // circle link with `activity_log` perm (and not the actor).
    const recipients = new Map<string, { isOwner: boolean }>();
    if (ownerUserId !== input.actorUserId) {
      recipients.set(ownerUserId, { isOwner: true });
    }

    const { data: links, error: linksErr } = await input.adminClient
      .from('care_circle_links')
      .select('recipient_id')
      .eq('requester_id', ownerUserId)
      .eq('profile_id', input.profileId)
      .eq('status', 'accepted');
    if (linksErr) {
      safeError('logAndNotifyCareCircleActivity.fetchLinks', linksErr);
    }
    const linkRecipientIds = (links ?? [])
      .map((l) => (l as { recipient_id: string }).recipient_id)
      .filter((id) => id && id !== input.actorUserId);

    if (linkRecipientIds.length > 0) {
      const permsMap = await fetchCareCirclePermissionsMap(
        input.adminClient,
        ownerUserId,
        linkRecipientIds
      );
      for (const recipientId of linkRecipientIds) {
        const perms = permsMap.get(recipientId);
        if (perms?.activity_log) {
          if (!recipients.has(recipientId)) {
            recipients.set(recipientId, { isOwner: false });
          }
        }
      }
    }

    if (recipients.size > 0) {
      // Stable seed for dedupe so identical events don't double-notify.
      const seed = [
        input.domain,
        input.action,
        input.entity?.id ?? 'unknown',
        input.metadata?.fileName ?? input.metadata?.fromName ?? input.metadata?.name ?? '',
        Math.floor(Date.now() / 1000),
      ].join(':');

      await Promise.all(
        Array.from(recipients.entries()).map(async ([recipientUserId, { isOwner }]) => {
          const copy = buildActivityCopy({
            domain: input.domain,
            action: input.action,
            actorName,
            recipientIsOwner: isOwner,
            ownerName,
            entityLabel: input.entity?.label ?? null,
            metadata: input.metadata,
          });
          try {
            await dispatchNotification(input.adminClient, {
              userId: recipientUserId,
              profileId: input.profileId,
              category: 'care_circle_member_activity',
              title: copy.title,
              body: copy.body,
              metadata: {
                domain: input.domain,
                action: input.action,
                actorUserId: input.actorUserId,
                actorName,
                ownerName,
                entityId: input.entity?.id ?? null,
                entityLabel: input.entity?.label ?? null,
                ...(input.metadata ?? {}),
              },
              sourceType: 'profile_activity_log',
              sourceId: input.entity?.id ?? null,
              dedupeKey: careCircleMemberActivityDedupeKey({
                recipientUserId,
                activityLogId: seed,
              }),
              deepLink: copy.deepLink,
            });
          } catch (err) {
            safeError(
              `logAndNotifyCareCircleActivity.dispatch:${recipientUserId}`,
              err
            );
          }
        })
      );
    }

    // Vault uploads also fan out as `vault_document_uploaded` to every member
    // with the `vault` permission (different category, separate user opt-in).
    if (input.domain === 'vault' && input.action === 'upload') {
      await emitVaultDocumentUploaded({
        adminClient: input.adminClient,
        profileId: input.profileId,
        ownerUserId,
        actorUserId: input.actorUserId,
        actorName,
        ownerName,
        filePath:
          (typeof input.entity?.id === 'string' && input.entity.id) ||
          (typeof input.metadata?.path === 'string' ? input.metadata.path : '') ||
          '',
        fileName:
          (typeof input.entity?.label === 'string' && input.entity.label) ||
          (typeof input.metadata?.fileName === 'string' ? input.metadata.fileName : '') ||
          'document',
        folder: typeof input.metadata?.folder === 'string' ? input.metadata.folder : null,
      });
    }
  } catch (err) {
    safeError('logAndNotifyCareCircleActivity (notify)', err);
  }
};

// ---------------------------------------------------------------------------
// Vault uploads (member-facing fan-out)
// ---------------------------------------------------------------------------

const emitVaultDocumentUploaded = async (params: {
  adminClient: SupabaseClient;
  profileId: string;
  ownerUserId: string | null;
  actorUserId: string;
  actorName: string;
  ownerName: string | null;
  filePath: string;
  fileName: string;
  folder: string | null;
}): Promise<void> => {
  if (!params.ownerUserId) return;
  const uploadedAt = new Date().toISOString();

  // Recipients = members with `vault` permission. The actor (uploader) is
  // skipped — they don't need a notification about their own action.
  const { data: links, error } = await params.adminClient
    .from('care_circle_links')
    .select('recipient_id')
    .eq('requester_id', params.ownerUserId)
    .eq('profile_id', params.profileId)
    .eq('status', 'accepted');
  if (error) {
    safeError('emitVaultDocumentUploaded.fetchLinks', error);
    return;
  }
  const recipientIds = (links ?? []).map((l) => (l as { recipient_id: string }).recipient_id);
  if (recipientIds.length === 0 && params.ownerUserId === params.actorUserId) {
    return;
  }

  const permissionsMap = recipientIds.length
    ? await fetchCareCirclePermissionsMap(params.adminClient, params.ownerUserId, recipientIds)
    : new Map();

  const targetUserIds = new Set<string>();
  // Owner gets notified when a member uploaded on their behalf.
  if (params.ownerUserId !== params.actorUserId) {
    targetUserIds.add(params.ownerUserId);
  }
  for (const id of recipientIds) {
    if (id === params.actorUserId) continue;
    const perms = permissionsMap.get(id);
    if (perms?.vault) targetUserIds.add(id);
  }
  if (targetUserIds.size === 0) return;

  const folderClause = params.folder ? ` in ${params.folder}` : '';
  await Promise.all(
    Array.from(targetUserIds).map((userId) => {
      const isOwner = userId === params.ownerUserId;
      const subjectFor = isOwner || !params.ownerName ? '' : ` for ${params.ownerName}'s profile`;
      return dispatchNotification(params.adminClient, {
        userId,
        profileId: params.profileId,
        category: 'vault_document_uploaded',
        title: `${params.actorName} uploaded a vault document`,
        body: `${params.fileName}${folderClause}${subjectFor}.`,
        metadata: {
          actorUserId: params.actorUserId,
          actorName: params.actorName,
          ownerName: params.ownerName,
          filePath: params.filePath,
          fileName: params.fileName,
          folder: params.folder,
        },
        sourceType: 'vault_object',
        sourceId: params.filePath || null,
        dedupeKey: vaultDocumentUploadedDedupeKey({
          recipientUserId: userId,
          profileId: params.profileId,
          filePath: params.filePath || params.fileName,
          uploadedAt,
        }),
        deepLink: params.folder
          ? `/app/vault?folder=${encodeURIComponent(params.folder)}`
          : '/app/vault',
      }).catch((err) => safeError(`emitVaultDocumentUploaded.dispatch:${userId}`, err));
    })
  );
};
