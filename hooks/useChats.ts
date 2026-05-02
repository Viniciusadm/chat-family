import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { ChatRepository } from "@/lib/ChatRepository";
import { db } from "@/lib/firebase";
import { syncChatHistories, syncPendingTextMessages } from "@/lib/offlineSync";
import type { Chat, ChatDoc } from "@/types/chat";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

export function useChats(): { chats: Chat[]; loading: boolean } {
  const { currentUser, tenantId, firebaseUser } = useAuth();
  const { isOnline } = useConnectivity();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLocalChats = useCallback(
    async (active: () => boolean) => {
      if (!tenantId) return;
      const localChats = await ChatRepository.getLocalChats(tenantId);
      if (!active()) return;
      setChats(localChats);
      setLoading(false);
    },
    [tenantId]
  );

  useEffect(() => {
    if (!firebaseUser || !tenantId || !currentUser) {
      setChats([]);
      setLoading(false);
      return;
    }

    let active = true;
    const uid = firebaseUser.uid;
    const memberId = currentUser.id;
    const listCol = collection(db, "users", uid, "chatList");
    const unsubs: (() => void)[] = [];
    void loadLocalChats(() => active);

    const emitLocal = () => {
      void loadLocalChats(() => active);
    };
    const unsubLocal = ChatRepository.subscribe(emitLocal);
    if (!isOnline) {
      return () => {
        active = false;
        unsubLocal();
      };
    }

    const unsubList = onSnapshot(
      listCol,
      (listSnap) => {
        unsubs.forEach((u) => u());
        unsubs.length = 0;

        const ids = listSnap.docs.map((d) => d.id);
        if (ids.length === 0) {
          setChats([]);
          setLoading(false);
          syncChatHistories([], isOnline);
          return;
        }

        setLoading(true);
        const byId = new Map<string, Chat>();

        const emit = () => {
          const arr = [...byId.values()].sort((a, b) => {
            const ta = a.lastMessage?.timestamp?.getTime() ?? 0;
            const tb = b.lastMessage?.timestamp?.getTime() ?? 0;
            return tb - ta;
          });
          setChats(arr);
          setLoading(false);
          syncChatHistories(arr.map((chat) => chat.id), isOnline);
          void syncPendingTextMessages(currentUser, tenantId, isOnline);
        };

        for (const chatId of ids) {
          const u = onSnapshot(
            doc(db, "chats", chatId),
            (snap) => {
              if (!snap.exists()) {
                byId.delete(chatId);
                void ChatRepository.deleteChat(chatId, { notify: false });
                emit();
                return;
              }
              const data = snap.data() as ChatDoc;
              const chat: Chat = {
                id: snap.id,
                tenantId: data.tenantId,
                participants: data.participants,
                isGroup: data.isGroup,
                name: data.name,
                unreadCount: data.unreadBy?.[memberId] ?? 0,
              };
              if (data.lastMessageAt) {
                chat.lastMessage = {
                  text: data.lastMessageText,
                  type: data.lastMessageType,
                  timestamp: data.lastMessageAt.toDate(),
                };
              }
              byId.set(chatId, chat);
              void ChatRepository.upsertChat(chat, { notify: false });
              emit();
            },
            () => {
              emit();
            }
          );
          unsubs.push(u);
        }
      },
      () => {
        unsubs.forEach((u) => u());
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubLocal();
      unsubList();
      unsubs.forEach((u) => u());
    };
  }, [firebaseUser, tenantId, currentUser, isOnline, loadLocalChats]);

  return { chats, loading };
}
