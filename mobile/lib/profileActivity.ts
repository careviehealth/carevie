import { apiRequest } from '@/api/client';
import {
  normalizeMedicationDosage,
  resolveMedicationFrequency,
  resolveMedicationTimesPerDay,
} from '@/lib/medications';

export type ProfileActivityDomain = 'vault' | 'medication' | 'appointment';
export type ProfileActivityAction = 'upload' | 'rename' | 'delete' | 'add' | 'update';

type ActivityMetadataValue = string | number | boolean | null;

export type ActivityMetadataChange = {
  field: string;
  label: string;
  before: ActivityMetadataValue;
  after: ActivityMetadataValue;
};

type ProfileActivityPayload = {
  profileId: string;
  domain: ProfileActivityDomain;
  action: ProfileActivityAction;
  entity?: {
    id?: string | null;
    label?: string | null;
  };
  metadata?: Record<string, unknown>;
};

type AppointmentActivityRecord = Record<string, unknown> & {
  id?: string;
  title?: string;
  type?: string;
  date?: string;
  time?: string;
};

type MedicationActivityInput = {
  id?: unknown;
  name?: unknown;
  dosage?: unknown;
  purpose?: unknown;
  frequency?: unknown;
  mealTiming?: unknown;
  timesPerDay?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

type MedicationActivityRecord = {
  id: string | null;
  name: string | null;
  dosage: string | null;
  purpose: string | null;
  frequency: string | null;
  timesPerDay: number | null;
  startDate: string | null;
  endDate: string | null;
};

const APPOINTMENT_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  type: 'Type',
  date: 'Date',
  time: 'Time',
};

const MEDICATION_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  dosage: 'Dosage',
  purpose: 'Purpose',
  frequency: 'Frequency',
  timesPerDay: 'Times per day',
  startDate: 'Start date',
  endDate: 'End date',
};

const normalizeActivityMetadataValue = (value: unknown): ActivityMetadataValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') return value;
  return null;
};

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getActivityFieldLabel = (field: string, labels: Record<string, string>) => {
  if (labels[field]) {
    return labels[field];
  }
  const normalized = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return toTitleCase(normalized || field);
};

const normalizeMedicationForActivity = (
  medication: MedicationActivityInput
): MedicationActivityRecord => {
  const name = normalizeActivityMetadataValue(medication.name) as string | null;
  const dosage = normalizeMedicationDosage(medication.dosage);
  const purpose = normalizeActivityMetadataValue(medication.purpose) as string | null;
  const frequency = resolveMedicationFrequency(medication.frequency, medication.mealTiming);
  const timesPerDay =
    name || dosage || frequency || purpose || medication.startDate || medication.endDate
      ? resolveMedicationTimesPerDay(frequency, medication.timesPerDay, medication.mealTiming)
      : null;

  return {
    id: normalizeActivityMetadataValue(medication.id) as string | null,
    name,
    dosage: normalizeActivityMetadataValue(dosage) as string | null,
    purpose,
    frequency: normalizeActivityMetadataValue(frequency) as string | null,
    timesPerDay:
      typeof timesPerDay === 'number' && Number.isFinite(timesPerDay) ? timesPerDay : null,
    startDate: normalizeActivityMetadataValue(medication.startDate) as string | null,
    endDate: normalizeActivityMetadataValue(medication.endDate) as string | null,
  };
};

export const getAppointmentActivityMetadata = (appointment: AppointmentActivityRecord) => ({
  title: normalizeActivityMetadataValue(appointment.title),
  type: normalizeActivityMetadataValue(appointment.type),
  date: normalizeActivityMetadataValue(appointment.date),
  time: normalizeActivityMetadataValue(appointment.time),
});

export const buildAppointmentActivityChanges = (
  previousAppointment: AppointmentActivityRecord,
  nextAppointment: AppointmentActivityRecord
): ActivityMetadataChange[] => {
  const keys = Array.from(
    new Set([...Object.keys(previousAppointment), ...Object.keys(nextAppointment)])
  ).filter((key) => key !== 'id');
  const prioritized = ['title', 'type', 'date', 'time'];
  const orderedKeys = [
    ...prioritized.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !prioritized.includes(key)).sort(),
  ];

  return orderedKeys
    .map((key) => {
      const before = normalizeActivityMetadataValue(previousAppointment[key]);
      const after = normalizeActivityMetadataValue(nextAppointment[key]);
      if (before === after) return null;
      return {
        field: key,
        label: getActivityFieldLabel(key, APPOINTMENT_ACTIVITY_FIELD_LABELS),
        before,
        after,
      };
    })
    .filter((entry): entry is ActivityMetadataChange => entry !== null);
};

export const getMedicationActivityMetadata = (medication: MedicationActivityInput) => {
  const normalized = normalizeMedicationForActivity(medication);
  return {
    name: normalized.name,
    dosage: normalized.dosage,
    purpose: normalized.purpose,
    frequency: normalized.frequency,
    timesPerDay: normalized.timesPerDay,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
  };
};

export const buildMedicationActivityChanges = (
  previousMedication: MedicationActivityInput,
  nextMedication: MedicationActivityInput
): ActivityMetadataChange[] => {
  const previous = normalizeMedicationForActivity(previousMedication);
  const next = normalizeMedicationForActivity(nextMedication);

  return (
    ['name', 'dosage', 'purpose', 'frequency', 'timesPerDay', 'startDate', 'endDate'] as const
  ).reduce<ActivityMetadataChange[]>((changes, field) => {
    const before = previous[field];
    const after = next[field];
    if (before === after) return changes;
    changes.push({
      field,
      label: getActivityFieldLabel(field, MEDICATION_ACTIVITY_FIELD_LABELS),
      before,
      after,
    });
    return changes;
  }, []);
};

export async function logProfileActivity(payload: ProfileActivityPayload): Promise<void> {
  if (!payload.profileId.trim()) return;

  try {
    await apiRequest<{ success: boolean }>('/api/profile/activity', {
      method: 'POST',
      body: payload,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Profile activity log failed:', error);
    }
  }
}
