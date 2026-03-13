export type MedicationMealKey = 'breakfast' | 'lunch' | 'dinner';
export type MedicationMealTimingValue = 'before' | 'after';
export type MedicationMealTiming = Partial<Record<MedicationMealKey, MedicationMealTimingValue>>;

export type MedicationReminderSlot = {
  key: MedicationMealKey | 'before_bedtime';
  label: 'Breakfast' | 'Lunch' | 'Dinner' | 'Bedtime';
  context: string;
  hour: number;
  minute: number;
};

export type MedicationDoseStatus = 'taken' | 'due' | 'upcoming' | 'missed';

export type MedicationDoseState = MedicationReminderSlot & {
  slotTime: Date;
  slotWindowEnd: Date;
  status: MedicationDoseStatus;
};

export type MedicationLog = {
  medicationId: string;
  timestamp: string;
  taken: boolean;
  slotKey?: MedicationReminderSlot['key'];
};

export type MedicationRecord = {
  id?: string;
  name: string;
  dosage: string;
  purpose?: string;
  frequency: string;
  mealTiming?: MedicationMealTiming;
  timesPerDay?: number | null;
  startDate?: string;
  endDate?: string;
  logs?: MedicationLog[];
};

const MEDICATION_DOSAGE_UNIT_REGEX = /\s*mg$/i;

export const MEDICATION_MEAL_OPTIONS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
] as const;

export const LEGACY_MEDICATION_FREQUENCY_OPTIONS = [
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
] as const;

const LEGACY_MEDICATION_FREQUENCY_TIMES = LEGACY_MEDICATION_FREQUENCY_OPTIONS.reduce<
  Record<string, number>
>((acc, option) => {
  acc[option.value] = option.times;
  return acc;
}, {});

const LEGACY_MEDICATION_FREQUENCY_LABELS = LEGACY_MEDICATION_FREQUENCY_OPTIONS.reduce<
  Record<string, string>
>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const LEGACY_MEDICATION_FREQUENCY_TO_MEAL_TIMING: Partial<Record<string, MedicationMealTiming>> =
  {
    with_meals: {
      breakfast: 'after',
      lunch: 'after',
      dinner: 'after',
    },
  };

const MEDICATION_REMINDER_SCHEDULE: Record<
  MedicationMealKey,
  Record<MedicationMealTimingValue, MedicationReminderSlot>
> = {
  breakfast: {
    before: {
      key: 'breakfast',
      label: 'Breakfast',
      context: 'before breakfast',
      hour: 7,
      minute: 30,
    },
    after: {
      key: 'breakfast',
      label: 'Breakfast',
      context: 'after breakfast',
      hour: 8,
      minute: 30,
    },
  },
  lunch: {
    before: {
      key: 'lunch',
      label: 'Lunch',
      context: 'before lunch',
      hour: 12,
      minute: 30,
    },
    after: {
      key: 'lunch',
      label: 'Lunch',
      context: 'after lunch',
      hour: 13,
      minute: 30,
    },
  },
  dinner: {
    before: {
      key: 'dinner',
      label: 'Dinner',
      context: 'before dinner',
      hour: 19,
      minute: 30,
    },
    after: {
      key: 'dinner',
      label: 'Dinner',
      context: 'after dinner',
      hour: 20,
      minute: 30,
    },
  },
};

const LEGACY_REMINDER_SLOTS: Partial<Record<string, MedicationReminderSlot[]>> = {
  before_bed: [
    {
      key: 'before_bedtime',
      label: 'Bedtime',
      context: 'before bedtime',
      hour: 21,
      minute: 30,
    },
  ],
};

const normalizeFrequencyKey = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
};

const normalizeMealTimingValue = (value: unknown): MedicationMealTimingValue | undefined => {
  if (value === 'before' || value === 'after') return value;
  return undefined;
};

export const formatMedicationDosage = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const withoutUnit = trimmed.replace(MEDICATION_DOSAGE_UNIT_REGEX, '').trim();
  return withoutUnit ? `${withoutUnit} mg` : '';
};

export const normalizeMedicationDosage = (value: unknown) => formatMedicationDosage(value);

const parseMedicationMealTimingFromText = (value: string): MedicationMealTiming => {
  const next: MedicationMealTiming = {};
  const segments = value
    .split(/[;,]/)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  for (const segment of segments) {
    const timing = segment.includes('before')
      ? 'before'
      : segment.includes('after')
      ? 'after'
      : undefined;
    if (!timing) continue;

    for (const option of MEDICATION_MEAL_OPTIONS) {
      if (segment.includes(option.key) || segment.includes(option.label.toLowerCase())) {
        next[option.key] = timing;
      }
    }
  }

  return next;
};

export const normalizeMedicationMealTiming = (value: unknown): MedicationMealTiming => {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const next: MedicationMealTiming = {};

  for (const option of MEDICATION_MEAL_OPTIONS) {
    const timing = normalizeMealTimingValue(record[option.key]);
    if (timing) {
      next[option.key] = timing;
    }
  }

  return next;
};

export const deriveMedicationMealTiming = (
  mealTiming: unknown,
  frequency?: unknown
): MedicationMealTiming => {
  const normalized = normalizeMedicationMealTiming(mealTiming);
  if (Object.keys(normalized).length > 0) return normalized;

  if (typeof frequency === 'string' && frequency.trim()) {
    const fromText = parseMedicationMealTimingFromText(frequency.trim());
    if (Object.keys(fromText).length > 0) return fromText;
  }

  const frequencyKey = normalizeFrequencyKey(frequency);
  const fromLegacy = LEGACY_MEDICATION_FREQUENCY_TO_MEAL_TIMING[frequencyKey];
  return fromLegacy ? { ...fromLegacy } : {};
};

export const countMedicationMealTiming = (mealTiming: unknown, frequency?: unknown) =>
  Object.keys(deriveMedicationMealTiming(mealTiming, frequency)).length;

export const formatMedicationMealTimingSummary = (mealTiming: unknown, frequency?: unknown) => {
  const normalized = deriveMedicationMealTiming(mealTiming, frequency);
  return MEDICATION_MEAL_OPTIONS.filter((option) => normalized[option.key])
    .map((option) => `${option.label} ${normalized[option.key]}`)
    .join(', ');
};

export const resolveMedicationFrequency = (frequency: unknown, mealTiming?: unknown) => {
  const summary = formatMedicationMealTimingSummary(mealTiming, frequency);
  if (summary) return summary;
  if (typeof frequency !== 'string') return '';
  return frequency.trim();
};

export const resolveMedicationTimesPerDay = (
  frequency: unknown,
  timesPerDay: unknown,
  mealTiming?: unknown
) => {
  const mealCount = countMedicationMealTiming(mealTiming, frequency);
  if (mealCount > 0) return mealCount;

  if (typeof timesPerDay === 'number' && Number.isFinite(timesPerDay) && timesPerDay >= 0) {
    return Math.floor(timesPerDay);
  }

  if (typeof timesPerDay === 'string') {
    const parsed = Number(timesPerDay.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }

  const frequencyKey = normalizeFrequencyKey(frequency);
  if (frequencyKey in LEGACY_MEDICATION_FREQUENCY_TIMES) {
    return LEGACY_MEDICATION_FREQUENCY_TIMES[frequencyKey];
  }

  return 1;
};

export const formatMedicationFrequencyLabel = (frequency: unknown, mealTiming?: unknown) => {
  const summary = formatMedicationMealTimingSummary(mealTiming, frequency);
  if (summary) return summary;

  if (typeof frequency !== 'string') return '';
  const trimmed = frequency.trim();
  if (!trimmed) return '';

  const frequencyKey = normalizeFrequencyKey(trimmed);
  return LEGACY_MEDICATION_FREQUENCY_LABELS[frequencyKey] ?? trimmed;
};

export const getMedicationReminderSlots = ({
  mealTiming,
  frequency,
}: {
  mealTiming?: unknown;
  frequency?: unknown;
}) => {
  const normalized = deriveMedicationMealTiming(mealTiming, frequency);
  const slots = MEDICATION_MEAL_OPTIONS.flatMap((option) => {
    const timing = normalized[option.key];
    if (!timing) return [];
    return [MEDICATION_REMINDER_SCHEDULE[option.key][timing]];
  });
  if (slots.length > 0) return slots;

  const frequencyKey = normalizeFrequencyKey(frequency);
  return LEGACY_REMINDER_SLOTS[frequencyKey] ?? [];
};

export const isMedicationReminderActiveOnDate = (
  medication: Pick<MedicationRecord, 'startDate' | 'endDate'>,
  dateKey: string
) => {
  const startDate = typeof medication.startDate === 'string' ? medication.startDate.trim() : '';
  const endDate = typeof medication.endDate === 'string' ? medication.endDate.trim() : '';
  if (startDate && startDate > dateKey) return false;
  if (endDate && endDate < dateKey) return false;
  return true;
};

export const isReminderSlotKey = (value: unknown): value is MedicationReminderSlot['key'] =>
  value === 'breakfast' ||
  value === 'lunch' ||
  value === 'dinner' ||
  value === 'before_bedtime';

export const normalizeMedicationReminderSlotKey = (
  value: unknown
): MedicationReminderSlot['key'] | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return isReminderSlotKey(trimmed) ? trimmed : undefined;
};

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const getSlotEntriesForDate = (
  medication: {
    frequency?: unknown;
    mealTiming?: unknown;
  },
  date: Date
) =>
  getMedicationReminderSlots({
    frequency: medication.frequency,
    mealTiming: medication.mealTiming,
  }).map((slot) => ({
    slot,
    slotTime: new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      slot.hour,
      slot.minute,
      0,
      0
    ),
  }));

export const getMedicationTakenSlotKeysForDate = (
  medication: {
    frequency?: unknown;
    mealTiming?: unknown;
    logs?: Array<{
      medicationId?: string;
      timestamp?: string;
      taken?: boolean;
      slotKey?: string;
    }>;
  },
  date: Date
) => {
  const slotEntries = getSlotEntriesForDate(medication, date);
  if (slotEntries.length === 0) return new Set<MedicationReminderSlot['key']>();

  const takenKeys = new Set<MedicationReminderSlot['key']>();
  const dayKey = date.toDateString();
  const logs = Array.isArray(medication.logs) ? medication.logs : [];
  const takenLogs = logs
    .filter((log) => {
      if (!log?.taken || typeof log.timestamp !== 'string') return false;
      const parsed = new Date(log.timestamp);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed.toDateString() === dayKey;
    })
    .map((log) => {
      const timestamp = log.timestamp as string;
      return {
        ...log,
        parsedTime: new Date(timestamp),
      };
    })
    .sort((a, b) => a.parsedTime.getTime() - b.parsedTime.getTime());

  for (const log of takenLogs) {
    if (isReminderSlotKey(log.slotKey)) {
      const matchesCurrentMedication = slotEntries.some((entry) => entry.slot.key === log.slotKey);
      if (matchesCurrentMedication) {
        takenKeys.add(log.slotKey);
        continue;
      }
    }

    const eligibleSlot = [...slotEntries]
      .filter(
        (entry) => !takenKeys.has(entry.slot.key) && entry.slotTime.getTime() <= log.parsedTime.getTime()
      )
      .pop();
    if (eligibleSlot) {
      takenKeys.add(eligibleSlot.slot.key);
      continue;
    }

    const firstRemainingSlot = slotEntries.find((entry) => !takenKeys.has(entry.slot.key));
    if (firstRemainingSlot) {
      takenKeys.add(firstRemainingSlot.slot.key);
    }
  }

  return takenKeys;
};

export const getDueMedicationReminderSlots = (
  medication: {
    frequency?: unknown;
    mealTiming?: unknown;
    logs?: Array<{
      medicationId?: string;
      timestamp?: string;
      taken?: boolean;
      slotKey?: string;
    }>;
    startDate?: string;
    endDate?: string;
  },
  now: Date,
  reminderWindowMs: number
) => {
  const dateKey = toLocalDateKey(now);
  if (!isMedicationReminderActiveOnDate(medication, dateKey)) return [];

  const slotEntries = getSlotEntriesForDate(medication, now);
  if (slotEntries.length === 0) return [];

  const takenKeys = getMedicationTakenSlotKeysForDate(medication, now);

  return slotEntries
    .filter((entry) => {
      if (takenKeys.has(entry.slot.key)) return false;
      const slotWindowEnd = new Date(entry.slotTime.getTime() + reminderWindowMs);
      return now >= entry.slotTime && now <= slotWindowEnd;
    })
    .map((entry) => ({
      ...entry.slot,
      slotTime: entry.slotTime,
    }));
};

export const getMedicationDoseStatesForDate = (
  medication: {
    frequency?: unknown;
    mealTiming?: unknown;
    logs?: Array<{
      medicationId?: string;
      timestamp?: string;
      taken?: boolean;
      slotKey?: string;
    }>;
    startDate?: string;
    endDate?: string;
  },
  now: Date,
  reminderWindowMs: number
): MedicationDoseState[] => {
  const dateKey = toLocalDateKey(now);
  if (!isMedicationReminderActiveOnDate(medication, dateKey)) return [];

  const takenKeys = getMedicationTakenSlotKeysForDate(medication, now);

  return getSlotEntriesForDate(medication, now).map((entry) => {
    const slotWindowEnd = new Date(entry.slotTime.getTime() + reminderWindowMs);
    let status: MedicationDoseStatus = 'upcoming';

    if (takenKeys.has(entry.slot.key)) {
      status = 'taken';
    } else if (now >= entry.slotTime && now <= slotWindowEnd) {
      status = 'due';
    } else if (now > slotWindowEnd) {
      status = 'missed';
    }

    return {
      ...entry.slot,
      slotTime: entry.slotTime,
      slotWindowEnd,
      status,
    };
  });
};

export const normalizeMedicationRecord = (
  value: unknown,
  createId: () => string
): MedicationRecord & { id: string } => {
  const record = (value ?? {}) as Record<string, unknown>;
  const mealTiming = deriveMedicationMealTiming(record.mealTiming, record.frequency);
  const frequency = resolveMedicationFrequency(record.frequency, mealTiming);

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : createId(),
    name: typeof record.name === 'string' ? record.name : '',
    dosage: normalizeMedicationDosage(record.dosage),
    purpose: typeof record.purpose === 'string' ? record.purpose : '',
    frequency,
    mealTiming: Object.keys(mealTiming).length > 0 ? mealTiming : undefined,
    timesPerDay: resolveMedicationTimesPerDay(frequency, record.timesPerDay, mealTiming),
    startDate: typeof record.startDate === 'string' ? record.startDate : undefined,
    endDate: typeof record.endDate === 'string' ? record.endDate : undefined,
    logs: Array.isArray(record.logs)
      ? record.logs
          .map((entry) => {
            const log = (entry ?? {}) as Record<string, unknown>;
            return {
              medicationId:
                typeof log.medicationId === 'string' && log.medicationId.trim()
                  ? log.medicationId
                  : '',
              timestamp: typeof log.timestamp === 'string' ? log.timestamp : '',
              taken: Boolean(log.taken),
              slotKey: normalizeMedicationReminderSlotKey(log.slotKey),
            };
          })
          .filter((entry) => entry.medicationId && entry.timestamp)
      : [],
  };
};
