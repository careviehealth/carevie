"""
all_users_data.py
-----------------
Display handler for doctor-facing patient summaries.
All data fetching is delegated to supabase_helper.get_full_patient_data().

Usage:
    python all_users_data.py <profile_id>
"""

from pathlib import Path
import sys
import json

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from supabase_helper import get_full_patient_data

# ──────────────────────────────────────────────
# Display helpers
# ──────────────────────────────────────────────

DIVIDER      = "=" * 65
SECTION_LINE = "-" * 65


def section(title: str):
    print(f"\n{SECTION_LINE}")
    print(f"  {title.upper()}")
    print(SECTION_LINE)


def field(label: str, value):
    """Print a single labelled field; silently skip None / empty values."""
    if value is None or value == "" or value == [] or value == {}:
        return
    print(f"  {label:<30} {value}")


def print_jsonb_list(items: list, fields_to_show: list[str]):
    """
    Render a list of JSONB objects showing only the specified fields.
    Falsy fields are skipped. Falls back gracefully for plain-string items.
    """
    if not items:
        print("  None recorded.")
        return
    for i, item in enumerate(items, 1):
        if isinstance(item, str):
            print(f"  • {item}")
            continue
        print(f"\n  [{i}]")
        for f in fields_to_show:
            val = item.get(f)
            if val not in (None, "", [], {}):
                label = f.replace("_", " ").title()
                if isinstance(val, (dict, list)):
                    val = json.dumps(val, indent=2)
                print(f"      {label:<26} {val}")


def print_simple_list(items: list):
    """Render a flat JSONB list of strings or simple objects."""
    if not items:
        print("  None recorded.")
        return
    for item in items:
        if isinstance(item, str):
            print(f"  • {item}")
        elif isinstance(item, dict):
            line = ", ".join(
                f"{k}: {v}" for k, v in item.items()
                if v not in (None, "", [], {})
            )
            print(f"  • {line}")


# ──────────────────────────────────────────────
# Section renderers  (each receives its variable)
# ──────────────────────────────────────────────

def display_demographics(demographics: dict):
    section("Patient Demographics")
    name = (demographics.get("display_name") or demographics.get("name") or "").strip()
    field("Name",          name)
    field("Age",           demographics.get("age"))
    field("Gender",        demographics.get("gender"))
    field("Blood Group",   demographics.get("blood_group"))
    field("Phone",         demographics.get("phone"))
  

    if demographics.get("height_cm"):
        field("Height", f"{demographics['height_cm']} cm")
    elif demographics.get("height_ft"):
        field("Height", f"{demographics['height_ft']} ft")

    if demographics.get("weight_kg"):
        field("Weight", f"{demographics['weight_kg']} kg")
    elif demographics.get("weight_lbs"):
        field("Weight", f"{demographics['weight_lbs']} lbs")



def display_emergency_card(emergency_card: dict):
    if not emergency_card:
        return
    section("Emergency Card")
    field("Critical Allergies",     emergency_card.get("critical_allergies"))
    field("Chronic Conditions",     emergency_card.get("chronic_conditions"))
    field("Emergency Instructions", emergency_card.get("emergency_instructions"))
    field("Emergency Contact",      emergency_card.get("emergency_contact_name"))
    field("Emergency Contact Phone",emergency_card.get("emergency_contact_phone"))
    field("Preferred Hospital",     emergency_card.get("preferred_hospital"))
    field("Insurer",                emergency_card.get("insurer_name"))
    field("Plan Type",              emergency_card.get("plan_type"))
    field("TPA Helpline",           emergency_card.get("tpa_helpline"))


def display_emergency_contacts(emergency_contacts: list):
    section("Emergency Contacts")
    print_jsonb_list(
        emergency_contacts,
        fields_to_show=["name", "relationship", "phone", "email", "note"],
    )


def display_health(health: dict):
    section("Allergies")
    print_simple_list(health.get("allergies") or [])

    section("Current Diagnosed Conditions")
    print_simple_list(health.get("current_diagnosed_condition") or [])

    section("Previous / Past Conditions")
    print_simple_list(health.get("previous_diagnosed_conditions") or [])

    section("Childhood Illnesses")
    print_simple_list(health.get("childhood_illness") or [])

    section("Ongoing Treatments")
    print_jsonb_list(
        health.get("ongoing_treatments") or [],
        fields_to_show=["name", "description", "started_date", "doctor", "notes"],
    )

    section("Long-Term Treatments")
    print_jsonb_list(
        health.get("long_term_treatments") or [],
        fields_to_show=["name", "description", "started_date", "doctor", "notes"],
    )

    section("Past Surgeries")
    print_jsonb_list(
        health.get("past_surgeries") or [],
        fields_to_show=["name", "date", "hospital", "surgeon", "notes"],
    )

    section("Family History")
    print_simple_list(health.get("family_history") or [])


def display_medical_team(medical_team: list):
    section("Medical Team / Doctors")
    print_jsonb_list(
        medical_team,
        fields_to_show=["name", "specialty", "hospital", "phone", "email",
                        ],
    )


def display_appointments(appointments: list):
    section("Appointments")
    print_jsonb_list(
        appointments,
        fields_to_show=["title", "date", "time", "doctor", "hospital",
                        "specialty", "type", "status", "reason", "notes"],
    )


def display_medications(medications: list):
    section("Medications (Tracker)")
    print_jsonb_list(
        medications,
        fields_to_show=["name", "generic_name", "dosage", "unit", "form",
                        "frequency", "times", "prescribed_by", "startDate",
                        "endDate", "purpose", "instructions", "side_effects",
                        "is_active", "notes"],
    )

def display_documents(documents: dict):
    # Check if there are actually any documents inside the sub-lists
    if not documents or not any(documents.values()):
        return
        
    section("Downloadable Documents (Valid for 1 Week)")

    for folder in ["reports", "prescriptions", "insurance"]:
        items = documents.get(folder, [])
        if not items:
            continue

        print(f"\n  [{folder.upper()}]")
        for i, item in enumerate(items, 1):
            name = item.get("file_name", "Unknown File")
            date = item.get("date", "Unknown Date")
            url = item.get("url", "")
            
            print(f"      {i}. {name} (Uploaded: {date})")
            print(f"         🔗 {url}")

def display_summaries(medical_summary: dict, insurance_summary: dict):
    if not medical_summary and not insurance_summary:
        pass  # Do nothing if neither cache exists
        return

    section("AI Cached Summaries")

    if medical_summary:
        print(f"\n  [MEDICAL SUMMARY ({medical_summary.get('folder_type', 'ALL').upper()})]")
        print(f"      Generated At : {medical_summary.get('generated_at', 'Unknown')}")
        print(f"      Summary Text : {medical_summary.get('summary_text', 'No text')}")
    else:
        pass

    if insurance_summary:
        print(f"\n  [INSURANCE SUMMARY]")
        print(f"      Generated At : {insurance_summary.get('created_at', 'Unknown')}")
        print(f"      Summary Text : {insurance_summary.get('summary_text', 'No text')}")
    else:
        pass
# ──────────────────────────────────────────────
# Main handler
# ──────────────────────────────────────────────

def main(profile_id: str) -> dict | None:
    """
    Fetch and display the full patient clinical summary.

    Returns the data dict on success (for programmatic callers),
    or None if the profile is not found.
    """
    print(f"\n{DIVIDER}")
    print("  PATIENT CLINICAL SUMMARY")
    print(f"  Profile: {profile_id}")
    print(DIVIDER)

    # ── Single fetch call ──────────────────────
    data = get_full_patient_data(profile_id)

    # Trigger QR summary generation only when needed; domain flows are independent.
    # Only overwrite the cached values from get_full_patient_data when the orchestrator
    # returns a non-None result — this prevents a generation failure from blanking out
    # a previously valid cached summary that was already fetched from the DB.
    try:
        from qr_rag_pipeline.qr_summary_orchestrator import ensure_qr_summaries
        refreshed = ensure_qr_summaries(profile_id)
        if refreshed.get("medical_summary"):
            data["medical_summary"] = refreshed["medical_summary"]
        if refreshed.get("insurance_summary"):
            data["insurance_summary"] = refreshed["insurance_summary"]
    except Exception as exc:
        print(f"⚠️  QR summary generation skipped due to error: {exc}")

    # ── Store each section in its own variable ─
    demographics       = data["demographics"]
    emergency_card     = data["emergency_card"]
    emergency_contacts = data["emergency_contacts"]
    health             = data["health"]
    medical_team       = data["medical_team"]
    appointments       = data["appointments"]
    medications        = data["medications"]
    documents          = data.get("documents", {})
    medical_summary    = data.get("medical_summary")
    insurance_summary  = data.get("insurance_summary")

    if not demographics:
        print(f"\n❌ No profile found for profile_id: {profile_id}")
        return None

    # ── Display ────────────────────────────────
    display_demographics(demographics)
    display_emergency_card(emergency_card)
    display_emergency_contacts(emergency_contacts)
    display_health(health)
    display_medical_team(medical_team)
    display_appointments(appointments)
    display_medications(medications)
    display_documents(documents)
    display_summaries(medical_summary, insurance_summary)
    print(f"\n{DIVIDER}")
    print("  END OF REPORT")
    print(DIVIDER + "\n")

    return data


if __name__ == "__main__":
    if len(sys.argv) >= 2:
        main(sys.argv[1].strip())
    else:
        # Fallback to hardcoded profile for local development convenience
        main("15bfe7a8-6d7a-4656-9aac-7b23b16e0dea")