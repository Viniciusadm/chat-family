import { getDatabase, withExclusiveWrite } from "@/lib/db";
import type {
  Message,
  MessageDoc,
  MessageReplySnapshot,
  MessageReplyType,
  MessageStatus,
  MessageType,
} from "@/types/chat";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  type: string;
  status: string;
  created_at: string;
  synced_at: string | null;
  local_audio_uri: string | null;
  audio_downloaded_at: string | null;
  audio_duration: number | null;
  reply_to_message_id: string | null;
  reply_to_sender_id: string | null;
  reply_to_sender_name: string | null;
  reply_to_type: string | null;
  reply_to_preview: string | null;
};

type MessageSyncRow = {
  history_synced_at: string | null;
  newest_message_at: string | null;
};

export type LocalMessageInput = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: MessageType;
  status: MessageStatus;
  createdAt: Date;
  syncedAt?: Date | null;
  localAudioUri?: string | null;
  audioDownloadedAt?: Date | null;
  audioDuration?: number | null;
  replyTo?: MessageReplySnapshot | null;
};

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function emit(conversationId: string) {
  listeners.get(conversationId)?.forEach((listener) => listener());
}

function normalizeReplyType(type: string | null | undefined): MessageReplyType {
  if (type === "audio" || type === "image") return type;
  return "text";
}

function rowReplyTo(row: MessageRow): MessageReplySnapshot | undefined {
  if (!row.reply_to_message_id) return undefined;

  return {
    id: row.reply_to_message_id,
    senderId: row.reply_to_sender_id ?? "",
    senderName: row.reply_to_sender_name ?? "Participante",
    type: normalizeReplyType(row.reply_to_type),
    preview: row.reply_to_preview ?? "",
  };
}

function rowToMessage(row: MessageRow): Message {
  const type: MessageType = row.type === "audio" ? "audio" : "text";
  const timestamp = new Date(row.created_at);

  return {
    id: row.id,
    chatId: row.conversation_id,
    senderId: row.sender_id,
    type,
    content: type === "text" ? row.body ?? "" : "",
    audioUrl: type === "audio" ? row.local_audio_uri ?? row.body ?? undefined : undefined,
    audioRemoteUrl: type === "audio" ? row.body ?? undefined : undefined,
    audioLocalUri: type === "audio" ? row.local_audio_uri ?? undefined : undefined,
    audioDuration: type === "audio" && typeof row.audio_duration === "number"
      ? row.audio_duration
      : undefined,
    timestamp,
    createdAtMs: timestamp.getTime(),
    status: row.status === "loading" ? "loading" : "sent",
    replyTo: rowReplyTo(row),
  };
}

function inputParams(message: LocalMessageInput) {
  return {
    $id: message.id,
    $conversationId: message.conversationId,
    $senderId: message.senderId,
    $body: message.body,
    $type: message.type,
    $status: message.status,
    $createdAt: message.createdAt.toISOString(),
    $syncedAt: message.syncedAt ? message.syncedAt.toISOString() : null,
    $localAudioUri: message.localAudioUri ?? null,
    $audioDownloadedAt: message.audioDownloadedAt
      ? message.audioDownloadedAt.toISOString()
      : null,
    $audioDuration: message.audioDuration ?? null,
    $replyToMessageId: message.replyTo?.id ?? null,
    $replyToSenderId: message.replyTo?.senderId ?? null,
    $replyToSenderName: message.replyTo?.senderName ?? null,
    $replyToType: message.replyTo?.type ?? null,
    $replyToPreview: message.replyTo?.preview ?? null,
  };
}

export const MessageRepository = {
  emit(conversationId: string) {
    emit(conversationId);
  },

  subscribe(conversationId: string, listener: Listener) {
    const set = listeners.get(conversationId) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(conversationId, set);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(conversationId);
      }
    };
  },

  async getLocalMessages(conversationId: string): Promise<Message[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT *
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return rows.map(rowToMessage);
  },

  async insertLocalMessage(
    message: LocalMessageInput,
    options: { notify?: boolean } = {}
  ) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `INSERT INTO messages (
          id,
          conversation_id,
          sender_id,
          body,
          type,
          status,
          created_at,
          synced_at,
          local_audio_uri,
          audio_downloaded_at,
          audio_duration,
          reply_to_message_id,
          reply_to_sender_id,
          reply_to_sender_name,
          reply_to_type,
          reply_to_preview
        ) VALUES (
          $id,
          $conversationId,
          $senderId,
          $body,
          $type,
          $status,
          $createdAt,
          $syncedAt,
          $localAudioUri,
          $audioDownloadedAt,
          $audioDuration,
          $replyToMessageId,
          $replyToSenderId,
          $replyToSenderName,
          $replyToType,
          $replyToPreview
        )
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          sender_id = excluded.sender_id,
          body = excluded.body,
          type = excluded.type,
          status = CASE
            WHEN messages.status = 'loading' AND excluded.status = 'sent'
              THEN 'sent'
            WHEN messages.status = 'loading'
              THEN messages.status
            ELSE excluded.status
          END,
          created_at = excluded.created_at,
          synced_at = COALESCE(excluded.synced_at, messages.synced_at),
          local_audio_uri = COALESCE(excluded.local_audio_uri, messages.local_audio_uri),
          audio_downloaded_at = COALESCE(
            excluded.audio_downloaded_at,
            messages.audio_downloaded_at
          ),
          audio_duration = COALESCE(excluded.audio_duration, messages.audio_duration),
          reply_to_message_id = COALESCE(
            excluded.reply_to_message_id,
            messages.reply_to_message_id
          ),
          reply_to_sender_id = COALESCE(
            excluded.reply_to_sender_id,
            messages.reply_to_sender_id
          ),
          reply_to_sender_name = COALESCE(
            excluded.reply_to_sender_name,
            messages.reply_to_sender_name
          ),
          reply_to_type = COALESCE(excluded.reply_to_type, messages.reply_to_type),
          reply_to_preview = COALESCE(
            excluded.reply_to_preview,
            messages.reply_to_preview
          )`,
        inputParams(message)
      );
    });
    if (options.notify !== false) {
      emit(message.conversationId);
    }
  },

  async updateStatus(id: string, status: MessageStatus) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      conversationId = existing?.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET status = ?, synced_at = ?
         WHERE id = ?`,
        [status, status === "sent" ? new Date().toISOString() : null, id]
      );
    });
    if (conversationId) {
      emit(conversationId);
    }
  },

  async updateLocalAudioUri(id: string, localAudioUri: string) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      conversationId = existing?.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET local_audio_uri = ?, audio_downloaded_at = ?
         WHERE id = ?`,
        [localAudioUri, new Date().toISOString(), id]
      );
    });
    if (conversationId) {
      emit(conversationId);
    }
  },

  async clearLocalAudioUri(id: string) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      conversationId = existing?.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET local_audio_uri = NULL, audio_downloaded_at = NULL
         WHERE id = ?`,
        [id]
      );
    });
    if (conversationId) {
      emit(conversationId);
    }
  },

  async upsertFirestoreMessage(
    conversationId: string,
    id: string,
    data: MessageDoc,
    options: { notify?: boolean } = {}
  ) {
    const isAudio = data.audioUrl != null;
    const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();

    await this.insertLocalMessage({
      id,
      conversationId,
      senderId: data.senderId,
      type: isAudio ? "audio" : "text",
      body: isAudio ? data.audioUrl ?? "" : data.text ?? "",
      status: "sent",
      createdAt,
      syncedAt: new Date(),
      audioDuration: isAudio ? data.audioDuration ?? null : null,
      replyTo: data.replyTo ?? null,
    }, options);
  },

  async syncWithFirestore(
    conversationId: string,
    sendPendingMessage: (message: Message) => Promise<void>
  ) {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT *
       FROM messages
       WHERE conversation_id = ?
         AND status = 'loading'
         AND type = 'text'
       ORDER BY created_at ASC`,
      [conversationId]
    );

    for (const row of rows) {
      const message = rowToMessage(row);
      try {
        await sendPendingMessage(message);
        await this.updateStatus(message.id, "sent");
      } catch {
        // Keep the local loading row for a later retry.
      }
    }
  },

  async getPendingTextMessages(): Promise<Message[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT *
       FROM messages
       WHERE status = 'loading'
         AND type = 'text'
       ORDER BY created_at ASC`
    );

    return rows.map(rowToMessage);
  },

  async getConversationIdsWithPendingTextMessages(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Pick<MessageRow, "conversation_id">>(
      `SELECT DISTINCT conversation_id
       FROM messages
       WHERE status = 'loading'
         AND type = 'text'`
    );

    return rows.map((row) => row.conversation_id);
  },

  async getMessageSyncState(conversationId: string): Promise<{
    historySyncedAt: Date | null;
    newestMessageAt: Date | null;
  }> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<MessageSyncRow>(
      `SELECT history_synced_at, newest_message_at
       FROM chat_message_sync
       WHERE chat_id = ?`,
      [conversationId]
    );

    return {
      historySyncedAt: row?.history_synced_at
        ? new Date(row.history_synced_at)
        : null,
      newestMessageAt: row?.newest_message_at
        ? new Date(row.newest_message_at)
        : null,
    };
  },

  async saveMessageSyncState(
    conversationId: string,
    newestMessageAt: Date | null
  ) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `INSERT INTO chat_message_sync (
          chat_id,
          history_synced_at,
          newest_message_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          history_synced_at = excluded.history_synced_at,
          newest_message_at = COALESCE(
            excluded.newest_message_at,
            chat_message_sync.newest_message_at
          )`,
        [
          conversationId,
          new Date().toISOString(),
          newestMessageAt?.toISOString() ?? null,
        ]
      );
    });
  },
};
