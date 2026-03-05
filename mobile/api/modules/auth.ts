import { supabase } from '@/lib/supabase';

export const authApi = {
  signInWithPassword: (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password }),

  signUpWithPassword: (email: string, password: string) =>
    supabase.auth.signUp({ email, password }),

  signOut: () => supabase.auth.signOut(),

  getSession: () => supabase.auth.getSession(),

  onAuthStateChange: supabase.auth.onAuthStateChange.bind(supabase.auth),
};
