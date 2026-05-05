import * as SecureStore from "expo-secure-store";
import { base64ToBytes, bytesToBase64 } from "./crypto/encoding";

const DEVICE_PRIV_KEY = "device-priv";
const CONV_KEY_PREFIX = "convkey-";

export const SecureKeyStore = {
  async getDevicePrivateKey(): Promise<Uint8Array | null> {
    const raw = await SecureStore.getItemAsync(DEVICE_PRIV_KEY);
    return raw ? base64ToBytes(raw) : null;
  },
  async setDevicePrivateKey(privateKey: Uint8Array): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_PRIV_KEY, bytesToBase64(privateKey));
  },
  async getConversationKey(chatId: string): Promise<Uint8Array | null> {
    const raw = await SecureStore.getItemAsync(CONV_KEY_PREFIX + chatId);
    return raw ? base64ToBytes(raw) : null;
  },
  async setConversationKey(chatId: string, key: Uint8Array): Promise<void> {
    await SecureStore.setItemAsync(CONV_KEY_PREFIX + chatId, bytesToBase64(key));
  },
  async removeConversationKey(chatId: string): Promise<void> {
    await SecureStore.deleteItemAsync(CONV_KEY_PREFIX + chatId);
  },
};
