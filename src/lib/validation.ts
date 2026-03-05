const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if the value is a valid UUID v4 (or any UUID format). */
export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Asserts the value is a valid UUID; throws a descriptive error otherwise. */
export function assertUUID(value: unknown, label = "ID"): asserts value is string {
  if (!isValidUUID(value)) {
    throw new InvalidInputError(`${label} must be a valid UUID.`);
  }
}

/**
 * Validates that a filename is safe for use in storage paths.
 * Blocks path traversal sequences and dangerous characters.
 */
export function isValidFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (/[/\\]/.test(name)) return false;
  if (name === "." || name === "..") return false;
  if (name.startsWith(".")) return false;
  if (/\.\./g.test(name)) return false;
  if (/[\x00-\x1f]/.test(name)) return false;
  return true;
}

/** Truncates a string to a maximum length. */
export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Custom error class for input validation failures (safe to expose to client). */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/**
 * Returns a safe error message for the client.
 * Strips internal details from database/system errors.
 */
export function safeErrorMessage(error: unknown, fallback = "An unexpected error occurred."): string {
  if (error instanceof InvalidInputError) return error.message;
  return fallback;
}
