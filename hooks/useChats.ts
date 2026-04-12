import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import type { Chat, ChatDoc } from "@/types/chat";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

export function useChats(): { chats: Chat[]; loading: boolean } {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setChats([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", currentUser.id)
    );

    const unsub = onSnapshot(q, (snap) => {
      const result: Chat[] = snap.docs.map((d) => {
        const data = d.data() as ChatDoc;
        const chat: Chat = {
          id: d.id,
          tenantId: data.tenantId,
          participants: data.participants,
          isGroup: data.isGroup,
          name: data.name,
          unreadCount: data.unreadBy?.[currentUser.id] ?? 0,
        };
        if (data.lastMessageAt) {
          chat.lastMessage = {
            text: data.lastMessageText,
            type: data.lastMessageType,
            timestamp: data.lastMessageAt.toDate(),
          };
        }
        return chat;
      });

      result.sort((a, b) => {
        const ta = a.lastMessage?.timestamp?.getTime() ?? 0;
        const tb = b.lastMessage?.timestamp?.getTime() ?? 0;
        return tb - ta;
      });

      setChats(result);
      setLoading(false);
    });

    return unsub;
  }, [currentUser]);

  return { chats, loading };
}
