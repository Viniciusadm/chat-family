import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { ReactionRepository } from "@/lib/ReactionRepository";
import { listReactions, removeReaction, upsertReaction } from "@/src/api/chats";
import { realtimeClient } from "@/src/api/realtime";
import type { Reaction } from "@/types/chat";
import { useCallback, useEffect, useState } from "react";

type ReactionAction =
  | { type: "add"; messageId: string; userId: string; emoji: string }
  | { type: "remove"; messageId: string; userId: string };

export function useReactions(chatId: string) {
  const { currentUser } = useAuth();
  const { isOnline } = useConnectivity();
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const currentUserId = currentUser?.id;

  const loadLocalReactions = useCallback(
    async (activeChatId: string, active: () => boolean) => {
      const data = await ReactionRepository.getReactions(activeChatId);
      if (!active()) return;
      setReactions(data);
    },
    []
  );

  const refreshRemoteReactions = useCallback(
    async (activeChatId: string, active: () => boolean) => {
      if (!isOnline) return;
      const rows = await listReactions(activeChatId);
      for (const row of rows) {
        await ReactionRepository.upsertRemoteReaction(
          row.message_id,
          row.member_id,
          row.emoji,
          activeChatId
        );
      }
      await loadLocalReactions(activeChatId, active);
    },
    [isOnline, loadLocalReactions]
  );

  const executeReaction = useCallback(
    async (action: ReactionAction) => {
      if (!currentUserId) return;
      const { messageId, userId } = action;
      if (action.type === "add") {
        await ReactionRepository.saveReaction(messageId, userId, action.emoji, "loading", chatId);
        if (isOnline) {
          try {
            await upsertReaction(chatId, messageId, action.emoji);
            await ReactionRepository.updateStatus(messageId, userId, "sent");
          } catch {
            await ReactionRepository.updateStatus(messageId, userId, "loading");
          }
        }
      } else {
        await ReactionRepository.removeReaction(messageId, userId, chatId);
        if (isOnline) {
          await removeReaction(chatId, messageId).catch(() => {});
        }
      }
    },
    [chatId, currentUserId, isOnline]
  );

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const messageReactions = reactions[messageId] ?? [];
      const existing = messageReactions.find((r) => r.userId === currentUserId);
      if (existing?.emoji === emoji) {
        await executeReaction({ type: "remove", messageId, userId: currentUserId });
        return;
      }
      if (existing) {
        await executeReaction({ type: "remove", messageId, userId: currentUserId });
      }
      await executeReaction({ type: "add", messageId, userId: currentUserId, emoji });
    },
    [currentUserId, reactions, executeReaction]
  );

  useEffect(() => {
    if (!chatId) {
      setReactions({});
      return;
    }
    let active = true;
    const isActive = () => active;
    void loadLocalReactions(chatId, isActive);
    void refreshRemoteReactions(chatId, isActive);
    const unsubLocal = ReactionRepository.subscribe(chatId, () => {
      void loadLocalReactions(chatId, isActive);
    });
    const unsubRealtime = realtimeClient.subscribe((event) => {
      if (event.chat_id === chatId && event.type.startsWith("reaction.")) {
        void refreshRemoteReactions(chatId, isActive);
      }
    });
    return () => {
      active = false;
      unsubLocal();
      unsubRealtime();
    };
  }, [chatId, loadLocalReactions, refreshRemoteReactions]);

  return { reactions, reactToMessage };
}
