import { generateConversationKey } from "./crypto/symmetric";
import { SecureKeyStore } from "./secureKeyStore";

export async function ensureConversationKey(chatId: string): Promise<Uint8Array> {
  const existing = await SecureKeyStore.getConversationKey(chatId);
  if (existing) return existing;
  const key = generateConversationKey();
  await SecureKeyStore.setConversationKey(chatId, key);
  return key;
}

export async function importConversationKey(chatId: string, key: Uint8Array): Promise<void> {
  await SecureKeyStore.setConversationKey(chatId, key);
}

export async function getConversationKey(chatId: string): Promise<Uint8Array | null> {
  return SecureKeyStore.getConversationKey(chatId);
}
