import { apiRequest } from '@/api/client';

type CareCircleStatus = 'pending' | 'accepted' | 'declined';

type CareCircleLink = {
  id: string;
  memberId: string;
  memberProfileId?: string | null;
  profileId?: string | null;
  status: CareCircleStatus;
  displayName: string;
  createdAt: string;
  updatedAt?: string | null;
};

export const careCircleApi = {
  getLinks: (profileId?: string) =>
    apiRequest<{ outgoing: CareCircleLink[]; incoming: CareCircleLink[] }>(
      `/api/care-circle/links${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''}`
    ),

  inviteByContact: (contact: string, profileId: string) =>
    apiRequest<{ recipientId: string }>('/api/care-circle/invite', {
      method: 'POST',
      body: { contact, profileId },
    }),
};
