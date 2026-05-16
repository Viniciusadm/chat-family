import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { ChatRepository } from "@/lib/ChatRepository";
import type { LocalTimestamp } from "@/lib/localTimestamp";
import { timestampFromMillis } from "@/lib/localTimestamp";
import { markRead } from "@/src/api/chats";
import type { Message } from "@/types/chat";
import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";

export function useChatReadReceipts(
  chatId: string,
  messages: Message[],
  localReadUpTo?: Record<string, LocalTimestamp>
): { readUpTo: Record<string, LocalTimestamp> | null } {
  const { currentUser } = useAuth();
  const { isOnline } = useConnectivity();
  const isFocused = useIsFocused();
  const [readUpTo, setReadUpTo] = useState<Record<string, LocalTimestamp> | null>(
    localReadUpTo ?? null
  );

  useEffect(() => {
    setReadUpTo(localReadUpTo ?? null);
  }, [chatId, localReadUpTo]);

  useEffect(() => {
    if (!chatId || localReadUpTo) return;
    let active = true;
    void ChatRepository.getLocalChat(chatId)
      .then((chat) => {
        if (active && chat?.readUpTo) setReadUpTo(chat.readUpTo);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [chatId, localReadUpTo]);

  useEffect(() => {
    if (!isOnline || !isFocused || !chatId || !currentUser?.id || messages.length === 0) {
      return;
    }
    const uid = currentUser.id;
    const last = messages[messages.length - 1];
    const id = setTimeout(() => {
      const targetMs = last.createdAtMs;
      const existing = readUpTo?.[uid];
      if (existing && existing.toMillis() >= targetMs) return;
      setReadUpTo((prev) => ({
        ...(prev ?? {}),
        [uid]: timestampFromMillis(targetMs),
      }));
      void markRead(chatId, new Date(targetMs).toISOString()).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [isOnline, isFocused, chatId, currentUser?.id, messages, readUpTo]);

  return { readUpTo };
}
