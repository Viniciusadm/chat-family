import { unwrapKeyFromShare, wrapKeyForDevice } from "./crypto/asymmetric";
import { getConversationKey, importConversationKey } from "./conversationKeys";
import { getDevicePrivateKey } from "./deviceIdentity";
import { listKeyShares, writeKeyShare } from "./remoteKeyShares";
import { listKeyRecipientDevices } from "@/src/api/devices";

export async function distributeConversationKey(
  chatId: string,
  participantMemberIds: string[],
  tenantId: string,
  wrappedBy: string,
): Promise<void> {
  const key = await getConversationKey(chatId);
  if (!key) return;
  void tenantId;

  const recipients = await listKeyRecipientDevices(participantMemberIds);
  await Promise.all(
    recipients.map(async (device) => {
      if (!device.public_key) return;
      const wrapped = wrapKeyForDevice(device.public_key, key);
      await writeKeyShare(device.id, chatId, wrappedBy, wrapped);
    })
  );
}

export async function distributeAllOwnedKeysToDevice(
  targetDeviceId: string,
  targetPublicKey: string,
  chatIds: string[],
  wrappedBy: string,
): Promise<void> {
  for (const chatId of chatIds) {
    const key = await getConversationKey(chatId);
    if (!key) continue;
    const wrapped = wrapKeyForDevice(targetPublicKey, key);
    try {
      await writeKeyShare(targetDeviceId, chatId, wrappedBy, wrapped);
    } catch {
      // Skip; the next approval pass can retry.
    }
  }
}

export async function consumePendingKeyShares(deviceId: string): Promise<string[]> {
  if (!deviceId) return [];
  const priv = await getDevicePrivateKey();
  if (!priv) return [];
  const shares = await listKeyShares(deviceId);
  const importedChatIds: string[] = [];
  for (const { chatId, share } of shares) {
    try {
      const key = unwrapKeyFromShare(priv, share);
      await importConversationKey(chatId, key);
      importedChatIds.push(chatId);
    } catch {
      // Bad share; skip.
    }
  }
  return importedChatIds;
}
