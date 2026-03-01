import * as SecureStore from 'expo-secure-store';

export type RememberedAccount = {
  userId: string;
  name: string;
  phone: string;
  email?: string | null;
  avatarUrl?: string | null;
};

const REMEMBERED_ACCOUNT_KEY = 'vytara_remembered_account_mobile';
const REMEMBERED_DEVICE_TOKEN_KEY = 'vytara_remembered_device_token_mobile';

const isRememberedAccount = (value: unknown): value is RememberedAccount => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RememberedAccount>;
  return (
    typeof candidate.userId === 'string' &&
    candidate.userId.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.phone === 'string' &&
    candidate.phone.length > 0
  );
};

export const loadRememberedAccount = async (): Promise<RememberedAccount | null> => {
  const raw = await SecureStore.getItemAsync(REMEMBERED_ACCOUNT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRememberedAccount(parsed)) {
      await SecureStore.deleteItemAsync(REMEMBERED_ACCOUNT_KEY);
      return null;
    }
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(REMEMBERED_ACCOUNT_KEY);
    return null;
  }
};

export const loadRememberedDeviceToken = async (): Promise<string | null> => {
  return SecureStore.getItemAsync(REMEMBERED_DEVICE_TOKEN_KEY);
};

export const saveRememberedDevice = async (
  account: RememberedAccount,
  deviceToken: string
) => {
  await Promise.all([
    SecureStore.setItemAsync(REMEMBERED_ACCOUNT_KEY, JSON.stringify(account)),
    SecureStore.setItemAsync(REMEMBERED_DEVICE_TOKEN_KEY, deviceToken),
  ]);
};

export const clearRememberedDevice = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(REMEMBERED_ACCOUNT_KEY),
    SecureStore.deleteItemAsync(REMEMBERED_DEVICE_TOKEN_KEY),
  ]);
};
