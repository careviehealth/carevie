// Deterministic dedupe-key builders. Same logical event => same key, so the
// UNIQUE (user_id, dedupe_key) constraint on user_notifications and the
// UNIQUE (job_type, dedupe_key) constraint on notification_jobs make repeat
// emission a no-op.

import type { NotificationCategory } from './types';

const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_:.-]/g, '_');

export const medicationDoseDedupeKey = (params: {
  recipientUserId: string;
  profileId: string;
  medicationId: string;
  dateKey: string; // YYYY-MM-DD in user's local tz
  slotKey: string;
  variant: 'due' | 'missed';
}) =>
  sanitize(
    `med:${params.variant}:${params.recipientUserId}:${params.profileId}:${params.medicationId}:${params.dateKey}:${params.slotKey}`
  );

export const appointmentReminderDedupeKey = (params: {
  recipientUserId: string;
  profileId: string;
  appointmentId: string;
  stage: '24h' | '2h' | '30m';
  occursAtIso: string; // anchor on absolute time so reschedules naturally produce a new key
}) =>
  sanitize(
    `appt:${params.stage}:${params.recipientUserId}:${params.profileId}:${params.appointmentId}:${params.occursAtIso}`
  );

export const appointmentChangedDedupeKey = (params: {
  recipientUserId: string;
  appointmentId: string;
  changeFingerprint: string;
}) =>
  sanitize(
    `appt:changed:${params.recipientUserId}:${params.appointmentId}:${params.changeFingerprint}`
  );

export const careCircleInviteDedupeKey = (params: {
  recipientUserId: string;
  inviteId: string;
  variant: 'received' | 'accepted';
}) =>
  sanitize(
    `cc:invite:${params.variant}:${params.recipientUserId}:${params.inviteId}`
  );

export const careCircleMemberActivityDedupeKey = (params: {
  recipientUserId: string;
  activityLogId: string;
}) =>
  sanitize(
    `cc:activity:${params.recipientUserId}:${params.activityLogId}`
  );

export const vaultDocumentUploadedDedupeKey = (params: {
  recipientUserId: string;
  profileId: string;
  filePath: string;
  uploadedAt: string;
}) =>
  sanitize(
    `vault:upload:${params.recipientUserId}:${params.profileId}:${params.filePath}:${params.uploadedAt}`
  );

export const medicalSummaryReadyDedupeKey = (params: {
  recipientUserId: string;
  profileId: string;
  summarySignature: string;
}) =>
  sanitize(
    `summary:${params.recipientUserId}:${params.profileId}:${params.summarySignature}`
  );

export const sourcePrefixForCategory = (category: NotificationCategory): string => {
  switch (category) {
    case 'medication_due':
    case 'medication_missed':
      return 'medication';
    case 'appointment_upcoming':
    case 'appointment_changed':
      return 'appointment';
    case 'care_circle_invite_received':
    case 'care_circle_invite_accepted':
      return 'care_circle_link';
    case 'care_circle_member_activity':
      return 'profile_activity_log';
    case 'vault_document_uploaded':
      return 'vault_object';
    case 'medical_summary_ready':
      return 'medical_summary';
  }
};
