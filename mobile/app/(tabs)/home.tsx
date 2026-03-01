import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Screen } from '@/components/Screen';
import { AppointmentsModal, type Appointment } from '@/components/AppointmentsModal';
import {
  EmergencyContactsModal,
  type EmergencyContact as EmergencyContactRecord,
} from '@/components/EmergencyContactsModal';
import { MedicalTeamModal, type Doctor } from '@/components/MedicalTeamModal';
import { MedicationsModal, type Medication } from '@/components/MedicationsModal';
import { supabase } from '@/lib/supabase';
import { apiRequest } from '@/api/client';

type EmergencyContact = EmergencyContactRecord;

const quickActions = [
  {
    key: 'appointments',
    title: 'Appointments',
    icon: 'calendar-month-outline',
  },
  {
    key: 'emergency',
    title: 'Emergency\nContacts',
    icon: 'phone-outline',
  },
  {
    key: 'medical',
    title: 'Medical Team',
    icon: 'account-group-outline',
  },
  {
    key: 'medications',
    title: 'Medications',
    icon: 'pill',
  },
] as const;

const HEADER_HEIGHT = -15;
const createMedicationId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectedProfile } = useProfile();
  const profileId = selectedProfile?.id ?? '';
  const [displayName, setDisplayName] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [isSendingSOS, setIsSendingSOS] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isAppointmentsOpen, setIsAppointmentsOpen] = useState(false);
  const [isEmergencyContactsOpen, setIsEmergencyContactsOpen] = useState(false);
  const [medicalTeam, setMedicalTeam] = useState<Doctor[]>([]);
  const [isMedicalTeamOpen, setIsMedicalTeamOpen] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isMedicationsOpen, setIsMedicationsOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadDisplayName = async () => {
      if (!user?.id || !profileId) return;
      // Load display name from selected profile instead of personal table
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', profileId)
        .maybeSingle();
      if (data?.display_name) {
        setDisplayName(data.display_name);
      }
    };
    loadDisplayName();
  }, [user?.id, profileId]);

  useEffect(() => {
    if (!user?.id || !profileId) {
      setEmergencyContacts([]);
      return;
    }

    let isActive = true;

    const loadEmergencyContacts = async () => {
      // Load emergency contacts by profile_id (each profile has own contacts)
      const { data, error } = await supabase
        .from('user_emergency_contacts')
        .select('contacts')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Emergency contacts fetch error:', error);
        }
        setEmergencyContacts([]);
        return;
      }

      setEmergencyContacts((data?.contacts ?? []) as EmergencyContact[]);
    };

    loadEmergencyContacts();

    return () => {
      isActive = false;
    };
  }, [user?.id, profileId]);

  useEffect(() => {
    if (!user?.id || !profileId) {
      setAppointments([]);
      return;
    }

    let isActive = true;

    const loadAppointments = async () => {
      const { data, error } = await supabase
        .from('user_appointments')
        .select('appointments')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Appointments fetch error:', error);
        }
        setAppointments([]);
        return;
      }

      setAppointments((data?.appointments ?? []) as Appointment[]);
    };

    loadAppointments();

    return () => {
      isActive = false;
    };
  }, [user?.id, profileId]);

  useEffect(() => {
    if (!user?.id || !profileId) {
      setMedications([]);
      return;
    }

    let isActive = true;

    const loadMedications = async () => {
      const { data, error } = await supabase
        .from('user_medications')
        .select('medications')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Medications fetch error:', error);
        }
        setMedications([]);
        return;
      }

      setMedications((data?.medications ?? []) as Medication[]);
    };

    loadMedications();

    return () => {
      isActive = false;
    };
  }, [user?.id, profileId]);

  useEffect(() => {
    if (!user?.id || !profileId) {
      setMedicalTeam([]);
      return;
    }

    let isActive = true;

    const loadMedicalTeam = async () => {
      const { data, error } = await supabase
        .from('user_medical_team')
        .select('doctors')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Medical team fetch error:', error);
        }
        setMedicalTeam([]);
        return;
      }

      setMedicalTeam((data?.doctors ?? []) as Doctor[]);
    };

    loadMedicalTeam();

    return () => {
      isActive = false;
    };
  }, [user?.id, profileId]);

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, [now]);

  const greetingName = displayName || user?.phone || 'there';
  const horizontalPadding = width < 380 ? 16 : 24;

  const handleAddAppointment = async (appointment: Appointment) => {
    if (!user?.id || !profileId) return;

    const existingIndex = appointments.findIndex((item) => item.id === appointment.id);
    const updatedAppointments =
      existingIndex !== -1
        ? appointments.map((item) => (item.id === appointment.id ? appointment : item))
        : [...appointments, appointment];

    const { error } = await supabase.from('user_appointments').upsert({
      profile_id: profileId, // Use profile_id instead of user_id
      user_id: user.id, // Keep user_id for reference
      appointments: updatedAppointments,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Save appointment error:', error);
      Alert.alert('Unable to save', 'Failed to save appointment. Please try again.');
      return;
    }

    setAppointments(updatedAppointments);
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!user?.id || !profileId) return;

    const updatedAppointments = appointments.filter((item) => item.id !== id);

    const { error } = await supabase.from('user_appointments').upsert({
      profile_id: profileId, // Use profile_id instead of user_id
      user_id: user.id, // Keep user_id for reference
      appointments: updatedAppointments,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Delete appointment error:', error);
      Alert.alert('Unable to delete', 'Failed to delete appointment. Please try again.');
      return;
    }

    setAppointments(updatedAppointments);
  };

  const addEmergencyContact = async (contact: EmergencyContact) => {
    if (!user?.id || !profileId) return;

    if (!contact.name.trim() || !contact.phone.trim() || !contact.relation.trim()) {
      Alert.alert('Missing info', 'Please enter a valid name, phone, and relation.');
      return;
    }

    const updatedContacts = [...emergencyContacts, contact];

    const { error } = await supabase.from('user_emergency_contacts').upsert({
      profile_id: profileId,
      user_id: user.id, // Keep for reference
      contacts: updatedContacts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });

    if (error) {
      console.error('Add emergency contact error:', error);
      Alert.alert('Unable to save', 'Failed to add contact. Please try again.');
      return;
    }

    setEmergencyContacts(updatedContacts);
  };

  const deleteEmergencyContact = async (id: string) => {
    if (!user?.id || !profileId) return;

    const updatedContacts = emergencyContacts.filter((contact) => contact.id !== id);

    const { error } = await supabase.from('user_emergency_contacts').upsert({
      profile_id: profileId,
      user_id: user.id,
      contacts: updatedContacts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });

    if (error) {
      console.error('Delete emergency contact error:', error);
      Alert.alert('Unable to delete', 'Failed to delete contact. Please try again.');
      return;
    }

    setEmergencyContacts(updatedContacts);
  };

  const addDoctor = async (doctor: Doctor) => {
    if (!user?.id || !profileId) return;

    if (!doctor.name.trim() || !doctor.number.trim() || !doctor.speciality.trim()) {
      Alert.alert('Missing info', 'Please fill all fields.');
      return;
    }

    const updatedDoctors = [...medicalTeam, doctor];

    const { error } = await supabase.from('user_medical_team').upsert({
      profile_id: profileId,
      user_id: user.id,
      doctors: updatedDoctors,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Add doctor error:', error);
      Alert.alert('Unable to save', 'Failed to add doctor. Please try again.');
      return;
    }

    setMedicalTeam(updatedDoctors);
  };

  const updateDoctor = async (doctor: Doctor) => {
    if (!user?.id || !profileId) return;

    const updatedDoctors = medicalTeam.map((item) => (item.id === doctor.id ? doctor : item));

    const { error } = await supabase.from('user_medical_team').upsert({
      profile_id: profileId,
      user_id: user.id,
      doctors: updatedDoctors,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Update doctor error:', error);
      Alert.alert('Unable to save', 'Failed to update doctor. Please try again.');
      return;
    }

    setMedicalTeam(updatedDoctors);
  };

  const deleteDoctor = async (id: string) => {
    if (!user?.id || !profileId) return;

    const updatedDoctors = medicalTeam.filter((item) => item.id !== id);

    const { error } = await supabase.from('user_medical_team').upsert({
      profile_id: profileId,
      user_id: user.id,
      doctors: updatedDoctors,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Delete doctor error:', error);
      Alert.alert('Unable to delete', 'Failed to delete doctor. Please try again.');
      return;
    }

    setMedicalTeam(updatedDoctors);
  };

  const addMedication = async (medication: Medication) => {
    if (!user?.id || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      Alert.alert('Missing info', 'Please fill Name, Dosage, and Frequency.');
      return;
    }

    const newMedication: Medication = {
      id: createMedicationId(),
      name: medication.name.trim(),
      dosage: medication.dosage.trim(),
      purpose: medication.purpose.trim(),
      frequency: medication.frequency.trim(),
      timesPerDay: medication.timesPerDay || 1,
      startDate: medication.startDate || new Date().toISOString().split('T')[0],
      endDate: medication.endDate || undefined,
      logs: [],
    };

    const updatedMedications = [...medications, newMedication];

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId,
          user_id: user.id,
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setMedications(updatedMedications);
    } catch (error: any) {
      console.error('Add medication error:', error);
      Alert.alert('Failed to add medication', error?.message || 'Please try again.');
    }
  };

  const updateMedication = async (medication: Medication) => {
    if (!user?.id || !profileId) return;

    if (!medication.name.trim() || !medication.dosage.trim() || !medication.frequency.trim()) {
      Alert.alert('Missing info', 'Please fill Name, Dosage, and Frequency.');
      return;
    }

    const updatedMedications = medications.map((m) => (m.id === medication.id ? medication : m));

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId,
          user_id: user.id,
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setMedications(updatedMedications);
    } catch (error: any) {
      console.error('Update medication error:', error);
      Alert.alert('Failed to update medication', error?.message || 'Please try again.');
    }
  };

  const deleteMedication = async (id: string) => {
    if (!user?.id || !profileId) return;

    const updatedMedications = medications.filter((m) => m.id !== id);

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId,
          user_id: user.id,
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setMedications(updatedMedications);
    } catch (error: any) {
      console.error('Delete medication error:', error);
      Alert.alert('Failed to delete medication', error?.message || 'Please try again.');
    }
  };

  const logMedicationDose = async (medicationId: string, taken: boolean) => {
    if (!user?.id || !profileId) return;

    const newLog = {
      medicationId,
      timestamp: new Date().toISOString(),
      taken,
    };

    const updatedMedications = medications.map((m) => {
      if (m.id === medicationId) {
        return {
          ...m,
          logs: [...(m.logs || []), newLog],
        };
      }
      return m;
    });

    try {
      const { error } = await supabase.from('user_medications').upsert(
        {
          profile_id: profileId,
          user_id: user.id,
          medications: updatedMedications,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id',
        }
      );

      if (error) throw error;

      setMedications(updatedMedications);
    } catch (error: any) {
      console.error('Failed to log dose:', error);
      Alert.alert('Failed to log dose', error?.message || 'Please try again.');
    }
  };

  const sendSOS = async () => {
    if (isSendingSOS) return;

    if (!emergencyContacts.length) {
      Alert.alert(
        'No Emergency Contacts',
        "Please set up emergency contacts first before using SOS.\n\nTap 'Emergency Contacts' on the home screen to add them."
      );
      return;
    }

    Alert.alert(
      'Send SOS Alert?',
      `This will send an emergency message to:\n\n${emergencyContacts
        .map((contact) => `- ${contact.name} (${contact.phone})`)
        .join('\n')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setIsSendingSOS(true);
              try {
                const data = await apiRequest<{ message?: string; error?: string }>('/api/sos', {
                  method: 'POST',
                  body: {
                    emergencyContacts,
                    userName: displayName || user?.phone || 'A user',
                  },
                });

                Alert.alert(
                  'SOS Alert Sent',
                  `SOS alert sent successfully.\n\n${data?.message ?? ''}\n\nYour emergency contacts have been notified.`
                );
              } catch (err: any) {
                console.error('SOS error:', err);
                if (
                  err?.message?.includes('EXPO_PUBLIC_API_URL') ||
                  err?.message?.includes('Missing')
                ) {
                  Alert.alert(
                    'Configuration Error',
                    'Missing API URL. Please set EXPO_PUBLIC_API_URL in mobile/.env and restart the app.'
                  );
                } else {
                  const errorMessage =
                    err?.message === 'Please enter a valid number'
                      ? 'Please enter a valid number'
                      : err?.message || 'Failed to send SOS alert. Please try again.';
                  Alert.alert('SOS Failed', errorMessage);
                }
              } finally {
                setIsSendingSOS(false);
              }
            })();
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <Screen
      innerStyle={styles.screenInner}
      contentContainerStyle={styles.screenContent}
      safeAreaStyle={styles.safeArea}
      padded={false}
    >
      <View style={[styles.headerCard, { marginTop: insets.top + HEADER_HEIGHT }]}>
        <LinearGradient
          colors={['#2f565f', '#6aa6a8']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.headerGradient}
        >
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.name}>{greetingName}</Text>

          <View style={styles.actionStack}>
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons name="file-document-outline" size={18} color="#1b2b2f" />
              <Text style={styles.primaryButtonText}>Get Summary</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                isSendingSOS && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={sendSOS}
              disabled={isSendingSOS}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#ffffff" />
              <Text style={styles.secondaryButtonText}>{isSendingSOS ? 'Sending...' : 'SOS'}</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.cardsGrid, { paddingHorizontal: horizontalPadding }]}>
        {quickActions.map((action) => (
          <Pressable
            key={action.key}
            onPress={() => {
              if (action.key === 'appointments') {
                setIsAppointmentsOpen(true);
              }
              if (action.key === 'emergency') {
                setIsEmergencyContactsOpen(true);
              }
              if (action.key === 'medical') {
                setIsMedicalTeamOpen(true);
              }
              if (action.key === 'medications') {
                setIsMedicationsOpen(true);
              }
            }}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons name={action.icon} size={20} color="#466a70" />
              </View>
            </View>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <View style={styles.cardDivider} />
            <Text style={styles.cardLink}>View details</Text>
          </Pressable>
        ))}
      </View>

      <AppointmentsModal
        visible={isAppointmentsOpen}
        appointments={appointments}
        onClose={() => setIsAppointmentsOpen(false)}
        onAddAppointment={handleAddAppointment}
        onDeleteAppointment={handleDeleteAppointment}
      />

      <EmergencyContactsModal
        visible={isEmergencyContactsOpen}
        contacts={emergencyContacts}
        onClose={() => setIsEmergencyContactsOpen(false)}
        onAdd={addEmergencyContact}
        onDelete={deleteEmergencyContact}
      />

      <MedicalTeamModal
        visible={isMedicalTeamOpen}
        doctors={medicalTeam}
        onClose={() => setIsMedicalTeamOpen(false)}
        onAdd={addDoctor}
        onUpdate={updateDoctor}
        onDelete={deleteDoctor}
      />

      <MedicationsModal
        visible={isMedicationsOpen}
        medications={medications}
        onClose={() => setIsMedicationsOpen(false)}
        onAdd={addMedication}
        onUpdate={updateMedication}
        onDelete={deleteMedication}
        onLogDose={logMedicationDose}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#eef3f3',
  },
  screenContent: {
    justifyContent: 'flex-start',
    paddingVertical: 0,
    paddingBottom: 28,
  },
  screenInner: {
    alignItems: 'stretch',
  },
  headerCard: {
    width: '100%',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'hidden',
    marginTop: 0,
    shadowColor: '#22484e',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 12,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '600',
    color: '#e8f4f4',
  },
  name: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f7fbfb',
  },
  actionStack: {
    gap: 12,
    marginTop: 6,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#f8fdfd',
    paddingVertical: 12,
    borderRadius: 999,
  },
  primaryButtonText: {
    color: '#1b2b2f',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d7263d',
    paddingVertical: 12,
    backgroundColor: '#d7263d',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  cardsGrid: {
    marginTop: 45,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 16,
  },
  card: {
    width: '47%',
    minHeight: 160,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#fdfefe',
    borderWidth: 1,
    borderColor: '#dbe3e6',
    shadowColor: '#98a7aa',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    justifyContent: 'space-between',
  },
  cardPressed: {
    transform: [{ translateY: 1 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#e5eef0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    color: '#1d2f33',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#d7e1e5',
    marginVertical: 10,
  },
  cardLink: {
    fontSize: 13,
    color: '#6b7f86',
  },
});
