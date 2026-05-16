import * as cryptoApi from "@/src/api/crypto";
import type { KeyBackupDoc, PasswordVerifierField } from "@/types/chat";

export interface PasswordSettings {
  salt: string;
  verifier: PasswordVerifierField;
}

export async function getPasswordSettings(_uid: string): Promise<PasswordSettings | null> {
  const settings = await cryptoApi.getPasswordSettings();
  if (
    !settings?.password_salt ||
    !settings.password_verifier_ciphertext ||
    !settings.password_verifier_iv
  ) {
    return null;
  }
  return {
    salt: settings.password_salt,
    verifier: {
      ciphertext: settings.password_verifier_ciphertext,
      iv: settings.password_verifier_iv,
    },
  };
}

export async function writePasswordSettings(
  _uid: string,
  settings: PasswordSettings,
): Promise<void> {
  await cryptoApi.putPasswordSettings({
    password_salt: settings.salt,
    password_verifier_ciphertext: settings.verifier.ciphertext,
    password_verifier_iv: settings.verifier.iv,
  });
}

export async function clearPasswordSettings(_uid: string): Promise<void> {
  await cryptoApi.deletePasswordSettings();
}

export async function writeKeyBackup(
  _uid: string,
  chatId: string,
  payload: { ciphertext: string; iv: string },
): Promise<void> {
  await cryptoApi.putKeyBackup(chatId, {
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    enc_version: 1,
  });
}

export async function listKeyBackups(
  _uid: string,
): Promise<{ chatId: string; backup: KeyBackupDoc }[]> {
  const backups = await cryptoApi.listKeyBackups();
  return backups.map((backup) => ({
    chatId: backup.chat_id,
    backup: {
      ciphertext: backup.ciphertext,
      iv: backup.iv,
      encVersion: backup.enc_version,
      createdAt: new Date().toISOString(),
    },
  }));
}

export async function countKeyBackups(uid: string): Promise<number> {
  return (await listKeyBackups(uid)).length;
}

export async function deleteAllKeyBackups(_uid: string): Promise<void> {
  await cryptoApi.deleteKeyBackups();
}
