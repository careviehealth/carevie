import { View, Text, StyleSheet } from 'react-native';
import Toast, { type ToastConfig, type ToastShowParams } from 'react-native-toast-message';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ToastBase({
  icon,
  iconColor,
  accentColor,
  title,
  message,
}: {
  icon: string;
  iconColor: string;
  accentColor: string;
  title?: string;
  message?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { marginTop: insets.top + 4 }]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.textWrap}>
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
        {message ? <Text style={styles.message} numberOfLines={2}>{message}</Text> : null}
      </View>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }) => (
    <ToastBase icon="check-circle" iconColor="#15803d" accentColor="#15803d" title={text1} message={text2} />
  ),
  error: ({ text1, text2 }) => (
    <ToastBase icon="alert-circle" iconColor="#dc2626" accentColor="#dc2626" title={text1} message={text2} />
  ),
  info: ({ text1, text2 }) => (
    <ToastBase icon="information" iconColor="#0f766e" accentColor="#0f766e" title={text1} message={text2} />
  ),
  warning: ({ text1, text2 }) => (
    <ToastBase icon="alert" iconColor="#d97706" accentColor="#d97706" title={text1} message={text2} />
  ),
};

type ToastType = 'success' | 'error' | 'info' | 'warning';

function show(type: ToastType, title: string, message?: string, opts?: Partial<ToastShowParams>) {
  Toast.show({ type, text1: title, text2: message, visibilityTime: 3000, topOffset: 0, ...opts });
}

export const toast = {
  success: (title: string, message?: string) => show('success', title, message),
  error: (title: string, message?: string) => show('error', title, message),
  info: (title: string, message?: string) => show('info', title, message),
  warning: (title: string, message?: string) => show('warning', title, message),
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5eaed',
    shadowColor: '#1b2b2f',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  iconWrap: {
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d2f33',
  },
  message: {
    fontSize: 13,
    color: '#6b7f86',
    marginTop: 2,
  },
});
