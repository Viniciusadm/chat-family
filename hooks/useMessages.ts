import { db } from "@/lib/firebase";
import type { Message, MessageDoc } from "@/types/chat";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

type MessagesState = {
  chatId: string;
  messages: Message[];
  loading: boolean;
};

export function useMessages(chatId: string): { messages: Message[]; loading: boolean } {
  const [state, setState] = useState<MessagesState>({
    chatId: "",
    messages: [],
    loading: true,
  });

  useEffect(() => {
    if (!chatId) {
      setState({ chatId: "", messages: [], loading: false });
      return;
    }

    let active = true;
    setState({ chatId, messages: [], loading: true });

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!active) return;
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
      setState({ chatId, messages: result, loading: false });
    });

    return () => {
      active = false;
      unsub();
    };
  }, [chatId]);

  if (state.chatId !== chatId) {
    return { messages: [], loading: true };
  }

  return { messages: state.messages, loading: state.loading };
}
