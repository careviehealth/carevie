import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Trash2, Calendar as CalendarIcon, List, Clock, MapPin } from 'lucide-react';

type Appointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  [key: string]: string;
};

type Props = {
  appointments: Appointment[];
  onClose: () => void;
  onAddAppointment: (appointment: Appointment) => void;
  onDeleteAppointment: (id: string) => void;
};

type TimeParts = {
  hour: string;
  minute: string;
  period: string;
};

// Dynamic fields configuration for each appointment type
const appointmentTypeFields = {
  'Doctor Visit': [
    { name: 'doctorName', label: 'Doctor Name', type: 'text', placeholder: 'Enter doctor name' },
    { name: 'specialty', label: 'Specialty', type: 'text', placeholder: 'e.g., Cardiologist' },
    { name: 'hospitalName', label: 'Hospital/Clinic Name', type: 'text', placeholder: 'Enter hospital or clinic name' },
    { name: 'reason', label: 'Reason for Visit', type: 'text', placeholder: 'Enter reason for visit' },
  ],
  'Lab Test': [
    { name: 'testName', label: 'Test Name', type: 'text', placeholder: 'e.g., Blood Test' },
    { name: 'labName', label: 'Lab Name', type: 'text', placeholder: 'Enter lab name' },
    { name: 'instructions', label: 'Instructions', type: 'textarea', placeholder: 'Any pre-test instructions' },
  ],
  'Hospital': [
    { name: 'hospitalName', label: 'Hospital Name', type: 'text', placeholder: 'Enter hospital name' },
    { name: 'department', label: 'Department', type: 'text', placeholder: 'e.g., Cardiology' },
    { name: 'reason', label: 'Reason for Admission', type: 'text', placeholder: 'Enter reason' },
  ],
  'Therapy': [
    { name: 'therapyType', label: 'Type of Therapy', type: 'text', placeholder: 'e.g., Physical Therapy' },
    { name: 'therapistName', label: 'Therapist Name', type: 'text', placeholder: 'Enter therapist name' },
    { name: 'location', label: 'Location', type: 'text', placeholder: 'Enter clinic/location' },
  ],
  'Follow-up': [
    { name: 'previousDoctor', label: 'Doctor Name', type: 'text', placeholder: 'Enter doctor name' },
    { name: 'previousVisitReason', label: 'Previous Visit Reason', type: 'text', placeholder: 'What was the previous visit for?' },
    { name: 'hospitalName', label: 'Hospital/Clinic Name', type: 'text', placeholder: 'Enter hospital or clinic name' },
  ],
  'Other': [
    { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the appointment' },
    { name: 'contactPerson', label: 'Contact Person', type: 'text', placeholder: 'Enter contact person name' },
  ],
};

const to24HourTime = (hour: string, minute: string, period: string) => {
  if (!hour || !minute || !period) return '';
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isFinite(parsedHour)) return '';
  if (!Number.isFinite(parsedMinute)) return '';

  let hour24 = parsedHour;
  if (period === 'AM') {
    hour24 = parsedHour === 12 ? 0 : parsedHour;
  } else if (period === 'PM') {
    hour24 = parsedHour === 12 ? 12 : parsedHour + 12;
  } else {
    return '';
  }

  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
};

const from24HourTime = (time: string): TimeParts => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return { hour: '', minute: '', period: '' };

  const hour24 = Number(match[1]);
  const minute = match[2];

  if (!Number.isFinite(hour24)) return { hour: '', minute: '', period: '' };

  const period = hour24 >= 12 ? 'PM' : 'AM';
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

const parseDateOnly = (dateStr: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return new Date(dateStr);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, month, day);
};

export function AppointmentsModal({
  appointments,
  onClose,
  onAddAppointment,
  onDeleteAppointment,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isClient, setIsClient] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Appointment | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');

  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    type: '',
  });

  const [eventTime, setEventTime] = useState<TimeParts>({
    hour: '',
    minute: '',
    period: '',
  });

  const [additionalFields, setAdditionalFields] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    // Delay client-only calendar rendering to avoid hydration mismatch on date-sensitive UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);
  }, []);

  const displayDate = isClient ? selectedDate : new Date(0);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    return { daysInMonth, startingDayOfWeek };
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(displayDate);

  const previousMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1));
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

  const handleDateClick = (day: number) => {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setEventForm({
      title: '',
      date: dateStr,
      time: '',
      type: '',
    });
    setEventTime({ hour: '', minute: '', period: '' });
    setAdditionalFields({});
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (appointment: Appointment) => {
    setSelectedEvent(appointment);
    setEventForm({
      title: appointment.title,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type,
    });
    setEventTime(from24HourTime(appointment.time));

    const fields: { [key: string]: string } = {};
    const typeFields = appointmentTypeFields[appointment.type as keyof typeof appointmentTypeFields] || [];
    typeFields.forEach((field) => {
      fields[field.name] = appointment[field.name] || '';
    });
    setAdditionalFields(fields);
    setShowEventModal(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventForm.title.trim()) {
      alert('Please enter the event name.');
      return;
    }
    if (!eventTime.hour) {
      alert('Please enter the hour for the appointment time.');
      return;
    }
    if (!eventTime.minute) {
      alert('Please enter the minutes for the appointment time.');
      return;
    }
    if (!eventTime.period) {
      alert('Please select AM or PM for the appointment time.');
      return;
    }
    if (!eventForm.type) {
      alert('Please select an appointment type.');
      return;
    }

    if (eventForm.title && eventForm.date && eventForm.time && eventForm.type) {
      const appointmentDateTime = new Date(`${eventForm.date}T${eventForm.time}`);
      const now = new Date();
      if (appointmentDateTime <= now) {
        alert('Please select a future date and time for the appointment.');
        return;
      }

      const appointmentData: Appointment = {
        id: selectedEvent?.id || crypto.randomUUID(),
        ...eventForm,
        ...additionalFields,
      };

      onAddAppointment(appointmentData);
      setShowEventModal(false);
      setEventForm({ title: '', date: '', time: '', type: '' });
      setEventTime({ hour: '', minute: '', period: '' });
      setAdditionalFields({});
      setSelectedEvent(null);
    }
  };

  const handleDeleteEvent = () => {
    setShowDeleteConfirmation(true);
  };

  const confirmDeleteEvent = () => {
    if (selectedEvent) {
      onDeleteAppointment(selectedEvent.id);
      setShowEventModal(false);
      setSelectedEvent(null);
      setEventForm({ title: '', date: '', time: '', type: '' });
      setEventTime({ hour: '', minute: '', period: '' });
      setAdditionalFields({});
      setShowDeleteConfirmation(false);
    }
  };

  const cancelDeleteEvent = () => {
    setShowDeleteConfirmation(false);
  };

  const getAppointmentsForDate = (day: number) => {
    const dateStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.filter((apt) => apt.date === dateStr);
  };

  const isPastDate = (day: number) => {
    const date = new Date(displayDate.getFullYear(), displayDate.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const upcomingAppointments = appointments
    .filter((apt) => {
      const aptDate = new Date(`${apt.date}T${apt.time}`);
      return aptDate >= new Date();
    })
    .sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateA.getTime() - dateB.getTime();
    });

  const formatDate = (dateStr: string) => {
    const date = parseDateOnly(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    const parts = from24HourTime(timeStr);
    return `${parts.hour}:${parts.minute} ${parts.period}`;
  };

  const currentTypeFields = eventForm.type
    ? appointmentTypeFields[eventForm.type as keyof typeof appointmentTypeFields] || []
    : [];

  const canUsePortal = isClient && typeof document !== 'undefined';
  const renderLayer = (content: React.ReactNode) =>
    canUsePortal ? createPortal(content, document.body) : content;

  return (
    <div className="vytara-theme-content fixed inset-0 flex items-center justify-center p-3 sm:p-4 z-50 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-white p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center rounded-t-2xl sm:rounded-t-3xl flex-shrink-0">
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Appointments</h2>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Toggle */}
            <div className="flex bg-slate-100 rounded-lg p-0.5 sm:p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition flex items-center gap-1 sm:gap-2 ${
                  viewMode === 'list'
                    ? 'bg-white text-teal-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-semibold hidden xs:inline">List</span>
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition flex items-center gap-1 sm:gap-2 ${
                  viewMode === 'calendar'
                    ? 'bg-white text-teal-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-semibold hidden xs:inline">Calendar</span>
              </button>
            </div>
            <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition text-slate-600">
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {viewMode === 'list' ? (
            /* List View */
            <div className="space-y-3 sm:space-y-4">
              {upcomingAppointments.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <CalendarIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-slate-300 mb-3 sm:mb-4" />
                  <p className="text-slate-500 text-base sm:text-lg font-medium">No upcoming appointments</p>
                  <p className="text-slate-400 text-xs sm:text-sm mt-2">
                    Click &quot;Add New Appointment&quot; to schedule one
                  </p>
                </div>
              ) : (
                upcomingAppointments.map((apt) => {
                  const typeFields = appointmentTypeFields[apt.type as keyof typeof appointmentTypeFields] || [];
                  return (
                    <div
                      key={apt.id}
                      onClick={() => handleEventClick(apt)}
                      className="bg-gradient-to-br from-teal-50 to-white border border-teal-200 rounded-xl sm:rounded-2xl p-4 sm:p-6 hover:shadow-lg transition cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <span className="inline-block px-2 sm:px-3 py-0.5 sm:py-1 bg-teal-500 text-white text-[10px] sm:text-xs font-semibold rounded-full mb-2 sm:mb-3">
                            {apt.type}
                          </span>

                          <h3 className="text-base sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3 group-hover:text-teal-600 transition truncate">
                            {apt.title}
                          </h3>

                          <div className="flex flex-wrap gap-2 sm:gap-4 mb-3 sm:mb-4">
                            <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600">
                              <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4 text-teal-500 flex-shrink-0" />
                              <span className="text-xs sm:text-sm font-medium">{formatDate(apt.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600">
                              <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-teal-500 flex-shrink-0" />
                              <span className="text-xs sm:text-sm font-medium">{formatTime(apt.time)}</span>
                            </div>
                          </div>

                          {typeFields.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-3 sm:mt-4">
                              {typeFields.map((field) => {
                                const value = apt[field.name];
                                if (value) {
                                  return (
                                    <div key={field.name} className="flex items-start gap-1.5 sm:gap-2">
                                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-[10px] sm:text-xs text-slate-500 font-medium">{field.label}</p>
                                        <p className="text-xs sm:text-sm text-slate-700 truncate">{value}</p>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(apt);
                            setShowDeleteConfirmation(true);
                          }}
                          className="p-1.5 sm:p-2 hover:bg-red-100 rounded-lg transition text-red-600 flex-shrink-0"
                          title="Delete appointment"
                        >
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              <button
                onClick={() => {
                  const today = new Date();
                  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  setEventForm({
                    title: '',
                    date: dateStr,
                    time: '',
                    type: '',
                  });
                  setEventTime({ hour: '', minute: '', period: '' });
                  setAdditionalFields({});
                  setSelectedEvent(null);
                  setShowEventModal(true);
                }}
                className="w-full py-3 sm:py-4 border-2 border-dashed border-teal-300 rounded-xl sm:rounded-2xl text-teal-600 hover:bg-teal-50 hover:border-teal-400 transition font-semibold text-sm sm:text-base"
              >
                + Add New Appointment
              </button>
            </div>
          ) : (
            /* Calendar View */
            <>
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <button onClick={previousMonth} className="p-1.5 sm:p-2 hover:bg-teal-50 rounded-lg transition text-teal-600">
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <h3 className="text-lg sm:text-2xl font-bold text-slate-900">
                  {displayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <button onClick={nextMonth} className="p-1.5 sm:p-2 hover:bg-teal-50 rounded-lg transition text-teal-600">
                  <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center text-teal-600 p-1 sm:p-2 font-semibold text-[10px] sm:text-sm">
                    {day}
                  </div>
                ))}

                {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                  <div key={`empty-${index}`} className="p-1 sm:p-2" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const dayAppointments = getAppointmentsForDate(day);
                  const past = isPastDate(day);

                  return (
                    <div
                      key={`day-${day}`}
                      className={`p-1 sm:p-2 border rounded-lg sm:rounded-xl min-h-[60px] sm:min-h-[90px] cursor-pointer transition ${
                        past
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : dayAppointments.length > 0
                          ? 'bg-teal-50 border-teal-300 hover:border-teal-500 hover:bg-teal-100'
                          : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                      }`}
                      onClick={() => {
                        if (!past) handleDateClick(day);
                      }}
                    >
                      <div className={`text-[10px] sm:text-sm font-semibold mb-0.5 sm:mb-1 ${past ? 'text-slate-400' : 'text-slate-900'}`}>
                        {day}
                      </div>

                      {dayAppointments.map((apt) => (
                        <div
                          key={apt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(apt);
                          }}
                          className="text-[9px] sm:text-xs bg-teal-500 text-white rounded-md px-1 sm:px-2 py-0.5 sm:py-1 mt-0.5 truncate hover:bg-teal-600 transition cursor-pointer font-medium"
                          title={`${apt.title} at ${apt.time}`}
                        >
                          <span className="hidden sm:inline">{apt.time} - </span>
                          {apt.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Event Modal */}
      {showEventModal && renderLayer(
        <div className="vytara-theme-content fixed inset-0 flex items-center justify-center p-3 sm:p-4 z-[60] bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-[28px] max-w-md w-full my-4 sm:my-8 border border-slate-200 bg-white shadow-2xl">
            <div className="relative z-10">
              <div className="p-4 sm:p-6 border-b border-slate-200 bg-white flex justify-between items-center">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  {selectedEvent ? 'Edit Appointment' : 'Add Appointment'}
                </h3>
                <button
                  onClick={() => {
                    setShowEventModal(false);
                    setSelectedEvent(null);
                    setEventForm({ title: '', date: '', time: '', type: '' });
                    setEventTime({ hour: '', minute: '', period: '' });
                    setAdditionalFields({});
                  }}
                  className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition text-slate-600"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveEvent} className="p-4 sm:p-6 space-y-3 sm:space-y-4 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto">
                <div>
                  <label htmlFor="event-name" className="block text-slate-700 mb-1.5 sm:mb-2 font-semibold text-xs sm:text-sm">
                    Event Name
                  </label>
                  <input
                    id="event-name"
                    type="text"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none text-sm sm:text-base"
                    placeholder="e.g., Doctor Visit"
                    autoComplete="off"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="event-date" className="block text-slate-700 mb-1.5 sm:mb-2 font-semibold text-xs sm:text-sm">
                    Event Date
                  </label>
                  <input
                    id="event-date"
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none bg-white text-sm sm:text-base"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1.5 sm:mb-2 font-semibold text-xs sm:text-sm">Event Time</label>
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-2.5 sm:p-3">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <input
                        type="text"
                        value={eventTime.hour}
                        onChange={(e) => updateTime({ hour: clampTimePart(e.target.value, 12) })}
                        placeholder="HH"
                        inputMode="numeric"
                        maxLength={2}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-center text-xs sm:text-sm font-semibold tracking-wide focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        aria-label="Hour"
                      />

                      <span className="text-slate-500 font-semibold text-sm sm:text-base">:</span>

                      <input
                        type="text"
                        value={eventTime.minute}
                        onChange={(e) => updateTime({ minute: clampTimePart(e.target.value, 59) })}
                        onBlur={() => {
                          if (!eventTime.minute) return;
                          updateTime({ minute: eventTime.minute.padStart(2, '0') });
                        }}
                        placeholder="MM"
                        inputMode="numeric"
                        maxLength={2}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-center text-xs sm:text-sm font-semibold tracking-wide focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        aria-label="Minute"
                      />

                      <div className="w-20 sm:w-24 shrink-0 grid grid-rows-2 gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => updateTime({ period: 'AM' })}
                          className={`rounded-lg border px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm font-semibold transition ${
                            eventTime.period === 'AM'
                              ? 'border-teal-500 bg-teal-500 text-white shadow'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
                          }`}
                          aria-pressed={eventTime.period === 'AM'}
                        >
                          AM
                        </button>

                        <button
                          type="button"
                          onClick={() => updateTime({ period: 'PM' })}
                          className={`rounded-lg border px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm font-semibold transition ${
                            eventTime.period === 'PM'
                              ? 'border-teal-500 bg-teal-500 text-white shadow'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
                          }`}
                          aria-pressed={eventTime.period === 'PM'}
                        >
                          PM
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-slate-500">
                      {eventTime.hour && eventTime.minute && eventTime.period
                        ? `Selected: ${eventTime.hour.padStart(2, '0')}:${eventTime.minute.padStart(2, '0')} ${eventTime.period}`
                        : 'Select a time for the appointment'}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="event-type" className="block text-slate-700 mb-1.5 sm:mb-2 font-semibold text-xs sm:text-sm">
                    Type
                  </label>
                  <select
                    id="event-type"
                    value={eventForm.type}
                    onChange={(e) => {
                      setEventForm({ ...eventForm, type: e.target.value });
                      setAdditionalFields({});
                    }}
                    className="w-full px-3 sm:px-4 py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none text-sm sm:text-base"
                    required
                  >
                    <option value="">Select Type</option>
                    <option value="Doctor Visit">Doctor Visit</option>
                    <option value="Lab Test">Lab Test</option>
                    <option value="Hospital">Hospital</option>
                    <option value="Therapy">Therapy</option>
                    <option value="Follow-up">Follow-up</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Dynamic Fields Based on Type */}
                {currentTypeFields.length > 0 && (
                  <div className="bg-teal-50 p-3 sm:p-4 rounded-lg border border-teal-200">
                    <h4 className="text-slate-900 font-semibold mb-2 sm:mb-3 text-xs sm:text-sm">Additional Details</h4>
                    {currentTypeFields.map((field) => (
                      <div key={field.name} className="mb-2 sm:mb-3">
                        <label
                          htmlFor={`field-${field.name}`}
                          className="block text-slate-700 text-[10px] sm:text-xs mb-1 font-medium"
                        >
                          {field.label}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            id={`field-${field.name}`}
                            value={additionalFields[field.name] || ''}
                            onChange={(e) =>
                              setAdditionalFields({ ...additionalFields, [field.name]: e.target.value })
                            }
                            className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none text-xs sm:text-sm"
                            placeholder={field.placeholder}
                            autoComplete="off"
                            rows={3}
                          />
                        ) : (
                          <input
                            id={`field-${field.name}`}
                            type={field.type}
                            value={additionalFields[field.name] || ''}
                            onChange={(e) =>
                              setAdditionalFields({ ...additionalFields, [field.name]: e.target.value })
                            }
                            className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none text-xs sm:text-sm"
                            placeholder={field.placeholder}
                            autoComplete="off"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-3 sm:pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-3 sm:px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition font-semibold text-xs sm:text-sm"
                  >
                    {selectedEvent ? 'Update' : 'Add Appointment'}
                  </button>

                  {selectedEvent && eventForm.title && (
                    <button
                      type="button"
                      onClick={handleDeleteEvent}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition text-xs sm:text-sm"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && renderLayer(
        <div className="vytara-theme-content fixed inset-0 flex items-center justify-center p-3 sm:p-4 z-[70] bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-sm w-full border border-slate-200">
            <div className="p-4 sm:p-6 border-b border-slate-200">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Confirm Deletion</h3>
            </div>
            <div className="p-4 sm:p-6">
              <p className="text-slate-700 mb-4 sm:mb-6 text-sm sm:text-base">
                Are you sure you want to delete this appointment? This action cannot be undone.
              </p>
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={cancelDeleteEvent}
                  className="flex-1 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-semibold text-xs sm:text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteEvent}
                  className="flex-1 px-3 sm:px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition font-semibold text-xs sm:text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
