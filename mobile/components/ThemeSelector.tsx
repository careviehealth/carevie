import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/components/Themed';
import { type AppThemeColors } from '@/constants/appThemes';
import { useAppTheme } from '@/hooks/useAppTheme';

export function ThemeSelector() {
  const {
    colors,
    isHydrated,
    isSyncing,
    selectedThemeId,
    setSelectedTheme,
    themes,
  } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Theme</Text>
          <Text style={styles.description}>
            Saved to your account and restored on signed-in devices.
          </Text>
        </View>
        <View style={styles.statusBadge}>
          <Text
            style={[
              styles.statusText,
              { color: isSyncing ? colors.accentStrong : colors.textSecondary },
            ]}
          >
            {isSyncing ? 'Syncing' : isHydrated ? 'Saved' : 'Loading'}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {themes.map((theme) => {
          const isSelected = theme.id === selectedThemeId;

          return (
            <Pressable
              key={theme.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => void setSelectedTheme(theme.id)}
              style={({ pressed }) => [
                styles.card,
                isSelected && styles.cardSelected,
                pressed && styles.cardPressed,
              ]}
            >
              <LinearGradient
                colors={[theme.preview.start, theme.preview.end]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.preview}
              >
                <View style={styles.previewTopRow}>
                  <View
                    style={[
                      styles.previewChip,
                      { backgroundColor: theme.preview.surface, borderColor: theme.preview.surface },
                    ]}
                  />
                  <View style={styles.previewDots}>
                    <View
                      style={[styles.previewDot, { backgroundColor: theme.preview.accent }]}
                    />
                    <View
                      style={[styles.previewDotSmall, { backgroundColor: theme.preview.surface }]}
                    />
                  </View>
                </View>
                <View style={styles.previewFooter}>
                  <View
                    style={[
                      styles.previewFooterBar,
                      { backgroundColor: theme.preview.surface },
                    ]}
                  />
                  <View
                    style={[
                      styles.previewFooterPill,
                      { backgroundColor: theme.preview.accent },
                    ]}
                  />
                </View>
              </LinearGradient>

              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{theme.label}</Text>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {theme.description}
                </Text>
              </View>

              {isSelected ? (
                <View style={styles.selectedBadge}>
                  <MaterialCommunityIcons
                    name="check"
                    size={14}
                    color={colors.accentContrast}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    description: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 4,
    },
    statusBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
    },
    scrollContent: {
      gap: 10,
      paddingRight: 12,
    },
    card: {
      width: 162,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    cardSelected: {
      borderColor: colors.accent,
      shadowColor: colors.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    cardPressed: {
      transform: [{ scale: 0.98 }],
    },
    preview: {
      height: 74,
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'space-between',
    },
    previewTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    previewChip: {
      width: 36,
      height: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    previewDots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    previewDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    previewDotSmall: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    previewFooter: {
      gap: 8,
    },
    previewFooterBar: {
      width: '72%',
      height: 10,
      borderRadius: 999,
    },
    previewFooterPill: {
      width: 44,
      height: 9,
      borderRadius: 999,
    },
    cardCopy: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cardDescription: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 4,
    },
    selectedBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      borderWidth: 1,
      borderColor: colors.surface,
    },
  });
}
