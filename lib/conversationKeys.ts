import { auth } from "./firebase";
import { generateConversationKey } from "./crypto/symmetric";
import { tryBackupConversationKey } from "./keyBackup";
import { SecureKeyStore } from "./secureKeyStore";

async function backupIfPossible(chatId: string, key: Uint8Array): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await tryBackupConversationKey(uid, chatId, key);
}

export async function ensureConversationKey(chatId: string): Promise<Uint8Array> {
  const existing = await SecureKeyStore.getConversationKey(chatId);
  if (existing) return existing;
  const key = generateConversationKey();
  await SecureKeyStore.setConversationKey(chatId, key);
  void backupIfPossible(chatId, key);
  return key;
}

export async function importConversationKey(chatId: string, key: Uint8Array): Promise<void> {
  await SecureKeyStore.setConversationKey(chatId, key);
  void backupIfPossible(chatId, key);
}

export async function getConversationKey(chatId: string): Promise<Uint8Array | null> {
  return SecureKeyStore.getConversationKey(chatId);
}
