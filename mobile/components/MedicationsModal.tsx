import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type MedicationLog = {
  medicationId: string;
  timestamp: string;
  taken: boolean;
};

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  purpose: string;
  frequency: string;
  timesPerDay?: number;
  startDate?: string;
  endDate?: string;
  logs?: MedicationLog[];
};

type Props = {
  visible: boolean;
  medications: Medication[];
  onClose: () => void;
  onAdd: (medication: Medication) => Promise<void> | void;
  onUpdate: (medication: Medication) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onLogDose?: (medicationId: string, taken: boolean) => Promise<void> | void;
};

const frequencyOptions = [
  { label: 'Once daily', value: 'once_daily', times: 1 },
  { label: 'Twice daily', value: 'twice_daily', times: 2 },
  { label: 'Three times daily', value: 'three_times_daily', times: 3 },
  { label: 'Four times daily', value: 'four_times_daily', times: 4 },
  { label: 'Every 4 hours', value: 'every_4_hours', times: 6 },
  { label: 'Every 6 hours', value: 'every_6_hours', times: 4 },
  { label: 'Every 8 hours', value: 'every_8_hours', times: 3 },
  { label: 'Every 12 hours', value: 'every_12_hours', times: 2 },
  { label: 'As needed', value: 'as_needed', times: 0 },
  { label: 'With meals', value: 'with_meals', times: 3 },
  { label: 'Before bed', value: 'before_bed', times: 1 },
];

const createMedicationId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatDateLabel = (dateStr?: string) => {
  if (!dateStr) return 'Select date';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Select date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function MedicationsModal({
  visible,
  medications,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onLogDose,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'completed'>('current');
  const [showReminders, setShowReminders] = useState(false);

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [purpose, setPurpose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [timesPerDay, setTimesPerDay] = useState('1');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    resetForm();
    setShowForm(false);
    setActiveTab('current');
  }, [visible]);

  useEffect(() => {
    if (showForm && !editingId && !startDate) {
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
    }
  }, [showForm, editingId, startDate]);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const upcomingMeds = medications.filter((med) => {
        if (!med.timesPerDay || !med.startDate || med.timesPerDay === 0) return false;

        if (med.endDate) {
          const end = new Date(med.endDate);
          const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (nowDateOnly > endDateOnly) return false;
        }

        const medLogs = med.logs || [];
        const todayLogs = medLogs.filter(
          (log) => new Date(log.timestamp).toDateString() === now.toDateString() && log.taken
        );

        return todayLogs.length < (med.timesPerDay || 1);
      });

      setShowReminders(upcomingMeds.length > 0);
    };

    checkReminders();
    const interval = setInterval(checkReminders, 60_000);
    return () => clearInterval(interval);
  }, [medications]);

  const resetForm = () => {
    setName('');
    setDosage('');
    setPurpose('');
    setFrequency('');
    setTimesPerDay('1');
    setStartDate('');
    setEndDate('');
    setEditingId(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
  };

  const handleEdit = (medication: Medication) => {
    setName(medication.name);
    setDosage(medication.dosage);
    setPurpose(medication.purpose);

    const matchingOption = frequencyOptions.find((opt) => opt.value === medication.frequency);
    if (matchingOption) {
      setFrequency(matchingOption.value);
      setTimesPerDay(matchingOption.times.toString());
    } else {
      setFrequency(medication.frequency);
      setTimesPerDay((medication.timesPerDay || 1).toString());
    }

    setStartDate(medication.startDate || '');
    setEndDate(medication.endDate || '');
    setEditingId(medication.id);
    setShowForm(true);
  };

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    const selected = frequencyOptions.find((opt) => opt.value === value);
    if (selected) {
      setTimesPerDay(selected.times.toString());
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !dosage.trim() || !frequency.trim()) {
      Alert.alert('Missing info', 'Please fill Name, Dosage, and Frequency.');
      return;
    }

    setSaving(true);
    try {
      const selectedFreq = frequencyOptions.find((opt) => opt.value === frequency);
      const finalTimesPerDay = selectedFreq ? selectedFreq.times : parseInt(timesPerDay, 10) || 1;

      const medicationData: Medication = {
        id: editingId || createMedicationId(),
        name: name.trim(),
        dosage: dosage.trim(),
        purpose: purpose.trim(),
        frequency: frequency.trim(),
        timesPerDay: finalTimesPerDay,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || undefined,
        logs: editingId ? medications.find((m) => m.id === editingId)?.logs || [] : [],
      };

      if (editingId) {
        await onUpdate(medicationData);
      } else {
        await onAdd(medicationData);
      }
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete medication?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(id) },
    ]);
  };

  const handleLogDose = async (medicationId: string, taken: boolean) => {
    if (!onLogDose) return;
    await onLogDose(medicationId, taken);
  };

  const getTodayProgress = (medication: Medication) => {
    if (medication.timesPerDay === 0) {
      return { taken: 0, target: 0, percentage: 100 };
    }

    const today = new Date().toDateString();
    const medLogs = medication.logs || [];
    const todayLogs = medLogs.filter(
      (log) => new Date(log.timestamp).toDateString() === today && log.taken
    );
    const target = medication.timesPerDay || 1;
    return {
      taken: todayLogs.length,
      target,
      percentage: Math.min((todayLogs.length / target) * 100, 100),
    };
  };

  const getDaysRemaining = (medication: Medication) => {
    if (!medication.endDate) return null;
    const end = new Date(medication.endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const activeMedications = useMemo(() => {
    const now = new Date();
    return medications.filter((med) => {
      if (!med.endDate) return true;
      const end = new Date(med.endDate);
      return now <= end;
    });
  }, [medications]);

  const pastMedications = useMemo(() => {
    const now = new Date();
    return medications.filter((med) => {
      if (!med.endDate) return false;
      const end = new Date(med.endDate);
      return now > end;
    });
  }, [medications]);

  const isTimesLocked = Boolean(frequencyOptions.find((opt) => opt.value === frequency));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Medications</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={20} color="#1f2f33" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <Pressable
              style={[styles.addToggle, showForm && styles.addToggleActive]}
              onPress={() => {
                setShowForm((prev) => !prev);
                if (showForm) resetForm();
              }}
            >
              <MaterialCommunityIcons name={showForm ? 'close' : 'plus'} size={18} color="#0f766e" />
              <Text style={styles.addToggleText}>
                {showForm ? 'Close Form' : '+ Add Medication'}
              </Text>
            </Pressable>

            {showReminders && !showForm ? (
              <View style={styles.reminderCard}>
                <View style={styles.reminderHeader}>
                  <Text style={styles.reminderTitle}>Medication Reminders</Text>
                  <Pressable onPress={() => setShowReminders(false)}>
                    <Text style={styles.reminderDismiss}>Dismiss</Text>
                  </Pressable>
                </View>
                <Text style={styles.reminderText}>
                  You have medications due today. Check your progress below.
                </Text>
              </View>
            ) : null}

            {showForm ? (
              <View style={styles.formCard}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Paracetamol"
                    placeholderTextColor="#9bb0b5"
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Dosage</Text>
                  <TextInput
                    value={dosage}
                    onChangeText={setDosage}
                    placeholder="e.g., 500mg"
                    placeholderTextColor="#9bb0b5"
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Purpose (optional)</Text>
                  <TextInput
                    value={purpose}
                    onChangeText={setPurpose}
                    placeholder="e.g., Pain relief"
                    placeholderTextColor="#9bb0b5"
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Frequency</Text>
                  <View style={styles.chipGrid}>
                    {frequencyOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => handleFrequencyChange(option.value)}
                        style={[
                          styles.chip,
                          frequency === option.value && styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            frequency === option.value && styles.chipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Times per day</Text>
                  <TextInput
                    value={timesPerDay}
                    onChangeText={setTimesPerDay}
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor="#9bb0b5"
                    style={[styles.input, isTimesLocked && styles.inputDisabled]}
                    editable={!isTimesLocked}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Start date</Text>
                  <Pressable
                    style={styles.dateSelector}
                    onPress={() => setShowStartPicker((prev) => !prev)}
                  >
                    <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#0f766e" />
                    <Text style={styles.dateSelectorText}>{formatDateLabel(startDate)}</Text>
                  </Pressable>
                  {showStartPicker ? (
                    <Calendar
                      onDayPress={(day) => {
                        setStartDate(day.dateString);
                        setShowStartPicker(false);
                      }}
                      markedDates={
                        startDate
                          ? {
                              [startDate]: { selected: true, selectedColor: '#0f766e' },
                            }
                          : undefined
                      }
                      theme={{
                        todayTextColor: '#0f766e',
                        selectedDayBackgroundColor: '#0f766e',
                        arrowColor: '#0f766e',
                        textDayFontWeight: '500',
                        textMonthFontWeight: '700',
                      }}
                    />
                  ) : null}
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>End date (optional)</Text>
                  <View style={styles.endDateRow}>
                    <Pressable
                      style={[styles.dateSelector, styles.endDateSelector]}
                      onPress={() => setShowEndPicker((prev) => !prev)}
                    >
                      <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#0f766e" />
                      <Text style={styles.dateSelectorText}>{formatDateLabel(endDate)}</Text>
                    </Pressable>
                    {endDate ? (
                      <Pressable onPress={() => setEndDate('')}>
                        <Text style={styles.clearText}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {showEndPicker ? (
                    <Calendar
                      onDayPress={(day) => {
                        setEndDate(day.dateString);
                        setShowEndPicker(false);
                      }}
                      markedDates={
                        endDate
                          ? {
                              [endDate]: { selected: true, selectedColor: '#0f766e' },
                            }
                          : undefined
                      }
                      theme={{
                        todayTextColor: '#0f766e',
                        selectedDayBackgroundColor: '#0f766e',
                        arrowColor: '#0f766e',
                        textDayFontWeight: '500',
                        textMonthFontWeight: '700',
                      }}
                    />
                  ) : null}
                </View>
                <View style={styles.formActions}>
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
            ) : (
              <>
                <View style={styles.segmented}>
                  <Pressable
                    onPress={() => setActiveTab('current')}
                    style={[
                      styles.segmentButton,
                      activeTab === 'current' && styles.segmentButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentLabel,
                        activeTab === 'current' && styles.segmentLabelActive,
                      ]}
                    >
                      Current ({activeMedications.length})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveTab('completed')}
                    style={[
                      styles.segmentButton,
                      activeTab === 'completed' && styles.segmentButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentLabel,
                        activeTab === 'completed' && styles.segmentLabelActive,
                      ]}
                    >
                      Completed ({pastMedications.length})
                    </Text>
                  </Pressable>
                </View>

                {activeTab === 'current' ? (
                  activeMedications.length === 0 ? (
                    <Text style={styles.emptySubtitle}>No active medications at the moment.</Text>
                  ) : (
                    activeMedications.map((med) => {
                      const progress = getTodayProgress(med);
                      const daysRemaining = getDaysRemaining(med);
                      return (
                        <View key={med.id} style={styles.medCard}>
                          <View style={styles.medHeader}>
                            <View style={styles.medInfo}>
                              <Text style={styles.medName}>{med.name}</Text>
                              <Text style={styles.medMeta}>
                                {med.dosage} • {med.frequency}
                                {med.purpose ? ` • ${med.purpose}` : ''}
                              </Text>
                              {daysRemaining !== null ? (
                                <Text style={styles.medSub}>
                                  {daysRemaining > 0
                                    ? `${daysRemaining} days remaining`
                                    : daysRemaining === 0
                                    ? 'Ends today'
                                    : 'Course completed'}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.cardActions}>
                              <Pressable onPress={() => handleEdit(med)} hitSlop={10}>
                                <MaterialCommunityIcons name="square-edit-outline" size={18} color="#0f766e" />
                              </Pressable>
                              <Pressable onPress={() => handleDelete(med.id)} hitSlop={10}>
                                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b42318" />
                              </Pressable>
                            </View>
                          </View>

                          {med.timesPerDay !== 0 ? (
                            <View style={styles.progressBlock}>
                              <View style={styles.progressHeader}>
                                <Text style={styles.progressLabel}>Today</Text>
                                <Text style={styles.progressValue}>
                                  {progress.taken} / {progress.target}
                                </Text>
                              </View>
                              <View style={styles.progressBar}>
                                <View
                                  style={[
                                    styles.progressFill,
                                    { width: `${progress.percentage}%` },
                                    progress.percentage === 100 && styles.progressFillDone,
                                  ]}
                                />
                              </View>

                              {progress.taken < progress.target && onLogDose ? (
                                <Pressable
                                  style={styles.logButton}
                                  onPress={() => handleLogDose(med.id, true)}
                                >
                                  <Text style={styles.logButtonText}>Mark dose taken</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  )
                ) : pastMedications.length === 0 ? (
                  <Text style={styles.emptySubtitle}>No completed courses yet.</Text>
                ) : (
                  pastMedications.map((med) => (
                    <View key={med.id} style={[styles.medCard, styles.medCardPast]}>
                      <View style={styles.medHeader}>
                        <View style={styles.medInfo}>
                          <Text style={[styles.medName, styles.medNamePast]}>{med.name}</Text>
                          <Text style={styles.medMeta}>
                            {med.dosage} • {med.frequency}
                            {med.purpose ? ` • ${med.purpose}` : ''}
                          </Text>
                          {med.endDate ? (
                            <Text style={styles.medSub}>
                              Ended on {new Date(med.endDate).toLocaleDateString('en-US')}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.cardActions}>
                          <Pressable onPress={() => handleEdit(med)} hitSlop={10}>
                            <MaterialCommunityIcons name="eye-outline" size={18} color="#0f766e" />
                          </Pressable>
                          <Pressable onPress={() => handleDelete(med.id)} hitSlop={10}>
                            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b42318" />
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.pastNote}>Course completed • No active reminders</Text>
                    </View>
                  ))
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
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
    backgroundColor: 'rgba(15, 23, 24, 0.35)',
  },
  sheet: {
    backgroundColor: '#f8fbfb',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
    maxHeight: '88%',
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
  reminderCard: {
    backgroundColor: '#fff4cc',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f3d38f',
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9a620f',
  },
  reminderDismiss: {
    fontSize: 12,
    color: '#9a620f',
    fontWeight: '600',
  },
  reminderText: {
    fontSize: 12,
    color: '#8a640e',
    marginTop: 6,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2f33',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
  },
  chipActive: {
    borderColor: '#0f766e',
    backgroundColor: '#0f766e',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52666b',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
  },
  dateSelectorText: {
    fontSize: 14,
    color: '#1f2f33',
  },
  endDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  endDateSelector: {
    flex: 1,
  },
  clearText: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
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
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#eaf0f1',
    borderRadius: 14,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#8aa1a6',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7f86',
  },
  segmentLabelActive: {
    color: '#0f766e',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7a8c90',
    textAlign: 'center',
  },
  medCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e8ea',
    gap: 12,
  },
  medCardPast: {
    backgroundColor: '#f4f7f7',
  },
  medHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  medInfo: {
    flex: 1,
  },
  medName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2f33',
  },
  medNamePast: {
    color: '#56666b',
  },
  medMeta: {
    fontSize: 12,
    color: '#6b7f86',
    marginTop: 4,
  },
  medSub: {
    fontSize: 12,
    color: '#8b9aa0',
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  progressBlock: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    color: '#6b7f86',
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2f33',
  },
  progressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e7eef0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0f766e',
  },
  progressFillDone: {
    backgroundColor: '#22c55e',
  },
  logButton: {
    marginTop: 6,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  pastNote: {
    fontSize: 12,
    color: '#8b9aa0',
  },
});
