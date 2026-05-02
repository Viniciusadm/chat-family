import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { db } from "@/lib/firebase";
import type { ChatDoc, Message } from "@/types/chat";
import { useIsFocused } from "@react-navigation/native";
import {
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";

export function useChatReadReceipts(
  chatId: string,
  messages: Message[]
): { readUpTo: Record<string, Timestamp> | null } {
  const { currentUser } = useAuth();
  const { isOnline } = useConnectivity();
  const isFocused = useIsFocused();
  const [readUpTo, setReadUpTo] = useState<Record<string, Timestamp> | null>(
    null
  );

  useEffect(() => {
    if (!chatId || !isOnline) return;
    const unsub = onSnapshot(
      doc(db, "chats", chatId),
      (snap) => {
        const data = snap.data() as ChatDoc | undefined;
        setReadUpTo(data?.readUpTo ?? null);
      },
      () => {}
    );
    return unsub;
  }, [chatId, isOnline]);

  useEffect(() => {
    if (!isOnline || !isFocused || !chatId || !currentUser?.id || messages.length === 0) {
      return;
    }
    const uid = currentUser.id;
    const last = messages[messages.length - 1];
    const id = setTimeout(() => {
      void (async () => {
        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);
        const data = chatSnap.data() as ChatDoc | undefined;
        const existing = data?.readUpTo?.[uid];
        const targetMs = last.createdAtMs;
        if (existing && existing.toMillis() >= targetMs) return;
        await updateDoc(chatRef, {
          [`readUpTo.${uid}`]: Timestamp.fromMillis(targetMs),
          [`unreadBy.${uid}`]: 0,
        });
      })().catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [isOnline, isFocused, chatId, currentUser?.id, messages]);

  return { readUpTo };
}
