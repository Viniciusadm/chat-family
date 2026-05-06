import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { ChatRepository } from "@/lib/ChatRepository";
import { ensureConversationKey } from "@/lib/conversationKeys";
import { encryptMessageText } from "@/lib/encryptedMessages";
import {
  ensureAudioMessageInFirestore,
  ensureTextMessageInFirestore,
  softDeleteMessageInFirestore,
  updateChatAfterOutgoingMessage,
  updateTextMessageInFirestore,
} from "@/lib/firestoreMessages";
import { storage } from "@/lib/firebase";
import { ImageCacheRepository } from "@/lib/ImageCacheRepository";
import { ImageGalleryRepository } from "@/lib/ImageGalleryRepository";
import { processImageForUpload } from "@/lib/ImageProcessor";
import { uploadAndPersistImage } from "@/lib/imageUpload";
import { MessageRepository } from "@/lib/MessageRepository";
import { syncPendingTextMessages } from "@/lib/offlineSync";
import { randomUuid } from "@/lib/randomUuid";
import type { Message, MessageReplySnapshot } from "@/types/chat";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useState } from "react";

export type SendableAudio = Blob | Uint8Array | ArrayBuffer;

export const EDIT_DELETE_WINDOW_MS = 60 * 60 * 1000;

export function useSendMessage(chatId: string) {
  const { currentUser, tenantId, firebaseUser } = useAuth();
  const { isOnline } = useConnectivity();
  const [isSending, setIsSending] = useState(false);

  const sendText = async (
    text: string,
    options?: { replyTo?: MessageReplySnapshot | null }
  ) => {
    const trimmed = text.trim();
    if (!currentUser || !tenantId || !trimmed) return;
    setIsSending(true);
    const messageId = randomUuid();
    const createdAt = new Date();
    try {
      await MessageRepository.insertLocalMessage({
        id: messageId,
        conversationId: chatId,
        senderId: currentUser.id,
        body: trimmed,
        type: "text",
        status: "loading",
        createdAt,
        replyTo: options?.replyTo ?? null,
      });
      await ChatRepository.updateLastMessage(chatId, {
        text: trimmed,
        type: "text",
        timestamp: createdAt,
      });
      if (!isOnline || !firebaseUser) return;
      await ensureConversationKey(chatId);
      const enc = await encryptMessageText(chatId, trimmed);
      if (!enc) {
        return;
      }
      await ensureTextMessageInFirestore({
        chatId,
        messageId,
        tenantId,
        senderId: currentUser.id,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        replyTo: options?.replyTo ?? null,
      });
      await MessageRepository.updateStatus(messageId, "sent");
      await updateChatAfterOutgoingMessage(chatId, currentUser.id, {
        type: "text",
        ciphertext: enc.ciphertext,
        iv: enc.iv,
      });
    } catch {
      // Keep the local message pending. The offline sync will retry it.
    } finally {
      setIsSending(false);
    }
  };

  const sendAudio = async (
    audio: SendableAudio,
    options?: {
      extension?: string;
      contentType?: string;
      duration?: number;
      replyTo?: MessageReplySnapshot | null;
    }
  ) => {
    if (!currentUser || !tenantId) return;
    if (!isOnline || !firebaseUser) return;
    setIsSending(true);
    const messageId = randomUuid();
    try {
      const ext = options?.extension ?? "webm";
      const storageRef = ref(
        storage,
        `audios/${tenantId}/${chatId}/${messageId}.${ext}`
      );

      await uploadBytes(
        storageRef,
        audio,
        options?.contentType
          ? { contentType: options.contentType }
          : undefined
      );
      const audioUrl = await getDownloadURL(storageRef);

      await ensureAudioMessageInFirestore({
        chatId,
        messageId,
        tenantId,
        senderId: currentUser.id,
        audioUrl,
        audioDuration: options?.duration ?? null,
        replyTo: options?.replyTo ?? null,
      });
      const sentAt = new Date();
      await MessageRepository.insertLocalMessage({
        id: messageId,
        conversationId: chatId,
        senderId: currentUser.id,
        body: audioUrl,
        type: "audio",
        status: "sent",
        createdAt: sentAt,
        syncedAt: sentAt,
        audioDuration: options?.duration ?? null,
        replyTo: options?.replyTo ?? null,
      });
      void AudioCacheRepository.downloadMessageAudio({
        chatId,
        messageId,
        remoteUrl: audioUrl,
      });
      await ChatRepository.updateLastMessage(chatId, {
        text: null,
        type: "audio",
        timestamp: sentAt,
      });
      await updateChatAfterOutgoingMessage(chatId, currentUser.id, {
        type: "audio",
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendImage = async (
    source: { uri: string; width: number; height: number },
    options?: { replyTo?: MessageReplySnapshot | null }
  ) => {
    if (!currentUser || !tenantId) return;
    setIsSending(true);
    const messageId = randomUuid();
    const createdAt = new Date();

    try {
      const processed = await processImageForUpload(
        source.uri,
        source.width,
        source.height
      );

      const localFullUri = await ImageCacheRepository.copyLocalSource({
        chatId,
        messageId,
        sourceUri: processed.full.uri,
        variant: "full",
      });
      const localThumbUri = await ImageCacheRepository.copyLocalSource({
        chatId,
        messageId,
        sourceUri: processed.thumbnail.uri,
        variant: "thumb",
      });

      await MessageRepository.insertLocalMessage({
        id: messageId,
        conversationId: chatId,
        senderId: currentUser.id,
        body: null,
        type: "image",
        status: "loading",
        createdAt,
        localImageUri: localFullUri,
        localThumbnailUri: localThumbUri,
        imageWidth: processed.full.width,
        imageHeight: processed.full.height,
        imageFileSize: processed.full.fileSize,
        imagePendingSourceUri: localFullUri ?? processed.full.uri,
        replyTo: options?.replyTo ?? null,
      });

      await ChatRepository.updateLastMessage(chatId, {
        text: null,
        type: "image",
        timestamp: createdAt,
      });

      if (localFullUri) {
        void ImageGalleryRepository.saveToGallery({
          messageId,
          fileUri: localFullUri,
        });
      }

      if (!isOnline || !firebaseUser) return;

      await uploadAndPersistImage({
        chatId,
        messageId,
        tenantId,
        senderId: currentUser.id,
        fullUri: processed.full.uri,
        thumbUri: processed.thumbnail.uri,
        imageWidth: processed.full.width,
        imageHeight: processed.full.height,
        imageFileSize: processed.full.fileSize,
        replyTo: options?.replyTo ?? null,
      });
    } catch {
      await MessageRepository.updateStatus(messageId, "failed").catch(() => {});
    } finally {
      setIsSending(false);
    }
  };

  const retryImageMessage = async (message: Message) => {
    if (!currentUser || !tenantId || !firebaseUser || !isOnline) return;
    if (message.type !== "image") return;
    const sourceUri = message.imagePendingSourceUri ?? message.imageLocalUri;
    if (!sourceUri) return;
    const thumbUri = message.imageThumbnailLocalUri ?? sourceUri;

    await MessageRepository.updateStatus(message.id, "loading");
    try {
      await uploadAndPersistImage({
        chatId,
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
      await MessageRepository.updateStatus(message.id, "failed").catch(() => {});
    }
  };

  const canModifyMessage = (message: Message): boolean => {
    if (!currentUser) return false;
    if (message.senderId !== currentUser.id) return false;
    if (message.isDeleted) return false;
    const ageMs = Date.now() - message.timestamp.getTime();
    return ageMs <= EDIT_DELETE_WINDOW_MS;
  };

  const editTextMessage = async (
    message: Message,
    newText: string
  ): Promise<boolean> => {
    if (!currentUser || !tenantId) return false;
    if (!canModifyMessage(message)) return false;
    if (message.type !== "text") return false;
    const trimmed = newText.trim();
    if (!trimmed || trimmed === message.content) return false;

    if (message.status === "loading") {
      await MessageRepository.overwritePendingCreateBody(message.id, trimmed);
      if (isOnline && firebaseUser) {
        void syncPendingTextMessages(currentUser, tenantId, isOnline);
      }
      return true;
    }

    const editedAt = new Date();
    await MessageRepository.markAsEdited(message.id, {
      newBody: trimmed,
      editedAt,
      pendingOp: "update",
      preserveOriginal: !message.isEdited,
    });

    if (!isOnline || !firebaseUser) return true;
    try {
      await ensureConversationKey(message.chatId);
      const enc = await encryptMessageText(message.chatId, trimmed);
      if (!enc) return true;
      await updateTextMessageInFirestore({
        chatId: message.chatId,
        messageId: message.id,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
      });
      await MessageRepository.clearPendingOp(message.id);
    } catch {
      await MessageRepository.incrementEditAttempts(message.id).catch(() => {});
    }
    return true;
  };

  const deleteMessage = async (message: Message): Promise<boolean> => {
    if (!currentUser) return false;
    if (!canModifyMessage(message)) return false;

    const deletedAt = new Date();

    if (message.status === "loading") {
      await MessageRepository.markAsDeleted(message.id, {
        deletedAt,
        pendingOp: null,
      });
      await MessageRepository.cancelPendingCreate(message.id);
      return true;
    }

    await MessageRepository.markAsDeleted(message.id, {
      deletedAt,
      pendingOp: "delete",
    });

    if (!isOnline || !firebaseUser) return true;
    try {
      await softDeleteMessageInFirestore({
        chatId: message.chatId,
        messageId: message.id,
      });
      await MessageRepository.clearPendingOp(message.id);
    } catch {
      await MessageRepository.incrementEditAttempts(message.id).catch(() => {});
    }
    return true;
  };

  return {
    sendText,
    sendAudio,
    sendImage,
    retryImageMessage,
    editTextMessage,
    deleteMessage,
    canModifyMessage,
    isSending,
  };
}
