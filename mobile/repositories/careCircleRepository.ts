import { careCircleApi } from '@/api';
import type { CareCircleRole, VaultCategory, VaultFolder } from '@/api/modules/carecircle';

export const careCircleRepository = {
  getLinks: (profileId?: string) => careCircleApi.getLinks(profileId),
  inviteByContact: (contact: string, profileId: string) => careCircleApi.inviteByContact(contact, profileId),
  respondToInvite: (linkId: string, decision: 'accepted' | 'declined') => careCircleApi.respondToInvite(linkId, decision),
  updateRole: (linkId: string, role: CareCircleRole) => careCircleApi.updateRole(linkId, role),
  getMemberDetails: (linkId: string) => careCircleApi.getMemberDetails(linkId),
  getMemberVault: (linkId: string, category?: VaultCategory) => careCircleApi.getMemberVault(linkId, category),
  getMemberVaultSignedUrl: (linkId: string, folder: string, name: string) => careCircleApi.getMemberVaultSignedUrl(linkId, folder, name),
  uploadMemberVaultFile: (
    linkId: string,
    folder: VaultFolder,
    file: { uri: string; name: string; mimeType?: string | null },
    fileName?: string,
    actorProfileId?: string
  ) => careCircleApi.uploadMemberVaultFile(linkId, folder, file, fileName, actorProfileId),
  renameMemberVaultFile: (
    linkId: string,
    folder: VaultFolder,
    name: string,
    nextName: string,
    actorProfileId?: string
  ) => careCircleApi.renameMemberVaultFile(linkId, folder, name, nextName, actorProfileId),
  deleteMemberVaultFile: (
    linkId: string,
    folder: VaultFolder,
    name: string,
    actorProfileId?: string
  ) => careCircleApi.deleteMemberVaultFile(linkId, folder, name, actorProfileId),
  getActivity: (limit?: number, sinceHours?: number) => careCircleApi.getActivity(limit, sinceHours),
};
