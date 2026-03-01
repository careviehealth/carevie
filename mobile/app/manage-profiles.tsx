import { useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInRight, FadeInUp } from 'react-native-reanimated';

import { ProfileAvatar } from '@/components/ProfileAvatar';
import { ProfileAvatarSelector } from '@/components/ProfileAvatarSelector';
import { useProfile } from '@/hooks/useProfile';
import type { Profile } from '@/repositories/userProfilesRepository';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ManageProfilesScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();

    const { profiles, updateProfile, deleteProfile } = useProfile();

    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [editName, setEditName] = useState('');
    const [editAvatarType, setEditAvatarType] = useState('default');
    const [editAvatarColor, setEditAvatarColor] = useState('#14b8a6');
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);

    const handleEditProfile = (profile: Profile) => {
        setEditingProfile(profile);
        setEditName(profile.name);
        setEditAvatarType(profile.avatar_type);
        setEditAvatarColor(profile.avatar_color || '#14b8a6');
    };

    const handleSaveEdit = async () => {
        if (!editingProfile || !editName.trim()) {
            Alert.alert('Name Required', 'Please enter a child name.');
            return;
        }

        try {
            await updateProfile(editingProfile.id, {
                name: editName.trim(),
                avatar_type: editAvatarType,
                avatar_color: editAvatarColor,
            });

            setEditingProfile(null);
            Alert.alert('Success', 'Child profile updated successfully.');
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update child profile. Please try again.');
        }
    };

    const handleDeleteProfile = (profile: Profile) => {
        if (profile.is_primary) {
            Alert.alert('Cannot Delete', 'You cannot delete the parent profile.');
            return;
        }

        Alert.alert(
            'Delete Child Profile',
            `Are you sure you want to delete "${profile.name}"? All medical data associated with this child profile will be permanently deleted.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteProfile(profile.id);
                            Alert.alert('Deleted', 'Child profile deleted successfully.');
                        } catch (error) {
                            console.error('Error deleting profile:', error);
                            Alert.alert('Error', 'Failed to delete child profile. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={[styles.container, isDark && styles.containerDark]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Pressable onPress={() => router.back()} hitSlop={8}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color={isDark ? '#e2e8f0' : '#1e293b'} />
                </Pressable>
                <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>Manage Children</Text>
                <View style={{ width: 28 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {profiles.map((profile, index) => (
                    <AnimatedPressable
                        key={profile.id}
                        entering={FadeInRight.delay(index * 100).springify()}
                        style={[styles.profileItem, isDark && styles.profileItemDark]}
                    >
                        <View style={styles.profileInfo}>
                            <ProfileAvatar
                                avatarType={profile.avatar_type}
                                avatarColor={profile.avatar_color}
                                size="small"
                            />
                            <View style={styles.profileDetails}>
                                <View style={styles.nameRow}>
                                    <Text style={[styles.profileName, isDark && styles.profileNameDark]}>
                                        {profile.name}
                                    </Text>
                                    {profile.is_primary && (
                                        <View style={styles.primaryBadge}>
                                            <MaterialCommunityIcons name="star" size={14} color="#fbbf24" />
                                            <Text style={styles.primaryText}>Parent</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[styles.profileMeta, isDark && styles.profileMetaDark]}>
                                    {profile.avatar_type.replace('_', ' ')} • {profile.avatar_color}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.actions}>
                            <Pressable
                                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                                onPress={() => handleEditProfile(profile)}
                            >
                                <MaterialCommunityIcons name="pencil" size={20} color="#14b8a6" />
                            </Pressable>
                            {!profile.is_primary && (
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.actionButton,
                                        pressed && styles.actionButtonPressed,
                                    ]}
                                    onPress={() => handleDeleteProfile(profile)}
                                >
                                    <MaterialCommunityIcons name="delete" size={20} color="#ef4444" />
                                </Pressable>
                            )}
                        </View>
                    </AnimatedPressable>
                ))}
            </ScrollView>

            {/* Edit Modal */}
            {editingProfile && (
                <View style={styles.modalOverlay}>
                    <Animated.View
                        entering={FadeInUp.springify()}
                        style={[styles.modalContent, isDark && styles.modalContentDark]}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>Edit Child Profile</Text>
                            <Pressable onPress={() => setEditingProfile(null)} hitSlop={8}>
                                <MaterialCommunityIcons
                                    name="close"
                                    size={24}
                                    color={isDark ? '#e2e8f0' : '#1e293b'}
                                />
                            </Pressable>
                        </View>

                        {/* Avatar Preview */}
                        <View style={styles.avatarPreview}>
                            <ProfileAvatar avatarType={editAvatarType} avatarColor={editAvatarColor} size="large" />
                            <Pressable style={styles.changeAvatarButton} onPress={() => setShowAvatarSelector(true)}>
                                <Text style={styles.changeAvatarText}>Change Avatar</Text>
                            </Pressable>
                        </View>

                        {/* Name Input */}
                        <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Name</Text>
                        <TextInput
                            style={[styles.input, isDark && styles.inputDark]}
                            placeholder="Child Name"
                            placeholderTextColor={isDark ? '#94a3b8' : '#94a3b8'}
                            value={editName}
                            onChangeText={setEditName}
                            autoFocus
                        />

                        {editingProfile.is_primary && (
                            <View style={styles.infoBox}>
                                <MaterialCommunityIcons name="information" size={20} color="#3b82f6" />
                                <Text style={styles.infoText}>
                                    This is your parent profile. It cannot be deleted.
                                </Text>
                            </View>
                        )}

                        {/* Buttons */}
                        <View style={styles.modalButtons}>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setEditingProfile(null)}
                            >
                                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleSaveEdit}
                            >
                                <Text style={styles.modalButtonTextConfirm}>Save</Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                </View>
            )}

            {/* Avatar Selector Modal */}
            <ProfileAvatarSelector
                visible={showAvatarSelector}
                onClose={() => setShowAvatarSelector(false)}
                onSelect={(type, color) => {
                    setEditAvatarType(type);
                    setEditAvatarColor(color);
                    setShowAvatarSelector(false);
                }}
                initialAvatarType={editAvatarType}
                initialAvatarColor={editAvatarColor}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    containerDark: {
        backgroundColor: '#0f172a',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0f172a',
    },
    headerTitleDark: {
        color: '#f1f5f9',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    profileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    profileItemDark: {
        backgroundColor: '#1e293b',
    },
    profileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    profileDetails: {
        marginLeft: 16,
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    profileName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#0f172a',
        marginRight: 8,
    },
    profileNameDark: {
        color: '#f1f5f9',
    },
    primaryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef3c7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    primaryText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400e',
    },
    profileMeta: {
        fontSize: 14,
        color: '#64748b',
        textTransform: 'capitalize',
    },
    profileMetaDark: {
        color: '#94a3b8',
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonPressed: {
        opacity: 0.6,
    },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
    },
    modalContentDark: {
        backgroundColor: '#1e293b',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
    },
    modalTitleDark: {
        color: '#f1f5f9',
    },
    avatarPreview: {
        alignItems: 'center',
        marginBottom: 24,
    },
    changeAvatarButton: {
        marginTop: 12,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    changeAvatarText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#14b8a6',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 8,
    },
    inputLabelDark: {
        color: '#cbd5e1',
    },
    input: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#0f172a',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    inputDark: {
        backgroundColor: '#334155',
        color: '#f1f5f9',
        borderColor: '#475569',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#dbeafe',
        padding: 12,
        borderRadius: 12,
        gap: 12,
        marginBottom: 16,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#1e40af',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    modalButtonCancel: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    modalButtonConfirm: {
        backgroundColor: '#14b8a6',
    },
    modalButtonTextCancel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#475569',
    },
    modalButtonTextConfirm: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
});
