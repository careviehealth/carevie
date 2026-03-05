import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
import { toast } from '@/lib/toast';
import { EmptyStatePreset } from '@/components/EmptyState';

export type Doctor = {
  id: string;
  name: string;
  number: string;
  speciality: string;
};

type Props = {
  visible: boolean;
  doctors: Doctor[];
  onClose: () => void;
  onAdd: (doctor: Doctor) => Promise<void> | void;
  onUpdate: (doctor: Doctor) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
};

const createDoctorId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function MedicalTeamModal({
  visible,
  doctors,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isCompact = windowWidth < 360;
  const sheetMaxHeight = Math.min(windowHeight - 24, 760);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [speciality, setSpeciality] = useState('');

  useEffect(() => {
    if (!visible) return;
    resetForm();
    setShowForm(false);
  }, [visible]);

  const resetForm = () => {
    setName('');
    setNumber('');
    setSpeciality('');
    setEditingId(null);
  };

  const handleEdit = (doctor: Doctor) => {
    setName(doctor.name);
    setNumber(doctor.number);
    setSpeciality(doctor.speciality);
    setEditingId(doctor.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !number.trim() || !speciality.trim()) {
      toast.warning('Missing info', 'Please fill all fields.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await onUpdate({
          id: editingId,
          name: name.trim(),
          number: number.trim(),
          speciality: speciality.trim(),
        });
      } else {
        await onAdd({
          id: createDoctorId(),
          name: name.trim(),
          number: number.trim(),
          speciality: speciality.trim(),
        });
      }
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete doctor?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.scrim} onPress={onClose} />
          <KeyboardAvoidingView
            style={styles.keyboardWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <MotiView
              from={{ translateY: 100, opacity: 0.5 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            >
              <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Medical Team</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={20} color="#1f2f33" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[styles.addToggle, showForm && styles.addToggleActive]}
                onPress={() => {
                  setShowForm((prev) => !prev);
                  if (showForm) resetForm();
                }}
              >
                <MaterialCommunityIcons name={showForm ? 'close' : 'plus'} size={18} color="#0f766e" />
                <Text style={styles.addToggleText}>
                  {showForm ? 'Close' : editingId ? 'Edit Doctor' : 'Add Doctor'}
                </Text>
              </Pressable>

            {showForm ? (
              <View style={styles.formCard}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Dr. John Smith"
                    placeholderTextColor="#9bb0b5"
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Phone number</Text>
                  <TextInput
                    value={number}
                    onChangeText={setNumber}
                    placeholder="e.g., 9876543210"
                    placeholderTextColor="#9bb0b5"
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Speciality</Text>
                  <TextInput
                    value={speciality}
                    onChangeText={setSpeciality}
                    placeholder="e.g., Cardiologist / General Physician"
                    placeholderTextColor="#9bb0b5"
                    style={styles.input}
                  />
                </View>
                <View style={[styles.formActions, isCompact && styles.formActionsStacked]}>
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                    disabled={saving}
                  >
                    <Text style={styles.secondaryActionText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryAction, saving && styles.buttonDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    <Text style={styles.primaryActionText}>
                      {saving ? (editingId ? 'Updating...' : 'Saving...') : editingId ? 'Update' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

              {!doctors.length ? (
                <EmptyStatePreset preset="doctors" />
              ) : (
                doctors.map((doctor) => (
                  <View key={doctor.id} style={styles.doctorCard}>
                    <View style={styles.doctorInfo}>
                      <Text style={styles.doctorName}>{doctor.name}</Text>
                      <Text style={styles.doctorMeta}>
                        {doctor.speciality} • {doctor.number}
                      </Text>
                    </View>
                    <View style={styles.cardActions}>
                      <Pressable onPress={() => handleEdit(doctor)} hitSlop={10}>
                        <MaterialCommunityIcons name="square-edit-outline" size={18} color="#0f766e" />
                      </Pressable>
                      <Pressable onPress={() => handleDelete(doctor.id)} hitSlop={10}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b42318" />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
            </MotiView>
        </KeyboardAvoidingView>
      </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardWrapper: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#f8fbfb',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8ea',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2f33',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef4f5',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  addToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b8d0d4',
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  addToggleActive: {
    borderColor: '#0f766e',
  },
  addToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f766e',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e8ea',
    gap: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#39484c',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1f2f33',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  formActionsStacked: {
    flexDirection: 'column',
  },
  primaryAction: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryAction: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#52666b',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2f33',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7a8c90',
    textAlign: 'center',
  },
  doctorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e8ea',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doctorInfo: {
    flex: 1,
    marginRight: 12,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2f33',
  },
  doctorMeta: {
    fontSize: 12,
    color: '#6b7f86',
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
});
