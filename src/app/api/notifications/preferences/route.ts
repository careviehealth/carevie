// User notification preferences: timezone, channel toggles, per-category
// toggles, quiet hours. GET returns synthetic defaults if no row exists yet,
// PUT upserts a real row.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import {
  getOrInitPreferences,
  sanitizeCategoryPrefs,
  upsertPreferences,
  type PreferencesUpdateInput,
} from '@/lib/notifications/preferences';

const HHMM_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

const isHHMM = (v: unknown): v is string =>
  typeof v === 'string' && HHMM_RE.test(v);

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const adminClient = createSupabaseAdminClient();
    const prefs = await getOrInitPreferences(adminClient, user.id);
    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error('[notifications/preferences GET] error:', error);
    return NextResponse.json({ message: 'Failed to load preferences.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Invalid body.' }, { status: 400 });
    }

    const update: PreferencesUpdateInput = {};
    if (typeof body.timezone === 'string') update.timezone = body.timezone;
    if (typeof body.channel_web_push === 'boolean') update.channel_web_push = body.channel_web_push;
    if (typeof body.channel_in_app === 'boolean') update.channel_in_app = body.channel_in_app;
    if (body.category_prefs && typeof body.category_prefs === 'object') {
      update.category_prefs = sanitizeCategoryPrefs(body.category_prefs);
    }
    if ('quiet_hours_start' in body) {
      const v = body.quiet_hours_start;
      if (v === null) {
        update.quiet_hours_start = null;
      } else if (isHHMM(v)) {
        update.quiet_hours_start = v;
      } else {
        return NextResponse.json({ message: 'quiet_hours_start must be HH:MM or null.' }, { status: 400 });
      }
    }
    if ('quiet_hours_end' in body) {
      const v = body.quiet_hours_end;
      if (v === null) {
        update.quiet_hours_end = null;
      } else if (isHHMM(v)) {
        update.quiet_hours_end = v;
      } else {
        return NextResponse.json({ message: 'quiet_hours_end must be HH:MM or null.' }, { status: 400 });
      }
    }

    const adminClient = createSupabaseAdminClient();
    const prefs = await upsertPreferences(adminClient, user.id, update);
    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error('[notifications/preferences PUT] error:', error);
    return NextResponse.json({ message: 'Failed to update preferences.' }, { status: 500 });
  }
}
