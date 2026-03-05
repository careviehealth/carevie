import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
    userProfilesRepository,
    type Profile,
    type CreateProfileData,
    type UpdateProfileData,
} from '@/repositories/userProfilesRepository';

type ProfileContextValue = {
    profiles: Profile[];
    selectedProfile: Profile | null;
    isLoading: boolean;
    selectProfile: (profileId: string) => Promise<void>;
    createProfile: (data: Omit<CreateProfileData, 'user_id' | 'auth_id'>) => Promise<Profile>;
    updateProfile: (profileId: string, data: UpdateProfileData) => Promise<Profile>;
    deleteProfile: (profileId: string) => Promise<void>;
    refreshProfiles: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const userId = user?.id ?? '';

    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load profiles when user is authenticated
    const loadProfiles = async () => {
        if (!userId) {
            setProfiles([]);
            setSelectedProfile(null);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);

            // Fetch all user profiles
            const userProfiles = await userProfilesRepository.getUserProfiles(userId);
            setProfiles(userProfiles);

            const lastSelectedId = await userProfilesRepository.getLastSelectedProfile(userId);
            const currentlySelected =
                selectedProfile ? userProfiles.find((p) => p.id === selectedProfile.id) || null : null;

            let profileToSelect = currentlySelected;
            if (!profileToSelect && lastSelectedId) {
                profileToSelect = userProfiles.find((p) => p.id === lastSelectedId) || null;
            }
            if (!profileToSelect) {
                profileToSelect = userProfiles.find((p) => p.is_primary) || userProfiles[0] || null;
            }

            setSelectedProfile(profileToSelect);

            if (profileToSelect && profileToSelect.id !== lastSelectedId) {
                await userProfilesRepository.setLastSelectedProfile(userId, profileToSelect.id);
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadProfiles();
    }, [userId]);

    const value = useMemo<ProfileContextValue>(
        () => ({
            profiles,
            selectedProfile,
            isLoading,

            selectProfile: async (profileId: string) => {
                const profile = profiles.find((p) => p.id === profileId);
                if (!profile) {
                    throw new Error('Profile not found');
                }

                setSelectedProfile(profile);

                // Save as last selected
                if (userId) {
                    await userProfilesRepository.setLastSelectedProfile(userId, profileId);
                }
            },

            createProfile: async (data: Omit<CreateProfileData, 'user_id' | 'auth_id'>) => {
                if (!userId) {
                    throw new Error('User not authenticated');
                }

                const newProfile = await userProfilesRepository.createProfile({
                    ...data,
                    user_id: userId,
                    auth_id: userId,
                });

                setProfiles((prev) => [...prev, newProfile]);

                // Auto-select the newly created profile
                setSelectedProfile(newProfile);

                // Save as last selected
                await userProfilesRepository.setLastSelectedProfile(userId, newProfile.id);

                return newProfile;
            },

            updateProfile: async (profileId: string, data: UpdateProfileData) => {
                const updatedProfile = await userProfilesRepository.updateProfile(profileId, data);

                setProfiles((prev) => prev.map((p) => (p.id === profileId ? updatedProfile : p)));

                // Update selected profile if it was the one updated
                if (selectedProfile?.id === profileId) {
                    setSelectedProfile(updatedProfile);
                }

                return updatedProfile;
            },

            deleteProfile: async (profileId: string) => {
                await userProfilesRepository.deleteProfile(profileId);

                setProfiles((prev) => prev.filter((p) => p.id !== profileId));

                // If deleted profile was selected, switch to primary
                if (selectedProfile?.id === profileId) {
                    const primaryProfile = profiles.find((p) => p.is_primary);
                    if (primaryProfile) {
                        setSelectedProfile(primaryProfile);
                        if (userId) {
                            await userProfilesRepository.setLastSelectedProfile(userId, primaryProfile.id);
                        }
                    }
                }
            },

            refreshProfiles: loadProfiles,
        }),
        [profiles, selectedProfile, isLoading, userId]
    );

    return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileContext() {
    const ctx = useContext(ProfileContext);
    if (!ctx) {
        throw new Error('useProfileContext must be used within a ProfileProvider');
    }
    return ctx;
}
