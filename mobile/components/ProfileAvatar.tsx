import { type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';

const AVATAR_ICONS: Record<string, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
    default: 'account',
    adult_male: 'face-man',
    adult_female: 'face-woman',
    child: 'baby-face',
    boy: 'face-man-outline',
    girl: 'face-woman-outline',
    elderly_male: 'account-tie',
    elderly_female: 'account-tie-woman',
};

const SIZES = {
    small: { container: 48, icon: 24 },
    medium: { container: 80, icon: 40 },
    large: { container: 120, icon: 60 },
};

type ProfileAvatarProps = {
    avatarType: string;
    avatarColor?: string | null;
    size?: 'small' | 'medium' | 'large';
};

export function ProfileAvatar({
    avatarType,
    avatarColor,
    size = 'medium',
}: ProfileAvatarProps) {
    const { colors: themeColors } = useAppTheme();
    const iconName = AVATAR_ICONS[avatarType] || AVATAR_ICONS.default;
    const color = avatarColor || themeColors.accent;
    const dimensions = SIZES[size];

    const containerStyle = {
        width: dimensions.container,
        height: dimensions.container,
        borderRadius: dimensions.container / 2,
        backgroundColor: color,
    };

    return (
        <View style={[styles.container, containerStyle]}>
            <MaterialCommunityIcons name={iconName} size={dimensions.icon} color="#ffffff" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
});
