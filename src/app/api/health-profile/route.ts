import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/auth";
type ProfilePayload = {
  profileId: string; // Profile ID to save data for
  displayName?: string;
  dateOfBirth: string; // YYYY-MM-DD
  bloodGroup: string;
  heightCm: number | null;
  weightKg: number | null;

  currentDiagnosedCondition: string[];
  allergies: string[];
  ongoingTreatments: string[];
  currentMedication: {
    id?: string;
    name: string;
    dosage?: string;
    purpose?: string;
    frequency?: string;
    timesPerDay?: number | null;
    startDate?: string;
    endDate?: string;
    logs?: {
      medicationId?: string;
      timestamp?: string;
      taken?: boolean;
    }[];
  }[];

  previousDiagnosedConditions: string[];
  pastSurgeries: {
    name: string;
    month: number;
    year: number;
  }[];
  childhoodIllness: string[];
  longTermTreatments: string[];
};

function computeAge(dobISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobISO)) return null;
  const dob = new Date(dobISO + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  if (age < 0 || age > 130) return null;
  return age;
}

function computeBMI(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg) return null;
  if (heightCm < 50 || heightCm > 260) return null;
  if (weightKg < 10 || weightKg > 400) return null;
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  return Math.round(bmi * 10) / 10;
}

const cleanStringList = (values: string[] | undefined) =>
  Array.isArray(values) ? values.map((item) => item.trim()).filter(Boolean) : [];

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MEDICATION_FREQUENCY_TIMES: Record<string, number> = {
  once_daily: 1,
  twice_daily: 2,
  three_times_daily: 3,
  four_times_daily: 4,
  every_4_hours: 6,
  every_6_hours: 4,
  every_8_hours: 3,
  every_12_hours: 2,
  as_needed: 0,
  with_meals: 3,
  before_bed: 1,
};

const resolveTimesPerDay = (frequency: string, rawTimesPerDay: number | null | undefined) => {
  if (typeof rawTimesPerDay === "number" && Number.isFinite(rawTimesPerDay) && rawTimesPerDay >= 0) {
    return Math.floor(rawTimesPerDay);
  }
  if (frequency in MEDICATION_FREQUENCY_TIMES) {
    return MEDICATION_FREQUENCY_TIMES[frequency];
  }
  return 1;
};

type MedicationLog = {
  medicationId: string;
  timestamp: string;
  taken: boolean;
};

const normalizeMedicationLogs = (
  logs: {
    medicationId?: string;
    timestamp?: string;
    taken?: boolean;
  }[] | undefined,
  medicationId: string
): MedicationLog[] =>
  Array.isArray(logs)
    ? logs
      .map((log) => ({
        medicationId:
          typeof log.medicationId === "string" && log.medicationId.trim()
            ? log.medicationId.trim()
            : medicationId,
        timestamp:
          typeof log.timestamp === "string" && log.timestamp.trim()
            ? log.timestamp.trim()
            : "",
        taken: typeof log.taken === "boolean" ? log.taken : null,
      }))
      .filter(
        (log): log is MedicationLog => Boolean(log.timestamp) && log.taken !== null
      )
    : [];

const PROFILE_MIGRATION_HINT =
  "Profile-based DB migration is incomplete. Run supabase/migrations/20260213170000_profile_based_rls_migration.sql and ensure profile_id unique constraints exist.";

const isMissingOnConflictConstraint = (message: string) =>
  /no unique|no exclusion|on conflict/i.test(message) && /profile_id/i.test(message);

const isLegacyUserUniqueViolation = (message: string) =>
  /duplicate key value/i.test(message) &&
  /(health_.*user_id|user_medications_.*user_id|user_id)/i.test(message);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ProfilePayload;

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized", message: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Service role key is missing.", message: "Service role key is missing." },
        { status: 500 }
      );
    }
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Validate profileId
    if (!body?.profileId || typeof body.profileId !== 'string') {
      return NextResponse.json(
        { error: "Profile ID is required", message: "Profile ID is required" },
        { status: 400 }
      );
    }

    // Ensure profile belongs to authenticated account.
    let verifiedProfileId: string | null = null;
    const { data: ownedByAuth, error: ownedByAuthError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", body.profileId)
      .eq("auth_id", user.id)
      .maybeSingle();

    if (!ownedByAuthError && ownedByAuth?.id) {
      verifiedProfileId = ownedByAuth.id;
    }

    if (!verifiedProfileId) {
      const { data: ownedByUser, error: ownedByUserError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", body.profileId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (ownedByUserError && ownedByUserError.code !== "PGRST116") {
        return NextResponse.json(
          { error: ownedByUserError.message, message: ownedByUserError.message },
          { status: 500 }
        );
      }

      if (ownedByUser?.id) {
        verifiedProfileId = ownedByUser.id;
      }
    }

    if (!verifiedProfileId) {
      return NextResponse.json(
        { error: "Invalid profile selection", message: "Invalid profile selection" },
        { status: 403 }
      );
    }

    // Required fields (first 4 questions)
    if (!body?.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth)) {
      return NextResponse.json(
        { error: "DOB is required (YYYY-MM-DD)", message: "DOB is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (!body?.bloodGroup || body.bloodGroup.trim().length === 0) {
      return NextResponse.json(
        { error: "Blood group is required", message: "Blood group is required" },
        { status: 400 }
      );
    }
    if (!body?.heightCm || !Number.isFinite(body.heightCm)) {
      return NextResponse.json(
        { error: "Height is required", message: "Height is required" },
        { status: 400 }
      );
    }
    if (!body?.weightKg || !Number.isFinite(body.weightKg)) {
      return NextResponse.json(
        { error: "Weight is required", message: "Weight is required" },
        { status: 400 }
      );
    }

    const currentDiagnosedCondition = cleanStringList(body.currentDiagnosedCondition);
    const allergies = cleanStringList(body.allergies);
    const ongoingTreatments = cleanStringList(body.ongoingTreatments);
    const previousDiagnosedConditions = cleanStringList(body.previousDiagnosedConditions);
    const childhoodIllness = cleanStringList(body.childhoodIllness);
    const longTermTreatments = cleanStringList(body.longTermTreatments);

    const medicationStartDate = new Date().toISOString().split("T")[0];
    const currentMedication = Array.isArray(body.currentMedication)
      ? body.currentMedication
        .map((item) => {
          const id =
            typeof item.id === "string" && item.id.trim() ? item.id.trim() : randomUUID();
          const name = item.name?.trim() || "";
          const dosage = item.dosage?.trim() || "";
          const purpose = item.purpose?.trim() || "";
          const frequency = item.frequency?.trim() || "";
          const startDate =
            typeof item.startDate === "string" && DATE_ONLY_REGEX.test(item.startDate)
              ? item.startDate
              : medicationStartDate;
          const endDate =
            typeof item.endDate === "string" && DATE_ONLY_REGEX.test(item.endDate)
              ? item.endDate
              : undefined;
          const timesPerDay = resolveTimesPerDay(frequency, item.timesPerDay);
          const logs = normalizeMedicationLogs(item.logs, id);
          return {
            id,
            name,
            dosage,
            purpose,
            frequency,
            timesPerDay,
            startDate,
            endDate,
            logs,
          };
        })
        .filter((item) => item.name || item.dosage || item.frequency || item.purpose)
      : [];

    const hasIncompleteMedication = currentMedication.some(
      (item) => !item.name || !item.dosage || !item.frequency
    );
    if (hasIncompleteMedication) {
      return NextResponse.json(
        {
          error: "Each medication entry requires name, dosage, and frequency.",
          message: "Each medication entry requires name, dosage, and frequency.",
        },
        { status: 400 }
      );
    }

    const medicationsForUser = currentMedication.filter(
      (item) => item.name && item.dosage && item.frequency
    );

    const pastSurgeries = Array.isArray(body.pastSurgeries)
      ? body.pastSurgeries
        .map((item) => ({
          name: item.name?.trim(),
          month: Number(item.month),
          year: Number(item.year),
        }))
        .filter((item) => item.name && item.month && item.year)
      : [];

    // Backend-only computed
    const age = computeAge(body.dateOfBirth);
    const bmi = computeBMI(body.heightCm, body.weightKg);

    // Enforce minimum age of 18 for primary (account holder) profiles
    const { data: profileRow } = await adminClient
      .from("profiles")
      .select("is_primary")
      .eq("id", verifiedProfileId)
      .maybeSingle();

    if (profileRow?.is_primary && (age === null || age < 18)) {
      return NextResponse.json(
        {
          error: "Primary account holder must be at least 18 years old.",
          message: "Primary account holder must be at least 18 years old.",
        },
        { status: 400 }
      );
    }

    const payload = {
      profile_id: verifiedProfileId,
      user_id: user.id, // Keep user_id for reference
      date_of_birth: body.dateOfBirth,
      age,
      blood_group: body.bloodGroup,
      height_cm: body.heightCm,
      weight_kg: body.weightKg,
      bmi,

      current_diagnosed_condition: currentDiagnosedCondition.length ? currentDiagnosedCondition : null,
      allergies: allergies.length ? allergies : null,
      ongoing_treatments: ongoingTreatments.length ? ongoingTreatments : null,
      current_medication: medicationsForUser.length
        ? medicationsForUser.map((item) => ({
          name: item.name,
          dosage: item.dosage,
          frequency: item.frequency,
        }))
        : null,
      previous_diagnosed_conditions: previousDiagnosedConditions.length ? previousDiagnosedConditions : null,
      past_surgeries: pastSurgeries.length ? pastSurgeries : null,
      childhood_illness: childhoodIllness.length ? childhoodIllness : null,
      long_term_treatments: longTermTreatments.length ? longTermTreatments : null,

      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await adminClient
      .from("health")
      .upsert(payload, { onConflict: "profile_id" }); // Use profile_id for conflict resolution

    if (upsertErr) {
      if (isLegacyUserUniqueViolation(upsertErr.message)) {
        return NextResponse.json(
          { error: upsertErr.message, message: PROFILE_MIGRATION_HINT },
          { status: 500 }
        );
      }
      if (isMissingOnConflictConstraint(upsertErr.message)) {
        return NextResponse.json(
          { error: upsertErr.message, message: PROFILE_MIGRATION_HINT },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: upsertErr.message, message: upsertErr.message }, { status: 400 });
    }

    const medicationPayload = {
      profile_id: verifiedProfileId,
      user_id: user.id, // Keep user_id for reference
      medications: medicationsForUser,
      updated_at: new Date().toISOString(),
    };

    if (body.displayName?.trim()) {
      const trimmedName = body.displayName.trim();
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update({
          name: trimmedName,
          display_name: trimmedName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", verifiedProfileId);
      if (profileErr) {
        const missingDisplayName = /display_name/i.test(profileErr.message);
        if (missingDisplayName) {
          const { error: fallbackProfileErr } = await adminClient
            .from("profiles")
            .update({
              name: body.displayName.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", verifiedProfileId);
          if (fallbackProfileErr) {
            return NextResponse.json(
              { error: fallbackProfileErr.message, message: fallbackProfileErr.message },
              { status: 400 }
            );
          }
        } else {
          return NextResponse.json({ error: profileErr.message, message: profileErr.message }, { status: 400 });
        }
      }
    }

    const { error: medicationErr } = await adminClient
      .from("user_medications")
      .upsert(medicationPayload, { onConflict: "profile_id" }); // Use profile_id for conflict resolution
    if (medicationErr) {
      if (isLegacyUserUniqueViolation(medicationErr.message)) {
        return NextResponse.json(
          { error: medicationErr.message, message: PROFILE_MIGRATION_HINT },
          { status: 500 }
        );
      }
      if (isMissingOnConflictConstraint(medicationErr.message)) {
        return NextResponse.json(
          { error: medicationErr.message, message: PROFILE_MIGRATION_HINT },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: medicationErr.message, message: medicationErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
