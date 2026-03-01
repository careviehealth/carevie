import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/server";
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
    name: string;
    dosage?: string;
    frequency?: string;
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

    const supabase = await supabaseServer();
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
    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const { data, error } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized", message: "Unauthorized" }, { status: 401 });
    }

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
      .eq("auth_id", data.user.id)
      .maybeSingle();

    if (!ownedByAuthError && ownedByAuth?.id) {
      verifiedProfileId = ownedByAuth.id;
    }

    if (!verifiedProfileId) {
      const { data: ownedByUser, error: ownedByUserError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", body.profileId)
        .eq("user_id", data.user.id)
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

    const currentMedication = Array.isArray(body.currentMedication)
      ? body.currentMedication
        .map((item) => ({
          name: item.name?.trim() || "",
          dosage: item.dosage?.trim() || "",
          frequency: item.frequency?.trim() || "",
        }))
        .filter((item) => item.name && item.dosage && item.frequency)
      : [];

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

    const payload = {
      profile_id: verifiedProfileId,
      user_id: data.user.id, // Keep user_id for reference
      date_of_birth: body.dateOfBirth,
      age,
      blood_group: body.bloodGroup,
      height_cm: body.heightCm,
      weight_kg: body.weightKg,
      bmi,

      current_diagnosed_condition: currentDiagnosedCondition.length ? currentDiagnosedCondition : null,
      allergies: allergies.length ? allergies : null,
      ongoing_treatments: ongoingTreatments.length ? ongoingTreatments : null,
      current_medication: currentMedication.length ? currentMedication : null,
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

    const medicationStartDate = new Date().toISOString().split("T")[0];
    const medicationsForUser = currentMedication.map((item) => ({
      id: randomUUID(),
      name: item.name,
      dosage: item.dosage,
      purpose: "",
      frequency: item.frequency,
      timesPerDay: 1,
      startDate: medicationStartDate,
      logs: [],
    }));

    const medicationPayload = {
      profile_id: verifiedProfileId,
      user_id: data.user.id, // Keep user_id for reference
      medications: medicationsForUser,
      updated_at: new Date().toISOString(),
    };

    if (body.displayName?.trim()) {
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update({
          display_name: body.displayName.trim(),
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
  } catch (e: any) {
    const message = e?.message || "Server error";
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
