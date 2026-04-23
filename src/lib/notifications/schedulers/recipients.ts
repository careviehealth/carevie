// Resolve who should receive a profile-scoped notification (the profile owner
// + every accepted care-circle recipient who has the relevant permission).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchCareCirclePermissionsMap,
  type CareCirclePermissionKey,
} from '@/lib/careCirclePermissions';

export type ProfileRecipient = {
  userId: string;
  isOwner: boolean;
  linkId: string | null;
};

const lookupOwnerUserIdForProfile = async (
  adminClient: SupabaseClient,
  profileId: string
): Promise<string | null> => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('user_id, auth_id')
    .eq('id', profileId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.auth_id as string | null) ?? (data.user_id as string | null) ?? null;
};

export const resolveProfileRecipients = async (
  adminClient: SupabaseClient,
  profileId: string,
  requiredPermission: CareCirclePermissionKey
): Promise<ProfileRecipient[]> => {
  const ownerUserId = await lookupOwnerUserIdForProfile(adminClient, profileId);
  if (!ownerUserId) return [];

  const recipients: ProfileRecipient[] = [{ userId: ownerUserId, isOwner: true, linkId: null }];

  const { data: links, error } = await adminClient
    .from('care_circle_links')
    .select('id, recipient_id')
    .eq('requester_id', ownerUserId)
    .eq('profile_id', profileId)
    .eq('status', 'accepted');
  if (error) {
    console.error('[notifications] failed to load care_circle_links:', error.message);
    return recipients;
  }
  const linkRows = (links ?? []) as Array<{ id: string; recipient_id: string }>;
  if (linkRows.length === 0) return recipients;

  const recipientIds = linkRows.map((l) => l.recipient_id);
  const permsMap = await fetchCareCirclePermissionsMap(adminClient, ownerUserId, recipientIds);
  for (const link of linkRows) {
    const perms = permsMap.get(link.recipient_id);
    if (perms && perms[requiredPermission]) {
      recipients.push({ userId: link.recipient_id, isOwner: false, linkId: link.id });
    }
  }
  return recipients;
};

export const ownerUserIdForProfile = lookupOwnerUserIdForProfile;
