import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileAvatar } from '@/components/ProfileAvatar';
import { ProfileAvatarSelector } from '@/components/ProfileAvatarSelector';
import { useProfile } from '@/hooks/useProfile';
import type { Profile } from '@/repositories/userProfilesRepository';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ProfileSelectionScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();

    const { profiles, selectedProfile, isLoading, selectProfile, createProfile } = useProfile();

    const [showAddModal, setShowAddModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);
    const [selectedAvatarType, setSelectedAvatarType] = useState('default');
    const [selectedAvatarColor, setSelectedAvatarColor] = useState('#14b8a6');

    const handleProfileSelect = async (profile: Profile) => {
        try {
            await selectProfile(profile.id);
            router.replace('/home');
        } catch (error) {
            console.error('Error selecting profile:', error);
            Alert.alert('Error', 'Failed to select profile. Please try again.');
        }
    };

    const handleAddProfile = () => {
        setNewProfileName('');
        setSelectedAvatarType('default');
        setSelectedAvatarColor('#14b8a6');
        setShowAddModal(true);
    };

    const handleCreateProfile = async () => {
        if (!newProfileName.trim()) {
            Alert.alert('Name Required', 'Please enter a child name.');
            return;
        }

        try {
            const previousSelectedProfileId = selectedProfile?.id ?? '';
            const newProfile = await createProfile({
                name: newProfileName.trim(),
                avatar_type: selectedAvatarType,
                avatar_color: selectedAvatarColor,
            });

            setShowAddModal(false);
            setNewProfileName('');

            // Redirect to health onboarding for the new profile
            router.replace({
                pathname: '/health-onboarding',
                params: {
                    newProfileId: newProfile.id,
                    previousProfileId: previousSelectedProfileId,
                    returnTo: '/profile-selection',
                },
            });
        } catch (error) {
            console.error('Error creating profile:', error);
            Alert.alert('Error', 'Failed to create profile. Please try again.');
        }
    };

    const handleManageProfiles = () => {
        router.push('/manage-profiles');
    };

    if (isLoading) {
        return (
            <LinearGradient colors={['#14b8a6', '#0f766e']} style={styles.container}>
                <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
                    <ActivityIndicator size="large" color="#ffffff" />
                    <Text style={styles.loadingText}>Loading child profiles...</Text>
                </View>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#14b8a6', '#0f766e']} style={styles.container}>
            <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
                {/* Header */}
                <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
                    <Text style={styles.title}>Which child profile?</Text>
                    <Text style={styles.subtitle}>Select a child profile to continue</Text>
                </Animated.View>

                {/* Profiles Grid */}
                <View style={styles.profilesGrid}>
                    {profiles.map((profile, index) => (
                        <AnimatedPressable
                            key={profile.id}
                            entering={FadeInDown.delay(200 + index * 100).springify()}
                            style={({ pressed }) => [styles.profileCard, pressed && styles.profileCardPressed]}
                            onPress={() => handleProfileSelect(profile)}
                        >
                            <ProfileAvatar
                                avatarType={profile.avatar_type}
                                avatarColor={profile.avatar_color}
                                size="large"
                            />
                            <Text style={styles.profileName} numberOfLines={1}>
                                {profile.name}
                            </Text>
                            {profile.is_primary && (
                                <View style={styles.primaryBadge}>
                                    <MaterialCommunityIcons name="star" size={12} color="#fbbf24" />
                                </View>
                            )}
                        </AnimatedPressable>
                    ))}

                    {/* Add Child Profile Button */}
                    {profiles.length < 8 && (
                        <AnimatedPressable
                            entering={FadeInDown.delay(200 + profiles.length * 100).springify()}
                            style={({ pressed }) => [
                                styles.profileCard,
                                styles.addProfileCard,
                                pressed && styles.profileCardPressed,
                            ]}
                            onPress={handleAddProfile}
                        >
                            <View style={styles.addProfileIcon}>
                                <MaterialCommunityIcons name="plus" size={60} color="rgba(255, 255, 255, 0.7)" />
                            </View>
                            <Text style={styles.profileName}>Add Child</Text>
                        </AnimatedPressable>
                    )}
                </View>

                {/* Manage Child Profiles Button */}
                <Animated.View entering={FadeInUp.delay(400)}>
                    <Pressable
                        style={({ pressed }) => [styles.manageButton, pressed && styles.manageButtonPressed]}
                        onPress={handleManageProfiles}
                    >
                        <MaterialCommunityIcons name="cog" size={20} color="#ffffff" />
                        <Text style={styles.manageButtonText}>Manage Children</Text>
                    </Pressable>
                </Animated.View>
            </View>

            {/* Add Child Profile Modal */}
            {showAddModal && (
                <View style={styles.modalOverlay}>
                    <Animated.View
                        entering={FadeInUp.springify()}
                        style={[styles.modalContent, isDark && styles.modalContentDark]}
                    >
                        <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
                            Create Child Profile
                        </Text>

                        {/* Avatar Preview */}
                        <View style={styles.avatarPreview}>
                            <ProfileAvatar
                                avatarType={selectedAvatarType}
                                avatarColor={selectedAvatarColor}
                                size="large"
                            />
                            <Pressable
                                style={styles.changeAvatarButton}
                                onPress={() => setShowAvatarSelector(true)}
                            >
                                <Text style={styles.changeAvatarText}>Change Avatar</Text>
                            </Pressable>
                        </View>

                        {/* Name Input */}
                        <TextInput
                            style={[styles.input, isDark && styles.inputDark]}
                            placeholder="Child Name"
                            placeholderTextColor={isDark ? '#94a3b8' : '#94a3b8'}
                            value={newProfileName}
                            onChangeText={setNewProfileName}
                            autoFocus
                        />

                        {/* Buttons */}
                        <View style={styles.modalButtons}>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setShowAddModal(false)}
                            >
                                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleCreateProfile}
                            >
                                <Text style={styles.modalButtonTextConfirm}>Create</Text>
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
                    setSelectedAvatarType(type);
                    setSelectedAvatarColor(color);
                    setShowAvatarSelector(false);
                }}
                initialAvatarType={selectedAvatarType}
                initialAvatarColor={selectedAvatarColor}
            />
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#ffffff',
        fontWeight: '500',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.9)',
    },
    profilesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 40,
    },
    profileCard: {
        alignItems: 'center',
        width: 140,
    },
    profileCardPressed: {
        opacity: 0.7,
    },
    profileName: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        textAlign: 'center',
    },
    primaryBadge: {
        position: 'absolute',
        top: -4,
        right: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 12,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addProfileCard: {
        justifyContent: 'center',
    },
    addProfileIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 3,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    manageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        alignSelf: 'center',
    },
    manageButtonPressed: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    manageButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
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
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 24,
        textAlign: 'center',
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
    input: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#0f172a',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    inputDark: {
        backgroundColor: '#334155',
        color: '#f1f5f9',
        borderColor: '#475569',
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
