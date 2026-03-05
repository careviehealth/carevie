import { apiRequest } from '@/api/client';

export type CareCircleStatus = 'pending' | 'accepted' | 'declined';
export type CareCircleRole = 'family' | 'friend';

export type CareCircleLink = {
  id: string;
  memberId: string;
  memberProfileId?: string | null;
  profileId?: string | null;
  ownerProfileIsPrimary?: boolean;
  status: CareCircleStatus;
  role?: CareCircleRole | string | null;
  displayName: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type MemberDetailsPersonal = {
  display_name: string | null;
  phone: string | null;
  gender?: string | null;
  address?: string | null;
} | null;

export type MemberDetailsHealth = {
  date_of_birth: string | null;
  blood_group: string | null;
  bmi: number | null;
  age: number | null;
  current_diagnosed_condition: string[] | null;
  allergies: string[] | null;
  ongoing_treatments: string[] | null;
  current_medication: { name: string; dosage?: string; frequency?: string }[] | null;
  previous_diagnosed_conditions: string[] | null;
  past_surgeries: { name: string; month: number; year: number }[] | null;
  childhood_illness: string[] | null;
  long_term_treatments: string[] | null;
} | null;

export type MemberDetailsAppointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  [key: string]: string;
};

export type MemberDetailsMedication = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  purpose?: string;
  timesPerDay?: number;
  startDate?: string;
  endDate?: string;
  logs?: {
    medicationId: string;
    timestamp: string;
    taken: boolean;
  }[];
};

export type MemberDetailsPayload = {
  personal: MemberDetailsPersonal;
  health: MemberDetailsHealth;
  appointments: MemberDetailsAppointment[];
  medications: MemberDetailsMedication[];
};

export type VaultCategory = 'all' | 'reports' | 'prescriptions' | 'insurance' | 'bills';
export type VaultFolder = Exclude<VaultCategory, 'all'>;

export type MemberVaultFile = {
  name: string;
  created_at: string | null;
  folder: VaultFolder;
  url: string | null;
};

export type ActivityLogDomain = 'vault' | 'medication' | 'appointment';
export type ActivityLogAction = 'upload' | 'rename' | 'delete' | 'add' | 'update';

export type SharedActivityLogRow = {
  id: string;
  profile_id: string;
  source: string;
  domain: ActivityLogDomain;
  action: ActivityLogAction;
  actor_user_id: string;
  actor_display_name: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profile_label?: string | null;
  link_id?: string | null;
};

export type NotificationStateRow = {
  notification_id: string;
  read_at: string | null;
  dismissed_at: string | null;
};

export const careCircleApi = {
  getLinks: (profileId?: string) =>
    apiRequest<{ outgoing: CareCircleLink[]; incoming: CareCircleLink[] }>(
      `/api/care-circle/links${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''}`
    ),

  inviteByContact: (contact: string, profileId: string) =>
    apiRequest<{ recipientId: string }>('/api/care-circle/invite', {
      method: 'POST',
      body: { contact, profileId },
    }),

  respondToInvite: (linkId: string, decision: 'accepted' | 'declined') =>
    apiRequest<{ success: boolean }>('/api/care-circle/respond', {
      method: 'POST',
      body: { linkId, decision },
    }),

  updateRole: (linkId: string, role: CareCircleRole) =>
    apiRequest<{ linkId: string; role: CareCircleRole; updatedCount: number }>(
      '/api/care-circle/role',
      { method: 'PATCH', body: { linkId, role } }
    ),

  getMemberDetails: (linkId: string) =>
    apiRequest<MemberDetailsPayload>(
      `/api/care-circle/member/details?linkId=${encodeURIComponent(linkId)}`
    ),

  getMemberVault: (linkId: string, category: VaultCategory = 'all') =>
    apiRequest<{ files?: MemberVaultFile[] }>(
      `/api/care-circle/member/vault?linkId=${encodeURIComponent(linkId)}&category=${encodeURIComponent(category)}`
    ),

  getMemberVaultSignedUrl: (linkId: string, folder: string, name: string) =>
    apiRequest<{ url?: string }>(
      `/api/care-circle/member/vault/signed?linkId=${encodeURIComponent(linkId)}&folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`
    ),

  uploadMemberVaultFile: (
    linkId: string,
    folder: VaultFolder,
    file: { uri: string; name: string; mimeType?: string | null },
    fileName?: string,
    actorProfileId?: string
  ) => {
    const formData = new FormData();
    formData.append('linkId', linkId);
    formData.append('folder', folder);
    formData.append(
      'file',
      {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'application/octet-stream',
      } as any
    );
    if (fileName?.trim()) {
      formData.append('fileName', fileName.trim());
    }
    if (actorProfileId?.trim()) {
      formData.append('actorProfileId', actorProfileId.trim());
    }
    return apiRequest<{ file?: { name: string; folder: VaultFolder; created_at?: string; path?: string } }>(
      '/api/care-circle/member/vault',
      {
        method: 'POST',
        body: formData,
      }
    );
  },

  renameMemberVaultFile: (
    linkId: string,
    folder: VaultFolder,
    name: string,
    nextName: string,
    actorProfileId?: string
  ) =>
    apiRequest<{ file?: { name: string; folder: VaultFolder } }>('/api/care-circle/member/vault', {
      method: 'PATCH',
      body: { linkId, actorProfileId, folder, name, nextName },
    }),

  deleteMemberVaultFile: (
    linkId: string,
    folder: VaultFolder,
    name: string,
    actorProfileId?: string
  ) =>
    apiRequest<{ deleted?: boolean }>('/api/care-circle/member/vault', {
      method: 'DELETE',
      body: { linkId, actorProfileId, folder, name },
    }),

  addMemberMedication: (
    linkId: string,
    medication: Omit<MemberDetailsMedication, 'id'> & { id?: string },
    actorProfileId?: string
  ) =>
    apiRequest<{ medication?: MemberDetailsMedication; medications?: MemberDetailsMedication[] }>(
      '/api/care-circle/member/medications',
      {
        method: 'POST',
        body: { linkId, actorProfileId, medication },
      }
    ),

  updateMemberMedication: (
    linkId: string,
    medication: MemberDetailsMedication,
    actorProfileId?: string
  ) =>
    apiRequest<{ medication?: MemberDetailsMedication; medications?: MemberDetailsMedication[] }>(
      '/api/care-circle/member/medications',
      {
        method: 'PATCH',
        body: { linkId, actorProfileId, medication },
      }
    ),

  deleteMemberMedication: (linkId: string, medicationId: string, actorProfileId?: string) =>
    apiRequest<{ deleted?: boolean; medications?: MemberDetailsMedication[] }>(
      '/api/care-circle/member/medications',
      {
        method: 'DELETE',
        body: { linkId, actorProfileId, medicationId },
      }
    ),

  addMemberAppointment: (
    linkId: string,
    appointment: Omit<MemberDetailsAppointment, 'id'> & { id?: string },
    actorProfileId?: string
  ) =>
    apiRequest<{ appointment?: MemberDetailsAppointment; appointments?: MemberDetailsAppointment[] }>(
      '/api/care-circle/member/appointments',
      {
        method: 'POST',
        body: { linkId, actorProfileId, appointment },
      }
    ),

  updateMemberAppointment: (
    linkId: string,
    appointment: MemberDetailsAppointment,
    actorProfileId?: string
  ) =>
    apiRequest<{ appointment?: MemberDetailsAppointment; appointments?: MemberDetailsAppointment[] }>(
      '/api/care-circle/member/appointments',
      {
        method: 'PATCH',
        body: { linkId, actorProfileId, appointment },
      }
    ),

  deleteMemberAppointment: (linkId: string, appointmentId: string, actorProfileId?: string) =>
    apiRequest<{ deleted?: boolean; appointments?: MemberDetailsAppointment[] }>(
      '/api/care-circle/member/appointments',
      {
        method: 'DELETE',
        body: { linkId, actorProfileId, appointmentId },
      }
    ),

  getActivity: (limit = 40, sinceHours = 24) =>
    apiRequest<{ logs?: SharedActivityLogRow[] }>(
      `/api/care-circle/activity?limit=${limit}&sinceHours=${sinceHours}`
    ),

  getNotificationStates: (ids: string[]) =>
    apiRequest<{ states?: NotificationStateRow[] }>(
      `/api/notifications/state?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}`
    ),

  updateNotificationStates: (notificationIds: string[], options: { dismissed?: boolean; read?: boolean }) =>
    apiRequest<{ success: boolean }>('/api/notifications/state', {
      method: 'POST',
      body: { notificationIds, ...options },
    }),
};
