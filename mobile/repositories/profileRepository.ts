import { profileApi } from '@/api';

export const profileRepository = {
  getPersonalProfile: async (profileId: string) => {
    const { data, error } = await profileApi.getPersonalProfile(profileId);
    if (error) throw error;
    return data;
  },

  getHealthProfile: async (profileId: string) => {
    const { data, error } = await profileApi.getHealthProfile(profileId);
    if (error) throw error;
    return data;
  },
};
