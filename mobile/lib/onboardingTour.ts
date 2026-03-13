import { supabase } from '@/lib/supabase';

const TOUR_SEEN_COLUMN = 'has_seen_onboarding_tour';
const TOUR_SEEN_AT_COLUMN = 'onboarding_tour_seen_at';

export type OnboardingTourMode = 'autostart' | 'replay';

export type OnboardingTourStepId =
  | 'nav-home'
  | 'nav-switch-profile'
  | 'home-get-summary'
  | 'home-sos'
  | 'home-notifications-mobile'
  | 'home-quick-cards'
  | 'nav-profile'
  | 'profile-overview'
  | 'nav-vault'
  | 'vault-upload'
  | 'nav-care-circle'
  | 'care-invite-member'
  | 'care-view-access'
  | 'nav-settings'
  | 'settings-replay-tour';

export type OnboardingTourStep = {
  id: OnboardingTourStepId;
  route: '/home' | '/profile' | '/vault' | '/carecircle' | '/settings';
  content: string;
  side: 'top' | 'bottom' | 'left' | 'right';
};

export const onboardingTourSteps: readonly OnboardingTourStep[] = [
  {
    id: 'nav-home',
    route: '/home',
    content: 'Use Home anytime to come back to your main dashboard.',
    side: 'top',
  },
  {
    id: 'nav-switch-profile',
    route: '/home',
    content: 'Switch Profile lets you quickly move between family members.',
    side: 'bottom',
  },
  {
    id: 'home-get-summary',
    route: '/home',
    content: 'Get Summary generates a quick overview from your uploaded reports.',
    side: 'bottom',
  },
  {
    id: 'home-sos',
    route: '/home',
    content: 'SOS instantly alerts your emergency contacts.',
    side: 'bottom',
  },
  {
    id: 'home-notifications-mobile',
    route: '/home',
    content: 'Open Notifications to review alerts and recent activity logs.',
    side: 'bottom',
  },
  {
    id: 'home-quick-cards',
    route: '/home',
    content: 'These cards open appointments, emergency contacts, medical team, and medications.',
    side: 'top',
  },
  {
    id: 'nav-profile',
    route: '/profile',
    content: 'Profile is where your full health information lives.',
    side: 'top',
  },
  {
    id: 'profile-overview',
    route: '/profile',
    content: 'Review and update personal details, vitals, and medical history here.',
    side: 'bottom',
  },
  {
    id: 'nav-vault',
    route: '/vault',
    content: 'Vault stores your medical documents in one place.',
    side: 'top',
  },
  {
    id: 'vault-upload',
    route: '/vault',
    content: 'Upload lab reports, prescriptions, insurance docs, and bills here.',
    side: 'bottom',
  },
  {
    id: 'nav-care-circle',
    route: '/carecircle',
    content: 'Care Circle helps you coordinate with trusted family or friends.',
    side: 'top',
  },
  {
    id: 'care-invite-member',
    route: '/carecircle',
    content: 'Invite members to collaborate on care and emergency readiness.',
    side: 'bottom',
  },
  {
    id: 'care-view-access',
    route: '/carecircle',
    content: 'Use this action to open shared details or the emergency card.',
    side: 'bottom',
  },
  {
    id: 'nav-settings',
    route: '/settings',
    content: 'Settings manages account controls, legal docs, and safety actions.',
    side: 'bottom',
  },
  {
    id: 'settings-replay-tour',
    route: '/settings',
    content: 'You can replay this walkthrough anytime from here.',
    side: 'top',
  },
] as const;

export function isMissingOnboardingTourColumnError(
  error: { code?: string; message?: string } | null | undefined
) {
  return (
    error?.code === 'PGRST204' ||
    error?.message?.toLowerCase().includes(TOUR_SEEN_COLUMN) ||
    false
  );
}

export async function getOnboardingTourSeen(userId: string): Promise<boolean> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return true;

  const { data, error } = await supabase
    .from('user_profile_preferences')
    .select(TOUR_SEEN_COLUMN)
    .eq('user_id', trimmedUserId)
    .maybeSingle();

  if (error) {
    if (isMissingOnboardingTourColumnError(error) || error.code === 'PGRST116') {
      return false;
    }
    throw error;
  }

  return Boolean(data?.[TOUR_SEEN_COLUMN]);
}

async function persistOnboardingTourSeen(userId: string, hasSeen: boolean): Promise<boolean> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return false;

  const now = new Date().toISOString();
  const payload = {
    user_id: trimmedUserId,
    [TOUR_SEEN_COLUMN]: hasSeen,
    [TOUR_SEEN_AT_COLUMN]: hasSeen ? now : null,
    updated_at: now,
  };

  const { error } = await supabase.from('user_profile_preferences').upsert(payload, {
    onConflict: 'user_id',
  });

  if (error) {
    if (isMissingOnboardingTourColumnError(error)) {
      return false;
    }
    throw error;
  }

  return true;
}

export async function markOnboardingTourSeen(userId: string) {
  return persistOnboardingTourSeen(userId, true);
}

export async function resetOnboardingTourSeen(userId: string) {
  return persistOnboardingTourSeen(userId, false);
}
