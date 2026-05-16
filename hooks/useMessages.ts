import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { ChatRepository } from "@/lib/ChatRepository";
import { ImageCacheRepository } from "@/lib/ImageCacheRepository";
import { ImageGalleryRepository } from "@/lib/ImageGalleryRepository";
import { MessageRepository } from "@/lib/MessageRepository";
import {
  syncChatHistory,
  syncPendingImageMessages,
  syncPendingOps,
  syncPendingTextMessages,
} from "@/lib/offlineSync";
import { listMessages } from "@/src/api/chats";
import { realtimeClient } from "@/src/api/realtime";
import type { Message } from "@/types/chat";
import { useCallback, useEffect, useState } from "react";

type MessagesState = {
  chatId: string;
  messages: Message[];
  loading: boolean;
};

export function useMessages(chatId: string): { messages: Message[]; loading: boolean } {
  const { currentUser, tenantId } = useAuth();
  const { isOnline } = useConnectivity();
  const [state, setState] = useState<MessagesState>({
    chatId: "",
    messages: [],
    loading: true,
  });

  const loadLocalMessages = useCallback(
    async (activeChatId: string, active: () => boolean) => {
      const messages = await MessageRepository.getLocalMessages(activeChatId);
      if (!active()) return;
      setState({ chatId: activeChatId, messages, loading: false });
    },
    []
  );

  const refreshLocalMedia = useCallback(
    async (activeChatId: string, active: () => boolean, download: boolean) => {
      const messages = await MessageRepository.getLocalMessages(activeChatId);
      let changed = false;
      for (const message of messages) {
        if (message.type === "audio" && message.audioRemoteUrl) {
          const cachedUri = await AudioCacheRepository.ensureMessageAudioCache({
            chatId: activeChatId,
            messageId: message.id,
            remoteUrl: message.audioRemoteUrl,
            localUri: message.audioLocalUri,
            download,
          });
          if (!active()) return;
          changed = changed || cachedUri !== (message.audioLocalUri ?? null);
        }
        if (message.type === "image" && message.imageRemoteUrl) {
          const cachedFull = await ImageCacheRepository.ensureMessageImageCache({
            chatId: activeChatId,
            messageId: message.id,
            remoteUrl: message.imageRemoteUrl,
            localUri: message.imageLocalUri,
            download,
          });
          if (!active()) return;
          if (cachedFull && !message.imageLocalUri) {
            changed = true;
            if (currentUser && message.senderId !== currentUser.id) {
              void ImageGalleryRepository.saveToGallery({
                messageId: message.id,
                fileUri: cachedFull,
              });
            }
          }
        }
      }
      if (changed) await loadLocalMessages(activeChatId, active);
    },
    [currentUser, loadLocalMessages]
  );

  const refreshRemoteMessages = useCallback(
    async (activeChatId: string, active: () => boolean) => {
      if (!isOnline) return;
      const syncState = await MessageRepository.getMessageSyncState(activeChatId);
      const rows = await listMessages(activeChatId, {
        after: syncState.newestMessageAt?.toISOString(),
        limit: 500,
      });
      let newest = syncState.newestMessageAt;
      for (const row of rows) {
        const createdAt = row.created_at ? new Date(row.created_at) : null;
        if (createdAt && (!newest || createdAt > newest)) newest = createdAt;
        await MessageRepository.upsertRemoteMessage(activeChatId, row.id, row, { notify: false });
        if (row.audio_url) {
          void AudioCacheRepository.downloadMessageAudio({
            chatId: activeChatId,
            messageId: row.id,
            remoteUrl: row.audio_url,
          });
        }
        if (row.image_url) {
          void ImageCacheRepository.downloadMessageImage({
            chatId: activeChatId,
            messageId: row.id,
            remoteUrl: row.image_url,
          });
        }
      }
      await MessageRepository.saveMessageSyncState(activeChatId, newest);
      await ChatRepository.refreshLastMessageFromLocal(activeChatId);
      if (!active()) return;
      await loadLocalMessages(activeChatId, active);
    },
    [isOnline, loadLocalMessages]
  );

  useEffect(() => {
    if (!chatId) {
      setState({ chatId: "", messages: [], loading: false });
      return;
    }

    let active = true;
    setState({ chatId, messages: [], loading: true });
    const isActive = () => active;

    void (async () => {
      await loadLocalMessages(chatId, isActive);
      if (!active) return;
      void refreshLocalMedia(chatId, isActive, isOnline);
      if (currentUser && tenantId) {
        await syncPendingTextMessages(currentUser, tenantId, isOnline);
        await syncPendingImageMessages(currentUser, tenantId, isOnline);
        await syncPendingOps(currentUser, isOnline);
      }
      await refreshRemoteMessages(chatId, isActive);
      void syncChatHistory(chatId, isOnline);
    })();

    const unsubLocal = MessageRepository.subscribe(chatId, () => {
      void loadLocalMessages(chatId, isActive);
    });
    const unsubRealtime = realtimeClient.subscribe((event) => {
      if (event.chat_id === chatId && event.type.startsWith("message.")) {
        void refreshRemoteMessages(chatId, isActive);
      }
    });

    return () => {
      active = false;
      unsubLocal();
      unsubRealtime();
    };
  }, [
    chatId,
    currentUser,
    isOnline,
    loadLocalMessages,
    refreshLocalMedia,
    refreshRemoteMessages,
    tenantId,
  ]);

  if (state.chatId !== chatId) {
    return { messages: [], loading: true };
  }

  return { messages: state.messages, loading: state.loading };
}
