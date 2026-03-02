'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, CircleHelp, UserPlus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/createClient';
import { useAppProfile } from '@/components/AppProfileProvider';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  INDIA_PHONE_DIGITS,
  PHONE_MAX_DIGITS,
  type CountryOption,
} from '@/lib/countries';

type CareCircleStatus = 'pending' | 'accepted' | 'declined';
type CareCircleRole = 'family' | 'friend';

type CareCircleMember = {
  linkId: string;
  id: string;
  name: string;
  status: CareCircleStatus;
  role: CareCircleRole;
  memberProfileId: string | null;
  profileId: string | null;
  ownerProfileIsPrimary: boolean;
};

type CareCircleData = {
  circleName: string;
  ownerName: string;
  myCircleMembers: CareCircleMember[];
  circlesImIn: CareCircleMember[];
};

type PendingInvite = {
  id: string;
  contact: string;
  sentAt: string;
};

type MemberDetailsPersonal = {
  display_name: string | null;
  phone: string | null;
  gender?: string | null;
  address?: string | null;
} | null;

type MemberDetailsHealth = {
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

type MemberDetailsAppointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  [key: string]: string;
};

type MemberDetailsMedication = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  purpose?: string;
  timesPerDay?: number;
  startDate?: string;
  endDate?: string;
  logs?: Array<{
    medicationId: string;
    timestamp: string;
    taken: boolean;
  }>;
};

type MedicationFormState = {
  id: string | null;
  name: string;
  dosage: string;
  frequency: string;
  purpose: string;
  timesPerDay: string;
  startDate: string;
  endDate: string;
};

type AppointmentFormState = {
  id: string | null;
  title: string;
  date: string;
  time: string;
  type: string;
};

type TimeParts = {
  hour: string;
  minute: string;
  period: string;
};

type MemberDetailsPayload = {
  personal: MemberDetailsPersonal;
  health: MemberDetailsHealth;
  appointments: MemberDetailsAppointment[];
  medications: MemberDetailsMedication[];
};

type VaultCategory = 'all' | 'reports' | 'prescriptions' | 'insurance' | 'bills';
type VaultFolder = Exclude<VaultCategory, 'all'>;
type MemberDetailsTab = 'personal' | 'appointments' | 'medications' | 'vault';

const isMemberDetailsTab = (value: string | null): value is MemberDetailsTab =>
  value === 'personal' || value === 'appointments' || value === 'medications' || value === 'vault';

type MemberVaultFile = {
  name: string;
  created_at: string | null;
  folder: VaultFolder;
  url: string | null;
};

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

type EmergencyCardRecord = {
  name: string | null;
  age: number | null;
  date_of_birth: string | null;
  photo_id_on_file: boolean | null;
  photo_id_last4: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_hospital: string | null;
  insurer_name: string | null;
  plan_type: string | null;
  tpa_helpline: string | null;
  insurance_last4: string | null;
  blood_group: string | null;
  critical_allergies: string | null;
  chronic_conditions: string | null;
  current_meds: string | null;
  emergency_instructions: string | null;
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

const emptyMedicationForm: MedicationFormState = {
  id: null,
  name: '',
  dosage: '',
  frequency: '',
  purpose: '',
  timesPerDay: '1',
  startDate: '',
  endDate: '',
};

const emptyAppointmentForm: AppointmentFormState = {
  id: null,
  title: '',
  date: '',
  time: '',
  type: '',
};

const roleLabels: Record<CareCircleRole, string> = {
  family: 'Family',
  friend: 'Friend',
};

const medicationFrequencyOptions = [
  { label: 'Once daily', value: 'once_daily', times: 1 },
  { label: 'Twice daily', value: 'twice_daily', times: 2 },
  { label: 'Three times daily', value: 'three_times_daily', times: 3 },
  { label: 'Four times daily', value: 'four_times_daily', times: 4 },
  { label: 'Every 4 hours', value: 'every_4_hours', times: 6 },
  { label: 'Every 6 hours', value: 'every_6_hours', times: 4 },
  { label: 'Every 8 hours', value: 'every_8_hours', times: 3 },
  { label: 'Every 12 hours', value: 'every_12_hours', times: 2 },
  { label: 'As needed', value: 'as_needed', times: 0 },
  { label: 'With meals', value: 'with_meals', times: 3 },
  { label: 'Before bed', value: 'before_bed', times: 1 },
] as const;

const appointmentTypeFields = {
  'Doctor Visit': [
    { name: 'doctorName', label: 'Doctor Name', type: 'text', placeholder: 'Enter doctor name' },
    { name: 'specialty', label: 'Specialty', type: 'text', placeholder: 'e.g., Cardiologist' },
    {
      name: 'hospitalName',
      label: 'Hospital/Clinic Name',
      type: 'text',
      placeholder: 'Enter hospital or clinic name',
    },
    { name: 'reason', label: 'Reason for Visit', type: 'text', placeholder: 'Enter reason for visit' },
  ],
  'Lab Test': [
    { name: 'testName', label: 'Test Name', type: 'text', placeholder: 'e.g., Blood Test' },
    { name: 'labName', label: 'Lab Name', type: 'text', placeholder: 'Enter lab name' },
    {
      name: 'instructions',
      label: 'Instructions',
      type: 'textarea',
      placeholder: 'Any pre-test instructions',
    },
  ],
  Hospital: [
    { name: 'hospitalName', label: 'Hospital Name', type: 'text', placeholder: 'Enter hospital name' },
    { name: 'department', label: 'Department', type: 'text', placeholder: 'e.g., Cardiology' },
    { name: 'reason', label: 'Reason for Admission', type: 'text', placeholder: 'Enter reason' },
  ],
  Therapy: [
    { name: 'therapyType', label: 'Type of Therapy', type: 'text', placeholder: 'e.g., Physical Therapy' },
    {
      name: 'therapistName',
      label: 'Therapist Name',
      type: 'text',
      placeholder: 'Enter therapist name',
    },
    { name: 'location', label: 'Location', type: 'text', placeholder: 'Enter clinic/location' },
  ],
  'Follow-up': [
    { name: 'previousDoctor', label: 'Doctor Name', type: 'text', placeholder: 'Enter doctor name' },
    {
      name: 'previousVisitReason',
      label: 'Previous Visit Reason',
      type: 'text',
      placeholder: 'What was the previous visit for?',
    },
    {
      name: 'hospitalName',
      label: 'Hospital/Clinic Name',
      type: 'text',
      placeholder: 'Enter hospital or clinic name',
    },
  ],
  Other: [
    { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the appointment' },
    {
      name: 'contactPerson',
      label: 'Contact Person',
      type: 'text',
      placeholder: 'Enter contact person name',
    },
  ],
} as const;

const appointmentTypeOptions = [
  'Doctor Visit',
  'Lab Test',
  'Hospital',
  'Therapy',
  'Follow-up',
  'Other',
] as const;

const emptyTimeParts: TimeParts = {
  hour: '',
  minute: '',
  period: '',
};

const normalizeCareCircleRole = (value: string | null | undefined): CareCircleRole => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (normalized === 'family') return 'family';
  return 'friend';
};

const isElevatedCareCircleRole = (role: CareCircleRole) => role === 'family';

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const normalizeAppointmentDate = (value: string | null | undefined) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatLocalDate(parsed);
};

const normalizeAppointmentTime = (value: string | null | undefined) => {
  if (!value) return '';
  const trimmed = value.trim();
  const strictMatch = /^(\d{2}):(\d{2})$/.exec(trimmed);
  if (strictMatch) {
    const hour = Number(strictMatch[1]);
    const minute = Number(strictMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  const fallbackMatch = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!fallbackMatch) return '';
  const hour = Number(fallbackMatch[1]);
  const minute = Number(fallbackMatch[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const to24HourTime = (hour: string, minute: string, period: string) => {
  if (!hour || !minute || !period) return '';
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isFinite(parsedHour)) return '';
  if (!Number.isFinite(parsedMinute)) return '';

  let hour24 = parsedHour;
  if (period === 'AM') {
    hour24 = parsedHour === 12 ? 0 : parsedHour;
  } else if (period === 'PM') {
    hour24 = parsedHour === 12 ? 12 : parsedHour + 12;
  } else {
    return '';
  }

  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
};

const from24HourTime = (value: string | null | undefined): TimeParts => {
  const normalizedTime = normalizeAppointmentTime(value);
  const match = /^(\d{2}):(\d{2})$/.exec(normalizedTime);
  if (!match) return { ...emptyTimeParts };

  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24)) return { ...emptyTimeParts };

  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    hour: String(hour12).padStart(2, '0'),
    minute,
    period,
  };
};

const clampTimePart = (value: string, max: number) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number(digits);
  if (!Number.isFinite(numeric)) return '';
  return String(Math.min(numeric, max));
};

const getAppointmentTimestamp = (appointment: Pick<MemberDetailsAppointment, 'date' | 'time'>) => {
  const normalizedDate = normalizeAppointmentDate(appointment.date);
  const normalizedTime = normalizeAppointmentTime(appointment.time);
  if (!normalizedDate || !normalizedTime) return Number.NaN;
  const parsed = new Date(`${normalizedDate}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) return Number.NaN;
  return parsed.getTime();
};

const formatAppointmentTime = (value: string | null | undefined) => {
  const normalizedTime = normalizeAppointmentTime(value);
  if (!normalizedTime) return value?.trim() || '—';
  const parsed = new Date(`1970-01-01T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) return normalizedTime;
  return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatVaultDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const vaultCategoryLabels: Record<VaultCategory, string> = {
  all: 'All',
  reports: 'Lab Reports',
  prescriptions: 'Prescriptions',
  insurance: 'Insurance',
  bills: 'Bills',
};

const VAULT_ALLOWED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'heic',
  'heif',
  'avif',
  'ico',
]);

const vaultFileExtension = (name: string) => name.split('.').pop()?.toLowerCase();
const stripVaultExtension = (name: string) => name.replace(/\.[^/.]+$/, '');
const sanitizeVaultFileName = (name: string) => name.replace(/[\\/]/g, '-').trim();
const isValidVaultFileName = (name: string) =>
  Boolean(name) && !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..';
const buildVaultFileNameForUpload = (file: File, requestedName: string) => {
  const fileExtension = vaultFileExtension(file.name);
  const baseFromInput = stripVaultExtension(sanitizeVaultFileName(requestedName));
  const fallbackBase = stripVaultExtension(sanitizeVaultFileName(file.name)) || 'untitled';
  const base = baseFromInput || fallbackBase;
  return fileExtension ? `${base}.${fileExtension}` : base;
};
const isAllowedVaultUploadType = (file: File) => {
  if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
    return true;
  }
  const extension = vaultFileExtension(file.name);
  return extension === 'pdf' || (extension ? VAULT_ALLOWED_IMAGE_EXTENSIONS.has(extension) : false);
};
const vaultFileKey = (file: Pick<MemberVaultFile, 'folder' | 'name'>) => `${file.folder}:${file.name}`;

const isVaultImageFile = (name: string) => {
  const ext = vaultFileExtension(name);
  return (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'gif' ||
    ext === 'webp' ||
    ext === 'bmp' ||
    ext === 'svg' ||
    ext === 'tif' ||
    ext === 'tiff' ||
    ext === 'heic' ||
    ext === 'heif'
  );
};
const isVaultPdfFile = (name: string) => vaultFileExtension(name) === 'pdf';

type CacheEntry<T> = { ts: number; value: T };
const CARECIRCLE_CACHE_TTL_MS = 5 * 60 * 1000;
const careCircleCacheKey = (cacheOwnerId: string, key: string) => `vytara:carecircle:${cacheOwnerId}:${key}`;
const readCareCircleCache = <T,>(cacheOwnerId: string, key: string): T | null => {
  if (!cacheOwnerId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(careCircleCacheKey(cacheOwnerId, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > CARECIRCLE_CACHE_TTL_MS) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
};
const writeCareCircleCache = <T,>(cacheOwnerId: string, key: string, value: T) => {
  if (!cacheOwnerId || typeof window === 'undefined') return;
  const entry: CacheEntry<T> = { ts: Date.now(), value };
  window.localStorage.setItem(careCircleCacheKey(cacheOwnerId, key), JSON.stringify(entry));
};

type SectionHelpButtonProps = {
  id: string;
  label: string;
  description: string;
};

function SectionHelpButton({ id, label, description }: SectionHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const updatePopoverPosition = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    const viewportPadding = 16;
    const popoverGap = 8;
    const minWidth = 220;
    const maxWidth = 320;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableWidth = Math.max(minWidth, viewportWidth - viewportPadding * 2);
    const width = Math.min(maxWidth, availableWidth);
    const popoverHeight = popoverRef.current?.offsetHeight ?? 120;

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - viewportPadding - width));

    let top = rect.bottom + popoverGap;
    if (top + popoverHeight > viewportHeight - viewportPadding) {
      top = rect.top - popoverHeight - popoverGap;
    }
    top = Math.max(viewportPadding, Math.min(top, viewportHeight - viewportPadding - popoverHeight));

    setPopoverPosition({ left, top, width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleViewportChange = () => updatePopoverPosition();
    updatePopoverPosition();

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, updatePopoverPosition]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={id}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {isOpen ? (
        <div
          ref={popoverRef}
          id={id}
          role="dialog"
          className="fixed z-40 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg shadow-slate-900/10"
          style={
            popoverPosition
              ? {
                  left: `${popoverPosition.left}px`,
                  top: `${popoverPosition.top}px`,
                  width: `${popoverPosition.width}px`,
                }
              : undefined
          }
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-600">
            Quick help
          </p>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function CareCirclePage() {
  const { selectedProfile } = useAppProfile();
  const profileId = selectedProfile?.id ?? '';
  const isSelectedProfilePrimary = Boolean(selectedProfile?.is_primary);
  const [circleData, setCircleData] = useState<CareCircleData>({
    circleName: 'Loading…',
    ownerName: '',
    myCircleMembers: [],
    circlesImIn: [],
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteContact, setInviteContact] = useState('');
  const [inviteCountry, setInviteCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [inviteCountryDropdownOpen, setInviteCountryDropdownOpen] = useState(false);
  const [inviteDropdownPosition, setInviteDropdownPosition] = useState({ top: 0, left: 0 });
  const inviteCountryDropdownRef = useRef<HTMLDivElement | null>(null);
  const inviteCountryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSavingInvite, setIsSavingInvite] = useState(false);
  const [showMyPendingInvites, setShowMyPendingInvites] = useState(false);
  const [showIncomingPendingInvites, setShowIncomingPendingInvites] = useState(false);
  const [incomingInviteError, setIncomingInviteError] = useState<string | null>(null);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [isEmergencyEditing, setIsEmergencyEditing] = useState(false);
  const [emergencyCardOwner, setEmergencyCardOwner] = useState<{
    userId: string;
    profileId: string | null;
    name: string;
  } | null>(null);
  const [emergencyCard, setEmergencyCard] =
    useState<EmergencyCardData>(emptyEmergencyCard);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [isEmergencyLoading, setIsEmergencyLoading] = useState(false);
  const [isSavingEmergency, setIsSavingEmergency] = useState(false);
  const [roleUpdatingLinkId, setRoleUpdatingLinkId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [selectedMember, setSelectedMember] = useState<CareCircleMember | null>(null);
  const [memberDetails, setMemberDetails] = useState<MemberDetailsPayload | null>(null);
  const [memberDetailsLoading, setMemberDetailsLoading] = useState(false);
  const [memberDetailsError, setMemberDetailsError] = useState<string | null>(null);
  const [memberDetailsTab, setMemberDetailsTab] = useState<MemberDetailsTab>('personal');
  const [vaultCategory, setVaultCategory] = useState<VaultCategory>('all');
  const [vaultFiles, setVaultFiles] = useState<MemberVaultFile[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [vaultPreviewFile, setVaultPreviewFile] = useState<MemberVaultFile | null>(null);
  const [vaultPreviewUrl, setVaultPreviewUrl] = useState<string | null>(null);
  const [vaultPreviewLoading, setVaultPreviewLoading] = useState(false);
  const [showVaultUploadModal, setShowVaultUploadModal] = useState(false);
  const [vaultUploadCategory, setVaultUploadCategory] = useState<VaultFolder>('reports');
  const [vaultUploadFile, setVaultUploadFile] = useState<File | null>(null);
  const [vaultUploadFileName, setVaultUploadFileName] = useState('');
  const [vaultUploadError, setVaultUploadError] = useState<string | null>(null);
  const [vaultUploading, setVaultUploading] = useState(false);
  const [vaultRenamingKey, setVaultRenamingKey] = useState<string | null>(null);
  const [vaultDeletingKey, setVaultDeletingKey] = useState<string | null>(null);
  const [medicationActionError, setMedicationActionError] = useState<string | null>(null);
  const [showMedicationFormModal, setShowMedicationFormModal] = useState(false);
  const [medicationFormMode, setMedicationFormMode] = useState<'add' | 'edit'>('add');
  const [medicationForm, setMedicationForm] = useState<MedicationFormState>(emptyMedicationForm);
  const [medicationSaving, setMedicationSaving] = useState(false);
  const [medicationDeletingId, setMedicationDeletingId] = useState<string | null>(null);
  const [appointmentActionError, setAppointmentActionError] = useState<string | null>(null);
  const [showAppointmentFormModal, setShowAppointmentFormModal] = useState(false);
  const [appointmentFormMode, setAppointmentFormMode] = useState<'add' | 'edit'>('add');
  const [appointmentForm, setAppointmentForm] = useState<AppointmentFormState>(emptyAppointmentForm);
  const [appointmentTime, setAppointmentTime] = useState<TimeParts>(emptyTimeParts);
  const [appointmentAdditionalFields, setAppointmentAdditionalFields] = useState<Record<string, string>>(
    {}
  );
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentDeletingId, setAppointmentDeletingId] = useState<string | null>(null);
  const [pendingMemberLinkId, setPendingMemberLinkId] = useState<string | null>(null);
  const [pendingMemberTab, setPendingMemberTab] = useState<MemberDetailsTab | null>(null);
  const hasAppliedMemberDeepLinkRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const openTarget = params.get('open');
    if (openTarget === 'incoming-invites') {
      setShowIncomingPendingInvites(true);
      setShowMyPendingInvites(false);
    }
    const memberLinkId = params.get('memberLinkId')?.trim() || null;
    const tabParam = params.get('tab');
    setPendingMemberLinkId(memberLinkId);
    setPendingMemberTab(isMemberDetailsTab(tabParam) ? tabParam : null);
    hasAppliedMemberDeepLinkRef.current = false;
  }, []);

  useEffect(() => {
    if (!pendingMemberLinkId || hasAppliedMemberDeepLinkRef.current) return;

    const allMembers = [...circleData.myCircleMembers, ...circleData.circlesImIn];
    const targetMember = allMembers.find(
      (member) => member.linkId === pendingMemberLinkId && member.status === 'accepted'
    );
    if (!targetMember) return;

    hasAppliedMemberDeepLinkRef.current = true;
    setShowIncomingPendingInvites(false);
    setShowMyPendingInvites(false);
    setSelectedMember(targetMember);
    setMemberDetailsTab(pendingMemberTab ?? 'personal');

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('memberLinkId');
      url.searchParams.delete('tab');
      const nextSearch = url.searchParams.toString();
      const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [circleData.circlesImIn, circleData.myCircleMembers, pendingMemberLinkId, pendingMemberTab]);

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

    const card = data as EmergencyCardRecord | null;

    if (!card) {
      setEmergencyCard(emptyEmergencyCard);
      setIsEmergencyLoading(false);
      return;
    }

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

  const loadCareCircle = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session?.user) {
      return;
    }
    const user = session.user;
    setCurrentUserId((prev) => (prev === user.id ? prev : user.id));
    const cacheOwnerId = profileId || user.id;

    const cachedCircleData = readCareCircleCache<CareCircleData>(cacheOwnerId, 'circleData');
    const hasRoleAwareCache =
      cachedCircleData &&
      Array.isArray(cachedCircleData.myCircleMembers) &&
      Array.isArray(cachedCircleData.circlesImIn) &&
      cachedCircleData.myCircleMembers.every(
        (member) =>
          typeof (member as CareCircleMember).linkId === 'string' &&
          typeof (member as CareCircleMember).ownerProfileIsPrimary === 'boolean'
      ) &&
      cachedCircleData.circlesImIn.every(
        (member) =>
          typeof (member as CareCircleMember).linkId === 'string' &&
          typeof (member as CareCircleMember).ownerProfileIsPrimary === 'boolean'
      );
    if (hasRoleAwareCache && cachedCircleData) {
      setCircleData(cachedCircleData);
      setEmergencyCardOwner((prev) =>
        prev || { userId: user.id, profileId: profileId || null, name: cachedCircleData.ownerName }
      );
    }
    const cachedPendingInvites = readCareCircleCache<PendingInvite[]>(cacheOwnerId, 'pendingInvites');
    if (cachedPendingInvites) {
      setPendingInvites(cachedPendingInvites);
    }

    const displayName =
      selectedProfile?.display_name?.trim() ||
      selectedProfile?.name?.trim() ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.phone ||
      'Your';

    const circleName = `${displayName}'s Care Circle`;

    if (profileId) {
      await loadEmergencyCard(profileId);
    } else {
      setEmergencyCard(emptyEmergencyCard);
    }
    setEmergencyCardOwner((prev) => {
      if (!prev || prev.userId === user.id) {
        return { userId: user.id, profileId: profileId || null, name: displayName };
      }
      return prev;
    });

    const response = await fetch(
      `/api/care-circle/links${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''}`,
      {
      cache: 'no-store',
      }
    );

    if (!response.ok) {
      return;
    }

    const linksData: {
      outgoing: Array<{
        id: string;
        memberId: string;
        memberProfileId: string | null;
        profileId: string | null;
        ownerProfileIsPrimary: boolean;
        status: CareCircleStatus;
        role?: string | null;
        displayName: string;
        createdAt: string;
        updatedAt?: string | null;
      }>;
      incoming: Array<{
        id: string;
        memberId: string;
        memberProfileId: string | null;
        profileId: string | null;
        ownerProfileIsPrimary: boolean;
        status: CareCircleStatus;
        role?: string | null;
        displayName: string;
        createdAt: string;
        updatedAt?: string | null;
      }>;
    } = await response.json();

    const myCircleMembers = linksData.outgoing.map((link) => ({
      linkId: link.id,
      id: link.memberId,
      name: link.displayName,
      status: link.status,
      role: normalizeCareCircleRole(link.role),
      memberProfileId: link.memberProfileId,
      profileId: link.profileId,
      ownerProfileIsPrimary: link.ownerProfileIsPrimary,
    }));

    const circlesImIn = linksData.incoming.map((link) => ({
      linkId: link.id,
      id: link.memberId,
      name: link.displayName,
      status: link.status,
      role: normalizeCareCircleRole(link.role),
      memberProfileId: link.memberProfileId,
      profileId: link.profileId,
      ownerProfileIsPrimary: link.ownerProfileIsPrimary,
    }));

    const nextPendingInvites = linksData.outgoing
      .filter((link) => link.status === 'pending')
      .map((link) => ({
        id: link.id,
        contact: link.displayName,
        sentAt: link.createdAt,
      }));
    setPendingInvites(nextPendingInvites);

    const nextCircleData: CareCircleData = {
      circleName,
      ownerName: displayName,
      myCircleMembers,
      circlesImIn,
    };
    setCircleData(nextCircleData);
    writeCareCircleCache(cacheOwnerId, 'pendingInvites', nextPendingInvites);
    writeCareCircleCache(cacheOwnerId, 'circleData', nextCircleData);
  }, [loadEmergencyCard, profileId, selectedProfile?.display_name, selectedProfile?.name]);

  useEffect(() => {
    loadCareCircle();
  }, [loadCareCircle]);

  useEffect(() => {
    if (!inviteCountryDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = inviteCountryDropdownRef.current?.contains(target);
      const inPortal = document.getElementById('carecircle-invite-country-dropdown')?.contains(target);
      if (!inTrigger && !inPortal) setInviteCountryDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inviteCountryDropdownOpen]);

  useEffect(() => {
    if (!inviteCountryDropdownOpen || !inviteCountryTriggerRef.current) return;
    const el = inviteCountryTriggerRef.current;
    const rect = el.getBoundingClientRect();
    setInviteDropdownPosition({ top: rect.bottom + 4, left: rect.left });
  }, [inviteCountryDropdownOpen]);

  const handleRemove = async (member: CareCircleMember) => {
    if (!currentUserId) {
      return;
    }
    await supabase
      .from('care_circle_links')
      .delete()
      .eq('requester_id', currentUserId)
      .eq('recipient_id', member.id);
    await loadCareCircle();
  };

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileId) {
      setInviteError('Please select a profile before sending invites.');
      return;
    }
    if (!isSelectedProfilePrimary) {
      setInviteError('Only the primary profile can send care circle invites.');
      return;
    }
    const digitsOnly = inviteContact.replace(/\D/g, '');
    if (!digitsOnly) {
      setInviteError('Please enter a phone number.');
      return;
    }

    const isIndia = inviteCountry.code === 'IN';
    const minLen = isIndia ? INDIA_PHONE_DIGITS : 10;
    if (digitsOnly.length < minLen || digitsOnly.length > PHONE_MAX_DIGITS) {
      setInviteError(
        isIndia
          ? 'Please enter a valid 10-digit phone number.'
          : 'Please enter a valid phone number (10–15 digits).'
      );
      return;
    }

    if (!currentUserId) {
      setInviteError('Please sign in again to send invites.');
      return;
    }

    const fullContact = `${inviteCountry.dialCode}${digitsOnly}`;
    setIsSavingInvite(true);
    setInviteError(null);

    const response = await fetch('/api/care-circle/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact: fullContact, profileId }),
    });

    if (!response.ok) {
      const errorPayload: { message?: string } = await response.json();
      setInviteError(errorPayload.message ?? 'Unable to send invite.');
      setIsSavingInvite(false);
      return;
    }

    setInviteContact('');
    setInviteCountry(DEFAULT_COUNTRY);
    setIsInviteOpen(false);
    setIsSavingInvite(false);
    await loadCareCircle();
  };

  const handleRespondToInvite = async (linkId: string, decision: 'accepted' | 'declined') => {
    if (!currentUserId) {
      return;
    }
    setIncomingInviteError(null);
    const response = await fetch('/api/care-circle/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId, decision }),
    });
    if (!response.ok) {
      const payload: { message?: string } = await response.json().catch(() => ({}));
      setIncomingInviteError(payload.message ?? 'Unable to update invite.');
      return;
    }
    await loadCareCircle();
  };

  const handleAcceptCircleInvite = async (linkId: string) => {
    await handleRespondToInvite(linkId, 'accepted');
  };

  const handleDeclineCircleInvite = async (linkId: string) => {
    await handleRespondToInvite(linkId, 'declined');
  };

  const handleUpdateRole = async (member: CareCircleMember, role: CareCircleRole) => {
    if (!member.linkId || role === member.role) return;
    setRoleUpdatingLinkId(member.linkId);
    setRoleError(null);
    const response = await fetch('/api/care-circle/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: member.linkId, role }),
    });

    if (!response.ok) {
      const payload: { message?: string } = await response.json().catch(() => ({}));
      setRoleError(payload.message ?? 'Unable to update member role.');
      setRoleUpdatingLinkId(null);
      return;
    }

    setRoleUpdatingLinkId(null);
    await loadCareCircle();
  };

  const closeVaultUploadModal = useCallback(() => {
    setShowVaultUploadModal(false);
    setVaultUploadCategory('reports');
    setVaultUploadFile(null);
    setVaultUploadFileName('');
    setVaultUploadError(null);
    setVaultUploading(false);
  }, []);

  const closeMedicationFormModal = useCallback(() => {
    setShowMedicationFormModal(false);
    setMedicationSaving(false);
    setMedicationActionError(null);
    setMedicationFormMode('add');
    setMedicationForm(emptyMedicationForm);
  }, []);

  const openAddMedicationModal = useCallback(() => {
    setMedicationActionError(null);
    setMedicationFormMode('add');
    setMedicationForm({
      ...emptyMedicationForm,
      startDate: formatLocalDate(new Date()),
    });
    setShowMedicationFormModal(true);
  }, []);

  const openEditMedicationModal = useCallback((medication: MemberDetailsMedication) => {
    setMedicationActionError(null);
    setMedicationFormMode('edit');
    const matchingOption = medicationFrequencyOptions.find(
      (option) => option.value === medication.frequency
    );
    setMedicationForm({
      id: medication.id,
      name: medication.name || '',
      dosage: medication.dosage || '',
      frequency: medication.frequency || '',
      purpose: medication.purpose || '',
      timesPerDay: matchingOption
        ? String(matchingOption.times)
        : medication.timesPerDay !== undefined && medication.timesPerDay !== null
        ? String(medication.timesPerDay)
        : '1',
      startDate: medication.startDate || '',
      endDate: medication.endDate || '',
    });
    setShowMedicationFormModal(true);
  }, []);

  const handleMedicationFrequencyChange = useCallback((value: string) => {
    const selected = medicationFrequencyOptions.find((option) => option.value === value);
    setMedicationForm((prev) => ({
      ...prev,
      frequency: value,
      timesPerDay: selected ? String(selected.times) : prev.timesPerDay,
    }));
  }, []);

  const closeAppointmentFormModal = useCallback(() => {
    setShowAppointmentFormModal(false);
    setAppointmentFormMode('add');
    setAppointmentForm(emptyAppointmentForm);
    setAppointmentTime(emptyTimeParts);
    setAppointmentAdditionalFields({});
    setAppointmentActionError(null);
    setAppointmentSaving(false);
  }, []);

  const openAddAppointmentModal = useCallback(() => {
    setAppointmentActionError(null);
    setAppointmentFormMode('add');
    setAppointmentForm({
      ...emptyAppointmentForm,
      date: formatLocalDate(new Date()),
    });
    setAppointmentTime(emptyTimeParts);
    setAppointmentAdditionalFields({});
    setShowAppointmentFormModal(true);
  }, []);

  const openEditAppointmentModal = useCallback((appointment: MemberDetailsAppointment) => {
    const typeFields =
      appointmentTypeFields[appointment.type as keyof typeof appointmentTypeFields] ?? [];
    const nextAdditionalFields = typeFields.reduce<Record<string, string>>((acc, field) => {
      acc[field.name] = appointment[field.name] || '';
      return acc;
    }, {});

    setAppointmentActionError(null);
    setAppointmentFormMode('edit');
    const normalizedTime = normalizeAppointmentTime(appointment.time) || appointment.time || '';
    setAppointmentForm({
      id: appointment.id,
      title: appointment.title || '',
      date: normalizeAppointmentDate(appointment.date) || appointment.date || '',
      time: normalizedTime,
      type: appointment.type || '',
    });
    setAppointmentTime(from24HourTime(normalizedTime));
    setAppointmentAdditionalFields(nextAdditionalFields);
    setShowAppointmentFormModal(true);
  }, []);

  const updateAppointmentTime = useCallback((next: Partial<TimeParts>) => {
    setAppointmentActionError(null);
    setAppointmentTime((prev) => {
      const updated = { ...prev, ...next };
      setAppointmentForm((form) => ({
        ...form,
        time: to24HourTime(updated.hour, updated.minute, updated.period),
      }));
      return updated;
    });
  }, []);

  const handleAppointmentTypeChange = useCallback((value: string) => {
    const typeFields = appointmentTypeFields[value as keyof typeof appointmentTypeFields] ?? [];
    setAppointmentForm((prev) => ({ ...prev, type: value }));
    setAppointmentAdditionalFields((prev) =>
      typeFields.reduce<Record<string, string>>((acc, field) => {
        acc[field.name] = prev[field.name] || '';
        return acc;
      }, {})
    );
  }, []);

  useEffect(() => {
    if (!selectedMember) {
      setMemberDetails(null);
      setMemberDetailsError(null);
      setMemberDetailsTab('personal');
      setVaultCategory('all');
      setVaultFiles([]);
      setVaultError(null);
      setVaultLoading(false);
      setVaultSearchQuery('');
      setVaultPreviewFile(null);
      setVaultPreviewUrl(null);
      setVaultPreviewLoading(false);
      closeVaultUploadModal();
      setVaultRenamingKey(null);
      setVaultDeletingKey(null);
      closeMedicationFormModal();
      setMedicationActionError(null);
      setMedicationDeletingId(null);
      closeAppointmentFormModal();
      setAppointmentActionError(null);
      setAppointmentDeletingId(null);
      return;
    }

    let cancelled = false;
    setMemberDetailsLoading(true);
    setMemberDetailsError(null);
    setMemberDetails(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/care-circle/member/details?linkId=${encodeURIComponent(selectedMember.linkId)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message ?? 'Failed to load member details');
        }
        const data = (await res.json()) as MemberDetailsPayload;
        if (!cancelled) {
          setMemberDetails(data);
        }
      } catch (error) {
        if (!cancelled) {
          setMemberDetailsError(
            error instanceof Error ? error.message : 'Failed to load member details'
          );
        }
      } finally {
        if (!cancelled) {
          setMemberDetailsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [closeAppointmentFormModal, closeMedicationFormModal, closeVaultUploadModal, selectedMember]);

  const closeMemberDetailsModal = () => {
    setSelectedMember(null);
    setMemberDetails(null);
    setMemberDetailsError(null);
    setMemberDetailsTab('personal');
    setVaultCategory('all');
    setVaultFiles([]);
    setVaultError(null);
    setVaultLoading(false);
    setVaultSearchQuery('');
    setVaultPreviewFile(null);
    setVaultPreviewUrl(null);
    setVaultPreviewLoading(false);
    closeVaultUploadModal();
    setVaultRenamingKey(null);
    setVaultDeletingKey(null);
    closeMedicationFormModal();
    setMedicationActionError(null);
    setMedicationDeletingId(null);
    closeAppointmentFormModal();
    setAppointmentActionError(null);
    setAppointmentDeletingId(null);
  };

  const fetchVaultFiles = useCallback(async (linkId: string, category: VaultCategory) => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const res = await fetch(
        `/api/care-circle/member/vault?linkId=${encodeURIComponent(linkId)}&category=${encodeURIComponent(
          category
        )}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? 'Failed to load vault files.');
      }
      const data = (await res.json()) as { files?: MemberVaultFile[] };
      setVaultFiles(Array.isArray(data.files) ? data.files : []);
    } catch (error) {
      setVaultFiles([]);
      setVaultError(error instanceof Error ? error.message : 'Failed to load vault files.');
    } finally {
      setVaultLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedMember || memberDetailsTab !== 'vault') return;
    fetchVaultFiles(selectedMember.linkId, vaultCategory);
  }, [fetchVaultFiles, memberDetailsTab, selectedMember, vaultCategory]);

  const handleVaultPreview = useCallback(
    async (file: MemberVaultFile) => {
      if (!selectedMember) return;
      setVaultPreviewFile(file);
      setVaultPreviewLoading(true);
      setVaultPreviewUrl(null);

      try {
        const res = await fetch(
          `/api/care-circle/member/vault/signed?linkId=${encodeURIComponent(
            selectedMember.linkId
          )}&folder=${encodeURIComponent(file.folder)}&name=${encodeURIComponent(file.name)}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message ?? 'Unable to load preview.');
        }
        const data = (await res.json()) as { url?: string };
        setVaultPreviewUrl(data.url ?? null);
      } catch {
        setVaultPreviewUrl(null);
      } finally {
        setVaultPreviewLoading(false);
      }
    },
    [selectedMember]
  );

  const handleVaultUpload = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedMember || !vaultUploadFile) return;

      if (!isAllowedVaultUploadType(vaultUploadFile)) {
        setVaultUploadError('Only PDF and image files are allowed.');
        return;
      }

      const finalName = buildVaultFileNameForUpload(vaultUploadFile, vaultUploadFileName);
      if (!isValidVaultFileName(finalName)) {
        setVaultUploadError('Please enter a valid file name.');
        return;
      }

      setVaultUploading(true);
      setVaultUploadError(null);
      setVaultError(null);

      try {
        const formData = new FormData();
        formData.append('linkId', selectedMember.linkId);
        formData.append('folder', vaultUploadCategory);
        formData.append('file', vaultUploadFile);
        formData.append('fileName', finalName);
        if (profileId) {
          formData.append('actorProfileId', profileId);
        }

        const response = await fetch('/api/care-circle/member/vault', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const payload: { message?: string } = await response.json().catch(() => ({}));
          throw new Error(payload.message ?? 'Failed to upload file.');
        }

        closeVaultUploadModal();
        await fetchVaultFiles(selectedMember.linkId, vaultCategory);
      } catch (error) {
        setVaultUploadError(error instanceof Error ? error.message : 'Failed to upload file.');
      } finally {
        setVaultUploading(false);
      }
    },
    [
      closeVaultUploadModal,
      fetchVaultFiles,
      profileId,
      selectedMember,
      vaultCategory,
      vaultUploadCategory,
      vaultUploadFile,
      vaultUploadFileName,
    ]
  );

  const handleVaultRename = useCallback(
    async (file: MemberVaultFile) => {
      if (!selectedMember) return;
      const nextName = window.prompt('Rename file', file.name)?.trim();
      if (!nextName || nextName === file.name) return;
      if (!isValidVaultFileName(nextName)) {
        window.alert("File name can't include slashes.");
        return;
      }

      const fileKey = vaultFileKey(file);
      setVaultRenamingKey(fileKey);
      setVaultError(null);

      try {
        const response = await fetch('/api/care-circle/member/vault', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: selectedMember.linkId,
            folder: file.folder,
            name: file.name,
            nextName,
            actorProfileId: profileId || undefined,
          }),
        });

        if (!response.ok) {
          const payload: { message?: string } = await response.json().catch(() => ({}));
          throw new Error(payload.message ?? 'Failed to rename file.');
        }

        await fetchVaultFiles(selectedMember.linkId, vaultCategory);
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : 'Failed to rename file.');
      } finally {
        setVaultRenamingKey(null);
      }
    },
    [fetchVaultFiles, profileId, selectedMember, vaultCategory]
  );

  const handleVaultDelete = useCallback(
    async (file: MemberVaultFile) => {
      if (!selectedMember) return;
      const confirmed = window.confirm(`Delete "${file.name}"?`);
      if (!confirmed) return;

      const fileKey = vaultFileKey(file);
      setVaultDeletingKey(fileKey);
      setVaultError(null);

      try {
        const response = await fetch('/api/care-circle/member/vault', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: selectedMember.linkId,
            folder: file.folder,
            name: file.name,
            actorProfileId: profileId || undefined,
          }),
        });

        if (!response.ok) {
          const payload: { message?: string } = await response.json().catch(() => ({}));
          throw new Error(payload.message ?? 'Failed to delete file.');
        }

        await fetchVaultFiles(selectedMember.linkId, vaultCategory);
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : 'Failed to delete file.');
      } finally {
        setVaultDeletingKey(null);
      }
    },
    [fetchVaultFiles, profileId, selectedMember, vaultCategory]
  );

  const handleMedicationSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedMember) return;

      const name = medicationForm.name.trim();
      const dosage = medicationForm.dosage.trim();
      const frequency = medicationForm.frequency.trim();
      const purpose = medicationForm.purpose.trim();
      const timesRaw = medicationForm.timesPerDay.trim();
      const startDate = medicationForm.startDate.trim();
      const endDate = medicationForm.endDate.trim();

      if (!name || !dosage || !frequency) {
        setMedicationActionError('Medication name, dosage, and frequency are required.');
        return;
      }

      const selectedFrequency = medicationFrequencyOptions.find(
        (option) => option.value === frequency
      );
      const parsedTimes = Number.parseInt(timesRaw, 10);
      const timesPerDay = selectedFrequency
        ? selectedFrequency.times
        : Number.isFinite(parsedTimes)
        ? parsedTimes
        : undefined;
      if (timesPerDay === undefined || timesPerDay < 0) {
        setMedicationActionError('Times per day must be a non-negative number.');
        return;
      }

      const normalizedStartDate = startDate || formatLocalDate(new Date());

      setMedicationSaving(true);
      setMedicationActionError(null);

      try {
        const response = await fetch('/api/care-circle/member/medications', {
          method: medicationFormMode === 'add' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: selectedMember.linkId,
            actorProfileId: profileId || undefined,
            medication: {
              ...(medicationFormMode === 'edit' ? { id: medicationForm.id } : {}),
              name,
              dosage,
              frequency,
              purpose,
              timesPerDay,
              startDate: normalizedStartDate,
              endDate: endDate || undefined,
              ...(medicationFormMode === 'add' ? { logs: [] } : {}),
            },
          }),
        });

        const payload: { message?: string; medications?: MemberDetailsMedication[] } = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to save medication.');
        }

        if (Array.isArray(payload.medications)) {
          setMemberDetails((prev) => (prev ? { ...prev, medications: payload.medications || [] } : prev));
        }
        closeMedicationFormModal();
      } catch (error) {
        setMedicationActionError(error instanceof Error ? error.message : 'Failed to save medication.');
      } finally {
        setMedicationSaving(false);
      }
    },
    [closeMedicationFormModal, medicationForm, medicationFormMode, profileId, selectedMember]
  );

  const handleMedicationDelete = useCallback(
    async (medication: MemberDetailsMedication) => {
      if (!selectedMember) return;
      const confirmed = window.confirm(`Delete "${medication.name}"?`);
      if (!confirmed) return;

      setMedicationDeletingId(medication.id);
      setMedicationActionError(null);

      try {
        const response = await fetch('/api/care-circle/member/medications', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: selectedMember.linkId,
            medicationId: medication.id,
            actorProfileId: profileId || undefined,
          }),
        });

        const payload: { message?: string; medications?: MemberDetailsMedication[] } = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to delete medication.');
        }

        if (Array.isArray(payload.medications)) {
          setMemberDetails((prev) => (prev ? { ...prev, medications: payload.medications || [] } : prev));
        }
      } catch (error) {
        setMedicationActionError(error instanceof Error ? error.message : 'Failed to delete medication.');
      } finally {
        setMedicationDeletingId(null);
      }
    },
    [profileId, selectedMember]
  );

  const handleAppointmentSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedMember) return;

      const title = appointmentForm.title.trim();
      const date = appointmentForm.date.trim();
      const time = appointmentForm.time.trim();
      const type = appointmentForm.type.trim();

      if (!title || !date || !time || !type) {
        setAppointmentActionError('Title, date, time, and type are required.');
        return;
      }

      const appointmentDateTime = new Date(`${date}T${time}`);
      if (Number.isNaN(appointmentDateTime.getTime()) || appointmentDateTime <= new Date()) {
        setAppointmentActionError('Please select a future date and time for the appointment.');
        return;
      }

      const typeFields = appointmentTypeFields[type as keyof typeof appointmentTypeFields] ?? [];
      const normalizedAdditionalFields = typeFields.reduce<Record<string, string>>((acc, field) => {
        acc[field.name] = (appointmentAdditionalFields[field.name] || '').trim();
        return acc;
      }, {});

      setAppointmentSaving(true);
      setAppointmentActionError(null);

      try {
        const response = await fetch('/api/care-circle/member/appointments', {
          method: appointmentFormMode === 'add' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: selectedMember.linkId,
            actorProfileId: profileId || undefined,
            appointment: {
              id:
                appointmentFormMode === 'edit' && appointmentForm.id
                  ? appointmentForm.id
                  : crypto.randomUUID(),
              title,
              date,
              time,
              type,
              ...normalizedAdditionalFields,
            },
          }),
        });

        const payload: { message?: string; appointments?: MemberDetailsAppointment[] } = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to save appointment.');
        }

        if (Array.isArray(payload.appointments)) {
          setMemberDetails((prev) => (prev ? { ...prev, appointments: payload.appointments || [] } : prev));
        }

        closeAppointmentFormModal();
      } catch (error) {
        setAppointmentActionError(error instanceof Error ? error.message : 'Failed to save appointment.');
      } finally {
        setAppointmentSaving(false);
      }
    },
    [
      appointmentAdditionalFields,
      appointmentForm,
      appointmentFormMode,
      closeAppointmentFormModal,
      profileId,
      selectedMember,
    ]
  );

  const handleAppointmentDelete = useCallback(
    async (appointment: MemberDetailsAppointment) => {
      if (!selectedMember) return;
      const confirmed = window.confirm(`Delete "${appointment.title}"?`);
      if (!confirmed) return;

      setAppointmentDeletingId(appointment.id);
      setAppointmentActionError(null);

      try {
        const response = await fetch('/api/care-circle/member/appointments', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: selectedMember.linkId,
            appointmentId: appointment.id,
            actorProfileId: profileId || undefined,
          }),
        });

        const payload: { message?: string; appointments?: MemberDetailsAppointment[] } = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to delete appointment.');
        }

        if (Array.isArray(payload.appointments)) {
          setMemberDetails((prev) => (prev ? { ...prev, appointments: payload.appointments || [] } : prev));
        }
      } catch (error) {
        setAppointmentActionError(
          error instanceof Error ? error.message : 'Failed to delete appointment.'
        );
      } finally {
        setAppointmentDeletingId(null);
      }
    },
    [profileId, selectedMember]
  );

  const handleEmergencyChange = <Key extends keyof EmergencyCardData>(
    key: Key,
    value: EmergencyCardData[Key]
  ) => {
    setEmergencyCard((prev) => ({ ...prev, [key]: value }));
  };

  const handleEmergencySave = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!currentUserId || !profileId) {
      setEmergencyError('Please sign in again to save this card.');
      return;
    }

    setIsSavingEmergency(true);
    setEmergencyError(null);

    const payload = {
      profile_id: profileId,
      user_id: currentUserId,
      name: emergencyCard.name || null,
      age: emergencyCard.age ? Number(emergencyCard.age) : null,
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

  const handleViewOwnEmergencyCard = async () => {
    if (!currentUserId || !profileId) {
      return;
    }
    const ownerName = circleData.ownerName || 'Your';
    const isViewingOwn = emergencyCardOwner?.userId === currentUserId;

    if (isEmergencyOpen && isViewingOwn) {
      setIsEmergencyOpen(false);
      return;
    }

    setIsEmergencyOpen(true);
    setIsEmergencyEditing(false);
    setEmergencyCardOwner({ userId: currentUserId, profileId, name: ownerName });
    await loadEmergencyCard(profileId);
  };

  const handleViewMemberEmergencyCard = async (member: CareCircleMember) => {
    if (!member.memberProfileId) {
      return;
    }
    setIsEmergencyOpen(true);
    setIsEmergencyEditing(false);
    setEmergencyCardOwner({
      userId: member.id,
      profileId: member.memberProfileId,
      name: member.name,
    });
    await loadEmergencyCard(member.memberProfileId);
  };

  const handleViewMemberDetails = (member: CareCircleMember) => {
    setSelectedMember(member);
    setMemberDetailsTab('personal');
    setVaultCategory('all');
    setVaultSearchQuery('');
    setVaultFiles([]);
    setVaultError(null);
    setVaultPreviewFile(null);
    setVaultPreviewUrl(null);
    closeVaultUploadModal();
    setVaultRenamingKey(null);
    setVaultDeletingKey(null);
    closeMedicationFormModal();
    setMedicationActionError(null);
    setMedicationDeletingId(null);
    closeAppointmentFormModal();
    setAppointmentActionError(null);
    setAppointmentDeletingId(null);
  };

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

  const isViewingExternalCard =
    emergencyCardOwner?.userId &&
    currentUserId &&
    emergencyCardOwner.userId !== currentUserId;

  const emergencyCardOwnerLabel = useMemo(() => {
    if (!emergencyCardOwner?.name) {
      return null;
    }
    if (emergencyCardOwner.userId === currentUserId) {
      return 'your';
    }
    return `${emergencyCardOwner.name}'s`;
  }, [currentUserId, emergencyCardOwner]);

  const activeMembers = useMemo(
    () =>
      circleData.myCircleMembers.filter(
        (member) => member.status === 'accepted' && member.id !== currentUserId
      ),
    [circleData.myCircleMembers, currentUserId]
  );

  const pendingCircleInvites = useMemo(
    () => circleData.circlesImIn.filter((member) => member.status === 'pending'),
    [circleData.circlesImIn]
  );

  const activeCirclesImIn = useMemo(
    () => circleData.circlesImIn.filter((member) => member.status === 'accepted'),
    [circleData.circlesImIn]
  );

  const primaryProfileNameByMemberId = useMemo(() => {
    const map = new Map<string, string>();
    activeCirclesImIn.forEach((member) => {
      if (member.ownerProfileIsPrimary && !map.has(member.id)) {
        map.set(member.id, member.name);
      }
    });
    return map;
  }, [activeCirclesImIn]);

  const canManageSelectedMemberVault =
    Boolean(selectedMember) &&
    selectedMember?.status === 'accepted' &&
    isElevatedCareCircleRole(selectedMember.role);
  const canManageSelectedMemberMedications = canManageSelectedMemberVault;
  const canManageSelectedMemberAppointments = canManageSelectedMemberVault;

  const sortedMemberMedications = useMemo(() => {
    const medications = memberDetails?.medications || [];
    return [...medications].sort((a, b) => {
      const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
      return bStart - aStart;
    });
  }, [memberDetails?.medications]);

  const sortedMemberAppointments = useMemo(() => {
    const appointments = memberDetails?.appointments || [];
    return [...appointments].sort((a, b) => {
      const aTimestamp = getAppointmentTimestamp(a);
      const bTimestamp = getAppointmentTimestamp(b);
      const aValid = Number.isFinite(aTimestamp);
      const bValid = Number.isFinite(bTimestamp);

      if (!aValid && !bValid) return (a.title || '').localeCompare(b.title || '');
      if (!aValid) return 1;
      if (!bValid) return -1;
      return aTimestamp - bTimestamp;
    });
  }, [memberDetails?.appointments]);

  const { upcomingMemberAppointments, pastMemberAppointments, undatedMemberAppointments } = useMemo(() => {
    const now = Date.now();
    const upcoming: MemberDetailsAppointment[] = [];
    const past: MemberDetailsAppointment[] = [];
    const undated: MemberDetailsAppointment[] = [];

    sortedMemberAppointments.forEach((appointment) => {
      const timestamp = getAppointmentTimestamp(appointment);
      if (!Number.isFinite(timestamp)) {
        undated.push(appointment);
        return;
      }

      if (timestamp >= now) {
        upcoming.push(appointment);
      } else {
        past.push(appointment);
      }
    });

    past.sort((a, b) => getAppointmentTimestamp(b) - getAppointmentTimestamp(a));

    return {
      upcomingMemberAppointments: upcoming,
      pastMemberAppointments: past,
      undatedMemberAppointments: undated,
    };
  }, [sortedMemberAppointments]);

  const filteredVaultFiles = useMemo(
    () =>
      vaultFiles.filter((file) =>
        file.name.toLowerCase().includes(vaultSearchQuery.trim().toLowerCase())
      ),
    [vaultFiles, vaultSearchQuery]
  );

  const hasMyPendingInvites = pendingInvites.length > 0;
  const hasIncomingPendingInvites = pendingCircleInvites.length > 0;

  return (
    <div className="min-h-screen bg-[#f4f7f8]">
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <section className="bg-white rounded-3xl border border-white/20 shadow-xl shadow-teal-900/10 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-teal-600 font-semibold">
                Care Circle
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mt-2">
                {circleData.circleName}
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleViewOwnEmergencyCard}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-teal-200 bg-white text-teal-700 font-semibold shadow-sm hover:bg-teal-50 transition"
              >
                Emergency card
              </button>
              <button
                type="button"
                onClick={() => setIsInviteOpen(true)}
                disabled={!isSelectedProfilePrimary}
                className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-md shadow-teal-900/20 transition ${
                  isSelectedProfilePrimary
                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                    : 'bg-slate-300 text-slate-600 cursor-not-allowed shadow-none'
                }`}
              >
                <UserPlus className="h-5 w-5" />
                Invite member
              </button>
              {!isSelectedProfilePrimary ? (
                <p className="w-full text-xs font-medium text-amber-700">
                  Switch to the primary profile to invite members.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {isEmergencyOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6"
            onClick={() => {
              setIsEmergencyOpen(false);
              setIsEmergencyEditing(false);
            }}
          >
            <section
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl border border-white/20 shadow-xl shadow-teal-900/10 p-6 md:p-8 space-y-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    Admission-ready emergency card
                  </h2>
                  <p className="text-sm text-slate-500">
                    Keep a ready-to-share snapshot for hospital admissions.
                  </p>
                  {emergencyCardOwnerLabel && (
                    <p className="mt-1 text-sm text-slate-500">
                      Viewing {emergencyCardOwnerLabel} emergency card.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEmergencyEditing(false)}
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ${
                      !isEmergencyEditing
                        ? 'bg-teal-600 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Card preview
                  </button>
                  {!isViewingExternalCard && (
                    <button
                      type="button"
                      onClick={() => setIsEmergencyEditing(true)}
                      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ${
                        isEmergencyEditing
                          ? 'bg-teal-600 text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Edit card
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsEmergencyOpen(false);
                      setIsEmergencyEditing(false);
                    }}
                    className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                    aria-label="Close emergency card"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

            {isEmergencyLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                Loading emergency card details…
              </div>
            ) : isEmergencyEditing && !isViewingExternalCard ? (
              <form
                onSubmit={handleEmergencySave}
                className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Full legal name
                    <input
                      value={emergencyCard.name}
                      onChange={(event) =>
                        handleEmergencyChange('name', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Age
                    <input
                      type="number"
                      min="0"
                      value={emergencyCard.age}
                      onChange={(event) =>
                        handleEmergencyChange('age', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Date of birth
                    <input
                      type="date"
                      value={emergencyCard.date_of_birth}
                      onChange={(event) =>
                        handleEmergencyChange('date_of_birth', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Preferred hospital
                    <input
                      value={emergencyCard.preferred_hospital}
                      onChange={(event) =>
                        handleEmergencyChange(
                          'preferred_hospital',
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Photo ID on file
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={emergencyCard.photo_id_on_file}
                        onChange={(event) =>
                          handleEmergencyChange(
                            'photo_id_on_file',
                            event.target.checked
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      Mark as on file
                    </div>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Photo ID last 4 digits
                    <input
                      value={emergencyCard.photo_id_last4}
                      onChange={(event) =>
                        handleEmergencyChange('photo_id_last4', event.target.value)
                      }
                      placeholder="1234"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Emergency contact name
                    <input
                      value={emergencyCard.emergency_contact_name}
                      onChange={(event) =>
                        handleEmergencyChange(
                          'emergency_contact_name',
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Emergency contact phone
                    <input
                      value={emergencyCard.emergency_contact_phone}
                      onChange={(event) =>
                        handleEmergencyChange(
                          'emergency_contact_phone',
                          event.target.value
                        )
                      }
                      placeholder="+1 555 000 0000"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Insurer name
                    <input
                      value={emergencyCard.insurer_name}
                      onChange={(event) =>
                        handleEmergencyChange('insurer_name', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Plan type (optional)
                    <input
                      value={emergencyCard.plan_type}
                      onChange={(event) =>
                        handleEmergencyChange('plan_type', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    TPA + helpline
                    <input
                      value={emergencyCard.tpa_helpline}
                      onChange={(event) =>
                        handleEmergencyChange('tpa_helpline', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Insurance last 4 digits
                    <input
                      value={emergencyCard.insurance_last4}
                      onChange={(event) =>
                        handleEmergencyChange(
                          'insurance_last4',
                          event.target.value
                        )
                      }
                      placeholder="1234"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Blood group
                    <input
                      value={emergencyCard.blood_group}
                      onChange={(event) =>
                        handleEmergencyChange('blood_group', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Critical allergies
                    <input
                      value={emergencyCard.critical_allergies}
                      onChange={(event) =>
                        handleEmergencyChange(
                          'critical_allergies',
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Chronic conditions
                    <input
                      value={emergencyCard.chronic_conditions}
                      onChange={(event) =>
                        handleEmergencyChange(
                          'chronic_conditions',
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Current meds
                    <input
                      value={emergencyCard.current_meds}
                      onChange={(event) =>
                        handleEmergencyChange('current_meds', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </label>
                </div>

                <label className="block text-sm font-medium text-slate-700">
                  Emergency instructions
                  <textarea
                    rows={3}
                    value={emergencyCard.emergency_instructions}
                    onChange={(event) =>
                      handleEmergencyChange(
                        'emergency_instructions',
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>

                {emergencyError && (
                  <p className="text-sm text-rose-600">{emergencyError}</p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEmergencyEditing(false)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEmergency}
                    className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    {isSavingEmergency ? 'Saving…' : 'Save card'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-teal-50 p-6 shadow-inner">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">
                      Emergency ID
                    </p>
                    <h3 className="text-2xl font-semibold text-slate-900">
                      {emergencyCard.name || 'Full legal name'}
                    </h3>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      <span>Age: {emergencyCard.age || '—'}</span>
                      <span>DOB: {emergencyCard.date_of_birth || '—'}</span>
                      <span>Blood: {emergencyCard.blood_group || '—'}</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Photo ID: {photoIdLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Emergency contact
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {emergencyCard.emergency_contact_name || 'Not provided'}
                    </p>
                    <p className="text-sm text-slate-600">
                      {emergencyCard.emergency_contact_phone || '—'}
                    </p>
                    {emergencyCard.emergency_contact_phone && (
                      <a
                        href={`tel:${emergencyCard.emergency_contact_phone}`}
                        className="mt-3 inline-flex items-center justify-center rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Call now
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Preferred hospital
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {emergencyCard.preferred_hospital || 'Not provided'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Insurance
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {emergencyCard.insurer_name || 'Not provided'}
                    </p>
                    <p className="text-sm text-slate-600">
                      {emergencyCard.plan_type || 'Plan type'}
                    </p>
                    <p className="text-sm text-slate-600">
                      TPA/Helpline: {emergencyCard.tpa_helpline || '—'}
                    </p>
                    <p className="text-sm text-slate-600">
                      Last 4: {insuranceLast4Label}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Medical notes
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Allergies: {emergencyCard.critical_allergies || '—'}
                    </p>
                    <p className="text-sm text-slate-600">
                      Chronic: {emergencyCard.chronic_conditions || '—'}
                    </p>
                    <p className="text-sm text-slate-600">
                      Meds: {emergencyCard.current_meds || '—'}
                    </p>
                    <p className="text-sm text-slate-600">
                      Instructions: {emergencyCard.emergency_instructions || '—'}
                    </p>
                  </div>
                </div>
                {emergencyError && (
                  <p className="mt-4 text-sm text-rose-600">{emergencyError}</p>
                )}
              </div>
            )}
            </section>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <section className="bg-white rounded-3xl border border-white/20 shadow-xl shadow-teal-900/10 p-6 md:p-8">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold text-slate-900">
                  My Care Circle
                </h2>
                <SectionHelpButton
                  id="my-care-circle-help"
                  label="About My Care Circle"
                  description="Members you invited to support this profile. You can check pending invites, update access role, or remove someone."
                />
              </div>
              <p className="text-slate-500 text-sm">
                Members you&apos;ve invited to support your care.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Members
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {activeMembers.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMyPendingInvites(true);
                        setShowIncomingPendingInvites(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Pending invites
                      {hasMyPendingInvites ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {pendingInvites.length}
                        </span>
                      ) : null}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {activeMembers.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No members have accepted your invite yet.
                    </p>
                  ) : (
                    activeMembers.map((member) => (
                      <div
                        key={member.linkId}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">{member.name}</p>
                            <p className="text-xs text-slate-500">
                              Current role: {roleLabels[member.role]}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemove(member)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Access role
                          </span>
                          <select
                            value={member.role}
                            disabled={roleUpdatingLinkId === member.linkId || !member.ownerProfileIsPrimary}
                            onChange={(event) =>
                              handleUpdateRole(
                                member,
                                normalizeCareCircleRole(event.target.value)
                              )
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="family">Family</option>
                            <option value="friend">Friend</option>
                          </select>
                        </div>
                        {!member.ownerProfileIsPrimary ? (
                          <p className="mt-2 text-xs text-amber-700">
                            Switch to your primary profile to change access role.
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                {roleError ? (
                  <p className="mt-3 text-sm text-rose-600">{roleError}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-white/20 shadow-xl shadow-teal-900/10 p-6 md:p-8">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold text-slate-900">
                  Care Circles I&apos;m In
                </h2>
                <SectionHelpButton
                  id="care-circles-im-in-help"
                  label="About Care Circles I'm In"
                  description="Circles where someone else invited you. Use this section to view what access you have and open shared details or emergency card."
                />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Active circles
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {activeCirclesImIn.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowIncomingPendingInvites(true);
                        setShowMyPendingInvites(false);
                        setIncomingInviteError(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Pending requests
                      {hasIncomingPendingInvites ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {pendingCircleInvites.length}
                        </span>
                      ) : null}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {activeCirclesImIn.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      You are not part of any other care circles yet.
                    </p>
                  ) : (
                    activeCirclesImIn.map((member) => {
                      const canView = isElevatedCareCircleRole(member.role)
                        ? true
                        : member.ownerProfileIsPrimary;
                      const primaryProfileName =
                        primaryProfileNameByMemberId.get(member.id) || member.name;

                      return (
                        <div
                          key={member.linkId}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{member.name}</p>
                            <p className="text-xs text-slate-500">
                              Role: {roleLabels[member.role]}
                            </p>
                            <p className="text-xs text-slate-500">
                              {member.ownerProfileIsPrimary
                                ? 'Primary profile'
                                : `Dependent of ${primaryProfileName}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              isElevatedCareCircleRole(member.role)
                                ? handleViewMemberDetails(member)
                                : handleViewMemberEmergencyCard(member)
                            }
                            disabled={!canView}
                            className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
                              canView
                                ? 'border-teal-200 bg-white text-teal-700 hover:bg-teal-50'
                                : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {isElevatedCareCircleRole(member.role) ? 'View details' : 'View card'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {selectedMember ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="bg-white w-full max-w-3xl rounded-2xl p-6 relative h-[85vh] overflow-hidden flex flex-col min-h-0">
            <button
              onClick={closeMemberDetailsModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-black"
              aria-label="Close member details"
            >
              ✕
            </button>

            <div className="flex flex-col flex-1 min-h-0 pt-1">
              <h2 className="text-xl font-semibold text-slate-900 pr-8 shrink-0">
                {selectedMember.name}&apos;s Details
              </h2>

              <div className="flex rounded-xl border border-slate-200 p-1.5 bg-slate-100/80 shrink-0 mt-4">
                {(['personal', 'appointments', 'medications', 'vault'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMemberDetailsTab(tab)}
                    className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 active:scale-[0.98] ${
                      memberDetailsTab === tab
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {tab === 'personal'
                      ? 'Personal'
                      : tab === 'appointments'
                      ? 'Appointments'
                      : tab === 'medications'
                      ? 'Medications'
                      : 'Vault'}
                  </button>
                ))}
              </div>

              <div className="mt-4 min-h-[280px] flex-1 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 shadow-inner">
                {memberDetailsTab === 'vault' ? (
                  <div
                    className={`relative space-y-4 p-4 ${
                      canManageSelectedMemberVault ? 'pt-14' : ''
                    }`}
                  >
                    {canManageSelectedMemberVault ? (
                      <button
                        type="button"
                        onClick={() => {
                          setVaultUploadError(null);
                          setShowVaultUploadModal(true);
                        }}
                        className="absolute right-4 top-4 rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                      >
                        Upload document
                      </button>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap gap-2">
                        {(['all', 'reports', 'prescriptions', 'insurance', 'bills'] as const).map(
                          (category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setVaultCategory(category)}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                vaultCategory === category
                                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-white/70'
                              }`}
                            >
                              {vaultCategoryLabels[category]}
                            </button>
                          )
                        )}
                      </div>
                      <div className="ml-auto w-full sm:w-56">
                        <input
                          type="text"
                          value={vaultSearchQuery}
                          onChange={(event) => setVaultSearchQuery(event.target.value)}
                          placeholder="Search files"
                          className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
                        />
                      </div>
                    </div>
                    {vaultUploadError ? (
                      <p className="text-sm text-rose-600">{vaultUploadError}</p>
                    ) : null}
                    {vaultLoading ? (
                      <p className="text-sm text-slate-500">Loading vault files…</p>
                    ) : vaultError ? (
                      <p className="text-sm text-rose-600">{vaultError}</p>
                    ) : filteredVaultFiles.length === 0 ? (
                      <p className="text-sm text-slate-500">No files in this vault.</p>
                    ) : (
                      <ul className="space-y-2">
                        {filteredVaultFiles.map((file) => {
                          const fileKey = vaultFileKey(file);
                          const isRenaming = vaultRenamingKey === fileKey;
                          const isDeleting = vaultDeletingKey === fileKey;
                          return (
                            <li
                              key={`${file.folder}:${file.name}`}
                              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                            >
                              <div>
                                <p className="font-medium text-slate-800">{file.name}</p>
                                <p className="text-xs text-slate-500">
                                  {vaultCategoryLabels[file.folder]} · {formatVaultDate(file.created_at)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVaultPreview(file)}
                                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Open
                                </button>
                                {canManageSelectedMemberVault ? (
                                  <button
                                    type="button"
                                    onClick={() => handleVaultRename(file)}
                                    disabled={isRenaming || isDeleting}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isRenaming ? 'Renaming…' : 'Rename'}
                                  </button>
                                ) : null}
                                {canManageSelectedMemberVault ? (
                                  <button
                                    type="button"
                                    onClick={() => handleVaultDelete(file)}
                                    disabled={isDeleting || isRenaming}
                                    className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isDeleting ? 'Deleting…' : 'Delete'}
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : memberDetailsLoading ? (
                  <div className="h-full min-h-[280px] flex items-center justify-center text-slate-500 text-sm">
                    Loading details…
                  </div>
                ) : memberDetailsError ? (
                  <div className="h-full min-h-[280px] flex items-center justify-center px-4">
                    <p className="text-sm text-rose-600">{memberDetailsError}</p>
                  </div>
                ) : memberDetailsTab === 'personal' && memberDetails ? (
                  <div className="p-4 space-y-4">
                    <dl className="grid gap-3 text-sm">
                      <div>
                        <dt className="text-slate-500 font-medium">Name</dt>
                        <dd className="text-slate-900 mt-0.5">
                          {memberDetails.personal?.display_name?.trim() || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">Number</dt>
                        <dd className="text-slate-900 mt-0.5">
                          {memberDetails.personal?.phone?.trim() || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">Age</dt>
                        <dd className="text-slate-900 mt-0.5">
                          {memberDetails.health?.age != null ? String(memberDetails.health.age) : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">Blood Group</dt>
                        <dd className="text-slate-900 mt-0.5">
                          {memberDetails.health?.blood_group?.trim() || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">BMI</dt>
                        <dd className="text-slate-900 mt-0.5">
                          {memberDetails.health?.bmi != null ? String(memberDetails.health.bmi) : '—'}
                        </dd>
                      </div>
                    </dl>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">
                        Current medical status
                      </h3>
                      <div className="space-y-2 text-sm">
                        {memberDetails.health?.current_diagnosed_condition?.length ? (
                          <p>
                            <span className="text-slate-500">Conditions:</span>{' '}
                            {memberDetails.health.current_diagnosed_condition.join(', ')}
                          </p>
                        ) : null}
                        {memberDetails.health?.allergies?.length ? (
                          <p>
                            <span className="text-slate-500">Allergies:</span>{' '}
                            {memberDetails.health.allergies.join(', ')}
                          </p>
                        ) : null}
                        {memberDetails.health?.ongoing_treatments?.length ? (
                          <p>
                            <span className="text-slate-500">Ongoing treatments:</span>{' '}
                            {memberDetails.health.ongoing_treatments.join(', ')}
                          </p>
                        ) : null}
                        {!(memberDetails.health?.current_diagnosed_condition?.length ||
                          memberDetails.health?.allergies?.length ||
                          memberDetails.health?.ongoing_treatments?.length) && (
                          <p className="text-slate-500">No current medical status recorded.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">
                        Past medical history
                      </h3>
                      <div className="space-y-2 text-sm">
                        {memberDetails.health?.previous_diagnosed_conditions?.length ? (
                          <p>
                            <span className="text-slate-500">Previous conditions:</span>{' '}
                            {memberDetails.health.previous_diagnosed_conditions.join(', ')}
                          </p>
                        ) : null}
                        {memberDetails.health?.past_surgeries?.length ? (
                          <p>
                            <span className="text-slate-500">Past surgeries:</span>{' '}
                            {memberDetails.health.past_surgeries
                              .map((s) => `${s.name} (${s.month}/${s.year})`)
                              .join(', ')}
                          </p>
                        ) : null}
                        {memberDetails.health?.childhood_illness?.length ? (
                          <p>
                            <span className="text-slate-500">Childhood illness:</span>{' '}
                            {memberDetails.health.childhood_illness.join(', ')}
                          </p>
                        ) : null}
                        {memberDetails.health?.long_term_treatments?.length ? (
                          <p>
                            <span className="text-slate-500">Long-term treatments:</span>{' '}
                            {memberDetails.health.long_term_treatments.join(', ')}
                          </p>
                        ) : null}
                        {!(memberDetails.health?.previous_diagnosed_conditions?.length ||
                          memberDetails.health?.past_surgeries?.length ||
                          memberDetails.health?.childhood_illness?.length ||
                          memberDetails.health?.long_term_treatments?.length) && (
                          <p className="text-slate-500">No past medical history recorded.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : memberDetailsTab === 'appointments' && memberDetails ? (
                  <div className="p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-700">Appointments</h3>
                      {canManageSelectedMemberAppointments ? (
                        <button
                          type="button"
                          onClick={openAddAppointmentModal}
                          className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                        >
                          Add appointment
                        </button>
                      ) : null}
                    </div>
                    {appointmentActionError ? (
                      <p className="text-sm text-rose-600">{appointmentActionError}</p>
                    ) : null}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                        Upcoming appointments
                      </h4>
                      {upcomingMemberAppointments.length === 0 ? (
                        <p className="text-sm text-slate-500">No upcoming appointments.</p>
                      ) : (
                        <ul className="space-y-3">
                          {upcomingMemberAppointments.map((apt) => {
                            const isDeletingAppointment = appointmentDeletingId === apt.id;
                            const detailFields =
                              appointmentTypeFields[apt.type as keyof typeof appointmentTypeFields] ?? [];
                            return (
                              <li
                                key={apt.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-800">{apt.title || '—'}</p>
                                    <p className="text-slate-600 mt-1">
                                      {normalizeAppointmentDate(apt.date) || apt.date || '—'} at{' '}
                                      {formatAppointmentTime(apt.time)}
                                    </p>
                                    <p className="text-slate-500 mt-1">Type: {apt.type || '—'}</p>
                                    {detailFields
                                      .filter((field) => Boolean(apt[field.name]))
                                      .map((field) => (
                                        <p key={field.name} className="text-slate-500">
                                          {field.label}: {apt[field.name]}
                                        </p>
                                      ))}
                                  </div>
                                  {canManageSelectedMemberAppointments ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openEditAppointmentModal(apt)}
                                        disabled={isDeletingAppointment}
                                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAppointmentDelete(apt)}
                                        disabled={isDeletingAppointment}
                                        className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {isDeletingAppointment ? 'Deleting…' : 'Delete'}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                        Past appointments
                      </h4>
                      {pastMemberAppointments.length === 0 ? (
                        <p className="text-sm text-slate-500">No past appointments.</p>
                      ) : (
                        <ul className="space-y-3">
                          {pastMemberAppointments.map((apt) => {
                            const detailFields =
                              appointmentTypeFields[apt.type as keyof typeof appointmentTypeFields] ?? [];
                            return (
                              <li
                                key={apt.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                              >
                                <div>
                                  <div>
                                    <p className="font-semibold text-slate-800">{apt.title || '—'}</p>
                                    <p className="text-slate-600 mt-1">
                                      {normalizeAppointmentDate(apt.date) || apt.date || '—'} at{' '}
                                      {formatAppointmentTime(apt.time)}
                                    </p>
                                    <p className="text-slate-500 mt-1">Type: {apt.type || '—'}</p>
                                    {detailFields
                                      .filter((field) => Boolean(apt[field.name]))
                                      .map((field) => (
                                        <p key={field.name} className="text-slate-500">
                                          {field.label}: {apt[field.name]}
                                        </p>
                                      ))}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    {undatedMemberAppointments.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          Other appointments
                        </h4>
                        <ul className="space-y-3">
                          {undatedMemberAppointments.map((apt) => {
                            const isDeletingAppointment = appointmentDeletingId === apt.id;
                            const detailFields =
                              appointmentTypeFields[apt.type as keyof typeof appointmentTypeFields] ?? [];
                            return (
                              <li
                                key={apt.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-800">{apt.title || '—'}</p>
                                    <p className="text-slate-600 mt-1">
                                      {normalizeAppointmentDate(apt.date) || apt.date || '—'} at{' '}
                                      {formatAppointmentTime(apt.time)}
                                    </p>
                                    <p className="text-slate-500 mt-1">Type: {apt.type || '—'}</p>
                                    {detailFields
                                      .filter((field) => Boolean(apt[field.name]))
                                      .map((field) => (
                                        <p key={field.name} className="text-slate-500">
                                          {field.label}: {apt[field.name]}
                                        </p>
                                      ))}
                                  </div>
                                  {canManageSelectedMemberAppointments ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openEditAppointmentModal(apt)}
                                        disabled={isDeletingAppointment}
                                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAppointmentDelete(apt)}
                                        disabled={isDeletingAppointment}
                                        className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {isDeletingAppointment ? 'Deleting…' : 'Delete'}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : memberDetailsTab === 'medications' && memberDetails ? (
                  <div className="p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-700">Medications</h3>
                      {canManageSelectedMemberMedications ? (
                        <button
                          type="button"
                          onClick={openAddMedicationModal}
                          className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                        >
                          Add medication
                        </button>
                      ) : null}
                    </div>
                    {medicationActionError ? (
                      <p className="text-sm text-rose-600">{medicationActionError}</p>
                    ) : null}
                    {sortedMemberMedications.length === 0 ? (
                      <p className="text-sm text-slate-500">No medications recorded.</p>
                    ) : (
                      <ul className="space-y-3">
                        {sortedMemberMedications.map((med) => {
                          const isDeletingMedication = medicationDeletingId === med.id;
                          const endDate = med.endDate ? new Date(med.endDate) : null;
                          const isActive =
                            !endDate ||
                            Number.isNaN(endDate.getTime()) ||
                            new Date().getTime() <= endDate.getTime();
                          return (
                            <li
                              key={med.id}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-slate-800">{med.name || '—'}</p>
                                  <p className="text-slate-600 mt-1">Dosage: {med.dosage || '—'}</p>
                                  <p className="text-slate-600">Frequency: {med.frequency || '—'}</p>
                                  {med.timesPerDay !== undefined && med.timesPerDay !== null ? (
                                    <p className="text-slate-600">Times/day: {String(med.timesPerDay)}</p>
                                  ) : null}
                                  {med.startDate ? (
                                    <p className="text-slate-500 mt-1">Start: {med.startDate}</p>
                                  ) : null}
                                  {med.endDate ? (
                                    <p className="text-slate-500">End: {med.endDate}</p>
                                  ) : null}
                                  {med.purpose ? (
                                    <p className="text-slate-500 mt-1">Purpose: {med.purpose}</p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      isActive
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {isActive ? 'Active' : 'Completed'}
                                  </span>
                                  {canManageSelectedMemberMedications ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditMedicationModal(med)}
                                      disabled={isDeletingMedication}
                                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Edit
                                    </button>
                                  ) : null}
                                  {canManageSelectedMemberMedications ? (
                                    <button
                                      type="button"
                                      onClick={() => handleMedicationDelete(med)}
                                      disabled={isDeletingMedication}
                                      className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {isDeletingMedication ? 'Deleting…' : 'Delete'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {vaultPreviewFile ? (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm">
          <div className="absolute inset-4 md:inset-8 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {vaultPreviewFile.name}
                </p>
                <p className="text-xs text-slate-500">{vaultCategoryLabels[vaultPreviewFile.folder]}</p>
              </div>
              <button
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                onClick={() => {
                  setVaultPreviewFile(null);
                  setVaultPreviewUrl(null);
                }}
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-auto">
              {vaultPreviewLoading && <div className="text-sm text-slate-500">Loading preview…</div>}
              {!vaultPreviewLoading && vaultPreviewUrl && isVaultImageFile(vaultPreviewFile.name) && (
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={vaultPreviewUrl}
                    alt={vaultPreviewFile.name}
                    className="max-h-full max-w-full rounded-xl border border-slate-100"
                  />
                </div>
              )}
              {!vaultPreviewLoading && vaultPreviewUrl && isVaultPdfFile(vaultPreviewFile.name) && (
                <iframe
                  src={vaultPreviewUrl}
                  title={vaultPreviewFile.name}
                  className="w-full h-full rounded-xl border border-slate-100"
                />
              )}
              {!vaultPreviewLoading &&
                vaultPreviewUrl &&
                !isVaultImageFile(vaultPreviewFile.name) &&
                !isVaultPdfFile(vaultPreviewFile.name) && (
                  <div className="text-sm text-slate-500">Preview not available for this file type.</div>
                )}
              {!vaultPreviewLoading && !vaultPreviewUrl && (
                <div className="text-sm text-slate-500">Preview unavailable.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showVaultUploadModal ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/60 px-4"
          onClick={closeVaultUploadModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Upload document</h3>
                <p className="text-xs text-slate-500">Add a file to this member&apos;s vault</p>
              </div>
              <button
                type="button"
                onClick={closeVaultUploadModal}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close upload modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleVaultUpload} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Category
                <select
                  value={vaultUploadCategory}
                  onChange={(event) => setVaultUploadCategory(event.target.value as VaultFolder)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="reports">Lab Reports</option>
                  <option value="prescriptions">Prescriptions</option>
                  <option value="insurance">Insurance</option>
                  <option value="bills">Bills</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                File
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  required
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    if (nextFile && !isAllowedVaultUploadType(nextFile)) {
                      setVaultUploadError('Only PDF and image files are allowed.');
                      event.target.value = '';
                      return;
                    }
                    setVaultUploadFile(nextFile);
                    setVaultUploadFileName(nextFile ? stripVaultExtension(nextFile.name) : '');
                    setVaultUploadError(null);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-teal-700"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                File name
                <input
                  type="text"
                  value={vaultUploadFileName}
                  onChange={(event) => {
                    setVaultUploadFileName(event.target.value);
                    setVaultUploadError(null);
                  }}
                  placeholder="e.g. March blood test"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>

              {vaultUploadFile ? (
                <p className="text-xs text-slate-500">
                  Extension will be kept as .{vaultFileExtension(vaultUploadFile.name) || 'file'}
                </p>
              ) : null}

              {vaultUploadError ? <p className="text-sm text-rose-600">{vaultUploadError}</p> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeVaultUploadModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={vaultUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={vaultUploading || !vaultUploadFile}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {vaultUploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showMedicationFormModal ? (
        <div
          className="fixed inset-0 z-[86] flex items-center justify-center bg-slate-900/60 px-4"
          onClick={closeMedicationFormModal}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {medicationFormMode === 'add' ? 'Add medication' : 'Edit medication'}
                </h3>
                <p className="text-xs text-slate-500">
                  Manage this member&apos;s ongoing medication plan.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMedicationFormModal}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close medication form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleMedicationSubmit} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Name
                  <input
                    type="text"
                    value={medicationForm.name}
                    onChange={(event) =>
                      setMedicationForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="e.g. Paracetamol"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Dosage
                  <input
                    type="text"
                    value={medicationForm.dosage}
                    onChange={(event) =>
                      setMedicationForm((prev) => ({ ...prev, dosage: event.target.value }))
                    }
                    placeholder="e.g. 500mg"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Frequency
                  <select
                    value={medicationForm.frequency}
                    onChange={(event) => handleMedicationFrequencyChange(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Select frequency</option>
                    {medicationFrequencyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Times per day
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={medicationForm.timesPerDay}
                    onChange={(event) =>
                      setMedicationForm((prev) => ({ ...prev, timesPerDay: event.target.value }))
                    }
                    placeholder="1"
                    disabled={medicationFrequencyOptions.some(
                      (option) => option.value === medicationForm.frequency
                    )}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Start date
                  <input
                    type="date"
                    value={medicationForm.startDate}
                    onChange={(event) =>
                      setMedicationForm((prev) => ({ ...prev, startDate: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  End date (optional)
                  <input
                    type="date"
                    value={medicationForm.endDate}
                    onChange={(event) =>
                      setMedicationForm((prev) => ({ ...prev, endDate: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Purpose (optional)
                <input
                  type="text"
                  value={medicationForm.purpose}
                  onChange={(event) =>
                    setMedicationForm((prev) => ({ ...prev, purpose: event.target.value }))
                  }
                  placeholder="e.g. Pain relief"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>

              {medicationActionError ? (
                <p className="text-sm text-rose-600">{medicationActionError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeMedicationFormModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={medicationSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={medicationSaving}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {medicationSaving
                    ? medicationFormMode === 'add'
                      ? 'Adding…'
                      : 'Saving…'
                    : medicationFormMode === 'add'
                    ? 'Add medication'
                    : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showAppointmentFormModal ? (
        <div
          className="fixed inset-0 z-[87] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-6"
          onClick={closeAppointmentFormModal}
        >
          <div
            className="my-auto w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between p-6 pb-0">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {appointmentFormMode === 'add' ? 'Add appointment' : 'Edit appointment'}
                </h3>
                <p className="text-xs text-slate-500">
                  Manage this member&apos;s upcoming and past appointments.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAppointmentFormModal}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close appointment form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleAppointmentSubmit}
              className="mt-5 flex-1 min-h-0 overflow-y-auto space-y-4 p-6 pt-5"
            >
              <label className="block text-sm font-medium text-slate-700">
                Title
                <input
                  type="text"
                  value={appointmentForm.title}
                  onChange={(event) =>
                    setAppointmentForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="e.g. Doctor follow-up"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Date
                <input
                  type="date"
                  value={appointmentForm.date}
                  onChange={(event) =>
                    setAppointmentForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </label>

              <div className="block text-sm font-medium text-slate-700">
                Time
                <div className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
                  <div className="grid grid-cols-[minmax(4.5rem,1fr)_auto_minmax(4.5rem,1fr)_auto_minmax(6rem,1fr)] items-center gap-2">
                    <input
                      type="text"
                      value={appointmentTime.hour}
                      onChange={(event) =>
                        updateAppointmentTime({ hour: clampTimePart(event.target.value, 12) })
                      }
                      placeholder="HH"
                      inputMode="numeric"
                      maxLength={2}
                      className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold tracking-wide focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                      aria-label="Hour"
                    />

                    <span className="text-slate-500 font-semibold text-base">:</span>

                    <input
                      type="text"
                      value={appointmentTime.minute}
                      onChange={(event) =>
                        updateAppointmentTime({ minute: clampTimePart(event.target.value, 59) })
                      }
                      onBlur={() => {
                        if (!appointmentTime.minute) return;
                        updateAppointmentTime({ minute: appointmentTime.minute.padStart(2, '0') });
                      }}
                      placeholder="MM"
                      inputMode="numeric"
                      maxLength={2}
                      className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold tracking-wide focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                      aria-label="Minute"
                    />

                    <div className="grid grid-rows-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateAppointmentTime({ period: 'AM' })}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          appointmentTime.period === 'AM'
                            ? 'border-teal-500 bg-teal-500 text-white shadow'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
                        }`}
                        aria-pressed={appointmentTime.period === 'AM'}
                      >
                        AM
                      </button>

                      <button
                        type="button"
                        onClick={() => updateAppointmentTime({ period: 'PM' })}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          appointmentTime.period === 'PM'
                            ? 'border-teal-500 bg-teal-500 text-white shadow'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
                        }`}
                        aria-pressed={appointmentTime.period === 'PM'}
                      >
                        PM
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    {appointmentTime.hour && appointmentTime.minute && appointmentTime.period
                      ? `Selected: ${appointmentTime.hour.padStart(2, '0')}:${appointmentTime.minute.padStart(2, '0')} ${appointmentTime.period}`
                      : 'Select a time for the appointment'}
                  </div>
                </div>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Type
                <select
                  value={appointmentForm.type}
                  onChange={(event) => handleAppointmentTypeChange(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">Select type</option>
                  {appointmentTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              {(appointmentTypeFields[appointmentForm.type as keyof typeof appointmentTypeFields] ?? [])
                .length > 0 ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    Additional details
                  </p>
                  <div className="mt-3 space-y-3">
                    {(
                      appointmentTypeFields[appointmentForm.type as keyof typeof appointmentTypeFields] ?? []
                    ).map((field) => (
                      <label key={field.name} className="block text-sm font-medium text-slate-700">
                        {field.label}
                        {field.type === 'textarea' ? (
                          <textarea
                            value={appointmentAdditionalFields[field.name] || ''}
                            onChange={(event) =>
                              setAppointmentAdditionalFields((prev) => ({
                                ...prev,
                                [field.name]: event.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        ) : (
                          <input
                            type={field.type}
                            value={appointmentAdditionalFields[field.name] || ''}
                            onChange={(event) =>
                              setAppointmentAdditionalFields((prev) => ({
                                ...prev,
                                [field.name]: event.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {appointmentActionError ? (
                <p className="text-sm text-rose-600">{appointmentActionError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeAppointmentFormModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={appointmentSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={appointmentSaving}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {appointmentSaving
                    ? appointmentFormMode === 'add'
                      ? 'Adding…'
                      : 'Saving…'
                    : appointmentFormMode === 'add'
                    ? 'Add appointment'
                    : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showMyPendingInvites && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Pending invites
                </h2>
                <p className="text-xs text-slate-500">
                  Invites you&apos;ve sent
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMyPendingInvites(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close pending invites"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {pendingInvites.length === 0 ? (
                <p className="text-sm text-slate-500">
                  There are no pending invites.
                </p>
              ) : (
                pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
                  >
                    <span>{invite.contact}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                      Pending
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showIncomingPendingInvites && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Pending requests
                </h2>
                <p className="text-xs text-slate-500">
                  Requests you&apos;ve received
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowIncomingPendingInvites(false);
                  setIncomingInviteError(null);
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close pending requests"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {pendingCircleInvites.length === 0 ? (
                <p className="text-sm text-slate-500">
                  There are no pending requests.
                </p>
              ) : (
                pendingCircleInvites.map((member) => (
                  <div
                    key={member.linkId}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>{member.name}</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptCircleInvite(member.linkId)}
                        className="inline-flex items-center justify-center rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineCircleInvite(member.linkId)}
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
              {incomingInviteError ? (
                <p className="text-sm text-rose-600">{incomingInviteError}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Invite to your care circle
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsInviteOpen(false);
                  setInviteContact('');
                  setInviteCountry(DEFAULT_COUNTRY);
                  setInviteError(null);
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close invite modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Add a registered user by entering their phone number.
            </p>
            <form onSubmit={handleInviteSubmit} className="mt-4 space-y-4">
              <div ref={inviteCountryDropdownRef} className="relative">
                <label className="block text-sm font-medium text-slate-700">
                  Phone number
                </label>
                <div className="mt-2 flex border border-slate-200 bg-white rounded-xl focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500">
                  <div className="relative shrink-0">
                    <button
                      ref={inviteCountryTriggerRef}
                      type="button"
                      onClick={() => setInviteCountryDropdownOpen((v) => !v)}
                      className="flex items-center gap-1 px-3 py-2.5 bg-slate-100 border-r border-slate-200 rounded-l-xl text-slate-700 font-semibold text-sm hover:bg-slate-200 focus:outline-none min-w-[5.5rem]"
                      aria-label="Country code"
                      aria-expanded={inviteCountryDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span>{inviteCountry.dialCode}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${inviteCountryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {inviteCountryDropdownOpen &&
                      createPortal(
                        <div
                          id="carecircle-invite-country-dropdown"
                          className="vytara-theme-content fixed z-[9999] w-64 bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden"
                          role="listbox"
                          style={{
                            top: inviteDropdownPosition.top,
                            left: inviteDropdownPosition.left,
                          }}
                        >
                          <div className="max-h-[280px] overflow-y-auto overscroll-contain py-1">
                            {COUNTRIES.map((c) => (
                              <button
                                key={c.code}
                                type="button"
                                role="option"
                                aria-selected={c.code === inviteCountry.code}
                                onClick={() => {
                                  setInviteCountry(c);
                                  setInviteCountryDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${c.code === inviteCountry.code ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-slate-700'}`}
                              >
                                {c.name} ({c.dialCode})
                              </button>
                            ))}
                          </div>
                        </div>,
                        document.body
                      )}
                  </div>
                  <input
                    type="tel"
                    value={inviteContact}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '');
                      if (digitsOnly.length <= PHONE_MAX_DIGITS) setInviteContact(digitsOnly);
                    }}
                    placeholder="e.g., 9876543210"
                    className="flex-1 min-w-0 px-3 py-2 text-sm text-slate-700 outline-none border-0 bg-white rounded-r-xl"
                  />
                </div>
              </div>
              {inviteError && (
                <p className="text-sm text-rose-600">{inviteError}</p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteOpen(false);
                    setInviteContact('');
                    setInviteCountry(DEFAULT_COUNTRY);
                    setInviteError(null);
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvite}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  {isSavingInvite ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
