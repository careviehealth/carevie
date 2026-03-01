import { supabase } from '@/lib/supabase';

export type Profile = {
    id: string;
    user_id: string | null;
    auth_id?: string | null;
    name: string;
    display_name?: string | null;
    phone?: string | null;
    gender?: string | null;
    address?: string | null;
    avatar_type: string;
    avatar_color: string | null;
    is_primary: boolean;
    created_at?: string;
    updated_at?: string;
};

export type CreateProfileData = {
    user_id?: string;
    auth_id?: string;
    name: string;
    avatar_type: string;
    avatar_color?: string;
    is_primary?: boolean;
};

export type UpdateProfileData = {
    name?: string;
    avatar_type?: string;
    avatar_color?: string;
};

export const userProfilesRepository = {
    /**
     * Get all profiles for a user
     */
    async getUserProfiles(userId: string): Promise<Profile[]> {
        const { data: authData, error: authError } = await supabase
            .from('profiles')
            .select('*')
            .eq('auth_id', userId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true });

        if (!authError && authData && authData.length > 0) {
            return authData || [];
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching user profiles:', error);
            throw error;
        }

        return data || [];
    },

    /**
     * Get a specific profile by ID
     */
    async getProfile(profileId: string): Promise<Profile | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', profileId)
            .maybeSingle();

        if (error) {
            console.error('Error fetching profile:', error);
            throw error;
        }

        return data;
    },

    /**
     * Get primary profile for a user
     */
    async getPrimaryProfile(userId: string): Promise<Profile | null> {
        const { data: authData, error: authError } = await supabase
            .from('profiles')
            .select('*')
            .eq('auth_id', userId)
            .eq('is_primary', true)
            .maybeSingle();

        if (!authError && authData) {
            return authData;
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .eq('is_primary', true)
            .maybeSingle();

        if (error) {
            console.error('Error fetching primary profile:', error);
            throw error;
        }

        return data;
    },

    /**
     * Create a new profile
     */
    async createProfile(profileData: CreateProfileData): Promise<Profile> {
        const ownerId = profileData.auth_id ?? profileData.user_id ?? null;
        const payload = {
            ...profileData,
            auth_id: ownerId,
            user_id: profileData.user_id ?? ownerId,
        };

        const { data, error } = await supabase
            .from('profiles')
            .insert([payload])
            .select()
            .single();

        if (!error) {
            return data;
        }

        const missingAuthColumn =
            (error as { code?: string }).code === 'PGRST204' ||
            error.message.toLowerCase().includes('auth_id');

        if (missingAuthColumn) {
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('profiles')
                .insert([
                    {
                        ...profileData,
                        user_id: profileData.user_id ?? ownerId,
                    },
                ])
                .select()
                .single();

            if (fallbackError) {
                console.error('Error creating profile:', fallbackError);
                throw fallbackError;
            }

            return fallbackData;
        }

        console.error('Error creating profile:', error);
        throw error;
    },

    /**
     * Update a profile
     */
    async updateProfile(profileId: string, updates: UpdateProfileData): Promise<Profile> {
        const { data, error } = await supabase
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', profileId)
            .select()
            .single();

        if (error) {
            console.error('Error updating profile:', error);
            throw error;
        }

        return data;
    },

    /**
     * Delete a profile (only if not primary)
     */
    async deleteProfile(profileId: string): Promise<void> {
        // First check if it's a primary profile
        const profile = await this.getProfile(profileId);
        if (profile?.is_primary) {
            throw new Error('Cannot delete primary profile');
        }

        const { error } = await supabase.from('profiles').delete().eq('id', profileId);

        if (error) {
            console.error('Error deleting profile:', error);
            throw error;
        }
    },

    /**
     * Get last selected profile for a user
     */
    async getLastSelectedProfile(userId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('user_profile_preferences')
            .select('last_selected_profile_id')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error('Error fetching last selected profile:', error);
            return null;
        }

        return data?.last_selected_profile_id || null;
    },

    /**
     * Set last selected profile for a user
     */
    async setLastSelectedProfile(userId: string, profileId: string): Promise<void> {
        const { error } = await supabase
            .from('user_profile_preferences')
            .upsert(
                {
                    user_id: userId,
                    last_selected_profile_id: profileId,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'user_id',
                }
            );

        if (error) {
            console.error('Error setting last selected profile:', error);
            throw error;
        }
    },
};
