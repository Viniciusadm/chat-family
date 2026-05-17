import {
  ensureConversationKey,
  getConversationKey,
  importConversationKey,
} from "@/lib/conversationKeys";
import {
  consumePendingKeyShares,
  importPendingKeyShareForChat,
} from "@/lib/keyDistribution";
import { MessageRepository } from "@/lib/MessageRepository";

export async function repairConversationKeyFromPendingShare(
  chatId: string,
  deviceId?: string,
): Promise<boolean> {
  if (!chatId || !deviceId) return false;

  const existingKey = await getConversationKey(chatId);
  const repairedWithExistingKey = await MessageRepository.decryptStoredMessages(chatId);
  if (repairedWithExistingKey > 0) return true;

  await consumePendingKeyShares(deviceId);
  const keyAfterImport = await getConversationKey(chatId);
  if (!existingKey && keyAfterImport) {
    await MessageRepository.decryptStoredMessages(chatId);
    return true;
  }

  const undecryptedCount = await MessageRepository.countUndecryptedTextMessages(chatId);
  if (undecryptedCount === 0) return false;

  const imported = await importPendingKeyShareForChat(deviceId, chatId, {
    replaceExisting: true,
  });
  if (!imported) return false;

  const repaired = await MessageRepository.decryptStoredMessages(chatId);
  if (repaired > 0) return true;

  if (existingKey) {
    await importConversationKey(chatId, existingKey);
  }
  return false;
}

export async function prepareConversationKeyForEncryption(
  chatId: string,
  deviceId?: string,
  options: { canCreate?: boolean } = {},
): Promise<Uint8Array | null> {
  await repairConversationKeyFromPendingShare(chatId, deviceId);
  const existingKey = await getConversationKey(chatId);
  if (existingKey) return existingKey;

  if (options.canCreate === false) return null;

  return ensureConversationKey(chatId);
}
