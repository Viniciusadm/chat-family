import { ChatRepository } from "@/lib/ChatRepository";
import { ensureConversationKey } from "@/lib/conversationKeys";
import { encryptMessageText } from "@/lib/encryptedMessages";
import { distributeConversationKeyForChat } from "@/lib/keyDistribution";
import {
  ensureTextMessageRemote,
  softDeleteMessageRemote,
  updateTextMessageRemote,
} from "@/lib/remoteMessages";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { ImageCacheRepository } from "@/lib/ImageCacheRepository";
import { uploadAndPersistImage } from "@/lib/imageUpload";
import { MessageRepository } from "@/lib/MessageRepository";
import { ReactionRepository } from "@/lib/ReactionRepository";
import { listMessages, upsertReaction } from "@/src/api/chats";
import type { AppUser } from "@/types/chat";

const MESSAGE_PAGE_SIZE = 100;
const inFlightHistorySyncs = new Set<string>();
let pendingSyncInFlight = false;

export async function syncChatHistory(chatId: string, isOnline = true) {
  if (!isOnline) return;
  if (inFlightHistorySyncs.has(chatId)) return;
  inFlightHistorySyncs.add(chatId);

  try {
    const syncState = await MessageRepository.getMessageSyncState(chatId);
    let newestMessageAt = syncState.newestMessageAt;

    while (true) {
      const rows = await listMessages(chatId, {
        after: syncState.historySyncedAt && newestMessageAt ? newestMessageAt.toISOString() : undefined,
        limit: MESSAGE_PAGE_SIZE,
      });
      if (rows.length === 0) break;

      for (const data of rows) {
        const createdAt = data.created_at ? new Date(data.created_at) : null;
        if (createdAt && (!newestMessageAt || createdAt > newestMessageAt)) {
          newestMessageAt = createdAt;
        }
        await MessageRepository.upsertRemoteMessage(
          chatId,
          data.id,
          data,
          { notify: false }
        );
        if (data.audio_url) {
          void AudioCacheRepository.downloadMessageAudio({
            chatId,
            messageId: data.id,
            remoteUrl: data.audio_url,
          });
        }
        if (data.image_url) {
          void ImageCacheRepository.downloadMessageImage({
            chatId,
            messageId: data.id,
            remoteUrl: data.image_url,
          });
        }
      }

      MessageRepository.emit(chatId);

      if (rows.length < MESSAGE_PAGE_SIZE) break;
    }

    await MessageRepository.saveMessageSyncState(chatId, newestMessageAt);
    await ChatRepository.refreshLastMessageFromLocal(chatId);
  } catch {
    // Offline or permission errors are retried by the next listener/sync pass.
  } finally {
    inFlightHistorySyncs.delete(chatId);
  }
}

export function syncChatHistories(chatIds: string[], isOnline = true) {
  if (!isOnline) return;
  for (const chatId of chatIds) {
    void syncChatHistory(chatId, isOnline);
  }
}

export async function syncPendingTextMessages(
  currentUser: AppUser,
  tenantId: string,
  isOnline = true
) {
  if (!isOnline) return;
  if (pendingSyncInFlight) return;
  pendingSyncInFlight = true;

  try {
    const messages = await MessageRepository.getPendingTextMessages();
    for (const message of messages) {
      if (message.senderId !== currentUser.id || message.type !== "text") {
        continue;
      }

      try {
        await ensureConversationKey(message.chatId);
        await distributeConversationKeyForChat(message.chatId);
        const enc = await encryptMessageText(message.chatId, message.content);
        if (!enc) continue;
        await ensureTextMessageRemote({
          chatId: message.chatId,
          messageId: message.id,
          tenantId,
          senderId: currentUser.id,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          replyTo: message.replyTo ?? null,
        });
        await MessageRepository.updateEncryptedPayload(message.id, {
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          encVersion: 1,
        });
        await MessageRepository.updateStatus(message.id, "sent");
      } catch {
        // Leave the row pending for the next online pass.
      }
    }
  } finally {
    pendingSyncInFlight = false;
  }
}

let pendingImageSyncInFlight = false;

export async function syncPendingImageMessages(
  currentUser: AppUser,
  tenantId: string,
  isOnline = true
) {
  if (!isOnline) return;
  if (pendingImageSyncInFlight) return;
  pendingImageSyncInFlight = true;

  try {
    const messages = await MessageRepository.getPendingImageMessages();
    for (const message of messages) {
      if (message.senderId !== currentUser.id || message.type !== "image") {
        continue;
      }
      const sourceUri =
        message.imagePendingSourceUri ?? message.imageLocalUri ?? null;
      if (!sourceUri) continue;

      try {
        if (message.status === "failed") {
          await MessageRepository.updateStatus(message.id, "loading");
        }
        await uploadAndPersistImage({
          chatId: message.chatId,
          messageId: message.id,
          tenantId,
          senderId: currentUser.id,
          imageUri: sourceUri,
          imageWidth: message.imageWidth ?? 0,
          imageHeight: message.imageHeight ?? 0,
          imageFileSize: message.imageFileSize ?? 0,
          replyTo: message.replyTo ?? null,
        });
      } catch {
        await MessageRepository.updateStatus(message.id, "failed").catch(
          () => {}
        );
      }
    }
  } finally {
    pendingImageSyncInFlight = false;
  }
}

let pendingOpsSyncInFlight = false;

export async function syncPendingOps(
  currentUser: AppUser,
  isOnline = true
) {
  if (!isOnline) return;
  if (pendingOpsSyncInFlight) return;
  pendingOpsSyncInFlight = true;

  try {
    const messages = await MessageRepository.getPendingOps();
    for (const message of messages) {
      if (message.senderId !== currentUser.id) continue;
      try {
        if (message.pendingOp === "delete") {
          await softDeleteMessageRemote({
            chatId: message.chatId,
            messageId: message.id,
          });
          await MessageRepository.clearPendingOp(message.id);
        } else if (message.pendingOp === "update" && message.type === "text") {
          await ensureConversationKey(message.chatId);
          await distributeConversationKeyForChat(message.chatId);
          const enc = await encryptMessageText(message.chatId, message.content);
          if (!enc) continue;
          await updateTextMessageRemote({
            chatId: message.chatId,
            messageId: message.id,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
          });
          await MessageRepository.updateEncryptedPayload(message.id, {
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            encVersion: 1,
          });
          await MessageRepository.clearPendingOp(message.id);
        }
      } catch {
        await MessageRepository.incrementEditAttempts(message.id).catch(
          () => {}
        );
      }
    }
  } finally {
    pendingOpsSyncInFlight = false;
  }
}

export async function syncPendingReactions(
  currentUser: AppUser,
  isOnline = true
) {
  if (!isOnline) return;

  const pending = await ReactionRepository.getPendingReactions();
  for (const reaction of pending) {
    if (reaction.userId !== currentUser.id) continue;

    try {
      await upsertReaction(reaction.chatId, reaction.messageId, reaction.emoji);
      await ReactionRepository.updateStatus(reaction.messageId, reaction.userId, "sent");
    } catch {
      // Leave pending for retry.
    }
  }
}
