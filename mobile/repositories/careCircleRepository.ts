import { careCircleApi } from '@/api';

export const careCircleRepository = {
  getLinks: (profileId?: string) => careCircleApi.getLinks(profileId),
  inviteByContact: (contact: string, profileId: string) => careCircleApi.inviteByContact(contact, profileId),
};
