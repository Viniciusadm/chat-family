import {
  checkPasswordVerifier,
  decryptConversationKeyWithKek,
  deriveKeyFromPassword,
  encryptConversationKeyWithKek,
  generatePasswordSalt,
  makePasswordVerifier,
} from "./crypto/passwordKey";
import {
  clearPasswordSettings,
  countKeyBackups,
  deleteAllKeyBackups,
  getPasswordSettings,
  listKeyBackups,
  writeKeyBackup,
  writePasswordSettings,
} from "./firestoreKeyBackups";
import { SecureKeyStore } from "./secureKeyStore";

export type RestoreResult =
  | { ok: true; restoredChatIds: string[] }
  | { ok: false; reason: "no-settings" | "wrong-password" | "no-backups" };

interface UnlockedState {
  uid: string;
  kek: Uint8Array;
}

let unlocked: UnlockedState | null = null;

export function getUnlockedKek(uid: string): Uint8Array | null {
  if (!unlocked || unlocked.uid !== uid) return null;
  return unlocked.kek;
}

export function isBackupUnlockedFor(uid: string): boolean {
  return unlocked != null && unlocked.uid === uid;
}

export function lockBackup(): void {
  if (unlocked) unlocked.kek.fill(0);
  unlocked = null;
}

export async function hasPasswordConfigured(uid: string): Promise<boolean> {
  const settings = await getPasswordSettings(uid);
  return settings != null;
}

export async function hasRemoteBackups(uid: string): Promise<boolean> {
  return (await countKeyBackups(uid)) > 0;
}

export async function setupBackupPassword(uid: string, password: string): Promise<void> {
  if (await getPasswordSettings(uid)) {
    throw new Error("Password already configured. Use changeBackupPassword.");
  }
  const salt = generatePasswordSalt();
  const kek = deriveKeyFromPassword(password, salt);
  const verifier = makePasswordVerifier(kek);
  await writePasswordSettings(uid, { salt, verifier });
  unlocked = { uid, kek };
  await backupAllLocalKeys(uid);
}

export async function unlockBackupWithPassword(
  uid: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: "no-settings" | "wrong-password" }> {
  const settings = await getPasswordSettings(uid);
  if (!settings) return { ok: false, reason: "no-settings" };
  const kek = deriveKeyFromPassword(password, settings.salt);
  if (!checkPasswordVerifier(kek, settings.verifier)) {
    kek.fill(0);
    return { ok: false, reason: "wrong-password" };
  }
  unlocked = { uid, kek };
  return { ok: true };
}

export async function changeBackupPassword(
  uid: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: "no-settings" | "wrong-password" }> {
  const settings = await getPasswordSettings(uid);
  if (!settings) return { ok: false, reason: "no-settings" };
  const oldKek = deriveKeyFromPassword(oldPassword, settings.salt);
  if (!checkPasswordVerifier(oldKek, settings.verifier)) {
    oldKek.fill(0);
    return { ok: false, reason: "wrong-password" };
  }
  oldKek.fill(0);
  const newSalt = generatePasswordSalt();
  const newKek = deriveKeyFromPassword(newPassword, newSalt);
  const newVerifier = makePasswordVerifier(newKek);
  await writePasswordSettings(uid, { salt: newSalt, verifier: newVerifier });
  unlocked = { uid, kek: newKek };
  await deleteAllKeyBackups(uid);
  await backupAllLocalKeys(uid);
  return { ok: true };
}

export async function disableBackupPassword(uid: string): Promise<void> {
  await deleteAllKeyBackups(uid);
  await clearPasswordSettings(uid);
  lockBackup();
}

export async function restoreBackups(
  uid: string,
  password: string,
): Promise<RestoreResult> {
  const settings = await getPasswordSettings(uid);
  if (!settings) return { ok: false, reason: "no-settings" };
  const kek = deriveKeyFromPassword(password, settings.salt);
  if (!checkPasswordVerifier(kek, settings.verifier)) {
    kek.fill(0);
    return { ok: false, reason: "wrong-password" };
  }
  const backups = await listKeyBackups(uid);
  if (backups.length === 0) {
    unlocked = { uid, kek };
    return { ok: false, reason: "no-backups" };
  }
  const restored: string[] = [];
  for (const { chatId, backup } of backups) {
    try {
      const conversationKey = decryptConversationKeyWithKek(
        kek,
        backup.ciphertext,
        backup.iv,
      );
      await SecureKeyStore.setConversationKey(chatId, conversationKey);
      restored.push(chatId);
    } catch {
      // Skip a single corrupt backup; do not abort the whole restore.
    }
  }
  unlocked = { uid, kek };
  return { ok: true, restoredChatIds: restored };
}

export async function tryBackupConversationKey(
  uid: string,
  chatId: string,
  conversationKey: Uint8Array,
): Promise<void> {
  if (!unlocked || unlocked.uid !== uid) return;
  try {
    const wrapped = encryptConversationKeyWithKek(unlocked.kek, conversationKey);
    await writeKeyBackup(uid, chatId, wrapped);
  } catch {
    // Network / permission issue — backup is opportunistic, never fail upstream.
  }
}

async function backupAllLocalKeys(uid: string): Promise<void> {
  if (!unlocked || unlocked.uid !== uid) return;
  const chatIds = await SecureKeyStore.listConversationKeyChatIds();
  for (const chatId of chatIds) {
    const key = await SecureKeyStore.getConversationKey(chatId);
    if (!key) continue;
    try {
      const wrapped = encryptConversationKeyWithKek(unlocked.kek, key);
      await writeKeyBackup(uid, chatId, wrapped);
    } catch {
      // Skip; user can re-trigger by toggling the password later.
    }
  }
}
