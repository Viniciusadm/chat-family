import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AudioCacheRepository } from "@/lib/AudioCacheRepository";
import { db } from "@/lib/firebase";
import { MessageRepository } from "@/lib/MessageRepository";
import { syncChatHistory, syncPendingTextMessages } from "@/lib/offlineSync";
import type { Message, MessageDoc } from "@/types/chat";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
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

      if (currentUser && tenantId) {
        void syncPendingTextMessages(currentUser, tenantId, isOnline);
        void syncChatHistory(chatId, isOnline);
      }

      if (!isOnline) return;

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
          }
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
  }, [chatId, currentUser, isOnline, loadLocalMessages, tenantId]);

  if (state.chatId !== chatId) {
    return { messages: [], loading: true };
  }

  return { messages: state.messages, loading: state.loading };
}
