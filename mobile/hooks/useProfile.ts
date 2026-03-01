import { useProfileContext } from '@/providers/ProfileProvider';

export function useProfile() {
    return useProfileContext();
}
