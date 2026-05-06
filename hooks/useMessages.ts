import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { ChatRepository } from "@/lib/ChatRepository";
import { ImageCacheRepository } from "@/lib/ImageCacheRepository";
import { ImageGalleryRepository } from "@/lib/ImageGalleryRepository";
import { db } from "@/lib/firebase";
import { MessageRepository } from "@/lib/MessageRepository";
import {
  syncChatHistory,
  syncPendingImageMessages,
  syncPendingOps,
  syncPendingTextMessages,
} from "@/lib/offlineSync";
import type { Message, MessageDoc } from "@/types/chat";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

type MessagesState = {
  chatId: string;
  messages: Message[];
  loading: boolean;
};

export function useMessages(chatId: string): { messages: Message[]; loading: boolean } {
  const { currentUser, tenantId, firebaseUser } = useAuth();
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

  const refreshLocalAudioCache = useCallback(
    async (activeChatId: string, active: () => boolean, download: boolean) => {
      const messages = await MessageRepository.getLocalMessages(activeChatId);
      let changed = false;

      for (const message of messages) {
        if (message.type !== "audio" || !message.audioRemoteUrl) continue;

        const cachedUri = await AudioCacheRepository.ensureMessageAudioCache({
          chatId: activeChatId,
          messageId: message.id,
          remoteUrl: message.audioRemoteUrl,
          localUri: message.audioLocalUri,
          download,
        });

        if (!active()) return;
        if (cachedUri !== (message.audioLocalUri ?? null)) {
          changed = true;
        }
      }

      if (changed) {
        await loadLocalMessages(activeChatId, active);
      }
    },
    [loadLocalMessages]
  );

  const refreshLocalImageCache = useCallback(
    async (activeChatId: string, active: () => boolean, download: boolean) => {
      const messages = await MessageRepository.getLocalMessages(activeChatId);
      let changed = false;

      for (const message of messages) {
        if (message.type !== "image") continue;
        if (!message.imageRemoteUrl) continue;

        const cachedFull = await ImageCacheRepository.ensureMessageImageCache({
          chatId: activeChatId,
          messageId: message.id,
          remoteUrl: message.imageRemoteUrl,
          localUri: message.imageLocalUri,
          variant: "full",
          download,
        });

        if (message.imageThumbnailUrl) {
          await ImageCacheRepository.ensureMessageImageCache({
            chatId: activeChatId,
            messageId: message.id,
            remoteUrl: message.imageThumbnailUrl,
            localUri: message.imageThumbnailLocalUri,
            variant: "thumb",
            download,
          });
        }

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

      if (changed) {
        await loadLocalMessages(activeChatId, active);
      }
    },
    [loadLocalMessages, currentUser]
  );

  useEffect(() => {
    if (!chatId) {
      setState({ chatId: "", messages: [], loading: false });
      return;
    }

    let active = true;
    let unsubFirestore: (() => void) | undefined;
    let unsubLocal: (() => void) | undefined;
    setState({ chatId, messages: [], loading: true });

    const isActive = () => active;

    void (async () => {
      await loadLocalMessages(chatId, isActive);
      if (!active) return;

      unsubLocal = MessageRepository.subscribe(chatId, () => {
        void loadLocalMessages(chatId, isActive);
      });

      void refreshLocalAudioCache(chatId, isActive, isOnline);
      void refreshLocalImageCache(chatId, isActive, isOnline);

      if (currentUser && tenantId && firebaseUser) {
        void (async () => {
          await syncPendingTextMessages(currentUser, tenantId, isOnline);
          await syncPendingImageMessages(currentUser, tenantId, isOnline);
          await syncPendingOps(currentUser, isOnline);
        })();
        void syncChatHistory(chatId, isOnline);
      }

      if (!isOnline || !firebaseUser) return;

      const q = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("createdAt", "asc")
      );

      unsubFirestore = onSnapshot(q, (snap) => {
        void (async () => {
          for (const d of snap.docs) {
            const data = d.data() as MessageDoc;
            await MessageRepository.upsertFirestoreMessage(
              chatId,
              d.id,
              data,
              { notify: false }
            );
            if (data.audioUrl) {
              void AudioCacheRepository.downloadMessageAudio({
                chatId,
                messageId: d.id,
                remoteUrl: data.audioUrl,
              });
            }
            if (data.imageUrl) {
              void ImageCacheRepository.downloadMessageImage({
                chatId,
                messageId: d.id,
                remoteUrl: data.imageUrl,
                variant: "full",
              });
            }
            if (data.thumbnailUrl) {
              void ImageCacheRepository.downloadMessageImage({
                chatId,
                messageId: d.id,
                remoteUrl: data.thumbnailUrl,
                variant: "thumb",
              });
            }
          }
          await ChatRepository.refreshLastMessageFromLocal(chatId);
          await loadLocalMessages(chatId, isActive);
        })();
      }, () => {
        if (active) {
          setState((prev) =>
            prev.chatId === chatId ? { ...prev, loading: false } : prev
          );
        }
      });
    })();

    return () => {
      active = false;
      unsubLocal?.();
      unsubFirestore?.();
    };
  }, [
    chatId,
    currentUser,
    firebaseUser,
    isOnline,
    loadLocalMessages,
    refreshLocalAudioCache,
    refreshLocalImageCache,
    tenantId,
  ]);

  if (state.chatId !== chatId) {
    return { messages: [], loading: true };
  }

  return { messages: state.messages, loading: state.loading };
}
