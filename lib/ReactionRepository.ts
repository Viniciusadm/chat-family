import { getDatabase, withExclusiveWrite } from "@/lib/db";
import type { Reaction } from "@/types/chat";

type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
  status: string;
};

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function emit(conversationId: string) {
  listeners.get(conversationId)?.forEach((l) => l());
}

function rowToReaction(row: ReactionRow): Reaction {
  return { userId: row.user_id, emoji: row.emoji };
}

export type PendingReaction = {
  messageId: string;
  userId: string;
  emoji: string;
  chatId: string;
};

export const ReactionRepository = {
  subscribe(conversationId: string, listener: Listener) {
    const set = listeners.get(conversationId) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(conversationId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(conversationId);
    };
  },

  emit(conversationId: string) {
    emit(conversationId);
  },

  async getReactions(conversationId: string): Promise<Record<string, Reaction[]>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ReactionRow>(
      `SELECT mr.*
       FROM message_reactions mr
       INNER JOIN messages m ON m.id = mr.message_id
       WHERE m.conversation_id = ?
       ORDER BY mr.emoji`,
      [conversationId]
    );
    const map: Record<string, Reaction[]> = {};
    for (const row of rows) {
      if (!map[row.message_id]) map[row.message_id] = [];
      map[row.message_id].push(rowToReaction(row));
    }
    return map;
  },

  async saveReaction(
    messageId: string,
    userId: string,
    emoji: string,
    status: "loading" | "sent",
    conversationId: string
  ) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `INSERT OR REPLACE INTO message_reactions (message_id, user_id, emoji, status)
         VALUES (?, ?, ?, ?)`,
        [messageId, userId, emoji, status]
      );
    });
    emit(conversationId);
  },

  async removeReaction(messageId: string, userId: string, conversationId: string) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?`,
        [messageId, userId]
      );
    });
    emit(conversationId);
  },

  async getPendingReactions(): Promise<PendingReaction[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ message_id: string; user_id: string; emoji: string; conversation_id: string }>(
      `SELECT mr.message_id, mr.user_id, mr.emoji, m.conversation_id
       FROM message_reactions mr
       INNER JOIN messages m ON m.id = mr.message_id
       WHERE mr.status = 'loading'`
    );
    return rows.map((r) => ({ messageId: r.message_id, userId: r.user_id, emoji: r.emoji, chatId: r.conversation_id }));
  },

  async updateStatus(messageId: string, userId: string, status: "loading" | "sent") {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `UPDATE message_reactions SET status = ? WHERE message_id = ? AND user_id = ?`,
        [status, messageId, userId]
      );
    });
  },

  async upsertFirestoreReaction(
    messageId: string,
    userId: string,
    emoji: string,
    conversationId?: string
  ) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `INSERT INTO message_reactions (message_id, user_id, emoji, status)
         VALUES (?, ?, ?, 'sent')
         ON CONFLICT(message_id, user_id) DO UPDATE SET
           emoji = excluded.emoji,
           status = 'sent'`,
        [messageId, userId, emoji]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async deleteReaction(messageId: string, userId: string) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?`,
        [messageId, userId]
      );
    });
  },
};
