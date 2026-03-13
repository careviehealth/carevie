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
import { Calendar, type DateData } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
import { toast } from '@/lib/toast';
import { EmptyState, EmptyStatePreset } from '@/components/EmptyState';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';

export type Appointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  [key: string]: string;
};

type Props = {
  visible: boolean;
  appointments: Appointment[];
  onClose: () => void;
  onAddAppointment: (appointment: Appointment) => Promise<void> | void;
  onDeleteAppointment: (id: string) => Promise<void> | void;
};

type TimeParts = {
  hour: string;
  minute: string;
  period: 'AM' | 'PM' | '';
};

type AppointmentDetailField = {
  name: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

const appointmentTypeFields: Record<string, AppointmentDetailField[]> = {
  'Doctor Visit': [
    { name: 'doctorName', label: 'Doctor name', placeholder: 'Enter doctor name' },
    { name: 'specialty', label: 'Specialty', placeholder: 'e.g., Cardiologist' },
    { name: 'hospitalName', label: 'Hospital/Clinic', placeholder: 'Enter hospital or clinic' },
    { name: 'reason', label: 'Reason for visit', placeholder: 'Enter reason' },
  ],
  'Lab Test': [
    { name: 'testName', label: 'Test name', placeholder: 'e.g., Blood Test' },
    { name: 'labName', label: 'Lab name', placeholder: 'Enter lab name' },
    { name: 'instructions', label: 'Instructions', placeholder: 'Any pre-test instructions', multiline: true },
  ],
  Hospital: [
    { name: 'hospitalName', label: 'Hospital name', placeholder: 'Enter hospital name' },
    { name: 'department', label: 'Department', placeholder: 'e.g., Cardiology' },
    { name: 'reason', label: 'Reason for admission', placeholder: 'Enter reason' },
  ],
  Therapy: [
    { name: 'therapyType', label: 'Type of therapy', placeholder: 'e.g., Physical Therapy' },
    { name: 'therapistName', label: 'Therapist name', placeholder: 'Enter therapist name' },
    { name: 'location', label: 'Location', placeholder: 'Enter clinic/location' },
  ],
  'Follow-up': [
    { name: 'previousDoctor', label: 'Doctor name', placeholder: 'Enter doctor name' },
    { name: 'previousVisitReason', label: 'Previous visit reason', placeholder: 'What was the previous visit for?' },
    { name: 'hospitalName', label: 'Hospital/Clinic', placeholder: 'Enter hospital or clinic' },
  ],
  Other: [
    { name: 'description', label: 'Description', placeholder: 'Describe the appointment', multiline: true },
    { name: 'contactPerson', label: 'Contact person', placeholder: 'Enter contact person name' },
  ],
};

const typeOptions = Object.keys(appointmentTypeFields);

const to24HourTime = (hour: string, minute: string, period: TimeParts['period']) => {
  if (!hour || !minute || !period) return '';
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) return '';

  let hour24 = parsedHour;
  if (period === 'AM') {
    hour24 = parsedHour === 12 ? 0 : parsedHour;
  } else if (period === 'PM') {
    hour24 = parsedHour === 12 ? 12 : parsedHour + 12;
  }

  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
};

const from24HourTime = (time: string): TimeParts => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return { hour: '', minute: '', period: '' };

  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24)) return { hour: '', minute: '', period: '' };

  const period: TimeParts['period'] = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    hour: String(hour12).padStart(2, '0'),
    minute,
    period,
  };
};

const clampTimePart = (value: string, max: number) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number(digits);
  if (!Number.isFinite(numeric)) return '';
  return String(Math.min(numeric, max));
};

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Select date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTimeLabel = (timeStr: string) => {
  const parts = from24HourTime(timeStr);
  if (!parts.hour || !parts.minute || !parts.period) return 'Select time';
  return `${parts.hour}:${parts.minute} ${parts.period}`;
};

const createAppointmentId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function AppointmentsModal({
  visible,
  appointments,
  onClose,
  onAddAppointment,
  onDeleteAppointment,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const isCompact = windowWidth < 360;
  const sheetMaxHeight = Math.min(windowHeight - 24, 760);
  const eventSheetMaxHeight = Math.min(windowHeight - 20, 820);
  const todayDate = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    type: '',
  });
  const [eventTime, setEventTime] = useState<TimeParts>({ hour: '', minute: '', period: '' });
  const [additionalFields, setAdditionalFields] = useState<Record<string, string>>({});
  const [selectedEvent, setSelectedEvent] = useState<Appointment | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedDate(todayDate);
    setViewMode('list');
  }, [todayDate, visible]);

  useEffect(() => {
    if (visible) return;
    setShowEventModal(false);
    setSelectedEvent(null);
  }, [visible]);

  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter((apt) => {
        const aptDate = new Date(`${apt.date}T${apt.time || '00:00'}`);
        return aptDate >= new Date();
      })
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
        return dateA.getTime() - dateB.getTime();
      });
  }, [appointments]);

  const selectedDayAppointments = useMemo(
    () => appointments.filter((apt) => apt.date === selectedDate),
    [appointments, selectedDate]
  );

  const appointmentDates = useMemo(() => new Set(appointments.map((apt) => apt.date)), [appointments]);
  const isPastDate = (dateStr: string) => dateStr < todayDate;

  const openAddModal = (dateOverride?: string) => {
    const baseDate = dateOverride || new Date().toISOString().split('T')[0];
    if (baseDate < todayDate) {
      toast.warning('Past date', 'You can only add appointments for future dates.');
      return;
    }
    setEventForm({
      title: '',
      date: baseDate,
      time: '',
      type: '',
    });
    setEventTime({ hour: '', minute: '', period: '' });
    setAdditionalFields({});
    setSelectedEvent(null);
    setShowDatePicker(false);
    setShowEventModal(true);
  };

  const openEditModal = (appointment: Appointment) => {
    setSelectedEvent(appointment);
    setEventForm({
      title: appointment.title,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type,
    });
    setEventTime(from24HourTime(appointment.time));
    const typeFields =
      appointmentTypeFields[appointment.type as keyof typeof appointmentTypeFields] || [];
    const fields: Record<string, string> = {};
    typeFields.forEach((field) => {
      fields[field.name] = appointment[field.name] || '';
    });
    setAdditionalFields(fields);
    setShowDatePicker(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (selectedEvent && selectedEvent.date < todayDate) {
      return;
    }
    if (!eventForm.title.trim()) {
      toast.warning('Missing title', 'Please enter the event name.');
      return;
    }
    if (!eventForm.date || eventForm.date < todayDate) {
      toast.warning('Invalid date', 'Please select a future date for the appointment.');
      return;
    }
    if (!eventTime.hour || !eventTime.minute || !eventTime.period) {
      toast.warning('Missing time', 'Please select a time for the appointment.');
      return;
    }
    if (!eventForm.type) {
      toast.warning('Missing type', 'Please select an appointment type.');
      return;
    }

    const appointmentTime = to24HourTime(eventTime.hour, eventTime.minute, eventTime.period);
    const appointmentDateTime = new Date(`${eventForm.date}T${appointmentTime}`);
    if (appointmentDateTime <= new Date()) {
      toast.warning('Invalid time', 'Please select a future date and time for the appointment.');
      return;
    }

    const payload: Appointment = {
      id: selectedEvent?.id || createAppointmentId(),
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: appointmentTime,
      type: eventForm.type,
      ...additionalFields,
    };

    try {
      await onAddAppointment(payload);
      setShowEventModal(false);
      setSelectedEvent(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to save appointment.';
      toast.error('Save failed', message);
    }
  };

  const handleDeleteEvent = (appointmentId: string) => {
    Alert.alert('Delete appointment?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await onDeleteAppointment(appointmentId);
            setShowEventModal(false);
            setSelectedEvent(null);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to delete appointment.';
            toast.error('Delete failed', message);
          }
        },
      },
    ]);
  };

  const handleDateSelect = (date: DateData) => {
    setSelectedDate(date.dateString);
  };

  const updateTime = (next: Partial<TimeParts>) => {
    setEventTime((prev) => {
      const updated = { ...prev, ...next };
      setEventForm((form) => ({
        ...form,
        time: to24HourTime(updated.hour, updated.minute, updated.period),
      }));
      return updated;
    });
  };

  const currentTypeFields =
    appointmentTypeFields[eventForm.type as keyof typeof appointmentTypeFields] || [];

  const isSelectedDateInPast = isPastDate(selectedDate);
  const isReadOnlyPastEvent = Boolean(selectedEvent && isPastDate(selectedEvent.date));

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
                  <Text style={styles.sheetTitle}>Appointments</Text>
                  <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={20} color={themeColors.textPrimary} />
                  </Pressable>
                </View>

                <View style={styles.segmented}>
                  <Pressable
                    onPress={() => setViewMode('list')}
                    style={[
                      styles.segmentButton,
                      viewMode === 'list' && styles.segmentButtonActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="view-list"
                      size={16}
                      color={viewMode === 'list' ? themeColors.accentStrong : themeColors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        isCompact && styles.segmentLabelCompact,
                        viewMode === 'list' && styles.segmentLabelActive,
                      ]}
                    >
                      List
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setViewMode('calendar')}
                    style={[
                      styles.segmentButton,
                      viewMode === 'calendar' && styles.segmentButtonActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={16}
                      color={
                        viewMode === 'calendar' ? themeColors.accentStrong : themeColors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        isCompact && styles.segmentLabelCompact,
                        viewMode === 'calendar' && styles.segmentLabelActive,
                      ]}
                    >
                      Calendar
                    </Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.sheetBody}
                  contentContainerStyle={styles.sheetContent}
                  showsVerticalScrollIndicator={false}
                >
                  {viewMode === 'list' ? (
                    <>
                      {upcomingAppointments.length === 0 ? (
                        <EmptyStatePreset preset="appointments" />
                      ) : (
                        upcomingAppointments.map((apt) => (
                          <Pressable
                            key={apt.id}
                            style={({ pressed }) => [
                              styles.appointmentCard,
                              pressed && styles.appointmentCardPressed,
                            ]}
                            onPress={() => openEditModal(apt)}
                          >
                            <View style={styles.cardHeader}>
                              <View style={styles.typeBadge}>
                                <Text style={styles.typeBadgeText}>{apt.type}</Text>
                              </View>
                              <Pressable
                                onPress={() => handleDeleteEvent(apt.id)}
                                hitSlop={10}
                              >
                                <MaterialCommunityIcons
                                  name="trash-can-outline"
                                  size={18}
                                  color={themeColors.dangerText}
                                />
                              </Pressable>
                            </View>
                            <Text style={styles.appointmentTitle}>{apt.title}</Text>
                            <View style={styles.detailRow}>
                              <MaterialCommunityIcons
                                name="calendar-month"
                                size={16}
                                color={themeColors.accentStrong}
                              />
                              <Text style={styles.detailText}>{formatDateLabel(apt.date)}</Text>
                            </View>
                            <View style={styles.detailRow}>
                              <MaterialCommunityIcons
                                name="clock-outline"
                                size={16}
                                color={themeColors.accentStrong}
                              />
                              <Text style={styles.detailText}>{formatTimeLabel(apt.time)}</Text>
                            </View>
                          </Pressable>
                        ))
                      )}
                      <Pressable style={styles.addButton} onPress={() => openAddModal()}>
                        <MaterialCommunityIcons
                          name="plus"
                          size={18}
                          color={themeColors.accentStrong}
                        />
                        <Text style={styles.addButtonText}>Add New Appointment</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Calendar
                        onDayPress={handleDateSelect}
                        theme={{
                          todayTextColor: themeColors.accentStrong,
                          arrowColor: themeColors.accentStrong,
                          textDayFontWeight: '500',
                          textMonthFontWeight: '700',
                          textDayHeaderFontWeight: '600',
                        }}
                        dayComponent={({ date, state }) => {
                          if (!date) return <View style={styles.dayCell} />;
                          const dateString = date.dateString;
                          const isOutsideMonth = state === 'disabled';
                          const isPast = isPastDate(dateString);
                          const isSelected = dateString === selectedDate;
                          const hasAppointments = appointmentDates.has(dateString);
                          return (
                            <Pressable
                              onPress={() => handleDateSelect(date)}
                              disabled={isOutsideMonth}
                              style={[
                                styles.dayCell,
                                isSelected && styles.dayCellSelected,
                                isOutsideMonth && styles.dayCellOutside,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayText,
                                  isPast && styles.dayTextPast,
                                  isSelected && styles.dayTextSelected,
                                  isOutsideMonth && styles.dayTextOutside,
                                ]}
                              >
                                {date.day}
                              </Text>
                              {hasAppointments ? (
                                <View style={[styles.dayDot, isPast && styles.dayDotPast]} />
                              ) : null}
                            </Pressable>
                          );
                        }}
                      />
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>
                          {formatDateLabel(selectedDate)}
                        </Text>
                        <Pressable
                          onPress={() => openAddModal(selectedDate)}
                          disabled={isSelectedDateInPast}
                        >
                          <Text
                            style={[
                              styles.sectionAction,
                              isSelectedDateInPast && styles.sectionActionDisabled,
                            ]}
                          >
                            Add
                          </Text>
                        </Pressable>
                      </View>
                      {isSelectedDateInPast ? (
                        <Text style={styles.pastNote}>Past dates are view-only.</Text>
                      ) : null}
                      {selectedDayAppointments.length === 0 ? (
                        <EmptyState icon="calendar-blank-outline" title="No appointments for this date" />
                      ) : (
                        selectedDayAppointments.map((apt) => (
                          <Pressable
                            key={apt.id}
                            style={({ pressed }) => [
                              styles.appointmentCard,
                              pressed && styles.appointmentCardPressed,
                            ]}
                            onPress={() => openEditModal(apt)}
                          >
                            <Text style={styles.appointmentTitle}>{apt.title}</Text>
                            <View style={styles.detailRow}>
                              <MaterialCommunityIcons
                                name="clock-outline"
                                size={16}
                                color={themeColors.accentStrong}
                              />
                              <Text style={styles.detailText}>{formatTimeLabel(apt.time)}</Text>
                            </View>
                            <View style={styles.typeBadgeCompact}>
                              <Text style={styles.typeBadgeText}>{apt.type}</Text>
                            </View>
                          </Pressable>
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

      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
      >
        <View style={styles.eventOverlay}>
          <KeyboardAvoidingView
            style={styles.eventKeyboardWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <MotiView
              from={{ translateY: 100, opacity: 0.5 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            >
              <View style={[styles.eventSheet, { maxHeight: eventSheetMaxHeight }]}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>
                    {selectedEvent ? 'Edit Appointment' : 'Add Appointment'}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setShowEventModal(false);
                      setSelectedEvent(null);
                    }}
                    style={styles.closeButton}
                  >
                    <MaterialCommunityIcons name="close" size={20} color={themeColors.textPrimary} />
                  </Pressable>
                </View>
                <ScrollView
                  contentContainerStyle={styles.eventContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                {isReadOnlyPastEvent ? (
                  <View style={styles.readOnlyBanner}>
                    <Text style={styles.readOnlyText}>
                      This appointment is in the past and cannot be edited.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Event name</Text>
                  <TextInput
                    value={eventForm.title}
                    onChangeText={(value) => setEventForm((prev) => ({ ...prev, title: value }))}
                    placeholder="e.g., Doctor visit"
                    placeholderTextColor={themeColors.textTertiary}
                    style={[styles.input, isReadOnlyPastEvent && styles.inputDisabled]}
                    editable={!isReadOnlyPastEvent}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Date</Text>
                  <Pressable
                    style={[styles.dateSelector, isReadOnlyPastEvent && styles.inputDisabled]}
                    onPress={() => {
                      if (isReadOnlyPastEvent) return;
                      setShowDatePicker((prev) => !prev);
                    }}
                    disabled={isReadOnlyPastEvent}
                  >
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={18}
                      color={themeColors.accentStrong}
                    />
                    <Text style={styles.dateSelectorText}>{formatDateLabel(eventForm.date)}</Text>
                  </Pressable>
                  {showDatePicker && !isReadOnlyPastEvent && (
                    <Calendar
                      onDayPress={(day) => {
                        if (day.dateString < todayDate) return;
                        setEventForm((prev) => ({ ...prev, date: day.dateString }));
                        setShowDatePicker(false);
                      }}
                      minDate={todayDate}
                      disableAllTouchEventsForDisabledDays
                      markedDates={{
                        [eventForm.date]: {
                          selected: true,
                          selectedColor: themeColors.accentStrong,
                        },
                      }}
                      theme={{
                        todayTextColor: themeColors.accentStrong,
                        selectedDayBackgroundColor: themeColors.accentStrong,
                        arrowColor: themeColors.accentStrong,
                        textDayFontWeight: '500',
                        textMonthFontWeight: '700',
                      }}
                    />
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Time</Text>
                  <View style={styles.timeRow}>
                    <TextInput
                      value={eventTime.hour}
                      onChangeText={(value) => updateTime({ hour: clampTimePart(value, 12) })}
                      placeholder="HH"
                      placeholderTextColor={themeColors.textTertiary}
                      keyboardType="number-pad"
                      maxLength={2}
                      style={[styles.timeInput, isReadOnlyPastEvent && styles.inputDisabled]}
                      editable={!isReadOnlyPastEvent}
                    />
                    <Text style={styles.timeSeparator}>:</Text>
                    <TextInput
                      value={eventTime.minute}
                      onChangeText={(value) => updateTime({ minute: clampTimePart(value, 59) })}
                      placeholder="MM"
                      placeholderTextColor={themeColors.textTertiary}
                      keyboardType="number-pad"
                      maxLength={2}
                      style={[styles.timeInput, isReadOnlyPastEvent && styles.inputDisabled]}
                      onBlur={() => {
                        if (!eventTime.minute) return;
                        updateTime({ minute: eventTime.minute.padStart(2, '0') });
                      }}
                      editable={!isReadOnlyPastEvent}
                    />
                    <View style={styles.periodColumn}>
                      {(['AM', 'PM'] as const).map((period) => (
                        <Pressable
                          key={period}
                          onPress={() => updateTime({ period })}
                          disabled={isReadOnlyPastEvent}
                          style={[
                            styles.periodButton,
                            eventTime.period === period && styles.periodButtonActive,
                            isReadOnlyPastEvent && styles.inputDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.periodLabel,
                              eventTime.period === period && styles.periodLabelActive,
                            ]}
                          >
                            {period}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <Text style={styles.timeHint}>{formatTimeLabel(eventForm.time)}</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Type</Text>
                  <View style={styles.typeGrid}>
                    {typeOptions.map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => {
                          setEventForm((prev) => ({ ...prev, type }));
                          setAdditionalFields({});
                        }}
                        disabled={isReadOnlyPastEvent}
                        style={[
                          styles.typeChip,
                          eventForm.type === type && styles.typeChipActive,
                          isReadOnlyPastEvent && styles.inputDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            eventForm.type === type && styles.typeChipTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {currentTypeFields.length > 0 && (
                  <View style={styles.extraFields}>
                    <Text style={styles.extraTitle}>Additional details</Text>
                    {currentTypeFields.map((field) => (
                      <View key={field.name} style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{field.label}</Text>
                        <TextInput
                          value={additionalFields[field.name] || ''}
                          onChangeText={(value) =>
                            setAdditionalFields((prev) => ({ ...prev, [field.name]: value }))
                          }
                          placeholder={field.placeholder}
                          placeholderTextColor={themeColors.textTertiary}
                          multiline={Boolean(field.multiline)}
                          style={[
                            styles.input,
                            field.multiline && styles.multiline,
                            isReadOnlyPastEvent && styles.inputDisabled,
                          ]}
                          editable={!isReadOnlyPastEvent}
                        />
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.actionRow}>
                  {selectedEvent && !isReadOnlyPastEvent ? (
                    <Pressable
                      style={[styles.secondaryAction, styles.deleteAction]}
                      onPress={() => handleDeleteEvent(selectedEvent.id)}
                    >
                      <Text style={styles.deleteActionText}>Delete</Text>
                    </Pressable>
                  ) : null}
                  {isReadOnlyPastEvent ? (
                    <Pressable style={styles.primaryAction} onPress={() => setShowEventModal(false)}>
                      <Text style={styles.primaryActionText}>Close</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.primaryAction} onPress={handleSaveEvent}>
                      <Text style={styles.primaryActionText}>
                        {selectedEvent ? 'Update' : 'Add Appointment'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                </ScrollView>
              </View>
            </MotiView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  segmented: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: 'row',
    backgroundColor: themeColors.backgroundMuted,
    borderRadius: 14,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentButtonActive: {
    backgroundColor: themeColors.surface,
    shadowColor: themeColors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  segmentLabelCompact: {
    fontSize: 12,
  },
  segmentLabelActive: {
    color: themeColors.accentStrong,
  },
  sheetBody: {
    paddingHorizontal: 20,
  },
  sheetContent: {
    paddingBottom: 24,
    paddingTop: 16,
    gap: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: themeColors.textSecondary,
    textAlign: 'center',
  },
  appointmentCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    shadowColor: themeColors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 8,
  },
  appointmentCardPressed: {
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    backgroundColor: themeColors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeCompact: {
    alignSelf: 'flex-start',
    backgroundColor: themeColors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  typeBadgeText: {
    color: themeColors.accentContrast,
    fontSize: 11,
    fontWeight: '600',
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: themeColors.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingVertical: 12,
    backgroundColor: themeColors.surface,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.accentStrong,
  },
  sectionHeader: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.accentStrong,
  },
  sectionActionDisabled: {
    color: themeColors.textTertiary,
  },
  pastNote: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    minHeight: 40,
  },
  dayCellSelected: {
    backgroundColor: themeColors.accent,
  },
  dayCellOutside: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textPrimary,
  },
  dayTextPast: {
    color: themeColors.textTertiary,
  },
  dayTextSelected: {
    color: themeColors.accentContrast,
  },
  dayTextOutside: {
    color: themeColors.textTertiary,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: themeColors.accent,
    marginTop: 4,
  },
  dayDotPast: {
    backgroundColor: themeColors.textTertiary,
  },
  eventOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  eventKeyboardWrapper: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  eventSheet: {
    backgroundColor: themeColors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 20,
  },
  eventHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  eventContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: themeColors.textPrimary,
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: themeColors.inputDisabled,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.inputBackground,
  },
  dateSelectorText: {
    fontSize: 14,
    color: themeColors.textPrimary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 14,
    color: themeColors.textPrimary,
  },
  timeSeparator: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  periodColumn: {
    gap: 6,
  },
  periodButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: themeColors.inputBackground,
  },
  periodButtonActive: {
    borderColor: themeColors.accent,
    backgroundColor: themeColors.accent,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  periodLabelActive: {
    color: themeColors.accentContrast,
  },
  timeHint: {
    fontSize: 12,
    color: themeColors.textTertiary,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.inputBackground,
  },
  typeChipActive: {
    borderColor: themeColors.accent,
    backgroundColor: themeColors.accent,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  typeChipTextActive: {
    color: themeColors.accentContrast,
  },
  extraFields: {
    backgroundColor: themeColors.backgroundMuted,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  extraTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  readOnlyBanner: {
    backgroundColor: themeColors.backgroundMuted,
    borderRadius: 12,
    padding: 10,
  },
  readOnlyText: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  primaryAction: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: themeColors.accentContrast,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryAction: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  deleteAction: {
    borderColor: themeColors.dangerBorder,
    backgroundColor: themeColors.dangerSurface,
  },
  deleteActionText: {
    color: themeColors.dangerText,
    fontSize: 13,
    fontWeight: '700',
  },
  });
}
