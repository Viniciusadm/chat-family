import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { db } from "@/lib/firebase";
import {
  ensureReactionInFirestore,
  removeReactionFromFirestore,
} from "@/lib/firestoreReactions";
import { ReactionRepository } from "@/lib/ReactionRepository";
import type { Reaction, ReactionDoc } from "@/types/chat";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

type ReactionAction =
  | { type: "add"; messageId: string; userId: string; emoji: string }
  | { type: "remove"; messageId: string; userId: string };

export function useReactions(chatId: string) {
  const { currentUser, firebaseUser } = useAuth();
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

  const executeReaction = useCallback(
    async (action: ReactionAction) => {
      if (!currentUserId) return;

      const { messageId, userId } = action;

      if (action.type === "add") {
        await ReactionRepository.saveReaction(
          messageId,
          userId,
          action.emoji,
          "loading",
          chatId
        );

        if (isOnline && firebaseUser) {
          try {
            await ensureReactionInFirestore({
              chatId,
              messageId,
              userId,
              emoji: action.emoji,
            });
            await ReactionRepository.updateStatus(messageId, userId, "sent");
          } catch {
            await ReactionRepository.updateStatus(messageId, userId, "loading");
          }
        }
      } else {
        await ReactionRepository.removeReaction(
          messageId,
          userId,
          chatId
        );

        if (isOnline && firebaseUser) {
          try {
            await removeReactionFromFirestore({ chatId, messageId, userId });
          } catch {
            // Silently fail; local is already removed
          }
        }
      }
    },
    [chatId, currentUserId, firebaseUser, isOnline]
  );

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;

      const messageReactions = reactions[messageId] ?? [];
      const existing = messageReactions.find(
        (r) => r.userId === currentUserId
      );

      if (existing?.emoji === emoji) {
        await executeReaction({ type: "remove", messageId, userId: currentUserId });
        return;
      }

      if (existing) {
        await executeReaction({ type: "remove", messageId, userId: currentUserId });
      }

      await executeReaction({
        type: "add",
        messageId,
        userId: currentUserId,
        emoji,
      });
    },
    [currentUserId, reactions, executeReaction]
  );

  useEffect(() => {
    if (!chatId) {
      setReactions({});
      return;
    }

    let active = true;
    let unsubFirestore: (() => void) | undefined;
    let unsubLocal: (() => void) | undefined;

    const isActive = () => active;

    void (async () => {
      await loadLocalReactions(chatId, isActive);
      if (!active) return;

      unsubLocal = ReactionRepository.subscribe(chatId, () => {
        void loadLocalReactions(chatId, isActive);
      });

      if (!firebaseUser || !isOnline) return;

      const q = query(
        collection(db, "chats", chatId, "reactions"),
        orderBy("updatedAt", "asc")
      );

      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          void (async () => {
            for (const d of snap.docs) {
              const data = d.data() as ReactionDoc;
              await ReactionRepository.upsertFirestoreReaction(
                data.messageId,
                data.userId,
                data.emoji,
                chatId
              );
            }

            if (snap.docChanges().length > 0) {
              await loadLocalReactions(chatId, isActive);
            }
          })();
        },
        () => {
          if (active) {
            void loadLocalReactions(chatId, isActive);
          }
        }
      );
    })();

    return () => {
      active = false;
      unsubLocal?.();
      unsubFirestore?.();
    };
  }, [chatId, firebaseUser, isOnline, loadLocalReactions]);

  return { reactions, reactToMessage };
}
