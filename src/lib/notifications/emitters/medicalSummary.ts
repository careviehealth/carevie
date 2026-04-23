// Emits `medical_summary_ready` when a freshly generated medical summary lands.
// Hooked from /api/medical (action=generate-summary) so any client that triggers
// regeneration produces an alert in the bell panel + push.
//
// We dedupe on a stable signature derived from {profileId, folderType, content
// length, report count} — that way: hitting "regenerate" with no underlying
// changes does NOT spam a duplicate notification.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

import { dispatchNotification } from '@/lib/notifications/dispatch';
import { medicalSummaryReadyDedupeKey } from '@/lib/notifications/dedupe';

const safeError = (label: string, err: unknown) => {
  console.error(`[notifications/emitters/medicalSummary] ${label}:`, err);
};

export type EmitMedicalSummaryReadyInput = {
  adminClient: SupabaseClient;
  recipientUserId: string;
  profileId: string;
  folderType?: string | null;
  summaryContent?: string | null;
  reportCount?: number | null;
};

const buildSignature = (input: EmitMedicalSummaryReadyInput): string => {
  const folder = (input.folderType ?? 'reports').slice(0, 64);
  const content = (input.summaryContent ?? '').trim();
  const length = content.length;
  const reports = input.reportCount ?? 0;
  // Hash content so the same body collapses to the same key regardless of
  // metadata (e.g. timestamp differences between repeat calls).
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  return `${folder}:${reports}:${length}:${hash}`;
};

const summaryDescription = (folderType: string | null | undefined): string => {
  switch ((folderType ?? '').trim().toLowerCase()) {
    case 'reports':
      return 'Your medical reports summary is ready.';
    case 'medications':
      return 'Your medications summary is ready.';
    case 'appointments':
      return 'Your appointments summary is ready.';
    case '':
      return 'Your medical summary is ready.';
    default:
      return `Your ${folderType} summary is ready.`;
  }
};

export const emitMedicalSummaryReady = async (
  input: EmitMedicalSummaryReadyInput
): Promise<void> => {
  if (!input.recipientUserId || !input.profileId) return;
  // Don't fire for empty summaries (failed generation, no content). We only
  // want to alert when there is something for the user to read.
  if (!input.summaryContent || !input.summaryContent.trim()) return;

  try {
    const signature = buildSignature(input);
    await dispatchNotification(input.adminClient, {
      userId: input.recipientUserId,
      profileId: input.profileId,
      category: 'medical_summary_ready',
      title: 'Medical summary ready',
      body: summaryDescription(input.folderType),
      metadata: {
        profileId: input.profileId,
        folderType: input.folderType ?? null,
        reportCount: input.reportCount ?? null,
        summaryLength: input.summaryContent.length,
      },
      sourceType: 'medical_summary',
      sourceId: input.profileId,
      dedupeKey: medicalSummaryReadyDedupeKey({
        recipientUserId: input.recipientUserId,
        profileId: input.profileId,
        summarySignature: signature,
      }),
      deepLink: '/app/homepage',
    });
  } catch (err) {
    safeError('emitMedicalSummaryReady', err);
  }
};
