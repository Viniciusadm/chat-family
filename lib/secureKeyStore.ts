import * as SecureStore from "expo-secure-store";
import { base64ToBytes, bytesToBase64 } from "./crypto/encoding";

const DEVICE_PRIV_KEY = "device-priv";
const CONV_KEY_PREFIX = "convkey-";
const CONV_KEY_INDEX = "convkey-index";

async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(CONV_KEY_INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(CONV_KEY_INDEX, JSON.stringify(ids));
}

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
    const index = await readIndex();
    if (!index.includes(chatId)) {
      index.push(chatId);
      await writeIndex(index);
    }
  },
  async removeConversationKey(chatId: string): Promise<void> {
    await SecureStore.deleteItemAsync(CONV_KEY_PREFIX + chatId);
    const index = await readIndex();
    const next = index.filter((id) => id !== chatId);
    if (next.length !== index.length) await writeIndex(next);
  },
  async listConversationKeyChatIds(): Promise<string[]> {
    return readIndex();
  },
};
