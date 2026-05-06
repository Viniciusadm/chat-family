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

export type CryptoProgress =
  | { phase: "deriving"; percent: number }
  | { phase: "backing-up"; done: number; total: number }
  | { phase: "restoring"; done: number; total: number };

export type CryptoProgressCallback = (p: CryptoProgress) => void;

const BACKUP_CONCURRENCY = 8;

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

export async function setupBackupPassword(
  uid: string,
  password: string,
  onProgress?: CryptoProgressCallback,
): Promise<void> {
  if (await getPasswordSettings(uid)) {
    throw new Error("Password already configured. Use changeBackupPassword.");
  }
  const salt = generatePasswordSalt();
  const kek = await deriveKeyFromPassword(password, salt, (percent) =>
    onProgress?.({ phase: "deriving", percent }),
  );
  const verifier = makePasswordVerifier(kek);
  await writePasswordSettings(uid, { salt, verifier });
  unlocked = { uid, kek };
  await backupAllLocalKeys(uid, onProgress);
}

export async function unlockBackupWithPassword(
  uid: string,
  password: string,
  onProgress?: CryptoProgressCallback,
): Promise<{ ok: true } | { ok: false; reason: "no-settings" | "wrong-password" }> {
  const settings = await getPasswordSettings(uid);
  if (!settings) return { ok: false, reason: "no-settings" };
  const kek = await deriveKeyFromPassword(password, settings.salt, (percent) =>
    onProgress?.({ phase: "deriving", percent }),
  );
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
  onProgress?: CryptoProgressCallback,
): Promise<{ ok: true } | { ok: false; reason: "no-settings" | "wrong-password" }> {
  const settings = await getPasswordSettings(uid);
  if (!settings) return { ok: false, reason: "no-settings" };
  const oldKek = await deriveKeyFromPassword(oldPassword, settings.salt, (percent) =>
    onProgress?.({ phase: "deriving", percent: percent / 2 }),
  );
  if (!checkPasswordVerifier(oldKek, settings.verifier)) {
    oldKek.fill(0);
    return { ok: false, reason: "wrong-password" };
  }
  oldKek.fill(0);
  const newSalt = generatePasswordSalt();
  const newKek = await deriveKeyFromPassword(newPassword, newSalt, (percent) =>
    onProgress?.({ phase: "deriving", percent: 0.5 + percent / 2 }),
  );
  const newVerifier = makePasswordVerifier(newKek);
  await writePasswordSettings(uid, { salt: newSalt, verifier: newVerifier });
  unlocked = { uid, kek: newKek };
  await deleteAllKeyBackups(uid);
  await backupAllLocalKeys(uid, onProgress);
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
  onProgress?: CryptoProgressCallback,
): Promise<RestoreResult> {
  const settings = await getPasswordSettings(uid);
  if (!settings) return { ok: false, reason: "no-settings" };
  const kek = await deriveKeyFromPassword(password, settings.salt, (percent) =>
    onProgress?.({ phase: "deriving", percent }),
  );
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
  let done = 0;
  const total = backups.length;
  onProgress?.({ phase: "restoring", done: 0, total });
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
    done++;
    onProgress?.({ phase: "restoring", done, total });
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

async function backupAllLocalKeys(
  uid: string,
  onProgress?: CryptoProgressCallback,
): Promise<void> {
  if (!unlocked || unlocked.uid !== uid) return;
  const chatIds = await SecureKeyStore.listConversationKeyChatIds();
  const total = chatIds.length;
  if (total === 0) return;
  let done = 0;
  onProgress?.({ phase: "backing-up", done: 0, total });

  const queue = [...chatIds];
  const workers: Promise<void>[] = [];
  const limit = Math.min(BACKUP_CONCURRENCY, total);
  const kek = unlocked.kek;
  for (let i = 0; i < limit; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const chatId = queue.shift();
          if (!chatId) break;
          if (!unlocked || unlocked.uid !== uid) return;
          try {
            const key = await SecureKeyStore.getConversationKey(chatId);
            if (key) {
              const wrapped = encryptConversationKeyWithKek(kek, key);
              await writeKeyBackup(uid, chatId, wrapped);
            }
          } catch {
            // Skip; user can re-trigger by toggling the password later.
          }
          done++;
          onProgress?.({ phase: "backing-up", done, total });
        }
      })(),
    );
  }
  await Promise.all(workers);
}
