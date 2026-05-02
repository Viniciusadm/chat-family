import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { ChatRepository } from "@/lib/ChatRepository";
import {
  ensureAudioMessageInFirestore,
  ensureTextMessageInFirestore,
  updateChatAfterOutgoingMessage,
} from "@/lib/firestoreMessages";
import { storage } from "@/lib/firebase";
import { MessageRepository } from "@/lib/MessageRepository";
import { randomUuid } from "@/lib/randomUuid";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useState } from "react";

export type SendableAudio = Blob | Uint8Array | ArrayBuffer;

export function useSendMessage(chatId: string) {
  const { currentUser, tenantId, firebaseUser } = useAuth();
  const { isOnline } = useConnectivity();
  const [isSending, setIsSending] = useState(false);

  const sendText = async (text: string) => {
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
      });
      await ChatRepository.updateLastMessage(chatId, {
        text: trimmed,
        type: "text",
        timestamp: createdAt,
      });
      if (!isOnline || !firebaseUser) return;
      await ensureTextMessageInFirestore({
        chatId,
        messageId,
        tenantId,
        senderId: currentUser.id,
        text: trimmed,
      });
      await MessageRepository.updateStatus(messageId, "sent");
      await updateChatAfterOutgoingMessage(
        chatId,
        currentUser.id,
        trimmed,
        "text"
      );
    } catch {
      // Keep the local message pending. The offline sync will retry it.
    } finally {
      setIsSending(false);
    }
  };

  const sendAudio = async (
    audio: SendableAudio,
    options?: { extension?: string; contentType?: string; duration?: number }
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
      await updateChatAfterOutgoingMessage(
        chatId,
        currentUser.id,
        null,
        "audio"
      );
    } finally {
      setIsSending(false);
    }
  };

  return { sendText, sendAudio, isSending };
}
