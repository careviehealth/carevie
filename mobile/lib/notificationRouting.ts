// Translate a push payload from the backend into a mobile route.
//
// The backend sends a transport-neutral payload that includes `category`,
// `metadata`, and a web-oriented `url`. Mobile has its own route tree, so we
// map intent (category + metadata) to an Expo Router path here rather than
// trying to parse the web URL.

export type MobilePushData = {
  notification_id?: string;
  category?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  scheduled_for?: string;
};

export type MobileDeepLink = {
  pathname: string;
  params?: Record<string, string>;
};

const DEFAULT_ROUTE: MobileDeepLink = { pathname: '/home' };

// Category → mobile route. Keep in sync with the 9 backend categories in
// src/lib/notifications/types.ts. If a category has no obvious mobile
// destination, fall through to /home.
export const routeForNotification = (data: MobilePushData): MobileDeepLink => {
  const category = typeof data.category === 'string' ? data.category : '';
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;

  switch (category) {
    case 'medication_due':
    case 'medication_missed':
      return { pathname: '/home', params: { open: 'medications' } };

    case 'appointment_upcoming':
    case 'appointment_changed':
      return { pathname: '/home', params: { open: 'calendar' } };

    case 'care_circle_invite_received':
    case 'care_circle_invite_accepted':
      return { pathname: '/carecircle' };

    case 'care_circle_member_activity': {
      const domain = typeof metadata.domain === 'string' ? metadata.domain : '';
      if (domain === 'vault') return { pathname: '/vault' };
      if (domain === 'medication') return { pathname: '/home', params: { open: 'medications' } };
      if (domain === 'appointment') return { pathname: '/home', params: { open: 'calendar' } };
      return { pathname: '/carecircle' };
    }

    case 'vault_document_uploaded': {
      const folder = typeof metadata.folder === 'string' ? metadata.folder : '';
      return folder
        ? { pathname: '/vault', params: { folder } }
        : { pathname: '/vault' };
    }

    case 'medical_summary_ready':
      return { pathname: '/home' };

    default:
      return DEFAULT_ROUTE;
  }
};
