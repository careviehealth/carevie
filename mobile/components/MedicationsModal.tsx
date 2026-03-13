import { useEffect, useMemo, useState } from 'react';
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
import { Calendar } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';

import { EmptyState, EmptyStatePreset } from '@/components/EmptyState';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';
import { toast } from '@/lib/toast';
import {
  MEDICATION_MEAL_OPTIONS,
  countMedicationMealTiming,
  deriveMedicationMealTiming,
  formatMedicationDosage,
  formatMedicationFrequencyLabel,
  formatMedicationMealTimingSummary,
  getDueMedicationReminderSlots,
  getMedicationDoseStatesForDate,
  normalizeMedicationDosage,
  resolveMedicationTimesPerDay,
  type MedicationLog as SharedMedicationLog,
  type MedicationMealKey,
  type MedicationReminderSlot,
  type MedicationRecord as SharedMedication,
} from '@/lib/medications';

export type MedicationLog = SharedMedicationLog;
export type Medication = SharedMedication & { id: string };

type Props = {
  visible: boolean;
  medications: Medication[];
  onClose: () => void;
  onAdd: (medication: Medication) => Promise<void> | void;
  onUpdate: (medication: Medication) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onLogDose?: (
    medicationId: string,
    taken: boolean,
    slotKey?: MedicationReminderSlot['key']
  ) => Promise<void> | void;
};

const createMedicationId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatDateLabel = (dateStr?: string) => {
  if (!dateStr) return 'Select date';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Select date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDoseTime = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

const getDoseStatusMeta = (
  status: 'taken' | 'due' | 'upcoming' | 'missed',
  styles: ReturnType<typeof createStyles>
) => {
  switch (status) {
    case 'taken':
      return {
        label: 'Taken',
        badge: styles.doseBadgeTaken,
        badgeText: styles.doseBadgeTextTaken,
      };
    case 'due':
      return {
        label: 'Due now',
        badge: styles.doseBadgeDue,
        badgeText: styles.doseBadgeTextDue,
      };
    case 'missed':
      return {
        label: 'Missed',
        badge: styles.doseBadgeMissed,
        badgeText: styles.doseBadgeTextMissed,
      };
    default:
      return {
        label: 'Upcoming',
        badge: styles.doseBadgeUpcoming,
        badgeText: styles.doseBadgeTextUpcoming,
      };
  }
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const isCompact = windowWidth < 360;
  const sheetMaxHeight = Math.min(windowHeight - 24, 840);
  const reminderWindowMs = 90 * 60 * 1000;

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'completed'>('current');
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [purpose, setPurpose] = useState('');
  const [mealTiming, setMealTiming] = useState<Medication['mealTiming']>({});
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
      setStartDate(new Date().toISOString().split('T')[0]);
    }
  }, [editingId, showForm, startDate]);

  const activeMedications = useMemo(() => {
    const now = new Date();
    return medications.filter((medication) => {
      if (!medication.endDate) return true;
      return now <= new Date(medication.endDate);
    });
  }, [medications]);

  const pastMedications = useMemo(() => {
    const now = new Date();
    return medications.filter((medication) => {
      if (!medication.endDate) return false;
      return now > new Date(medication.endDate);
    });
  }, [medications]);

  const hasDueReminders = useMemo(() => {
    const now = new Date();
    return activeMedications.some(
      (medication) => getDueMedicationReminderSlots(medication, now, reminderWindowMs).length > 0
    );
  }, [activeMedications]);

  const resetForm = () => {
    setName('');
    setDosage('');
    setPurpose('');
    setMealTiming({});
    setStartDate('');
    setEndDate('');
    setEditingId(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
  };

  const handleEdit = (medication: Medication) => {
    setName(medication.name);
    setDosage(formatMedicationDosage(medication.dosage));
    setPurpose(medication.purpose || '');
    setMealTiming(deriveMedicationMealTiming(medication.mealTiming, medication.frequency));
    setStartDate(medication.startDate || '');
    setEndDate(medication.endDate || '');
    setEditingId(medication.id);
    setShowForm(true);
  };

  const handleMealSelection = (meal: MedicationMealKey, selected: boolean) => {
    setMealTiming((prev) => {
      if (!selected) {
        const updated = { ...prev };
        delete updated[meal];
        return updated;
      }
      return { ...prev, [meal]: prev?.[meal] || 'before' };
    });
  };

  const handleMealTimingChange = (meal: MedicationMealKey, value: 'before' | 'after') => {
    setMealTiming((prev) => ({ ...prev, [meal]: value }));
  };

  const handleSave = async () => {
    const selectedMealCount = countMedicationMealTiming(mealTiming);
    if (!name.trim() || !dosage.trim() || selectedMealCount === 0) {
      toast.warning(
        'Missing info',
        'Please fill the medication name, dosage, and at least one meal timing.'
      );
      return;
    }

    setSaving(true);
    try {
      const frequencySummary = formatMedicationMealTimingSummary(mealTiming);
      const medicationData: Medication = {
        id: editingId || createMedicationId(),
        name: name.trim(),
        dosage: normalizeMedicationDosage(dosage),
        purpose: purpose.trim(),
        frequency: frequencySummary,
        mealTiming: selectedMealCount > 0 ? mealTiming : undefined,
        timesPerDay: resolveMedicationTimesPerDay(frequencySummary, selectedMealCount, mealTiming),
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || undefined,
        logs: editingId ? medications.find((item) => item.id === editingId)?.logs || [] : [],
      };

      if (editingId) {
        await onUpdate(medicationData);
      } else {
        await onAdd(medicationData);
      }

      resetForm();
      setShowForm(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to save medication.';
      toast.error('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete medication?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await onDelete(id);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to delete medication.';
            toast.error('Delete failed', message);
          }
        },
      },
    ]);
  };

  const handleLogDose = async (
    medicationId: string,
    taken: boolean,
    slotKey?: MedicationReminderSlot['key']
  ) => {
    if (!onLogDose) return;
    await onLogDose(medicationId, taken, slotKey);
  };

  const getTodayProgress = (medication: Medication) => {
    const doseStates = getMedicationDoseStatesForDate(medication, new Date(), reminderWindowMs);
    if (doseStates.length > 0) {
      const taken = doseStates.filter((dose) => dose.status === 'taken').length;
      const target = doseStates.length;
      return {
        taken,
        target,
        percentage: target > 0 ? Math.min((taken / target) * 100, 100) : 100,
      };
    }

    if (medication.timesPerDay === 0) {
      return { taken: 0, target: 0, percentage: 100 };
    }

    const today = new Date().toDateString();
    const medicationLogs = medication.logs || [];
    const todayLogs = medicationLogs.filter(
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
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
                  <Text style={styles.sheetTitle}>Medications</Text>
                  <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={20} color={themeColors.textPrimary} />
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
                    <MaterialCommunityIcons
                      name={showForm ? 'close' : 'plus'}
                      size={18}
                      color={themeColors.accentStrong}
                    />
                    <Text style={styles.addToggleText}>
                      {showForm ? 'Close Form' : '+ Add Medication'}
                    </Text>
                  </Pressable>

                  {hasDueReminders && !showForm ? (
                    <View style={styles.reminderCard}>
                      <View style={styles.reminderHeader}>
                        <Text style={styles.reminderTitle}>Medication reminders</Text>
                        <MaterialCommunityIcons
                          name="pill"
                          size={18}
                          color={themeColors.warningText}
                        />
                      </View>
                      <Text style={styles.reminderText}>
                        You have one or more medication slots due right now. Open a card below to
                        mark each dose taken.
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
                          placeholderTextColor={themeColors.textTertiary}
                          style={styles.input}
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Dosage</Text>
                        <TextInput
                          value={dosage}
                          onChangeText={setDosage}
                          placeholder="e.g., 500mg"
                          placeholderTextColor={themeColors.textTertiary}
                          style={styles.input}
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Purpose (optional)</Text>
                        <TextInput
                          value={purpose}
                          onChangeText={setPurpose}
                          placeholder="e.g., Pain relief"
                          placeholderTextColor={themeColors.textTertiary}
                          style={styles.input}
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Meal timing</Text>
                        <View style={styles.mealList}>
                          {MEDICATION_MEAL_OPTIONS.map((meal) => {
                            const selected = Boolean(mealTiming?.[meal.key]);
                            const timingValue = mealTiming?.[meal.key] || 'before';
                            return (
                              <View
                                key={meal.key}
                                style={[styles.mealCard, selected && styles.mealCardActive]}
                              >
                                <Pressable
                                  style={styles.mealCardHeader}
                                  onPress={() => handleMealSelection(meal.key, !selected)}
                                >
                                  <View
                                    style={[
                                      styles.mealCheckbox,
                                      selected && styles.mealCheckboxActive,
                                    ]}
                                  >
                                    {selected ? (
                                      <MaterialCommunityIcons name="check" size={14} color="#fff" />
                                    ) : null}
                                  </View>
                                  <View style={styles.mealCardCopy}>
                                    <Text style={styles.mealCardTitle}>{meal.label}</Text>
                                    <Text style={styles.mealCardHint}>
                                      {selected
                                        ? 'Choose when to take it around this meal.'
                                        : 'Tap to add this meal slot.'}
                                    </Text>
                                  </View>
                                </Pressable>

                                {selected ? (
                                  <View style={styles.mealTimingRow}>
                                    <Pressable
                                      onPress={() => handleMealTimingChange(meal.key, 'before')}
                                      style={[
                                        styles.mealTimingButton,
                                        timingValue === 'before' &&
                                          styles.mealTimingButtonActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.mealTimingButtonText,
                                          timingValue === 'before' &&
                                            styles.mealTimingButtonTextActive,
                                        ]}
                                      >
                                        Before meal
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      onPress={() => handleMealTimingChange(meal.key, 'after')}
                                      style={[
                                        styles.mealTimingButton,
                                        timingValue === 'after' &&
                                          styles.mealTimingButtonActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.mealTimingButtonText,
                                          timingValue === 'after' &&
                                            styles.mealTimingButtonTextActive,
                                        ]}
                                      >
                                        After meal
                                      </Text>
                                    </Pressable>
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                        <Text style={styles.scheduleHelper}>
                          Select every meal this medicine is tied to. The app will track doses by
                          meal slot.
                        </Text>
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Start date</Text>
                        <Pressable
                          style={styles.dateSelector}
                          onPress={() => setShowStartPicker((prev) => !prev)}
                        >
                          <MaterialCommunityIcons
                            name="calendar-month-outline"
                            size={18}
                            color={themeColors.accentStrong}
                          />
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
                                    [startDate]: {
                                      selected: true,
                                      selectedColor: themeColors.accentStrong,
                                    },
                                  }
                                : undefined
                            }
                            theme={{
                              todayTextColor: themeColors.accentStrong,
                              selectedDayBackgroundColor: themeColors.accentStrong,
                              arrowColor: themeColors.accentStrong,
                              textDayFontWeight: '500',
                              textMonthFontWeight: '700',
                            }}
                          />
                        ) : null}
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>End date (optional)</Text>
                        <View style={[styles.endDateRow, isCompact && styles.endDateRowStacked]}>
                          <Pressable
                            style={[styles.dateSelector, styles.endDateSelector]}
                            onPress={() => setShowEndPicker((prev) => !prev)}
                          >
                            <MaterialCommunityIcons
                              name="calendar-month-outline"
                              size={18}
                              color={themeColors.accentStrong}
                            />
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
                                    [endDate]: {
                                      selected: true,
                                      selectedColor: themeColors.accentStrong,
                                    },
                                  }
                                : undefined
                            }
                            theme={{
                              todayTextColor: themeColors.accentStrong,
                              selectedDayBackgroundColor: themeColors.accentStrong,
                              arrowColor: themeColors.accentStrong,
                              textDayFontWeight: '500',
                              textMonthFontWeight: '700',
                            }}
                          />
                        ) : null}
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
                            {saving
                              ? editingId
                                ? 'Updating...'
                                : 'Saving...'
                              : editingId
                              ? 'Update'
                              : 'Save'}
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
                              isCompact && styles.segmentLabelCompact,
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
                              isCompact && styles.segmentLabelCompact,
                              activeTab === 'completed' && styles.segmentLabelActive,
                            ]}
                          >
                            Completed ({pastMedications.length})
                          </Text>
                        </Pressable>
                      </View>

                      {activeTab === 'current' ? (
                        activeMedications.length === 0 ? (
                          <EmptyStatePreset preset="medications" />
                        ) : (
                          activeMedications.map((medication) => {
                            const progress = getTodayProgress(medication);
                            const daysRemaining = getDaysRemaining(medication);
                            const doseStates = getMedicationDoseStatesForDate(
                              medication,
                              new Date(),
                              reminderWindowMs
                            );
                            const hasStructuredDoseStates = doseStates.length > 0;
                            const remainingStructuredDoses = doseStates.filter(
                              (dose) => dose.status !== 'taken'
                            );
                            const frequencyLabel =
                              formatMedicationFrequencyLabel(
                                medication.frequency,
                                medication.mealTiming
                              ) || 'Schedule not set';

                            return (
                              <View key={medication.id} style={styles.medCard}>
                                <View style={styles.medHeader}>
                                  <View style={styles.medInfo}>
                                    <Text style={styles.medName}>{medication.name}</Text>
                                    <Text style={styles.medMeta}>
                                      {formatMedicationDosage(medication.dosage) || '—'} •{' '}
                                      {frequencyLabel}
                                      {medication.purpose ? ` • ${medication.purpose}` : ''}
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
                                    <Pressable onPress={() => handleEdit(medication)} hitSlop={10}>
                                      <MaterialCommunityIcons
                                        name="square-edit-outline"
                                        size={18}
                                        color={themeColors.accentStrong}
                                      />
                                    </Pressable>
                                    <Pressable
                                      onPress={() => handleDelete(medication.id)}
                                      hitSlop={10}
                                    >
                                      <MaterialCommunityIcons
                                        name="trash-can-outline"
                                        size={18}
                                        color={themeColors.dangerText}
                                      />
                                    </Pressable>
                                  </View>
                                </View>

                                {medication.timesPerDay !== 0 ? (
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

                                    {hasStructuredDoseStates ? (
                                      <View style={styles.doseList}>
                                        <Text style={styles.doseListLabel}>Today's doses</Text>
                                        {doseStates.map((dose) => {
                                          const statusMeta = getDoseStatusMeta(dose.status, styles);
                                          return (
                                            <View
                                              key={`${medication.id}-${dose.key}`}
                                              style={styles.doseRow}
                                            >
                                              <View style={styles.doseCopy}>
                                                <Text style={styles.doseTitle}>{dose.label}</Text>
                                                <Text style={styles.doseMeta}>
                                                  {dose.context} at {formatDoseTime(dose.slotTime)}
                                                </Text>
                                              </View>
                                              <View style={styles.doseActions}>
                                                <View
                                                  style={[
                                                    styles.doseBadge,
                                                    statusMeta.badge,
                                                  ]}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.doseBadgeText,
                                                      statusMeta.badgeText,
                                                    ]}
                                                  >
                                                    {statusMeta.label}
                                                  </Text>
                                                </View>
                                                {dose.status !== 'taken' && onLogDose ? (
                                                  <Pressable
                                                    style={styles.logSlotButton}
                                                    onPress={() =>
                                                      handleLogDose(
                                                        medication.id,
                                                        true,
                                                        dose.key
                                                      )
                                                    }
                                                  >
                                                    <Text style={styles.logSlotButtonText}>
                                                      Mark taken
                                                    </Text>
                                                  </Pressable>
                                                ) : null}
                                              </View>
                                            </View>
                                          );
                                        })}
                                        {remainingStructuredDoses.length === 0 ? (
                                          <Text style={styles.allDoneText}>
                                            All doses completed today
                                          </Text>
                                        ) : null}
                                      </View>
                                    ) : progress.taken < progress.target && onLogDose ? (
                                      <Pressable
                                        style={styles.logButton}
                                        onPress={() => handleLogDose(medication.id, true)}
                                      >
                                        <Text style={styles.logButtonText}>Mark dose taken</Text>
                                      </Pressable>
                                    ) : null}

                                    {progress.percentage === 100 && !hasStructuredDoseStates ? (
                                      <Text style={styles.allDoneText}>
                                        All doses completed today
                                      </Text>
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })
                        )
                      ) : pastMedications.length === 0 ? (
                        <EmptyState
                          icon="check-circle-outline"
                          title="No completed courses yet"
                        />
                      ) : (
                        pastMedications.map((medication) => (
                          <View key={medication.id} style={[styles.medCard, styles.medCardPast]}>
                            <View style={styles.medHeader}>
                              <View style={styles.medInfo}>
                                <Text style={[styles.medName, styles.medNamePast]}>
                                  {medication.name}
                                </Text>
                                <Text style={styles.medMeta}>
                                  {formatMedicationDosage(medication.dosage) || '—'} •{' '}
                                  {formatMedicationFrequencyLabel(
                                    medication.frequency,
                                    medication.mealTiming
                                  ) || '—'}
                                  {medication.purpose ? ` • ${medication.purpose}` : ''}
                                </Text>
                                {medication.endDate ? (
                                  <Text style={styles.medSub}>
                                    Ended on{' '}
                                    {new Date(medication.endDate).toLocaleDateString('en-US')}
                                  </Text>
                                ) : null}
                              </View>
                              <View style={styles.cardActions}>
                                <Pressable onPress={() => handleEdit(medication)} hitSlop={10}>
                                  <MaterialCommunityIcons
                                    name="eye-outline"
                                    size={18}
                                    color={themeColors.accentStrong}
                                  />
                                </Pressable>
                                <Pressable
                                  onPress={() => handleDelete(medication.id)}
                                  hitSlop={10}
                                >
                                  <MaterialCommunityIcons
                                    name="trash-can-outline"
                                    size={18}
                                    color={themeColors.dangerText}
                                  />
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
            </MotiView>
          </KeyboardAvoidingView>
        </View>
      </BlurView>
    </Modal>
  );
}

function createStyles(themeColors: AppThemeColors) {
  return StyleSheet.create({
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
    backgroundColor: themeColors.surfaceMuted,
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
    borderBottomColor: themeColors.border,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.surfaceElevated,
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
    borderColor: themeColors.border,
    paddingVertical: 12,
    backgroundColor: themeColors.surface,
  },
  addToggleActive: {
    borderColor: themeColors.accentStrong,
  },
  addToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.accentStrong,
  },
  reminderCard: {
    backgroundColor: themeColors.warningSurface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: themeColors.warning,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.warningText,
  },
  reminderText: {
    fontSize: 12,
    color: themeColors.warningText,
    marginTop: 6,
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    gap: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: themeColors.textPrimary,
    backgroundColor: themeColors.inputBackground,
  },
  mealList: {
    gap: 10,
  },
  mealCard: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 16,
    backgroundColor: themeColors.inputBackground,
    padding: 12,
    gap: 10,
  },
  mealCardActive: {
    borderColor: themeColors.accentStrong,
    backgroundColor: themeColors.accentSoft,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: themeColors.borderStrong,
    backgroundColor: themeColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealCheckboxActive: {
    borderColor: themeColors.accent,
    backgroundColor: themeColors.accent,
  },
  mealCardCopy: {
    flex: 1,
    gap: 2,
  },
  mealCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  mealCardHint: {
    fontSize: 12,
    color: themeColors.textSecondary,
    lineHeight: 17,
  },
  mealTimingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mealTimingButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.borderStrong,
    backgroundColor: themeColors.surface,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTimingButtonActive: {
    borderColor: themeColors.accent,
    backgroundColor: themeColors.accent,
  },
  mealTimingButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  mealTimingButtonTextActive: {
    color: themeColors.accentContrast,
  },
  scheduleHelper: {
    fontSize: 12,
    lineHeight: 18,
    color: themeColors.textSecondary,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: themeColors.inputBackground,
  },
  dateSelectorText: {
    fontSize: 15,
    color: themeColors.textPrimary,
  },
  endDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  endDateRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  endDateSelector: {
    flex: 1,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.accentStrong,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  formActionsStacked: {
    flexDirection: 'column',
  },
  secondaryAction: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.borderStrong,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.surface,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  primaryAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.accent,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.accentContrast,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 14,
    backgroundColor: themeColors.backgroundMuted,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: themeColors.surface,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.textSecondary,
  },
  segmentLabelCompact: {
    fontSize: 12,
  },
  segmentLabelActive: {
    color: themeColors.textPrimary,
  },
  medCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: themeColors.border,
    padding: 16,
    gap: 14,
  },
  medCardPast: {
    opacity: 0.88,
  },
  medHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  medInfo: {
    flex: 1,
    gap: 4,
  },
  medName: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  medNamePast: {
    color: themeColors.textSecondary,
  },
  medMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: themeColors.textSecondary,
  },
  medSub: {
    fontSize: 12,
    color: themeColors.accentStrong,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBlock: {
    gap: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.accentStrong,
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: themeColors.backgroundMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: themeColors.accent,
    borderRadius: 999,
  },
  progressFillDone: {
    backgroundColor: themeColors.success,
  },
  doseList: {
    gap: 8,
  },
  doseListLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: themeColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  doseRow: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  doseCopy: {
    gap: 2,
  },
  doseTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  doseMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: themeColors.textSecondary,
  },
  doseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  doseBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  doseBadgeTaken: {
    backgroundColor: themeColors.successSurface,
    borderColor: themeColors.success,
  },
  doseBadgeTextTaken: {
    color: themeColors.success,
  },
  doseBadgeDue: {
    backgroundColor: themeColors.warningSurface,
    borderColor: themeColors.warning,
  },
  doseBadgeTextDue: {
    color: themeColors.warningText,
  },
  doseBadgeUpcoming: {
    backgroundColor: themeColors.backgroundMuted,
    borderColor: themeColors.borderStrong,
  },
  doseBadgeTextUpcoming: {
    color: themeColors.textSecondary,
  },
  doseBadgeMissed: {
    backgroundColor: themeColors.dangerSurface,
    borderColor: themeColors.dangerBorder,
  },
  doseBadgeTextMissed: {
    color: themeColors.dangerText,
  },
  doseBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  logSlotButton: {
    borderRadius: 10,
    backgroundColor: themeColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logSlotButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: themeColors.accentContrast,
  },
  logButton: {
    borderRadius: 12,
    backgroundColor: themeColors.accent,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.accentContrast,
  },
  allDoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.success,
  },
  pastNote: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  });
}
