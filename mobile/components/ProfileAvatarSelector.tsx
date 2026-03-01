import { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useColorScheme,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProfileAvatar } from './ProfileAvatar';

const AVATAR_TYPES = [
    { type: 'default', label: 'Default' },
    { type: 'adult_male', label: 'Adult Male' },
    { type: 'adult_female', label: 'Adult Female' },
    { type: 'child', label: 'Child' },
    { type: 'boy', label: 'Boy' },
    { type: 'girl', label: 'Girl' },
    { type: 'elderly_male', label: 'Elderly Male' },
    { type: 'elderly_female', label: 'Elderly Female' },
];

const PROFILE_COLORS = [
    { hex: '#14b8a6', label: 'Teal' },
    { hex: '#8b5cf6', label: 'Purple' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#ef4444', label: 'Red' },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#10b981', label: 'Green' },
    { hex: '#ec4899', label: 'Pink' },
    { hex: '#64748b', label: 'Slate' },
];

type ProfileAvatarSelectorProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (avatarType: string, avatarColor: string) => void;
    initialAvatarType?: string;
    initialAvatarColor?: string;
};

export function ProfileAvatarSelector({
    visible,
    onClose,
    onSelect,
    initialAvatarType = 'default',
    initialAvatarColor = '#14b8a6',
}: ProfileAvatarSelectorProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [selectedType, setSelectedType] = useState(initialAvatarType);
    const [selectedColor, setSelectedColor] = useState(initialAvatarColor);

    const handleConfirm = () => {
        onSelect(selectedType, selectedColor);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, isDark && styles.titleDark]}>Choose Avatar</Text>
                        <Pressable onPress={onClose} hitSlop={8}>
                            <MaterialCommunityIcons
                                name="close"
                                size={24}
                                color={isDark ? '#e2e8f0' : '#1e293b'}
                            />
                        </Pressable>
                    </View>

                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        {/* Preview */}
                        <View style={styles.previewSection}>
                            <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>Preview</Text>
                            <View style={styles.previewContainer}>
                                <ProfileAvatar avatarType={selectedType} avatarColor={selectedColor} size="large" />
                            </View>
                        </View>

                        {/* Avatar Type Selection */}
                        <View style={styles.section}>
                            <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>
                                Avatar Type
                            </Text>
                            <View style={styles.grid}>
                                {AVATAR_TYPES.map((avatar) => (
                                    <Pressable
                                        key={avatar.type}
                                        style={[
                                            styles.avatarOption,
                                            selectedType === avatar.type && styles.avatarOptionSelected,
                                            isDark && styles.avatarOptionDark,
                                            selectedType === avatar.type && isDark && styles.avatarOptionSelectedDark,
                                        ]}
                                        onPress={() => setSelectedType(avatar.type)}
                                    >
                                        <ProfileAvatar
                                            avatarType={avatar.type}
                                            avatarColor={selectedColor}
                                            size="small"
                                        />
                                        <Text
                                            style={[
                                                styles.avatarLabel,
                                                isDark && styles.avatarLabelDark,
                                                selectedType === avatar.type && styles.avatarLabelSelected,
                                            ]}
                                            numberOfLines={2}
                                        >
                                            {avatar.label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        {/* Color Selection */}
                        <View style={styles.section}>
                            <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>Color</Text>
                            <View style={styles.colorGrid}>
                                {PROFILE_COLORS.map((color) => (
                                    <Pressable
                                        key={color.hex}
                                        style={[
                                            styles.colorOption,
                                            selectedColor === color.hex && styles.colorOptionSelected,
                                        ]}
                                        onPress={() => setSelectedColor(color.hex)}
                                    >
                                        <View
                                            style={[
                                                styles.colorCircle,
                                                { backgroundColor: color.hex },
                                                selectedColor === color.hex && styles.colorCircleSelected,
                                            ]}
                                        >
                                            {selectedColor === color.hex && (
                                                <MaterialCommunityIcons name="check" size={24} color="#ffffff" />
                                            )}
                                        </View>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </ScrollView>

                    {/* Footer Buttons */}
                    <View style={styles.footer}>
                        <Pressable
                            style={[styles.button, styles.buttonCancel, isDark && styles.buttonCancelDark]}
                            onPress={onClose}
                        >
                            <Text style={[styles.buttonText, styles.buttonTextCancel]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.button, styles.buttonConfirm]} onPress={handleConfirm}>
                            <Text style={[styles.buttonText, styles.buttonTextConfirm]}>Confirm</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: 32,
        maxHeight: '85%',
    },
    modalContentDark: {
        backgroundColor: '#1e293b',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
    },
    titleDark: {
        color: '#f1f5f9',
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    previewSection: {
        marginBottom: 24,
    },
    previewContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#334155',
        marginBottom: 12,
    },
    sectionLabelDark: {
        color: '#cbd5e1',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    avatarOption: {
        width: '22%',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
    },
    avatarOptionDark: {
        backgroundColor: '#334155',
        borderColor: '#475569',
    },
    avatarOptionSelected: {
        borderColor: '#14b8a6',
        backgroundColor: '#f0fdfa',
    },
    avatarOptionSelectedDark: {
        borderColor: '#14b8a6',
        backgroundColor: '#0f766e20',
    },
    avatarLabel: {
        marginTop: 8,
        fontSize: 11,
        fontWeight: '500',
        color: '#64748b',
        textAlign: 'center',
    },
    avatarLabelDark: {
        color: '#94a3b8',
    },
    avatarLabelSelected: {
        color: '#0f766e',
        fontWeight: '600',
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    colorOption: {
        width: 60,
        height: 60,
    },
    colorCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'transparent',
    },
    colorCircleSelected: {
        borderColor: '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    colorOptionSelected: {},
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        marginTop: 20,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonCancel: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    buttonCancelDark: {
        backgroundColor: '#334155',
        borderColor: '#475569',
    },
    buttonConfirm: {
        backgroundColor: '#14b8a6',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    buttonTextCancel: {
        color: '#475569',
    },
    buttonTextConfirm: {
        color: '#ffffff',
    },
});
