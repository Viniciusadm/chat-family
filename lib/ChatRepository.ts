import { getDatabase } from "@/lib/db";
import type { Chat } from "@/types/chat";

type ChatRow = {
  id: string;
  tenant_id: string;
  participants: string;
  is_group: number;
  name: string;
  unread_count: number;
  last_message_text: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function parseParticipants(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function rowToChat(row: ChatRow): Chat {
  const chat: Chat = {
    id: row.id,
    tenantId: row.tenant_id,
    participants: parseParticipants(row.participants),
    isGroup: row.is_group === 1,
    name: row.name,
    unreadCount: row.unread_count,
  };

  if (row.last_message_at) {
    chat.lastMessage = {
      text: row.last_message_text,
      type:
        row.last_message_type === "audio" || row.last_message_type === "text"
          ? row.last_message_type
          : null,
      timestamp: new Date(row.last_message_at),
    };
  }

  return chat;
}

export const ChatRepository = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async getLocalChats(tenantId: string): Promise<Chat[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ChatRow>(
      `SELECT *
       FROM chats
       WHERE tenant_id = ?
       ORDER BY COALESCE(last_message_at, updated_at, '') DESC, name ASC`,
      [tenantId]
    );

    return rows.map(rowToChat);
  },

  async upsertChat(chat: Chat, options: { notify?: boolean } = {}) {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO chats (
        id,
        tenant_id,
        participants,
        is_group,
        name,
        unread_count,
        last_message_text,
        last_message_type,
        last_message_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chat.id,
        chat.tenantId,
        JSON.stringify(chat.participants),
        chat.isGroup ? 1 : 0,
        chat.name,
        chat.unreadCount,
        chat.lastMessage?.text ?? null,
        chat.lastMessage?.type ?? null,
        chat.lastMessage?.timestamp?.toISOString() ?? null,
        new Date().toISOString(),
      ]
    );

    if (options.notify !== false) {
      emit();
    }
  },

  async deleteChat(chatId: string, options: { notify?: boolean } = {}) {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM chats WHERE id = ?", [chatId]);
    if (options.notify !== false) {
      emit();
    }
  },

  async updateLastMessage(
    chatId: string,
    lastMessage: { text: string | null; type: "text" | "audio"; timestamp: Date },
    options: { notify?: boolean } = {}
  ) {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE chats
       SET last_message_text = ?,
           last_message_type = ?,
           last_message_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        lastMessage.text,
        lastMessage.type,
        lastMessage.timestamp.toISOString(),
        new Date().toISOString(),
        chatId,
      ]
    );

    if (options.notify !== false) {
      emit();
    }
  },
};
