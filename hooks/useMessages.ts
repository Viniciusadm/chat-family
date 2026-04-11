import { db } from "@/lib/firebase";
import type { Message, MessageDoc } from "@/types/chat";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

export function useMessages(chatId: string): { messages: Message[]; loading: boolean } {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const result: Message[] = snap.docs.map((d) => {
        const data = d.data() as MessageDoc;
        const isAudio = data.audioUrl != null;
        return {
          id: d.id,
          chatId,
          senderId: data.senderId,
          type: isAudio ? "audio" : "text",
          content: data.text ?? "",
          audioUrl: data.audioUrl ?? undefined,
          audioDuration: data.audioDuration ?? undefined,
          timestamp: data.createdAt ? data.createdAt.toDate() : new Date(),
          createdAtMs: data.createdAt ? data.createdAt.toMillis() : Date.now(),
        };
      });
      setMessages(result);
      setLoading(false);
    });

    return unsub;
  }, [chatId]);

  return { messages, loading };
}
