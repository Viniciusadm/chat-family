import { ensureConversationKey } from "@/lib/conversationKeys";
import { encryptMessageText } from "@/lib/encryptedMessages";
import {
  ensureTextMessageInFirestore,
  updateChatAfterOutgoingMessage,
} from "@/lib/firestoreMessages";
import { ensureReactionInFirestore } from "@/lib/firestoreReactions";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { ImageCacheRepository } from "@/lib/ImageCacheRepository";
import { uploadAndPersistImage } from "@/lib/imageUpload";
import { db } from "@/lib/firebase";
import { MessageRepository } from "@/lib/MessageRepository";
import { ReactionRepository } from "@/lib/ReactionRepository";
import type { AppUser, MessageDoc } from "@/types/chat";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  type QueryConstraint,
  startAfter,
  type QueryDocumentSnapshot,
  where,
} from "firebase/firestore";

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
    let cursor: QueryDocumentSnapshot | null = null;

    while (true) {
      const constraints: QueryConstraint[] = [
        ...(syncState.historySyncedAt && syncState.newestMessageAt
          ? [where("createdAt", ">", Timestamp.fromDate(syncState.newestMessageAt))]
          : []),
        orderBy("createdAt", "asc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(MESSAGE_PAGE_SIZE),
      ];
      const snap = await getDocs(
        query(collection(db, "chats", chatId, "messages"), ...constraints)
      );

      if (snap.empty) break;

      for (const messageDoc of snap.docs) {
        const data = messageDoc.data() as MessageDoc;
        const createdAt = data.createdAt?.toDate();
        if (createdAt && (!newestMessageAt || createdAt > newestMessageAt)) {
          newestMessageAt = createdAt;
        }
        await MessageRepository.upsertFirestoreMessage(
          chatId,
          messageDoc.id,
          data,
          { notify: false }
        );
        if (data.audioUrl) {
          void AudioCacheRepository.downloadMessageAudio({
            chatId,
            messageId: messageDoc.id,
            remoteUrl: data.audioUrl,
          });
        }
        if (data.imageUrl) {
          void ImageCacheRepository.downloadMessageImage({
            chatId,
            messageId: messageDoc.id,
            remoteUrl: data.imageUrl,
            variant: "full",
          });
        }
        if (data.thumbnailUrl) {
          void ImageCacheRepository.downloadMessageImage({
            chatId,
            messageId: messageDoc.id,
            remoteUrl: data.thumbnailUrl,
            variant: "thumb",
          });
        }
      }

      MessageRepository.emit(chatId);

      if (snap.docs.length < MESSAGE_PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    await MessageRepository.saveMessageSyncState(chatId, newestMessageAt);
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
        const enc = await encryptMessageText(message.chatId, message.content);
        if (!enc) continue;
        await ensureTextMessageInFirestore({
          chatId: message.chatId,
          messageId: message.id,
          tenantId,
          senderId: currentUser.id,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          replyTo: message.replyTo ?? null,
        });
        await updateChatAfterOutgoingMessage(message.chatId, currentUser.id, {
          type: "text",
          ciphertext: enc.ciphertext,
          iv: enc.iv,
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
      const thumbUri = message.imageThumbnailLocalUri ?? sourceUri;

      try {
        if (message.status === "failed") {
          await MessageRepository.updateStatus(message.id, "loading");
        }
        await uploadAndPersistImage({
          chatId: message.chatId,
          messageId: message.id,
          tenantId,
          senderId: currentUser.id,
          fullUri: sourceUri,
          thumbUri,
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

export async function syncPendingReactions(
  currentUser: AppUser,
  isOnline = true
) {
  if (!isOnline) return;

  const pending = await ReactionRepository.getPendingReactions();
  for (const reaction of pending) {
    if (reaction.userId !== currentUser.id) continue;

    try {
      await ensureReactionInFirestore({
        chatId: reaction.chatId,
        messageId: reaction.messageId,
        userId: reaction.userId,
        emoji: reaction.emoji,
      });
      await ReactionRepository.updateStatus(reaction.messageId, reaction.userId, "sent");
    } catch {
      // Leave pending for retry.
    }
  }
}
