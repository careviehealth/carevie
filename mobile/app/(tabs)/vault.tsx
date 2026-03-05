import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import { Calendar } from 'react-native-calendars';
import { MotiView } from 'moti';
import Animated, {
  FadeInDown,
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { Screen } from '@/components/Screen';
import { SkeletonListItem } from '@/components/Skeleton';
import { EmptyStatePreset } from '@/components/EmptyState';
import { useProfile } from '@/hooks/useProfile';
import { vaultApi, type VaultFile } from '@/api/modules/vault';
import type { MedicalFolder } from '@/constants/medicalFolders';
import { toast } from '@/lib/toast';

type CategoryKey = 'all' | MedicalFolder;

type VaultItem = VaultFile & {
  folder: MedicalFolder;
};

type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

type DateFilter = 'all' | 'last-7' | 'last-30' | 'last-90' | 'custom';

type UploadDraft = {
  file: { uri: string; name: string; mimeType?: string | null } | null;
  category: CategoryKey;
  fileName: string;
};

const categoryOptions: { key: CategoryKey; label: string }[] = [
  { key: 'all', label: 'All Documents' },
  { key: 'reports', label: 'Lab Reports' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'bills', label: 'Bills & Receipts' },
];

const dateFilters: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'last-7', label: 'Last 7 days' },
  { key: 'last-30', label: 'Last 30 days' },
  { key: 'last-90', label: 'Last 90 days' },
  { key: 'custom', label: 'Custom' },
];

const sortOptions: { key: SortOption; label: string }[] = [
  { key: 'date-desc', label: 'Newest first' },
  { key: 'date-asc', label: 'Oldest first' },
  { key: 'name-asc', label: 'Name A-Z' },
  { key: 'name-desc', label: 'Name Z-A' },
];

const folderIcon: Record<MedicalFolder, keyof typeof MaterialCommunityIcons.glyphMap> = {
  reports: 'pulse',
  prescriptions: 'pill',
  insurance: 'shield-outline',
  bills: 'receipt',
};

const allowedImageExt = new Set([
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
]);

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');
const getExtension = (name: string) => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
};

const getMimeType = (name: string) => {
  const ext = getExtension(name).toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return 'application/octet-stream';
};

const getUti = (name: string) => {
  const ext = getExtension(name).toLowerCase();
  if (ext === 'pdf') return 'com.adobe.pdf';
  if (ext === 'png') return 'public.png';
  if (ext === 'jpg' || ext === 'jpeg') return 'public.jpeg';
  if (ext === 'gif') return 'com.compuserve.gif';
  if (ext === 'heic') return 'public.heic';
  if (ext === 'heif') return 'public.heif';
  return 'public.data';
};

const getExtensionFromContentType = (contentType?: string | null) => {
  if (!contentType) return '';
  const normalized = contentType.toLowerCase();
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('image/png')) return 'png';
  if (normalized.includes('image/jpeg')) return 'jpg';
  if (normalized.includes('image/gif')) return 'gif';
  if (normalized.includes('image/webp')) return 'webp';
  if (normalized.includes('image/heic')) return 'heic';
  if (normalized.includes('image/heif')) return 'heif';
  return '';
};

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateString = (value: string) => new Date(`${value}T00:00:00`);

const getDatesInRange = (start: string, end: string) => {
  const dates: string[] = [];
  if (!start || !end) return dates;
  const startDate = parseDateString(start);
  const endDate = parseDateString(end);
  if (startDate > endDate) return dates;

  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(formatDateForInput(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const isAllowedUploadType = (name: string, mimeType?: string | null) => {
  if (mimeType === 'application/pdf' || mimeType?.startsWith('image/')) return true;
  const ext = getExtension(name).toLowerCase();
  return ext === 'pdf' || allowedImageExt.has(ext);
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
  onPress: (event?: any) => void;
  style?: any;
  disabled?: boolean;
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(0.9);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(1);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};

export default function VaultScreen() {
  const { selectedProfile } = useProfile();
  const storageOwnerId = selectedProfile?.id ?? '';
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [files, setFiles] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [counts, setCounts] = useState<Record<MedicalFolder, number>>({
    reports: 0,
    prescriptions: 0,
    insurance: 0,
    bills: 0,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>({
    file: null,
    category: 'reports',
    fileName: '',
  });
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [menuFile, setMenuFile] = useState<VaultItem | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [menuHeight, setMenuHeight] = useState(0);
  const [renameFile, setRenameFile] = useState<VaultItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameExtension, setRenameExtension] = useState('');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [customDateModalOpen, setCustomDateModalOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
  const centeredModalMaxHeight = Math.min(windowHeight - insets.top - insets.bottom - 32, 640);
  const customDateCardMaxHeight = Math.min(windowHeight - insets.top - insets.bottom - 40, 700);
  const customDateCalendarMaxHeight = Math.min(windowHeight * 0.5, 420);

  const fetchCounts = useCallback(async () => {
    if (!storageOwnerId) return;
    const folders: MedicalFolder[] = ['reports', 'prescriptions', 'insurance', 'bills'];
    const nextCounts: Record<MedicalFolder, number> = {
      reports: 0,
      prescriptions: 0,
      insurance: 0,
      bills: 0,
    };

    await Promise.all(
      folders.map(async (folder) => {
        const { data } = await vaultApi.listFiles(storageOwnerId, folder);
        nextCounts[folder] = data?.length ?? 0;
      })
    );

    setCounts(nextCounts);
  }, [storageOwnerId]);

  const fetchFiles = useCallback(
    async (category: CategoryKey, showSpinner = true) => {
      if (!storageOwnerId) return;
      if (showSpinner) setLoading(true);

      const folderMap: Record<CategoryKey, MedicalFolder[]> = {
        all: ['reports', 'prescriptions', 'insurance', 'bills'],
        reports: ['reports'],
        prescriptions: ['prescriptions'],
        insurance: ['insurance'],
        bills: ['bills'],
      };

      const results: VaultItem[] = [];
      await Promise.all(
        folderMap[category].map(async (folder) => {
          const { data } = await vaultApi.listFiles(storageOwnerId, folder);
          if (data?.length) {
            results.push(
              ...data.map((item) => ({
                ...item,
                folder,
              }))
            );
          }
        })
      );

      results.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setFiles(results);
      if (showSpinner) setLoading(false);
    },
    [storageOwnerId]
  );

  const refreshAll = useCallback(async () => {
    if (!storageOwnerId) return;
    setRefreshing(true);
    await Promise.all([fetchFiles(activeCategory, false), fetchCounts()]);
    setRefreshing(false);
  }, [activeCategory, fetchCounts, fetchFiles, storageOwnerId]);

  useEffect(() => {
    if (!storageOwnerId) return;
    fetchFiles(activeCategory);
    fetchCounts();
  }, [activeCategory, fetchCounts, fetchFiles, storageOwnerId]);

  useEffect(() => {
    if (storageOwnerId) return;
    setFiles([]);
    setCounts({
      reports: 0,
      prescriptions: 0,
      insurance: 0,
      bills: 0,
    });
  }, [storageOwnerId]);

  const visibleFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = files.filter((file) =>
      query ? file.name.toLowerCase().includes(query) : true
    );

    const dateFiltered = filtered.filter((file) => {
      if (dateFilter === 'all') return true;
      if (dateFilter === 'custom') {
        if (!customRange.start || !customRange.end) return false;
        const createdAt = new Date(file.created_at);
        const startDate = new Date(customRange.start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(customRange.end);
        endDate.setHours(23, 59, 59, 999);
        return createdAt >= startDate && createdAt <= endDate;
      }
      const createdAt = new Date(file.created_at);
      const now = new Date();
      const days = dateFilter === 'last-7' ? 7 : dateFilter === 'last-30' ? 30 : 90;
      const cutoff = new Date(now);
      cutoff.setDate(now.getDate() - days);
      return createdAt >= cutoff;
    });

    const sorted = [...dateFiltered].sort((a, b) => {
      if (sortOption === 'date-asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortOption === 'name-asc') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      if (sortOption === 'name-desc') {
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [dateFilter, files, searchQuery, sortOption, customRange]);

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;

    if (!isAllowedUploadType(asset.name, asset.mimeType)) {
      toast.warning('Unsupported file', 'Please upload a PDF or image file.');
      return;
    }

    setUploadDraft({
      file: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType },
      category: activeCategory === 'all' ? 'reports' : activeCategory,
      fileName: stripExtension(asset.name),
    });
    setUploadModalOpen(true);
  };

  const handleUpload = async () => {
    if (!storageOwnerId || !uploadDraft.file) return;
    const folder = uploadDraft.category === 'all' ? 'reports' : uploadDraft.category;
    const extension = getExtension(uploadDraft.file.name);
    const baseName = uploadDraft.fileName.trim() || stripExtension(uploadDraft.file.name) || 'untitled';
    const finalName = extension ? `${baseName}.${extension}` : baseName;

    setUploading(true);
    try {
      const { error } = await vaultApi.uploadFile(storageOwnerId, folder, uploadDraft.file, finalName);
      if (error) {
        toast.error('Upload failed', error.message || 'Unable to upload file.');
        return;
      }

      setUploadModalOpen(false);
      setUploadDraft({ file: null, category: 'reports', fileName: '' });
      await refreshAll();
    } catch (error) {
      toast.error(
        'Upload failed',
        error instanceof Error ? error.message : 'Unable to upload file.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (item: VaultItem) => {
    if (!storageOwnerId) return;
    setPreviewItem(item);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    const { data, error } = await vaultApi.getSignedUrl(`${storageOwnerId}/${item.folder}/${item.name}`);
    if (error || !data?.signedUrl) {
      setPreviewError(error?.message || 'Unable to open preview.');
      setPreviewLoading(false);
      return;
    }
    setPreviewUrl(data.signedUrl);
    setPreviewLoading(false);
  };

  const handleDownload = async (item: VaultItem) => {
    if (!storageOwnerId) return;
    const { data, error } = await vaultApi.getSignedUrl(
      `${storageOwnerId}/${item.folder}/${item.name}`,
      60 * 10
    );
    if (error || !data?.signedUrl) {
      toast.error('Download failed', error?.message || 'Unable to download file.');
      return;
    }
    const sanitizedName = item.name.replace(/[\\/]/g, '_');
    let finalName = sanitizedName;
    let extension = getExtension(finalName);
    if (!extension) {
      try {
        const headResponse = await fetch(data.signedUrl, { method: 'HEAD' });
        const contentType = headResponse.headers.get('content-type');
        const guessedExtension = getExtensionFromContentType(contentType);
        if (guessedExtension) {
          finalName = `${sanitizedName}.${guessedExtension}`;
          extension = guessedExtension;
        }
      } catch {
        // Ignore HEAD failures; fall back to original name.
      }
    }
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) {
      toast.error('Download failed', 'No writable directory available.');
      return;
    }
    const destination = `${baseDir}${Date.now()}-${finalName}`;
    try {
      const download = await FileSystem.downloadAsync(data.signedUrl, destination);
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;
        const mimeType = getMimeType(finalName);
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          finalName,
          mimeType
        );
        const base64 = await FileSystem.readAsStringAsync(download.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(destUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        toast.success('Downloaded', 'Saved to the selected folder.');
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          toast.success('Downloaded', `Saved "${finalName}" to your device.`);
          return;
        }
        await Sharing.shareAsync(download.uri, {
          mimeType: getMimeType(finalName),
          UTI: getUti(finalName),
        });
      }
    } catch (downloadError: any) {
      toast.error('Download failed', downloadError?.message || 'Unable to download file.');
    }
  };

  const handleRename = async () => {
    if (!storageOwnerId || !renameFile) return;
    const rawName = renameValue.trim();
    if (!rawName) {
      setRenameFile(null);
      return;
    }
    if (rawName.includes('/')) {
      toast.warning('Invalid name', "File name can't include slashes.");
      return;
    }
    const hasExtension = rawName.includes('.');
    const nextName = hasExtension || !renameExtension ? rawName : `${rawName}.${renameExtension}`;
    if (nextName === renameFile.name) {
      setRenameFile(null);
      return;
    }
    const fromPath = `${storageOwnerId}/${renameFile.folder}/${renameFile.name}`;
    const toPath = `${storageOwnerId}/${renameFile.folder}/${nextName}`;
    const { error } = await vaultApi.renameFile(fromPath, toPath);
    if (error) {
      toast.error('Rename failed', error.message || 'Unable to rename file.');
      return;
    }
    setFiles((prev) =>
      prev.map((file) =>
        file.name === renameFile.name && file.folder === renameFile.folder
          ? { ...file, name: nextName }
          : file
      )
    );
    setRenameFile(null);
    setRenameExtension('');
  };

  const handleDelete = async (item: VaultItem) => {
    if (!storageOwnerId) return;
    Alert.alert('Delete document?', `Delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await vaultApi.deleteFile(`${storageOwnerId}/${item.folder}/${item.name}`);
          if (error) {
            toast.error('Delete failed', error.message || 'Unable to delete file.');
            return;
          }
          setFiles((prev) => prev.filter((file) => file.name !== item.name));
          fetchCounts();
        },
      },
    ]);
  };

  const openRenameModal = (item: VaultItem) => {
    setRenameFile(item);
    setRenameValue(stripExtension(item.name));
    setRenameExtension(getExtension(item.name));
  };

  const closePreview = () => {
    setPreviewItem(null);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const openMenu = (item: VaultItem, event?: any) => {
    const { pageX, pageY } = event?.nativeEvent ?? {};
    if (typeof pageX === 'number' && typeof pageY === 'number') {
      setMenuAnchor({ x: pageX, y: pageY });
    } else {
      setMenuAnchor(null);
    }
    setMenuFile(item);
  };

  const closeMenu = () => {
    setMenuFile(null);
  };

  const previewType = useMemo(() => {
    if (!previewItem) return 'unknown';
    const extension = getExtension(previewItem.name).toLowerCase();
    if (extension === 'pdf') return 'pdf';
    if (allowedImageExt.has(extension)) return 'image';
    return 'unknown';
  }, [previewItem]);

  const onSelectCategory = (category: CategoryKey) => {
    setActiveCategory(category);
  };

  const menuWidth = 200;
  const menuLeft = useMemo(() => {
    if (!menuAnchor) return 12;
    const candidate = menuAnchor.x - menuWidth + 16;
    return Math.min(Math.max(candidate, 12), windowWidth - menuWidth - 12);
  }, [menuAnchor, menuWidth, windowWidth]);

  const menuTop = useMemo(() => {
    if (!menuAnchor) return insets.top + 80;
    const candidate = menuAnchor.y + 8;
    const maxTop = windowHeight - menuHeight - insets.bottom - 12;
    const minTop = insets.top + 8;
    return Math.min(Math.max(candidate, minTop), Math.max(minTop, maxTop));
  }, [menuAnchor, menuHeight, windowHeight, insets.bottom, insets.top]);

  const today = useMemo(() => formatDateForInput(new Date()), []);

  const handleSelectRangeDate = (dateString: string) => {
    setCustomRange((prev) => {
      if (!prev.start || (prev.start && prev.end)) {
        return { start: dateString, end: '' };
      }

      if (dateString < prev.start) {
        return { start: dateString, end: '' };
      }

      return { start: prev.start, end: dateString };
    });
  };

  const markedDates = useMemo(() => {
    const { start, end } = customRange;
    if (!start && !end) return {};

    const selectionEnd = end || start;
    const range = getDatesInRange(start, selectionEnd);
    if (range.length === 1) {
      return {
        [start]: {
          startingDay: true,
          endingDay: true,
          color: '#2f565f',
          textColor: '#ffffff',
        },
      };
    }

    return range.reduce<Record<string, any>>((acc, date, index) => {
      const isStart = date === start;
      const isEnd = date === selectionEnd;
      acc[date] = {
        startingDay: isStart,
        endingDay: isEnd,
        color: '#2f565f',
        textColor: '#ffffff',
      };
      return acc;
    }, {});
  }, [customRange]);

  const rangeLabel = useMemo(() => {
    if (!customRange.start) return 'Select a date range';
    const startLabel = parseDateString(customRange.start).toLocaleDateString();
    if (!customRange.end) return `${startLabel} • Choose end date`;
    const endLabel = parseDateString(customRange.end).toLocaleDateString();
    return `${startLabel} – ${endLabel}`;
  }, [customRange.end, customRange.start]);

  const isRangeValid = useMemo(() => {
    if (!customRange.start) return false;
    const selectionEnd = customRange.end || customRange.start;
    return selectionEnd >= customRange.start;
  }, [customRange.end, customRange.start]);

  const renderCount = (key: CategoryKey) => {
    if (key === 'all') {
      return counts.reports + counts.prescriptions + counts.insurance + counts.bills;
    }
    return counts[key];
  };

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      innerStyle={styles.innerContent}
      padded={false}
      scrollable={false}
      safeAreaStyle={styles.safeArea}
      safeAreaEdges={['left', 'right', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Medical Vault</Text>
            <Text style={styles.subtitle}>Securely store and manage your medical documents</Text>
          </View>
          <AnimatedButton style={styles.uploadButton} onPress={handlePickFile}>
            <MaterialCommunityIcons name="upload" size={18} color="#1f2f33" />
            <Text style={styles.uploadText}>Upload</Text>
          </AnimatedButton>
        </View>

        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={18} color="#94a3b8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search documents..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          <AnimatedButton onPress={() => setSortMenuOpen(true)} style={styles.sortButton}>
            <MaterialCommunityIcons name="sort" size={18} color="#1f2f33" />
          </AnimatedButton>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {categoryOptions.map((category, index) => {
            const isActive = activeCategory === category.key;
            return (
              <Animated.View
                key={category.key}
                entering={FadeInDown.delay(index * 30).springify()}
              >
                <AnimatedButton
                  onPress={() => onSelectCategory(category.key)}
                  style={[styles.chip, isActive && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {category.label}
                  </Text>
                  <View style={[styles.chipCount, isActive && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, isActive && styles.chipCountTextActive]}>
                      {renderCount(category.key)}
                    </Text>
                  </View>
                </AnimatedButton>
              </Animated.View>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {dateFilters.map((filter, index) => {
            const isActive = dateFilter === filter.key || (filter.key === 'custom' && dateFilter === 'custom' && customRange.start && customRange.end);
            return (
              <Animated.View
                key={filter.key}
                entering={FadeInDown.delay(index * 30).springify()}
              >
                <AnimatedButton
                  onPress={() => {
                    if (filter.key === 'custom') {
                      setCustomDateModalOpen(true);
                    } else {
                      setDateFilter(filter.key);
                      setCustomRange({ start: '', end: '' });
                    }
                  }}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {filter.label}
                  </Text>
                </AnimatedButton>
              </Animated.View>
            );
          })}
        </ScrollView>

        <View style={styles.list}>
          {loading ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonListItem key={i} />
              ))}
            </View>
          ) : null}

          {!loading && visibleFiles.length === 0 ? (
            <EmptyStatePreset preset="search" />
          ) : null}

          {!loading &&
            visibleFiles.map((item, index) => (
              <Animated.View
                key={`${item.folder}-${item.name}`}
                entering={FadeInDown.delay(Math.min(index * 60, 600)).springify()}
              >
                <AnimatedPressable
                  style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}
                  onPress={() => handlePreview(item)}
                >
                  <View style={styles.listIcon}>
                    <MaterialCommunityIcons name={folderIcon[item.folder]} size={22} color="#2f565f" />
                  </View>
                  <View style={styles.listText}>
                    <Text style={styles.itemTitle}>{item.name}</Text>
                    <Text style={styles.itemDate}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <AnimatedButton
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      openMenu(item, event);
                    }}
                    style={styles.moreButton}
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={18} color="#7c8b90" />
                  </AnimatedButton>
              </AnimatedPressable>
              </Animated.View>
            ))}
        </View>
      </ScrollView>

      <Modal transparent visible={Boolean(previewItem)} animationType="slide">
        <Animated.View entering={FadeIn} style={styles.previewOverlay}>
          <View style={[styles.previewContainer, { paddingTop: insets.top + 12 }]}>
            <View style={styles.previewHeader}>
              <AnimatedButton style={styles.previewHeaderButton} onPress={closePreview}>
                <MaterialCommunityIcons name="close" size={18} color="#1f2f33" />
              </AnimatedButton>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewItem?.name}
              </Text>
              <AnimatedButton
                style={styles.previewHeaderButton}
                onPress={() => {
                  if (previewItem) handleDownload(previewItem);
                }}
              >
                <MaterialCommunityIcons name="download" size={18} color="#1f2f33" />
              </AnimatedButton>
            </View>
            <View style={styles.previewBody}>
              {previewLoading ? (
                <View style={styles.previewState}>
                  <ActivityIndicator size="small" color="#2f565f" />
                  <Text style={styles.previewStateText}>Preparing preview…</Text>
                </View>
              ) : null}

              {!previewLoading && previewError ? (
                <View style={styles.previewState}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#b42318" />
                  <Text style={styles.previewErrorText}>{previewError}</Text>
                </View>
              ) : null}

              {!previewLoading && !previewError && previewUrl && previewType === 'image' ? (
                <Image
                  source={{ uri: previewUrl }}
                  resizeMode="contain"
                  style={styles.previewImage}
                />
              ) : null}

              {!previewLoading && !previewError && previewUrl && previewType === 'pdf' ? (
                <Pdf
                  source={{ uri: previewUrl }}
                  style={styles.previewPdf}
                  onError={(error) => {
                    const message =
                      error && typeof error === 'object' && 'message' in error
                        ? String((error as { message?: unknown }).message ?? '')
                        : '';
                    setPreviewError(message || 'Unable to load PDF.');
                  }}
                />
              ) : null}

              {!previewLoading && !previewError && previewUrl && previewType === 'unknown' ? (
                <View style={styles.previewState}>
                  <MaterialCommunityIcons name="file-outline" size={22} color="#64748b" />
                  <Text style={styles.previewStateText}>Preview not available for this file.</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={Boolean(menuFile)} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.popoverOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <Animated.View
            entering={FadeIn}
            style={[styles.actionSheetPopover, { top: menuTop, left: menuLeft, width: menuWidth }]}
            onLayout={(event) => {
              setMenuHeight(event.nativeEvent.layout.height);
            }}
          >
            <View>
              <Text style={styles.actionTitle}>{menuFile?.name}</Text>
              <AnimatedButton
                style={styles.actionItem}
                onPress={() => {
                  if (menuFile) handleDownload(menuFile);
                  closeMenu();
                }}
              >
                <MaterialCommunityIcons name="download" size={18} color="#1f2f33" />
                <Text style={styles.actionText}>Download</Text>
              </AnimatedButton>
              <AnimatedButton
                style={styles.actionItem}
                onPress={() => {
                  if (menuFile) openRenameModal(menuFile);
                  closeMenu();
                }}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color="#1f2f33" />
                <Text style={styles.actionText}>Rename</Text>
              </AnimatedButton>
              <AnimatedButton
                style={styles.actionItem}
                onPress={() => {
                  if (menuFile) handleDelete(menuFile);
                  closeMenu();
                }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b42318" />
                <Text style={[styles.actionText, styles.dangerText]}>Delete</Text>
              </AnimatedButton>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={uploadModalOpen} animationType="slide">
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
        <Animated.View entering={FadeIn} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setUploadModalOpen(false)} />
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <MotiView
              from={{ translateY: 100, opacity: 0.5 }}
              animate={{ translateY: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            >
              <Animated.View
                entering={SlideInDown.springify()}
                style={[styles.uploadSheet, { maxHeight: centeredModalMaxHeight }]}
              >
                <View>
                  <Text style={styles.sheetTitle}>Upload document</Text>
                  <Text style={styles.sheetSubtitle}>{uploadDraft.file?.name ?? 'No file selected'}</Text>
                <TextInput
                  value={uploadDraft.fileName}
                  onChangeText={(value) => setUploadDraft((prev) => ({ ...prev, fileName: value }))}
                  placeholder="File name"
                  placeholderTextColor="#94a3b8"
                  style={styles.sheetInput}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {categoryOptions
                    .filter((category) => category.key !== 'all')
                    .map((category) => {
                      const isActive = uploadDraft.category === category.key;
                      return (
                        <Pressable
                          key={category.key}
                          onPress={() => setUploadDraft((prev) => ({ ...prev, category: category.key }))}
                          style={[styles.chip, isActive && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                            {category.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                </ScrollView>
                <AnimatedButton
                  style={[styles.primaryButton, uploading && styles.buttonDisabled]}
                  onPress={handleUpload}
                  disabled={uploading}
                >
                  <Text style={styles.primaryButtonText}>{uploading ? 'Uploading...' : 'Upload'}</Text>
                </AnimatedButton>
                </View>
              </Animated.View>
            </MotiView>
          </KeyboardAvoidingView>
        </Animated.View>
        </BlurView>
      </Modal>

      <Modal transparent visible={Boolean(renameFile)} animationType="fade">
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
        <Animated.View entering={FadeIn} style={styles.centeredOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameFile(null)} />
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Animated.View
              entering={FadeInDown.springify()}
              style={[styles.renameCard, { maxHeight: centeredModalMaxHeight }]}
            >
              <View>
                <Text style={styles.sheetTitle}>Rename document</Text>
                <TextInput
                  value={renameValue}
                  onChangeText={setRenameValue}
                  placeholder="New file name"
                  placeholderTextColor="#94a3b8"
                  style={styles.sheetInput}
                />
                <AnimatedButton style={styles.primaryButton} onPress={handleRename}>
                  <Text style={styles.primaryButtonText}>Save</Text>
                </AnimatedButton>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Animated.View>
        </BlurView>
      </Modal>

      <Modal transparent visible={sortMenuOpen} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortMenuOpen(false)} />
          <Animated.View entering={FadeInDown.springify()} style={styles.sortMenu}>
            <View>
              {sortOptions.map((option) => {
                const isActive = sortOption === option.key;
                return (
                  <AnimatedButton
                    key={option.key}
                    onPress={() => {
                      setSortOption(option.key);
                      setSortMenuOpen(false);
                    }}
                    style={styles.sortOption}
                  >
                    <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                      {option.label}
                    </Text>
                    {isActive ? (
                      <MaterialCommunityIcons name="check" size={16} color="#2f565f" />
                    ) : null}
                  </AnimatedButton>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal transparent visible={customDateModalOpen} animationType="fade">
        <Animated.View entering={FadeIn} style={styles.centeredOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setCustomDateModalOpen(false);
            }}
          />
          <Animated.View
            entering={FadeInDown.springify()}
            style={[styles.customDateCard, { maxHeight: customDateCardMaxHeight }]}
          >
            <ScrollView
              contentContainerStyle={styles.customDateScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sheetTitle}>Custom Date Range</Text>
              <View style={styles.dateInputContainer}>
                <View style={styles.rangeSummary}>
                  <View style={styles.rangeIcon}>
                    <MaterialCommunityIcons name="calendar-range" size={18} color="#2f565f" />
                  </View>
                  <View style={styles.rangeText}>
                    <Text style={styles.rangeLabel}>Selected range</Text>
                    <Text style={styles.rangeValue}>{rangeLabel}</Text>
                  </View>
                </View>
                <View style={[styles.calendarWrapper, { maxHeight: customDateCalendarMaxHeight }]}>
                  <Calendar
                    markingType="period"
                    markedDates={markedDates}
                    maxDate={today}
                    onDayPress={(day) => handleSelectRangeDate(day.dateString)}
                    enableSwipeMonths
                    theme={{
                      calendarBackground: '#ffffff',
                      textSectionTitleColor: '#64748b',
                      selectedDayBackgroundColor: '#2f565f',
                      selectedDayTextColor: '#ffffff',
                      todayTextColor: '#2f565f',
                      arrowColor: '#2f565f',
                      dayTextColor: '#1f2f33',
                      monthTextColor: '#1f2f33',
                      textDisabledColor: '#c7d0d4',
                      textDayFontWeight: '600',
                      textMonthFontWeight: '700',
                    }}
                    style={styles.calendar}
                  />
                </View>
              </View>
              <View style={styles.customDateActions}>
                <AnimatedButton
                  style={styles.secondaryButton}
                  onPress={() => {
                    setCustomRange({ start: '', end: '' });
                    setDateFilter('all');
                    setCustomDateModalOpen(false);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Clear</Text>
                </AnimatedButton>
                <AnimatedButton
                  style={[
                    styles.primaryButton,
                    !isRangeValid && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    if (!isRangeValid) return;
                    if (customRange.start && !customRange.end) {
                      setCustomRange((prev) => ({ ...prev, end: prev.start }));
                    }
                    setDateFilter('custom');
                    setCustomDateModalOpen(false);
                  }}
                  disabled={!isRangeValid}
                >
                  <Text style={styles.primaryButtonText}>Apply</Text>
                </AnimatedButton>
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#eef3f3',
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
    paddingBottom: 24,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f1a1c',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7f86',
    marginTop: 4,
    maxWidth: 240,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d5dee2',
    backgroundColor: '#f7fbfb',
  },
  uploadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2f33',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#d3dde1',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fdfefe',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  sortButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3f3',
  },
  chipRow: {
    gap: 10,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d1dadd',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#2f565f',
    borderColor: '#2f565f',
  },
  chipText: {
    fontSize: 12,
    color: '#1f2f33',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#f8fbfb',
  },
  chipCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#eef3f3',
  },
  chipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  chipCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1f2f33',
  },
  chipCountTextActive: {
    color: '#ffffff',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1dadd',
    backgroundColor: '#fdfefe',
  },
  filterChipActive: {
    backgroundColor: '#e4eef0',
    borderColor: '#b8c7cc',
  },
  filterChipText: {
    fontSize: 11,
    color: '#51656b',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#1f2f33',
  },
  list: {
    gap: 12,
  },
  listItemPressed: {
    transform: [{ scale: 0.98 }],
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7e0e4',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#9aa8ad',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#e4eef0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1b2b2f',
  },
  itemDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f6',
  },
  emptyState: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7e0e4',
    backgroundColor: '#f8fbfb',
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2f33',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  popoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalKeyboard: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: '#eef3f3',
  },
  previewContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  previewHeaderButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f6',
  },
  previewTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2f33',
  },
  previewBody: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7e0e4',
    backgroundColor: '#ffffff',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  previewPdf: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  previewState: {
    alignItems: 'center',
    gap: 8,
  },
  previewStateText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  previewErrorText: {
    fontSize: 12,
    color: '#b42318',
    textAlign: 'center',
  },
  actionSheetPopover: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2f33',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#1f2f33',
    fontWeight: '600',
  },
  dangerText: {
    color: '#b42318',
  },
  uploadSheet: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
  },
  renameCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 20,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2f33',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: '#d1dadd',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#fdfefe',
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#2f565f',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  sortMenu: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 16,
    gap: 8,
    margin: 24,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sortOptionText: {
    fontSize: 13,
    color: '#1f2f33',
  },
  sortOptionTextActive: {
    fontWeight: '700',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#e1eaec',
    borderRadius: 6,
  },
  customDateCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 20,
    gap: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  customDateScrollContent: {
    gap: 16,
    paddingBottom: 4,
  },
  dateInputContainer: {
    gap: 16,
  },
  rangeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#f7fbfb',
    borderWidth: 1,
    borderColor: '#e1eaec',
  },
  rangeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#e4eef0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeText: {
    flex: 1,
  },
  rangeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  rangeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2f33',
  },
  calendarWrapper: {
    borderWidth: 1,
    borderColor: '#e1eaec',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  calendar: {
    borderRadius: 16,
  },
  customDateActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1dadd',
    backgroundColor: '#f7fbfb',
  },
  secondaryButtonText: {
    color: '#1f2f33',
    fontSize: 14,
    fontWeight: '600',
  },
});
