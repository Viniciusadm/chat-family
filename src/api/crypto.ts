import { apiFetch } from "./client";

export type PasswordSettingsDto = {
  password_salt?: string | null;
  password_verifier_ciphertext?: string | null;
  password_verifier_iv?: string | null;
};

export type KeyBackupDto = {
  chat_id: string;
  ciphertext: string;
  iv: string;
  enc_version: number;
};

export type KeyShareDto = {
  chat_id: string;
  ephemeral_public_key: string;
  iv: string;
  ciphertext: string;
};

export function getPasswordSettings() {
  return apiFetch<PasswordSettingsDto | null>("/crypto/password-settings");
}

export function putPasswordSettings(body: PasswordSettingsDto) {
  return apiFetch<{ ok: true }>("/crypto/password-settings", { method: "PUT", body });
}

export function deletePasswordSettings() {
  return apiFetch<{ ok: true }>("/crypto/password-settings", { method: "DELETE" });
}

export function listKeyBackups() {
  return apiFetch<KeyBackupDto[]>("/crypto/key-backups");
}

export function putKeyBackup(chatId: string, body: {
  ciphertext: string;
  iv: string;
  enc_version: number;
}) {
  return apiFetch<{ ok: true }>(`/crypto/key-backups/${chatId}`, { method: "PUT", body });
}

export function deleteKeyBackups() {
  return apiFetch<{ ok: true }>("/crypto/key-backups", { method: "DELETE" });
}

export function listKeyShares(deviceId: string) {
  return apiFetch<KeyShareDto[]>(`/devices/${deviceId}/key-shares`);
}

export function putKeyShare(deviceId: string, chatId: string, body: {
  ephemeral_public_key: string;
  iv: string;
  ciphertext: string;
}) {
  return apiFetch<{ ok: true }>(`/devices/${deviceId}/key-shares/${chatId}`, {
    method: "PUT",
    body,
  });
}
