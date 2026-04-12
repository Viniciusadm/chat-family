import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import type { Chat, ChatDoc } from "@/types/chat";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

export function useChats(): { chats: Chat[]; loading: boolean } {
  const { currentUser, tenantId, firebaseUser } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || !tenantId || !currentUser) {
      setChats([]);
      setLoading(false);
      return;
    }

    const uid = firebaseUser.uid;
    const memberId = currentUser.id;
    const listCol = collection(db, "users", uid, "chatList");
    const unsubs: (() => void)[] = [];

    const unsubList = onSnapshot(
      listCol,
      (listSnap) => {
        unsubs.forEach((u) => u());
        unsubs.length = 0;

        const ids = listSnap.docs.map((d) => d.id);
        if (ids.length === 0) {
          setChats([]);
          setLoading(false);
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
        };

        for (const chatId of ids) {
          const u = onSnapshot(
            doc(db, "chats", chatId),
            (snap) => {
              if (!snap.exists()) {
                byId.delete(chatId);
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
              emit();
            },
            () => {
              byId.delete(chatId);
              emit();
            }
          );
          unsubs.push(u);
        }
      },
      () => {
        unsubs.forEach((u) => u());
        setChats([]);
        setLoading(false);
      }
    );

    return () => {
      unsubList();
      unsubs.forEach((u) => u());
    };
  }, [firebaseUser, tenantId, currentUser]);

  return { chats, loading };
}
