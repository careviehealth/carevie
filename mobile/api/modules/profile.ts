import { supabase } from '@/lib/supabase';

type PersonalProfile = {
  display_name: string | null;
  phone: string | null;
  gender: string | null;
  address: string | null;
};

type HealthProfile = {
  date_of_birth: string | null;
  blood_group: string | null;
  height_cm: number | null;
  height_ft: number | null;
  weight_kg: number | null;
  weight_lbs: number | null;
  bmi: number | null;
  age: number | null;
  current_diagnosed_condition: unknown;
  allergies: unknown;
  ongoing_treatments: unknown;
  current_medication: unknown;
  previous_diagnosed_conditions: unknown;
  past_surgeries: unknown;
  childhood_illness: unknown;
  long_term_treatments: unknown;
};

export const profileApi = {
  getPersonalProfile: (profileId: string) =>
    supabase
      .from('profiles')
      .select('display_name, phone, gender, address')
      .eq('id', profileId)
      .maybeSingle<PersonalProfile>(),

  getHealthProfile: (profileId: string) =>
    supabase
      .from('health')
      .select(
        'date_of_birth, blood_group, height_cm, height_ft, weight_kg, weight_lbs, bmi, age, current_diagnosed_condition, allergies, ongoing_treatments, current_medication, previous_diagnosed_conditions, past_surgeries, childhood_illness, long_term_treatments'
      )
      .eq('profile_id', profileId)
      .maybeSingle<HealthProfile>(),
};
