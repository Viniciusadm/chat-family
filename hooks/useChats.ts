import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { ChatRepository } from "@/lib/ChatRepository";
import { decryptIncomingMessage } from "@/lib/encryptedMessages";
import { db } from "@/lib/firebase";
import {
  syncChatHistories,
  syncPendingImageMessages,
  syncPendingOps,
  syncPendingTextMessages,
} from "@/lib/offlineSync";
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
      if (!tenantId) {
        setLoading(false);
        return;
      }
      const localChats = await ChatRepository.getLocalChats(tenantId);
      if (!active()) return;
      const memberId = currentUser?.id;
      const filtered = memberId
        ? localChats.filter((c) => c.participants.includes(memberId))
        : localChats;
      setChats(filtered);
      setLoading(false);
    },
    [tenantId, currentUser?.id]
  );

  useEffect(() => {
    if (!tenantId || !currentUser) {
      setChats([]);
      setLoading(false);
      return;
    }

    let active = true;
    const memberId = currentUser.id;
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

    if (!firebaseUser) {
      return () => {
        active = false;
        unsubLocal();
      };
    }

    const uid = firebaseUser.uid;
    const listCol = collection(db, "users", uid, "chatList");

    const unsubList = onSnapshot(
      listCol,
      (listSnap) => {
        unsubs.forEach((u) => u());
        unsubs.length = 0;

        const ids = listSnap.docs.map((d) => d.id);
        if (ids.length === 0) {
          setLoading(false);
          syncChatHistories([], isOnline);
          return;
        }

        const emit = () => {
          setLoading(false);
          syncChatHistories(ids, isOnline);
          void (async () => {
            await syncPendingTextMessages(currentUser, tenantId, isOnline);
            await syncPendingImageMessages(currentUser, tenantId, isOnline);
            await syncPendingOps(currentUser, isOnline);
          })();
        };

        for (const chatId of ids) {
          const u = onSnapshot(
            doc(db, "chats", chatId),
            (snap) => {
              void (async () => {
                if (!snap.exists()) {
                  await ChatRepository.deleteChat(chatId);
                  if (!active) return;
                  emit();
                  return;
                }
                const data = snap.data() as ChatDoc;
                if (!data.participants?.includes(memberId)) {
                  await ChatRepository.deleteChat(chatId);
                  if (!active) return;
                  emit();
                  return;
                }
                const chat: Chat = {
                  id: snap.id,
                  tenantId: data.tenantId,
                  participants: data.participants,
                  isGroup: data.isGroup,
                  name: data.name,
                  photoUrl: data.photoUrl ?? null,
                  photoPath: data.photoPath ?? null,
                  unreadCount: data.unreadBy?.[memberId] ?? 0,
                  readUpTo: data.readUpTo,
                };
                if (data.lastMessageAt && data.lastMessageType) {
                  const timestamp = data.lastMessageAt.toDate();
                  if (data.lastMessageType === "text") {
                    const text = await decryptIncomingMessage(chatId, {
                      ciphertext: data.lastMessageCiphertext,
                      iv: data.lastMessageIv,
                      text: data.lastMessageText,
                    });
                    if (text != null) {
                      chat.lastMessage = {
                        text,
                        type: "text",
                        timestamp,
                      };
                    }
                  } else {
                    chat.lastMessage = {
                      text: null,
                      type: data.lastMessageType,
                      timestamp,
                    };
                  }
                }
                if (!active) return;
                await ChatRepository.upsertChat(chat);
                if (!active) return;
                await ChatRepository.refreshLastMessageFromLocal(chatId);
                if (!active) return;
                emit();
              })();
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
