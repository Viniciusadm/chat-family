import { unwrapKeyFromShare, wrapKeyForDevice } from "./crypto/asymmetric";
import { getConversationKey, importConversationKey } from "./conversationKeys";
import { getDevicePrivateKey } from "./deviceIdentity";
import { listKeyShares, writeKeyShare } from "./remoteKeyShares";

export async function distributeConversationKey(
  chatId: string,
  participantMemberIds: string[],
  tenantId: string,
  wrappedBy: string,
): Promise<void> {
  const key = await getConversationKey(chatId);
  if (!key) return;

  void participantMemberIds;
  void tenantId;
  void wrappedBy;
  void key;
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
