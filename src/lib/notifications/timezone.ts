// IANA-aware date helpers used by the schedulers. We avoid pulling in a
// timezone library by leaning on Intl.DateTimeFormat, which is fully supported
// in Node 20+ (the runtime Next.js targets).

const partsToRecord = (parts: Intl.DateTimeFormatPart[]) =>
  parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatter = (timeZone: string) => {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, f);
  }
  return f;
};

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const safeTimeZone = (tz: string | null | undefined): string => {
  if (typeof tz === 'string' && tz.trim() && isValidTimeZone(tz.trim())) return tz.trim();
  return 'UTC';
};

// Wall-clock components in `tz` for an instant.
export const wallClockInZone = (instant: Date, tz: string) => {
  const parts = partsToRecord(formatter(safeTimeZone(tz)).formatToParts(instant));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second ?? '0'),
  };
};

// Local YYYY-MM-DD date key in tz for an instant.
export const dateKeyInZone = (instant: Date, tz: string) => {
  const w = wallClockInZone(instant, tz);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
};

// Convert a wall-clock {year, month, day, hour, minute} in `tz` to a UTC Date.
// Implemented by binary-searching against Intl.DateTimeFormat to handle DST
// gaps/overlaps without a tz library. Accurate to the second.
export const zonedWallClockToInstant = (
  parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
  tz: string
): Date => {
  const safe = safeTimeZone(tz);
  // Initial guess: pretend the wall clock is UTC, then iteratively correct.
  let utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
    0
  );
  for (let i = 0; i < 5; i += 1) {
    const w = wallClockInZone(new Date(utcGuess), safe);
    const targetEpoch = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0,
      0
    );
    const gotEpoch = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0, 0);
    const diff = targetEpoch - gotEpoch;
    if (diff === 0) break;
    utcGuess += diff;
  }
  return new Date(utcGuess);
};

// Parse a YYYY-MM-DD string into {year, month, day}. Returns null on bad input.
export const parseDateKey = (key: string): { year: number; month: number; day: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

// Add `days` days to a YYYY-MM-DD key. Calendar-aware (treats date as midnight UTC).
export const addDaysToDateKey = (key: string, days: number): string | null => {
  const parsed = parseDateKey(key);
  if (!parsed) return null;
  const ms = Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// True if `now` (any tz) sits inside the user's quiet-hours window. Quiet hours
// are stored as local-tz wall clocks; "22:00"–"07:00" wraps across midnight.
export const isInQuietHours = (
  now: Date,
  tz: string,
  startHHMM: string | null | undefined,
  endHHMM: string | null | undefined
): boolean => {
  if (!startHHMM || !endHHMM) return false;
  const w = wallClockInZone(now, tz);
  const cur = w.hour * 60 + w.minute;
  const parse = (s: string) => {
    const m = /^(\d{2}):(\d{2})/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = parse(startHHMM);
  const end = parse(endHHMM);
  if (start === null || end === null) return false;
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end; // wraps midnight
};
