-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.care_circle_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  requester_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'friend'::text CHECK (relationship = ANY (ARRAY['family'::text, 'friend'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])),
  profile_id uuid NOT NULL,
  CONSTRAINT care_circle_links_pkey PRIMARY KEY (id),
  CONSTRAINT care_circle_links_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id),
  CONSTRAINT care_circle_links_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id),
  CONSTRAINT fk_care_circle_links_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.care_emergency_cards (
  user_id uuid NOT NULL,
  name text,
  age integer,
  blood_group text,
  critical_allergies text,
  chronic_conditions text,
  current_meds text,
  emergency_instructions text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  date_of_birth date,
  photo_id_on_file boolean NOT NULL DEFAULT false,
  photo_id_last4 text,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_hospital text,
  insurer_name text,
  plan_type text,
  tpa_helpline text,
  insurance_last4 text,
  profile_id uuid NOT NULL,
  CONSTRAINT care_emergency_cards_pkey PRIMARY KEY (profile_id),
  CONSTRAINT care_emergency_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_care_emergency_cards_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.health (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  date_of_birth date,
  blood_group text,
  height_cm numeric,
  weight_kg numeric,
  bmi numeric,
  age integer,
  current_diagnosed_condition jsonb,
  allergies jsonb,
  ongoing_treatments jsonb,
  current_medication jsonb,
  previous_diagnosed_conditions jsonb,
  past_surgeries jsonb,
  childhood_illness jsonb,
  long_term_treatments jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  family_history jsonb,
  profile_id uuid NOT NULL,
  CONSTRAINT health_pkey PRIMARY KEY (id),
  CONSTRAINT health_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT health_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.medical_reports_processed (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  folder_type text DEFAULT 'reports'::text CHECK (folder_type = ANY (ARRAY['reports'::text, 'prescriptions'::text, 'insurance'::text, 'bills'::text])),
  extracted_text text,
  patient_name text,
  report_date text,
  processing_status text DEFAULT 'pending'::text,
  processed_at timestamp without time zone DEFAULT now(),
  created_at timestamp without time zone DEFAULT now(),
  age text,
  gender text,
  report_type text,
  doctor_name text,
  hospital_name text,
  name_match_status text DEFAULT 'pending'::text CHECK (name_match_status = ANY (ARRAY['pending'::text, 'matched'::text, 'mismatched'::text, 'verified'::text])),
  name_match_confidence numeric,
  structured_data_json jsonb,
  structured_data_hash text,
  structured_extracted_at timestamp with time zone,
  source_file_hash text,
  profile_id uuid NOT NULL,
  CONSTRAINT medical_reports_processed_pkey PRIMARY KEY (id),
  CONSTRAINT medical_reports_processed_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.medical_summaries_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  folder_type text DEFAULT 'all'::text,
  summary_text text NOT NULL,
  report_count integer DEFAULT 0,
  generated_at timestamp without time zone DEFAULT now(),
  reports_signature text,
  profile_id uuid NOT NULL,
  CONSTRAINT medical_summaries_cache_pkey PRIMARY KEY (id),
  CONSTRAINT medical_summaries_cache_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.notification_states (
  user_id uuid NOT NULL,
  notification_id text NOT NULL,
  read_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_states_pkey PRIMARY KEY (user_id, notification_id)
);
CREATE TABLE public.personal (
  id uuid NOT NULL,
  display_name text,
  phone text,
  auth_provider text CHECK (auth_provider = ANY (ARRAY['email'::text, 'phone'::text, 'google'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  gender text,
  address text,
  profile_id uuid NOT NULL,
  CONSTRAINT personal_pkey PRIMARY KEY (id),
  CONSTRAINT fk_personal_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT personal_user_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.profile_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  source text NOT NULL CHECK (source = ANY (ARRAY['care_circle'::text])),
  domain text NOT NULL CHECK (domain = ANY (ARRAY['vault'::text, 'medication'::text, 'appointment'::text])),
  action text NOT NULL CHECK (action = ANY (ARRAY['upload'::text, 'rename'::text, 'delete'::text, 'add'::text, 'update'::text])),
  actor_user_id uuid NOT NULL,
  actor_display_name text,
  entity_id text,
  entity_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profile_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT profile_activity_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  avatar_type text NOT NULL DEFAULT 'default'::text,
  avatar_color text,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  display_name text,
  auth_id uuid NOT NULL,
  phone text,
  gender text,
  address text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT profiles_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id)
);
CREATE TABLE public.remembered_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_token_hash text NOT NULL UNIQUE,
  label text,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone DEFAULT now(),
  CONSTRAINT remembered_devices_pkey PRIMARY KEY (id),
  CONSTRAINT remembered_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_appointments (
  user_id uuid NOT NULL,
  appointments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  profile_id uuid NOT NULL,
  CONSTRAINT user_appointments_pkey PRIMARY KEY (profile_id),
  CONSTRAINT user_appointments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_user_appointments_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_emergency_contacts (
  user_id uuid NOT NULL,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  profile_id uuid NOT NULL,
  CONSTRAINT user_emergency_contacts_pkey PRIMARY KEY (profile_id),
  CONSTRAINT user_emergency_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_user_emergency_contacts_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_medical_team (
  user_id uuid NOT NULL,
  doctors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  profile_id uuid NOT NULL,
  CONSTRAINT user_medical_team_pkey PRIMARY KEY (profile_id),
  CONSTRAINT user_medical_team_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_user_medical_team_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_medication_logs (
  user_id uuid NOT NULL,
  logs jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  profile_id uuid NOT NULL,
  CONSTRAINT user_medication_logs_pkey PRIMARY KEY (profile_id),
  CONSTRAINT user_medication_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_user_medication_logs_profile FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_medications (
  user_id uuid NOT NULL,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  profile_id uuid NOT NULL,
  CONSTRAINT user_medications_pkey PRIMARY KEY (profile_id),
  CONSTRAINT user_medications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_medications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_profile_preferences (
  user_id uuid NOT NULL,
  last_selected_profile_id uuid,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profile_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_profile_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_profile_preferences_last_selected_profile_id_fkey FOREIGN KEY (last_selected_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  email text,
  phone text,
  allow_name_mismatch boolean NOT NULL DEFAULT false,
  auto_delete_mismatch boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id)
);