import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { careCircleApi } from '@/api/modules/carecircle';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from '@/lib/countries';
import { supabase } from '@/lib/supabase';

type CareCircleStatus = 'pending' | 'accepted' | 'declined';

type CareCircleLink = {
  id: string;
  memberId: string;
  memberProfileId?: string | null;
  profileId?: string | null;
  status: CareCircleStatus;
  displayName: string;
  createdAt: string;
};

type CircleView = 'my-circle' | 'circles-in';

type EmergencyCardData = {
  name: string;
  age: string;
  date_of_birth: string;
  photo_id_on_file: boolean;
  photo_id_last4: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  preferred_hospital: string;
  insurer_name: string;
  plan_type: string;
  tpa_helpline: string;
  insurance_last4: string;
  blood_group: string;
  critical_allergies: string;
  chronic_conditions: string;
  current_meds: string;
  emergency_instructions: string;
};

const emptyEmergencyCard: EmergencyCardData = {
  name: '',
  age: '',
  date_of_birth: '',
  photo_id_on_file: false,
  photo_id_last4: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  preferred_hospital: '',
  insurer_name: '',
  plan_type: '',
  tpa_helpline: '',
  insurance_last4: '',
  blood_group: '',
  critical_allergies: '',
  chronic_conditions: '',
  current_meds: '',
  emergency_instructions: '',
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ').filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
};

// Animated Button Component
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedButton = ({
  children,
  onPress,
  style,
  disabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
  disabled?: boolean;
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[style, animatedStyle] as any}
    >
      {children}
    </AnimatedPressable>
  );
};

// Skeleton Loader Component
const SkeletonMemberCard = ({ index }: { index: number }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withTiming(0.6, { duration: 1000 }, () => {
      opacity.value = withTiming(0.3, { duration: 1000 });
    });
    const interval = setInterval(() => {
      opacity.value = withTiming(0.6, { duration: 1000 }, () => {
        opacity.value = withTiming(0.3, { duration: 1000 });
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={styles.memberCard}>
      <Animated.View style={animatedStyle}>
        <View style={[styles.memberAvatar, { backgroundColor: '#e1eaec' }]} />
        <View style={styles.memberInfo}>
          <View style={[styles.skeletonLine, { width: '60%', marginBottom: 8 }]} />
          <View style={[styles.skeletonLine, { width: '40%' }]} />
        </View>
        <View style={[styles.removeButton, { backgroundColor: '#e1eaec', borderColor: '#e1eaec' }]} />
      </Animated.View>
    </Animated.View>
  );
};

export default function CareCircleScreen() {
  const { user } = useAuth();
  const { selectedProfile } = useProfile();
  const profileId = selectedProfile?.id ?? '';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [displayName, setDisplayName] = useState('');
  const [circleView, setCircleView] = useState<CircleView>('my-circle');
  const [outgoingLinks, setOutgoingLinks] = useState<CareCircleLink[]>([]);
  const [incomingLinks, setIncomingLinks] = useState<CareCircleLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteContact, setInviteContact] = useState('');
  const [inviteCountry, setInviteCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [inviteCountryPickerVisible, setInviteCountryPickerVisible] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [emergencyCardOwner, setEmergencyCardOwner] = useState<{
    userId: string;
    profileId: string | null;
    name: string;
  } | null>(null);
  const [emergencyCard, setEmergencyCard] = useState<EmergencyCardData>(emptyEmergencyCard);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [isEmergencyLoading, setIsEmergencyLoading] = useState(false);
  const [isEmergencyEditing, setIsEmergencyEditing] = useState(false);
  const [isSavingEmergency, setIsSavingEmergency] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<'accept' | 'decline' | null>(null);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

  // Pull content closer to the header area while respecting safe area.
  const headerHeight = insets.top + 2;

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

  const fetchLinks = useCallback(async (showSpinner = true) => {
    if (!user?.id || !profileId) return;
    if (showSpinner) setLoading(true);

    try {
      const data = await careCircleApi.getLinks(profileId);
      setOutgoingLinks(data.outgoing || []);
      setIncomingLinks(data.incoming || []);
    } catch (err: any) {
      console.error('Failed to fetch care circle links:', err);
      // If API URL is not configured, show empty state instead of error
      if (err?.message?.includes('EXPO_PUBLIC_API_URL') || err?.message?.includes('Missing')) {
        setOutgoingLinks([]);
        setIncomingLinks([]);
        // Don't show alert for missing API URL - just show empty state
      } else {
        const errorMessage = err?.message || 'Failed to load care circle links.';
        Alert.alert('Error', errorMessage);
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [user?.id, profileId]);

  const refreshAll = useCallback(async () => {
    if (!user?.id || !profileId) return;
    setRefreshing(true);
    await fetchLinks(false);
    setRefreshing(false);
  }, [fetchLinks, user?.id, profileId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  useFocusEffect(
    useCallback(() => {
      fetchLinks(false);
    }, [fetchLinks])
  );

  const loadEmergencyCard = useCallback(async (targetProfileId: string) => {
    setIsEmergencyLoading(true);
    setEmergencyError(null);

    if (!targetProfileId) {
      setEmergencyCard(emptyEmergencyCard);
      setEmergencyError('No profile found for this member.');
      setIsEmergencyLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('care_emergency_cards')
      .select(
        [
          'name',
          'age',
          'date_of_birth',
          'photo_id_on_file',
          'photo_id_last4',
          'emergency_contact_name',
          'emergency_contact_phone',
          'preferred_hospital',
          'insurer_name',
          'plan_type',
          'tpa_helpline',
          'insurance_last4',
          'blood_group',
          'critical_allergies',
          'chronic_conditions',
          'current_meds',
          'emergency_instructions',
        ].join(',')
      )
      .eq('profile_id', targetProfileId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      setEmergencyError('Unable to load the emergency card details.');
      setIsEmergencyLoading(false);
      return;
    }

    if (!data) {
      setEmergencyCard(emptyEmergencyCard);
      setIsEmergencyLoading(false);
      return;
    }

    const card = data as Partial<EmergencyCardData> & { age?: number | null };

    setEmergencyCard({
      name: card.name ?? '',
      age: card.age ? String(card.age) : '',
      date_of_birth: card.date_of_birth ?? '',
      photo_id_on_file: card.photo_id_on_file ?? false,
      photo_id_last4: card.photo_id_last4 ?? '',
      emergency_contact_name: card.emergency_contact_name ?? '',
      emergency_contact_phone: card.emergency_contact_phone ?? '',
      preferred_hospital: card.preferred_hospital ?? '',
      insurer_name: card.insurer_name ?? '',
      plan_type: card.plan_type ?? '',
      tpa_helpline: card.tpa_helpline ?? '',
      insurance_last4: card.insurance_last4 ?? '',
      blood_group: card.blood_group ?? '',
      critical_allergies: card.critical_allergies ?? '',
      chronic_conditions: card.chronic_conditions ?? '',
      current_meds: card.current_meds ?? '',
      emergency_instructions: card.emergency_instructions ?? '',
    });

    setIsEmergencyLoading(false);
  }, []);

  const handleViewOwnEmergencyCard = useCallback(async () => {
    if (!user?.id || !profileId) return;
    setIsEmergencyOpen(true);
    setIsEmergencyEditing(false);
    const ownerName = displayName || user?.phone || 'Your';
    setEmergencyCardOwner({ userId: user.id, profileId, name: ownerName });
    await loadEmergencyCard(profileId);
  }, [displayName, loadEmergencyCard, profileId, user?.id, user?.phone]);

  const handleViewMemberEmergencyCard = useCallback(
    async (member: CareCircleLink) => {
      if (!member.memberId || !member.memberProfileId) {
        Alert.alert('Unavailable', 'Unable to open this emergency card right now.');
        return;
      }
      setIsEmergencyOpen(true);
      setIsEmergencyEditing(false);
      setEmergencyCardOwner({
        userId: member.memberId,
        profileId: member.memberProfileId,
        name: member.displayName,
      });
      await loadEmergencyCard(member.memberProfileId);
    },
    [loadEmergencyCard]
  );

  const handleInvite = async () => {
    if (!profileId) {
      Alert.alert('Profile Required', 'Please select a profile before inviting members.');
      return;
    }
    const digitsOnly = inviteContact.replace(/\D/g, '');
    if (!digitsOnly) {
      Alert.alert('Invalid Input', 'Please enter a phone number.');
      return;
    }
    const isIndia = inviteCountry.code === 'IN';
    const minLen = isIndia ? INDIA_PHONE_DIGITS : 10;
    if (digitsOnly.length < minLen || digitsOnly.length > PHONE_MAX_DIGITS) {
      Alert.alert(
        'Invalid phone',
        isIndia
          ? 'Please enter a valid 10-digit phone number.'
          : 'Please enter a valid phone number (10–15 digits).'
      );
      return;
    }

    const fullContact = `${inviteCountry.dialCode}${digitsOnly}`;
    setInviting(true);
    try {
      await careCircleApi.inviteByContact(fullContact, profileId);
      Alert.alert('Success', 'Invitation sent successfully!');
      setInviteModalOpen(false);
      setInviteContact('');
      setInviteCountry(DEFAULT_COUNTRY);
      await fetchLinks();
    } catch (err: any) {
      console.error('Failed to send invitation:', err);
      const errorMessage = err?.message || 'Unable to send invitation. Please check your API configuration.';
      Alert.alert('Invite Failed', errorMessage);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (linkId: string, memberName: string) => {
    Alert.alert(
      'Remove Member?',
      `Remove "${memberName}" from your care circle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) {
              Alert.alert('Error', 'Please sign in again to remove members.');
              return;
            }
            try {
              const { error } = await supabase
                .from('care_circle_links')
                .delete()
                .eq('id', linkId)
                .eq('requester_id', user.id);
              if (error) {
                throw error;
              }
              await fetchLinks(false);
            } catch (err: any) {
              console.error('Failed to remove member:', err);
              const errorMessage = err?.message || 'Unable to remove this member right now.';
              Alert.alert('Remove Failed', errorMessage);
            }
          },
        },
      ]
    );
  };

  const handleAccept = async (linkId: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'Please sign in again to accept requests.');
      return;
    }
    setPendingActionId(linkId);
    setPendingActionType('accept');
    try {
      const { error } = await supabase
        .from('care_circle_links')
        .update({ status: 'accepted' })
        .eq('id', linkId)
        .eq('recipient_id', user.id);
      if (error) {
        throw error;
      }
      await fetchLinks(false);
    } catch (err: any) {
      console.error('Failed to accept request:', err);
      const errorMessage = err?.message || 'Unable to accept this request right now.';
      Alert.alert('Accept Failed', errorMessage);
    } finally {
      setPendingActionId(null);
      setPendingActionType(null);
    }
  };

  const handleDecline = async (linkId: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'Please sign in again to decline requests.');
      return;
    }
    setPendingActionId(linkId);
    setPendingActionType('decline');
    try {
      const { error } = await supabase
        .from('care_circle_links')
        .update({ status: 'declined' })
        .eq('id', linkId)
        .eq('recipient_id', user.id);
      if (error) {
        throw error;
      }
      await fetchLinks(false);
    } catch (err: any) {
      console.error('Failed to decline request:', err);
      const errorMessage = err?.message || 'Unable to decline this request right now.';
      Alert.alert('Decline Failed', errorMessage);
    } finally {
      setPendingActionId(null);
      setPendingActionType(null);
    }
  };

  const handleEmergencyChange = <Key extends keyof EmergencyCardData>(
    key: Key,
    value: EmergencyCardData[Key]
  ) => {
    setEmergencyCard((prev) => ({ ...prev, [key]: value }));
  };

  const handleEmergencySave = async () => {
    if (!user?.id || !profileId) {
      setEmergencyError('Please sign in again to save this card.');
      return;
    }

    setIsSavingEmergency(true);
    setEmergencyError(null);

    const ageValue = emergencyCard.age ? Number(emergencyCard.age) : null;

    const payload = {
      profile_id: profileId,
      user_id: user.id,
      name: emergencyCard.name || null,
      age: Number.isFinite(ageValue) ? ageValue : null,
      date_of_birth: emergencyCard.date_of_birth || null,
      photo_id_on_file: emergencyCard.photo_id_on_file,
      photo_id_last4: emergencyCard.photo_id_last4 || null,
      emergency_contact_name: emergencyCard.emergency_contact_name || null,
      emergency_contact_phone: emergencyCard.emergency_contact_phone || null,
      preferred_hospital: emergencyCard.preferred_hospital || null,
      insurer_name: emergencyCard.insurer_name || null,
      plan_type: emergencyCard.plan_type || null,
      tpa_helpline: emergencyCard.tpa_helpline || null,
      insurance_last4: emergencyCard.insurance_last4 || null,
      blood_group: emergencyCard.blood_group || null,
      critical_allergies: emergencyCard.critical_allergies || null,
      chronic_conditions: emergencyCard.chronic_conditions || null,
      current_meds: emergencyCard.current_meds || null,
      emergency_instructions: emergencyCard.emergency_instructions || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('care_emergency_cards')
      .upsert(payload, { onConflict: 'profile_id' });

    if (error) {
      setEmergencyError('Unable to save the emergency card details.');
      setIsSavingEmergency(false);
      return;
    }

    setIsSavingEmergency(false);
    setIsEmergencyEditing(false);
    await loadEmergencyCard(profileId);
  };

  const myCircleMembers = useMemo(() => {
    return outgoingLinks.filter((link) => link.status === 'accepted');
  }, [outgoingLinks]);

  const pendingInvites = useMemo(() => {
    return outgoingLinks.filter((link) => link.status === 'pending');
  }, [outgoingLinks]);

  const circlesIn = useMemo(() => {
    return incomingLinks.filter((link) => link.status === 'accepted');
  }, [incomingLinks]);

  const pendingRequests = useMemo(() => {
    return incomingLinks.filter((link) => link.status === 'pending');
  }, [incomingLinks]);
  const hasPendingRequests = pendingRequests.length > 0;

  const emergencyOwnerLabel = useMemo(() => {
    if (!emergencyCardOwner?.name) return 'Emergency Card';
    if (emergencyCardOwner.name === 'Your') return 'Your Emergency Card';
    return `${emergencyCardOwner.name}'s Emergency Card`;
  }, [emergencyCardOwner]);

  const photoIdLabel = useMemo(() => {
    if (emergencyCard.photo_id_on_file && emergencyCard.photo_id_last4) {
      return `On file •••• ${emergencyCard.photo_id_last4}`;
    }
    if (emergencyCard.photo_id_on_file) {
      return 'On file';
    }
    if (emergencyCard.photo_id_last4) {
      return `•••• ${emergencyCard.photo_id_last4}`;
    }
    return 'Not provided';
  }, [emergencyCard.photo_id_last4, emergencyCard.photo_id_on_file]);

  const insuranceLast4Label = useMemo(() => {
    if (!emergencyCard.insurance_last4) {
      return 'Not provided';
    }
    return `•••• ${emergencyCard.insurance_last4}`;
  }, [emergencyCard.insurance_last4]);

  const isViewingExternalCard = Boolean(
    emergencyCardOwner?.userId && user?.id && emergencyCardOwner.userId !== user.id
  );

  const currentMembers = circleView === 'my-circle' ? myCircleMembers : circlesIn;
  const currentPending = circleView === 'my-circle' ? pendingInvites : pendingRequests;

  // Animated value for segment indicator
  const segmentTranslateX = useSharedValue(circleView === 'my-circle' ? 0 : 1);

  useEffect(() => {
    // Animate to 0 for "My Circle", 1 for "Circles I'm In"
    segmentTranslateX.value = withSpring(circleView === 'my-circle' ? 0 : 1, {
      damping: 25,
      stiffness: 300,
      mass: 0.8,
    });
  }, [circleView]);

  const segmentIndicatorStyle = useAnimatedStyle(() => {
    // Calculate the actual pixel translation
    // Segmented control: padding 24*2 = 48px, inner padding 5*2 = 10px, gap 5px
    // Available width = width - 48
    // Each segment width = (available width - 10 - 5) / 2
    const availableWidth = width - 48;
    const segmentWidth = (availableWidth - 10 - 5) / 2;
    const translateX = interpolate(
      segmentTranslateX.value,
      [0, 1],
      [0, segmentWidth + 5] // Move by one segment width + gap
    );
    return {
      transform: [{ translateX }],
    };
  }, [width]);

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      innerStyle={styles.innerContent}
      padded={false}
      scrollable={false}
      safeAreaStyle={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: headerHeight }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <Animated.View entering={FadeInDown.springify()} style={styles.headerRow}>
          <Text style={styles.title}>Care Circle</Text>
          <AnimatedButton onPress={() => setInviteModalOpen(true)} style={styles.inviteButton}>
            <View style={styles.inviteButtonIcon}>
              <MaterialCommunityIcons name="account-plus" size={16} color="#2f565f" />
            </View>
            <Text style={styles.inviteText}>Invite member</Text>
          </AnimatedButton>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.segmentedControl}>
          <Animated.View style={[styles.segmentIndicator, segmentIndicatorStyle]} />
          <Pressable
            style={[styles.segment, { zIndex: 1 }]}
            onPress={() => setCircleView('my-circle')}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                circleView === 'my-circle' && styles.segmentTextActive,
              ]}
            >
              My Circle
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, { zIndex: 1 }]}
            onPress={() => setCircleView('circles-in')}
          >
            <View style={styles.segmentLabel}>
              <Text
                numberOfLines={1}
                style={[
                  styles.segmentText,
                  circleView === 'circles-in' && styles.segmentTextActive,
                ]}
              >
                Circles I'm In
              </Text>
              {hasPendingRequests ? (
                <View style={styles.segmentBadge}>
                  <Text style={styles.segmentBadgeText}>{pendingRequests.length}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.emergencyCardWrapper}>
          <AnimatedButton onPress={handleViewOwnEmergencyCard}>
            <LinearGradient
              colors={['#2f565f', '#4a7a7d', '#6aa6a8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emergencyCard}
            >
              <View style={styles.emergencyCardIcon}>
                <MaterialCommunityIcons name="card-account-details-outline" size={24} color="#ffffff" />
              </View>
              <Text style={styles.emergencyCardText}>Emergency card</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" style={{ opacity: 0.8 }} />
            </LinearGradient>
          </AnimatedButton>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Members</Text>
            <AnimatedButton
              onPress={() => setPendingModalOpen(true)}
              style={[
                styles.pendingButton,
                currentPending.length > 0 && styles.pendingButtonWithBadge,
              ]}
            >
              <MaterialCommunityIcons
                name={circleView === 'my-circle' ? 'send-clock-outline' : 'inbox-arrow-down-outline'}
                size={16}
                color="#2f565f"
              />
              <Text style={styles.pendingButtonText}>
                {circleView === 'my-circle' ? 'Pending invites' : 'Pending requests'}
              </Text>
              {currentPending.length > 0 ? (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{currentPending.length}</Text>
                </View>
              ) : null}
            </AnimatedButton>
          </View>
          {loading && currentMembers.length === 0 ? (
            <Animated.View entering={FadeIn} style={styles.memberList}>
              {[...Array(2)].map((_, i) => (
                <SkeletonMemberCard key={i} index={i} />
              ))}
            </Animated.View>
          ) : currentMembers.length === 0 ? (
            <Animated.View entering={FadeInDown.springify()} style={styles.emptyState}>
              <MaterialCommunityIcons name="account-group-outline" size={28} color="#94a3b8" />
              <Text style={styles.emptyText}>No members yet</Text>
              <Text style={styles.emptySubtext}>Invite someone to get started</Text>
            </Animated.View>
          ) : (
            <View style={styles.memberList}>
              {currentMembers.map((member) => (
                <View
                  key={member.id}
                  style={styles.memberCard}
                >
                  <LinearGradient
                    colors={['#e4eef0', '#d6e6e6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.memberAvatar}
                  >
                    <Text style={styles.memberAvatarText}>{getInitials(member.displayName)}</Text>
                  </LinearGradient>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                      {member.displayName}
                    </Text>
                  </View>
                  {circleView === 'my-circle' && (
                    <AnimatedButton
                      onPress={() => handleRemove(member.id, member.displayName)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </AnimatedButton>
                  )}
                  {circleView === 'circles-in' && (
                    <AnimatedButton
                      onPress={() => handleViewMemberEmergencyCard(member)}
                      style={styles.viewButton}
                    >
                      <Text style={styles.viewButtonText}>View card</Text>
                    </AnimatedButton>
                  )}
                </View>
              ))}
            </View>
          )}
        </Animated.View>

      </ScrollView>

      <Modal transparent visible={pendingModalOpen} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.modalOverlayCentered}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingModalOpen(false)} />
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[
              styles.pendingSheet,
              styles.modalCardCentered,
              { maxHeight: height * 0.7 },
            ]}
          >
            <View style={styles.pendingSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>
                  {circleView === 'my-circle' ? 'Pending invites' : 'Pending requests'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  {circleView === 'my-circle'
                    ? "Invites you've sent waiting for a response."
                    : 'Care circle requests you can accept or decline.'}
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setPendingModalOpen(false)}
              >
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            </View>
            {currentPending.length === 0 ? (
              <View style={styles.pendingEmpty}>
                <MaterialCommunityIcons
                  name={circleView === 'my-circle' ? 'send-outline' : 'inbox-outline'}
                  size={32}
                  color="#94a3b8"
                />
                <Text style={styles.emptyText}>
                  {circleView === 'my-circle' ? 'No pending invites' : 'No pending requests'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {circleView === 'my-circle'
                    ? 'Invites you send will appear here until they respond.'
                    : 'Requests from others will show here.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={[
                  styles.pendingSheetScroll,
                  { maxHeight: Math.min(height * 0.55, 360) },
                ]}
                contentContainerStyle={styles.pendingSheetContent}
                showsVerticalScrollIndicator={true}
              >
                {currentPending.map((pending) => (
                  <View key={pending.id} style={styles.pendingCard}>
                    <View style={styles.pendingHeaderRow}>
                      <LinearGradient
                        colors={['#f5e6d3', '#e8d4b8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.pendingAvatar}
                      >
                        <Text style={[styles.memberAvatarText, { color: '#8b6f47' }]}>
                          {getInitials(pending.displayName)}
                        </Text>
                      </LinearGradient>
                      <View style={styles.pendingInfo}>
                        <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                          {pending.displayName || 'Unknown member'}
                        </Text>
                        <Text style={styles.pendingStatus}>
                          {circleView === 'my-circle' ? 'Pending invite' : 'Pending request'}
                        </Text>
                      </View>
                    </View>
                    {circleView === 'my-circle' ? (
                      <AnimatedButton
                        onPress={() => handleRemove(pending.id, pending.displayName)}
                        style={[styles.removeButton, styles.pendingActionSingle]}
                      >
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </AnimatedButton>
                    ) : (
                      <View style={styles.pendingActionsRow}>
                        <AnimatedButton
                          onPress={() => handleAccept(pending.id)}
                          style={[
                            styles.acceptButton,
                            pendingActionId === pending.id && pendingActionType === 'accept'
                              ? styles.buttonDisabled
                              : null,
                          ]}
                          disabled={
                            pendingActionId === pending.id &&
                            pendingActionType === 'accept'
                          }
                        >
                          <Text style={styles.acceptButtonText}>
                            {pendingActionId === pending.id && pendingActionType === 'accept'
                              ? 'Accepting...'
                              : 'Accept'}
                          </Text>
                        </AnimatedButton>
                        <AnimatedButton
                          onPress={() => handleDecline(pending.id)}
                          style={[
                            styles.declineButton,
                            pendingActionId === pending.id && pendingActionType === 'decline'
                              ? styles.buttonDisabled
                              : null,
                          ]}
                          disabled={
                            pendingActionId === pending.id &&
                            pendingActionType === 'decline'
                          }
                        >
                          <Text style={styles.declineButtonText}>
                            {pendingActionId === pending.id && pendingActionType === 'decline'
                              ? 'Declining...'
                              : 'Decline'}
                          </Text>
                        </AnimatedButton>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={inviteModalOpen} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.modalOverlayCentered}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteModalOpen(false)} />
          <Animated.View entering={FadeIn.duration(200)} style={[styles.inviteSheet, styles.modalCardCentered]}>
            <View>
              <View style={styles.inviteHeader}>
                <Text style={styles.sheetTitle}>Invite Member</Text>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => {
                    setInviteModalOpen(false);
                    setInviteContact('');
                    setInviteCountry(DEFAULT_COUNTRY);
                  }}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#475569" />
                </Pressable>
              </View>
              <Text style={styles.sheetSubtitle}>
                Enter a phone number to send an invitation
              </Text>
              <View style={styles.invitePhoneRow}>
                <Pressable
                  style={styles.inviteCountryCode}
                  onPress={() => setInviteCountryPickerVisible(true)}
                >
                  <Text style={styles.inviteCountryCodeText}>{inviteCountry.dialCode}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#39484c" />
                </Pressable>
                <TextInput
                  value={inviteContact}
                  onChangeText={(value) => setInviteContact(value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS))}
                  placeholder="Phone number"
                  placeholderTextColor="#94a3b8"
                  style={[styles.sheetInput, styles.invitePhoneInput]}
                  keyboardType="phone-pad"
                />
              </View>
              <Modal
                visible={inviteCountryPickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setInviteCountryPickerVisible(false)}
              >
                <View style={styles.countryModalOverlay}>
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setInviteCountryPickerVisible(false)}
                  />
                  <View style={styles.countryModalContent} pointerEvents="box-none">
                    <View style={styles.countryModalHeader}>
                      <Text style={styles.countryModalTitle}>Select country</Text>
                      <Pressable onPress={() => setInviteCountryPickerVisible(false)} hitSlop={12}>
                        <Text style={styles.countryModalDone}>Done</Text>
                      </Pressable>
                    </View>
                    <View style={styles.countryListContainer}>
                      <FlatList
                        data={COUNTRIES}
                        keyExtractor={(item) => item.code}
                        style={styles.countryList}
                        contentContainerStyle={styles.countryListContent}
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <Pressable
                            style={({ pressed }) => [
                              styles.countryItem,
                              pressed && styles.countryItemPressed,
                            ]}
                            onPress={() => {
                              setInviteCountry(item);
                              setInviteCountryPickerVisible(false);
                            }}
                          >
                            <Text style={styles.countryItemText}>
                              {item.name} ({item.dialCode})
                            </Text>
                          </Pressable>
                        )}
                      />
                    </View>
                  </View>
                </View>
              </Modal>
              <View style={styles.sheetActions}>
                <AnimatedButton
                  style={styles.secondaryButton}
                  onPress={() => {
                    setInviteModalOpen(false);
                    setInviteContact('');
                    setInviteCountry(DEFAULT_COUNTRY);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </AnimatedButton>
                <AnimatedButton
                  style={[styles.primaryButton, inviting && styles.buttonDisabled]}
                  onPress={handleInvite}
                  disabled={inviting || !inviteContact.trim()}
                >
                  <Text style={styles.primaryButtonText}>{inviting ? 'Sending...' : 'Send Invite'}</Text>
                </AnimatedButton>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={isEmergencyOpen} animationType="fade">
        <Animated.View
          entering={FadeIn}
          style={[
            styles.modalOverlay,
            styles.emergencyOverlay,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 0),
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setIsEmergencyOpen(false);
              setEmergencyError(null);
              setIsEmergencyEditing(false);
            }}
          />
          <Animated.View
            entering={SlideInDown.springify()}
            style={[
              styles.emergencySheet,
              {
                height: height - insets.top - insets.bottom - 24,
                maxHeight: height - insets.top - insets.bottom - 24,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.emergencyHeader}>
              <View style={styles.emergencyTitleWrap}>
                <Text style={styles.sheetTitle}>{emergencyOwnerLabel}</Text>
                {isViewingExternalCard && (
                  <Text style={styles.sheetSubtitle}>Viewing a shared emergency card.</Text>
                )}
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => {
                  setIsEmergencyOpen(false);
                  setEmergencyError(null);
                  setIsEmergencyEditing(false);
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            </View>

            <View style={styles.emergencyToggleRow}>
              <AnimatedButton
                onPress={() => {
                  setIsEmergencyEditing(false);
                  if (isEmergencyEditing) {
                    setEmergencyError(null);
                  }
                }}
                style={[
                  styles.emergencyToggleButton,
                  !isEmergencyEditing && styles.emergencyToggleButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.emergencyToggleText,
                    !isEmergencyEditing && styles.emergencyToggleTextActive,
                  ]}
                >
                  Card preview
                </Text>
              </AnimatedButton>
              {!isViewingExternalCard && (
                <AnimatedButton
                  onPress={() => setIsEmergencyEditing(true)}
                  style={[
                    styles.emergencyToggleButton,
                    isEmergencyEditing && styles.emergencyToggleButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.emergencyToggleText,
                      isEmergencyEditing && styles.emergencyToggleTextActive,
                    ]}
                  >
                    Edit card
                  </Text>
                </AnimatedButton>
              )}
            </View>

            {isViewingExternalCard && (
              <Text style={styles.emergencyHint}>Editing is disabled for shared cards.</Text>
            )}

            {isEmergencyLoading ? (
              <View style={styles.emergencyLoading}>
                <Text style={styles.emergencyLoadingText}>Loading emergency card...</Text>
              </View>
            ) : emergencyError && !isEmergencyEditing ? (
              <View style={styles.emergencyError}>
                <Text style={styles.emergencyErrorText}>{emergencyError}</Text>
              </View>
            ) : isEmergencyEditing && !isViewingExternalCard ? (
              <Animated.View
                key="edit"
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.emergencyBody}
              >
                <ScrollView
                  style={styles.emergencyScrollView}
                  contentContainerStyle={styles.emergencyContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                >
                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Personal</Text>
                    <Text style={styles.formLabel}>Full legal name</Text>
                    <TextInput
                      value={emergencyCard.name}
                      onChangeText={(value) => handleEmergencyChange('name', value)}
                      placeholder="Full legal name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <View style={styles.formRow}>
                      <View style={styles.formColumn}>
                        <Text style={styles.formLabel}>Age</Text>
                        <TextInput
                          value={emergencyCard.age}
                          onChangeText={(value) => handleEmergencyChange('age', value)}
                          keyboardType="number-pad"
                          placeholder="Age"
                          placeholderTextColor="#94a3b8"
                          style={styles.sheetInput}
                        />
                      </View>
                      <View style={styles.formColumn}>
                        <Text style={styles.formLabel}>Date of birth</Text>
                        <TextInput
                          value={emergencyCard.date_of_birth}
                          onChangeText={(value) =>
                            handleEmergencyChange('date_of_birth', value)
                          }
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#94a3b8"
                          style={styles.sheetInput}
                        />
                      </View>
                    </View>
                    <Text style={styles.formLabel}>Blood group</Text>
                    <TextInput
                      value={emergencyCard.blood_group}
                      onChangeText={(value) => handleEmergencyChange('blood_group', value)}
                      placeholder="Blood group"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <View style={styles.switchRow}>
                      <Text style={styles.formLabel}>Photo ID on file</Text>
                      <Switch
                        value={emergencyCard.photo_id_on_file}
                        onValueChange={(value) =>
                          handleEmergencyChange('photo_id_on_file', value)
                        }
                        trackColor={{ false: '#e2e8f0', true: '#2f565f' }}
                        thumbColor={emergencyCard.photo_id_on_file ? '#ffffff' : '#f8fafc'}
                      />
                    </View>
                    <Text style={styles.formLabel}>Photo ID last 4 digits</Text>
                    <TextInput
                      value={emergencyCard.photo_id_last4}
                      onChangeText={(value) => handleEmergencyChange('photo_id_last4', value)}
                      placeholder="1234"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Emergency contact</Text>
                    <Text style={styles.formLabel}>Contact name</Text>
                    <TextInput
                      value={emergencyCard.emergency_contact_name}
                      onChangeText={(value) =>
                        handleEmergencyChange('emergency_contact_name', value)
                      }
                      placeholder="Contact name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Contact phone</Text>
                    <TextInput
                      value={emergencyCard.emergency_contact_phone}
                      onChangeText={(value) =>
                        handleEmergencyChange('emergency_contact_phone', value)
                      }
                      placeholder="+1 555 000 0000"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      style={styles.sheetInput}
                    />
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Insurance</Text>
                    <Text style={styles.formLabel}>Insurer name</Text>
                    <TextInput
                      value={emergencyCard.insurer_name}
                      onChangeText={(value) => handleEmergencyChange('insurer_name', value)}
                      placeholder="Insurer name"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Plan type</Text>
                    <TextInput
                      value={emergencyCard.plan_type}
                      onChangeText={(value) => handleEmergencyChange('plan_type', value)}
                      placeholder="Plan type"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>TPA/Helpline</Text>
                    <TextInput
                      value={emergencyCard.tpa_helpline}
                      onChangeText={(value) => handleEmergencyChange('tpa_helpline', value)}
                      placeholder="TPA/Helpline"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Insurance last 4 digits</Text>
                    <TextInput
                      value={emergencyCard.insurance_last4}
                      onChangeText={(value) => handleEmergencyChange('insurance_last4', value)}
                      placeholder="1234"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.sectionHeading}>Medical details</Text>
                    <Text style={styles.formLabel}>Preferred hospital</Text>
                    <TextInput
                      value={emergencyCard.preferred_hospital}
                      onChangeText={(value) =>
                        handleEmergencyChange('preferred_hospital', value)
                      }
                      placeholder="Preferred hospital"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Critical allergies</Text>
                    <TextInput
                      value={emergencyCard.critical_allergies}
                      onChangeText={(value) =>
                        handleEmergencyChange('critical_allergies', value)
                      }
                      placeholder="Allergies"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Chronic conditions</Text>
                    <TextInput
                      value={emergencyCard.chronic_conditions}
                      onChangeText={(value) =>
                        handleEmergencyChange('chronic_conditions', value)
                      }
                      placeholder="Chronic conditions"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Current meds</Text>
                    <TextInput
                      value={emergencyCard.current_meds}
                      onChangeText={(value) => handleEmergencyChange('current_meds', value)}
                      placeholder="Current meds"
                      placeholderTextColor="#94a3b8"
                      style={styles.sheetInput}
                    />
                    <Text style={styles.formLabel}>Emergency instructions</Text>
                    <TextInput
                      value={emergencyCard.emergency_instructions}
                      onChangeText={(value) =>
                        handleEmergencyChange('emergency_instructions', value)
                      }
                      placeholder="Instructions"
                      placeholderTextColor="#94a3b8"
                      style={[styles.sheetInput, styles.textArea]}
                      multiline
                    />
                  </View>

                  {emergencyError && (
                    <Text style={styles.formError}>{emergencyError}</Text>
                  )}

                  <View style={styles.formActions}>
                    <AnimatedButton
                      style={styles.secondaryButton}
                      onPress={async () => {
                        setIsEmergencyEditing(false);
                        const ownerProfileId = emergencyCardOwner?.profileId;
                        if (ownerProfileId) {
                          await loadEmergencyCard(ownerProfileId);
                        }
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton
                      style={[styles.primaryButton, isSavingEmergency && styles.buttonDisabled]}
                      onPress={handleEmergencySave}
                      disabled={isSavingEmergency}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isSavingEmergency ? 'Saving...' : 'Save card'}
                      </Text>
                    </AnimatedButton>
                  </View>
                </ScrollView>
              </Animated.View>
            ) : (
              <Animated.View
                key="preview"
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.emergencyBody}
              >
                <ScrollView
                  style={styles.emergencyScrollView}
                  contentContainerStyle={styles.emergencyContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                >
                  <View style={styles.previewCard}>
                    <Text style={styles.previewEyebrow}>Emergency ID</Text>
                    <Text style={styles.previewName}>
                      {emergencyCard.name || 'Full legal name'}
                    </Text>
                    <View style={styles.previewMetaRow}>
                      <Text style={styles.previewMetaText}>
                        Age: {emergencyCard.age || '—'}
                      </Text>
                      <Text style={styles.previewMetaText}>
                        DOB: {emergencyCard.date_of_birth || '—'}
                      </Text>
                      <Text style={styles.previewMetaText}>
                        Blood: {emergencyCard.blood_group || '—'}
                      </Text>
                    </View>
                    <Text style={styles.previewMetaText}>Photo ID: {photoIdLabel}</Text>
                  </View>

                  <View style={styles.previewContactCard}>
                    <Text style={styles.previewSectionTitle}>Emergency contact</Text>
                    <Text style={styles.previewContactName}>
                      {emergencyCard.emergency_contact_name || 'Not provided'}
                    </Text>
                    <Text style={styles.previewContactValue}>
                      {emergencyCard.emergency_contact_phone || '—'}
                    </Text>
                    {emergencyCard.emergency_contact_phone ? (
                      <AnimatedButton
                        onPress={() =>
                          Linking.openURL(`tel:${emergencyCard.emergency_contact_phone}`)
                        }
                        style={styles.callNowButton}
                      >
                        <Text style={styles.callNowButtonText}>Call now</Text>
                      </AnimatedButton>
                    ) : null}
                  </View>

                  <View style={styles.previewGrid}>
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>Preferred hospital</Text>
                      <Text style={styles.previewSectionValue}>
                        {emergencyCard.preferred_hospital || 'Not provided'}
                      </Text>
                    </View>
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>Insurance</Text>
                      <Text style={styles.previewSectionValue}>
                        {emergencyCard.insurer_name || 'Not provided'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        {emergencyCard.plan_type || 'Plan type'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        TPA/Helpline: {emergencyCard.tpa_helpline || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Last 4: {insuranceLast4Label}
                      </Text>
                    </View>
                    <View style={[styles.previewSection, styles.previewSectionWide]}>
                      <Text style={styles.previewSectionTitle}>Medical notes</Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Allergies: {emergencyCard.critical_allergies || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Chronic: {emergencyCard.chronic_conditions || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Meds: {emergencyCard.current_meds || '—'}
                      </Text>
                      <Text style={styles.previewSectionSubvalue}>
                        Instructions: {emergencyCard.emergency_instructions || '—'}
                      </Text>
                    </View>
                  </View>
                </ScrollView>
              </Animated.View>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f5f8f9',
  },
  screenContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 0,
    paddingBottom: 0,
  },
  innerContent: {
    flex: 1,
    width: '100%',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2f565f',
    backgroundColor: '#ffffff',
    shadowColor: '#2f565f',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inviteButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  inviteButtonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e4eef0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    padding: 5,
    gap: 5,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    position: 'relative',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 5,
    left: '2.5%',
    width: '47.5%',
    height: 44,
    backgroundColor: '#2f565f',
    borderRadius: 10,
    zIndex: 0,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  segmentActive: {
    // Background is handled by the indicator, so we don't need it here
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  segmentLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  segmentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  emergencyCardWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#2f565f',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  emergencyCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyCardText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 16,
    letterSpacing: 0.3,
  },
  section: {
    gap: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  pendingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#c2d7db',
    backgroundColor: '#f0f6f6',
  },
  pendingButtonWithBadge: {
    borderColor: '#2f565f',
    backgroundColor: '#e8f0f0',
  },
  pendingButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  pendingBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2f565f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  memberList: {
    gap: 14,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e1eaec',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  memberAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#2f565f',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2f565f',
    letterSpacing: 0.5,
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f1a1c',
    letterSpacing: -0.2,
  },
  pendingStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  removeButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.8,
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.2,
  },
  viewButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#c2d7db',
    backgroundColor: '#f0f6f6',
    minWidth: 88,
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f565f',
    letterSpacing: 0.2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#2f565f',
    shadowColor: '#2f565f',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  acceptButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  declineButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  declineButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.8,
  },
  declineButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  emptyState: {
    padding: 48,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e1eaec',
    borderStyle: 'dashed',
    backgroundColor: '#fafcfc',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: -0.2,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCardCentered: {
    borderRadius: 24,
    width: '100%',
    shadowOffset: { width: 0, height: 8 },
  },
  emergencyOverlay: {
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  inviteSheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    gap: 20,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  invitePhoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteCountryCode: {
    minWidth: 70,
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#f0f4f5',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  inviteCountryCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2f33',
  },
  invitePhoneInput: {
    flex: 1,
  },
  countryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  countryModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
    maxHeight: 500,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  countryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  countryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  countryModalDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f766e',
  },
  countryListContainer: {
    flex: 1,
    minHeight: 0,
    maxHeight: 360,
  },
  countryList: {
    flex: 1,
  },
  countryListContent: {
    paddingBottom: 24,
  },
  countryItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  countryItemPressed: {
    backgroundColor: '#f0fdfa',
  },
  countryItemText: {
    fontSize: 16,
    color: '#334155',
  },
  pendingSheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  pendingSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  pendingEmpty: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 12,
  },
  pendingSheetScroll: {
    width: '100%',
  },
  pendingSheetContent: {
    gap: 14,
    paddingBottom: 24,
  },
  pendingCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e1eaec',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  pendingInfo: {
    flex: 1,
    gap: 4,
  },
  pendingActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  pendingActionSingle: {
    alignSelf: 'flex-end',
  },
  emergencySheet: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 16,
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  emergencyToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  emergencyToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  emergencyToggleButtonActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  emergencyToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  emergencyToggleTextActive: {
    color: '#ffffff',
  },
  emergencyHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  emergencyBody: {
    flex: 1,
  },
  emergencyTitleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  sheetInput: {
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f1a1c',
    backgroundColor: '#fafcfc',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2f565f',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2f565f',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d7e0e4',
    backgroundColor: '#fafcfc',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emergencyLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emergencyLoadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  emergencyError: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
  },
  emergencyErrorText: {
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
  },
  emergencyScrollView: {
    flex: 1,
    minHeight: 0,
  },
  emergencyContent: {
    paddingBottom: 24,
    gap: 16,
  },
  formSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formColumn: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  formError: {
    fontSize: 13,
    color: '#b91c1c',
    textAlign: 'center',
  },
  previewCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#f9fbfb',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  previewEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2f565f',
  },
  previewName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  previewMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewMetaText: {
    fontSize: 13,
    color: '#475569',
  },
  previewContactCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  previewContactName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  previewContactValue: {
    fontSize: 13,
    color: '#475569',
  },
  callNowButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e11d48',
    shadowColor: '#e11d48',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  callNowButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewSection: {
    width: '48%',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  previewSectionWide: {
    width: '100%',
  },
  previewSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  previewSectionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  previewSectionSubvalue: {
    fontSize: 12,
    color: '#475569',
  },
  emergencySection: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    textAlign: 'right',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#e1eaec',
    borderRadius: 6,
  },
});
