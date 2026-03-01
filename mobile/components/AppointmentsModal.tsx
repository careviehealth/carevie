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
import { Calendar, type DateData } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

const appointmentTypeFields = {
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
      Alert.alert('Past date', 'You can only add appointments for future dates.');
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
      return Alert.alert('Missing title', 'Please enter the event name.');
    }
    if (!eventForm.date || eventForm.date < todayDate) {
      return Alert.alert('Invalid date', 'Please select a future date for the appointment.');
    }
    if (!eventTime.hour || !eventTime.minute || !eventTime.period) {
      return Alert.alert('Missing time', 'Please select a time for the appointment.');
    }
    if (!eventForm.type) {
      return Alert.alert('Missing type', 'Please select an appointment type.');
    }

    const appointmentTime = to24HourTime(eventTime.hour, eventTime.minute, eventTime.period);
    const appointmentDateTime = new Date(`${eventForm.date}T${appointmentTime}`);
    if (appointmentDateTime <= new Date()) {
      return Alert.alert('Invalid time', 'Please select a future date and time for the appointment.');
    }

    const payload: Appointment = {
      id: selectedEvent?.id || createAppointmentId(),
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: appointmentTime,
      type: eventForm.type,
      ...additionalFields,
    };

    await onAddAppointment(payload);
    setShowEventModal(false);
    setSelectedEvent(null);
  };

  const handleDeleteEvent = (appointmentId: string) => {
    Alert.alert('Delete appointment?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void onDeleteAppointment(appointmentId);
          setShowEventModal(false);
          setSelectedEvent(null);
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
      <View style={styles.modalOverlay}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Appointments</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={20} color="#1f2f33" />
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
                color={viewMode === 'list' ? '#0f766e' : '#6b7f86'}
              />
              <Text
                style={[
                  styles.segmentLabel,
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
                color={viewMode === 'calendar' ? '#0f766e' : '#6b7f86'}
              />
              <Text
                style={[
                  styles.segmentLabel,
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
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="calendar-blank" size={32} color="#c7d3d6" />
                    <Text style={styles.emptyTitle}>No upcoming appointments</Text>
                    <Text style={styles.emptySubtitle}>
                      Tap the button below to schedule one.
                    </Text>
                  </View>
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
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b42318" />
                        </Pressable>
                      </View>
                      <Text style={styles.appointmentTitle}>{apt.title}</Text>
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons name="calendar-month" size={16} color="#0f766e" />
                        <Text style={styles.detailText}>{formatDateLabel(apt.date)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#0f766e" />
                        <Text style={styles.detailText}>{formatTimeLabel(apt.time)}</Text>
                      </View>
                    </Pressable>
                  ))
                )}
                <Pressable style={styles.addButton} onPress={() => openAddModal()}>
                  <MaterialCommunityIcons name="plus" size={18} color="#0f766e" />
                  <Text style={styles.addButtonText}>Add New Appointment</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Calendar
                  onDayPress={handleDateSelect}
                  theme={{
                    todayTextColor: '#0f766e',
                    arrowColor: '#0f766e',
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
                  <Text style={styles.emptySubtitle}>No appointments for this date.</Text>
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
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#0f766e" />
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
      </View>

      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
      >
        <View style={styles.eventOverlay}>
          <View style={styles.eventSheet}>
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
                <MaterialCommunityIcons name="close" size={20} color="#1f2f33" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.eventContent} showsVerticalScrollIndicator={false}>
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
                  placeholderTextColor="#9bb0b5"
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
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#0f766e" />
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
                        selectedColor: '#0f766e',
                      },
                    }}
                    theme={{
                      todayTextColor: '#0f766e',
                      selectedDayBackgroundColor: '#0f766e',
                      arrowColor: '#0f766e',
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
                    placeholderTextColor="#9bb0b5"
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
                    placeholderTextColor="#9bb0b5"
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
                        placeholderTextColor="#9bb0b5"
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
        </View>
      </Modal>
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
    maxHeight: '86%',
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
  segmented: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: 'row',
    backgroundColor: '#eaf0f1',
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
    color: '#1f2f33',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7a8c90',
    textAlign: 'center',
  },
  appointmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e8ea',
    shadowColor: '#9eb0b4',
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
    backgroundColor: '#0f766e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeCompact: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f766e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  typeBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2f33',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#52666b',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b8d0d4',
    paddingVertical: 12,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f766e',
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
    color: '#1f2f33',
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f766e',
  },
  sectionActionDisabled: {
    color: '#9bb0b5',
  },
  pastNote: {
    fontSize: 12,
    color: '#8b9aa0',
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    minHeight: 40,
  },
  dayCellSelected: {
    backgroundColor: '#0f766e',
  },
  dayCellOutside: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2a3a3f',
  },
  dayTextPast: {
    color: '#b5c1c5',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  dayTextOutside: {
    color: '#9fb0b5',
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#0f766e',
    marginTop: 4,
  },
  dayDotPast: {
    backgroundColor: '#b5c1c5',
  },
  eventOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 19, 20, 0.4)',
    justifyContent: 'flex-end',
  },
  eventSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 20,
    maxHeight: '92%',
  },
  eventHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f3',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2f33',
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
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
  },
  dateSelectorText: {
    fontSize: 14,
    color: '#1f2f33',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
    borderRadius: 12,
    paddingVertical: 10,
    textAlign: 'center',
    fontSize: 14,
    color: '#1f2f33',
  },
  timeSeparator: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7c8b90',
  },
  periodColumn: {
    gap: 6,
  },
  periodButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8e3e6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f7fbfb',
  },
  periodButtonActive: {
    borderColor: '#0f766e',
    backgroundColor: '#0f766e',
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7f86',
  },
  periodLabelActive: {
    color: '#ffffff',
  },
  timeHint: {
    fontSize: 12,
    color: '#7a8c90',
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
    borderColor: '#d8e3e6',
    backgroundColor: '#f7fbfb',
  },
  typeChipActive: {
    borderColor: '#0f766e',
    backgroundColor: '#0f766e',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52666b',
  },
  typeChipTextActive: {
    color: '#ffffff',
  },
  extraFields: {
    backgroundColor: '#f1f7f7',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  extraTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2f33',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  readOnlyBanner: {
    backgroundColor: '#f6f7f8',
    borderRadius: 12,
    padding: 10,
  },
  readOnlyText: {
    fontSize: 12,
    color: '#6b7f86',
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  deleteAction: {
    borderColor: '#f2b6b6',
    backgroundColor: '#fff5f5',
  },
  deleteActionText: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '700',
  },
});
