import { decryptIncomingMessage } from "@/lib/encryptedMessages";
import { getDatabase, withExclusiveWrite } from "@/lib/db";
import type { MessageDto } from "@/src/api/chats";
import type {
  Message,
  MessagePendingOp,
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
  image_remote_url: string | null;
  local_image_uri: string | null;
  image_width: number | null;
  image_height: number | null;
  image_file_size: number | null;
  image_pending_source_uri: string | null;
  image_downloaded_at: string | null;
  is_edited: number | null;
  edited_at: string | null;
  is_deleted: number | null;
  deleted_at: string | null;
  pending_op: string | null;
  original_body: string | null;
  updated_at: string | null;
  edit_attempts: number | null;
  ciphertext: string | null;
  iv: string | null;
  enc_version: number | null;
};

type MessageSyncRow = {
  history_synced_at: string | null;
  newest_message_at: string | null;
};

export type LocalMessageInput = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  type: MessageType;
  status: MessageStatus;
  createdAt: Date;
  syncedAt?: Date | null;
  localAudioUri?: string | null;
  audioDownloadedAt?: Date | null;
  audioDuration?: number | null;
  replyTo?: MessageReplySnapshot | null;
  imageRemoteUrl?: string | null;
  localImageUri?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageFileSize?: number | null;
  imagePendingSourceUri?: string | null;
  imageDownloadedAt?: Date | null;
  isEdited?: boolean;
  editedAt?: Date | null;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  ciphertext?: string | null;
  iv?: string | null;
  encVersion?: number | null;
};

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
const allListeners = new Set<Listener>();

function emit(conversationId: string) {
  listeners.get(conversationId)?.forEach((listener) => listener());
  allListeners.forEach((listener) => listener());
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
  const type: MessageType =
    row.type === "audio" ? "audio" : row.type === "image" ? "image" : "text";
  const timestamp = new Date(row.created_at);
  const isDeleted = row.is_deleted === 1;
  const isEdited = row.is_edited === 1;
  const decryptionFailed =
    type === "text" && row.status === "sent" && row.body == null && !isDeleted;
  const status: MessageStatus =
    row.status === "loading"
      ? "loading"
      : row.status === "failed"
        ? "failed"
        : "sent";
  const pendingOp: MessagePendingOp | null =
    row.pending_op === "update" || row.pending_op === "delete"
      ? row.pending_op
      : null;

  return {
    id: row.id,
    chatId: row.conversation_id,
    senderId: row.sender_id,
    type,
    content: type === "text" ? row.body ?? "" : "",
    audioUrl:
      type === "audio" ? row.local_audio_uri ?? row.body ?? undefined : undefined,
    audioRemoteUrl: type === "audio" ? row.body ?? undefined : undefined,
    audioLocalUri: type === "audio" ? row.local_audio_uri ?? undefined : undefined,
    audioDuration:
      type === "audio" && typeof row.audio_duration === "number"
        ? row.audio_duration
        : undefined,
    imageUrl:
      type === "image"
        ? row.local_image_uri ??
          row.image_remote_url ??
          row.image_pending_source_uri ??
          undefined
        : undefined,
    imageRemoteUrl:
      type === "image" ? row.image_remote_url ?? undefined : undefined,
    imageLocalUri:
      type === "image" ? row.local_image_uri ?? undefined : undefined,
    imageWidth:
      type === "image" && typeof row.image_width === "number"
        ? row.image_width
        : undefined,
    imageHeight:
      type === "image" && typeof row.image_height === "number"
        ? row.image_height
        : undefined,
    imageFileSize:
      type === "image" && typeof row.image_file_size === "number"
        ? row.image_file_size
        : undefined,
    imagePendingSourceUri:
      type === "image" ? row.image_pending_source_uri ?? undefined : undefined,
    timestamp,
    createdAtMs: timestamp.getTime(),
    status,
    replyTo: rowReplyTo(row),
    decryptionFailed: decryptionFailed || undefined,
    isEdited: isEdited || undefined,
    editedAt: row.edited_at ? new Date(row.edited_at) : null,
    isDeleted: isDeleted || undefined,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    pendingOp,
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
    $imageRemoteUrl: message.imageRemoteUrl ?? null,
    $localImageUri: message.localImageUri ?? null,
    $imageWidth: message.imageWidth ?? null,
    $imageHeight: message.imageHeight ?? null,
    $imageFileSize: message.imageFileSize ?? null,
    $imagePendingSourceUri: message.imagePendingSourceUri ?? null,
    $imageDownloadedAt: message.imageDownloadedAt
      ? message.imageDownloadedAt.toISOString()
      : null,
    $isEdited: message.isEdited ? 1 : 0,
    $editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    $isDeleted: message.isDeleted ? 1 : 0,
    $deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
    $ciphertext: message.ciphertext ?? null,
    $iv: message.iv ?? null,
    $encVersion: message.encVersion ?? null,
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

  subscribeAll(listener: Listener) {
    allListeners.add(listener);
    return () => {
      allListeners.delete(listener);
    };
  },

  async getAllTextMessages(tenantId: string): Promise<
    {
      id: string;
      chatId: string;
      senderId: string;
      content: string;
      createdAtMs: number;
    }[]
  > {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      conversation_id: string;
      sender_id: string;
      body: string;
      created_at: string;
    }>(
      `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at
       FROM messages m
       INNER JOIN chats c ON c.id = m.conversation_id
       WHERE c.tenant_id = ?
         AND m.type = 'text'
         AND m.body IS NOT NULL
         AND m.body <> ''
         AND COALESCE(m.is_deleted, 0) = 0
       ORDER BY m.created_at DESC`,
      [tenantId]
    );
    return rows.map((row) => ({
      id: row.id,
      chatId: row.conversation_id,
      senderId: row.sender_id,
      content: row.body,
      createdAtMs: new Date(row.created_at).getTime(),
    }));
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
          reply_to_preview,
          image_remote_url,
          local_image_uri,
          image_width,
          image_height,
          image_file_size,
          image_pending_source_uri,
          image_downloaded_at,
          is_edited,
          edited_at,
          is_deleted,
          deleted_at,
          ciphertext,
          iv,
          enc_version
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
          $replyToPreview,
          $imageRemoteUrl,
          $localImageUri,
          $imageWidth,
          $imageHeight,
          $imageFileSize,
          $imagePendingSourceUri,
          $imageDownloadedAt,
          $isEdited,
          $editedAt,
          $isDeleted,
          $deletedAt,
          $ciphertext,
          $iv,
          $encVersion
        )
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          sender_id = excluded.sender_id,
          body = CASE
            WHEN messages.pending_op IS NOT NULL THEN messages.body
            WHEN excluded.body IS NULL AND messages.body IS NOT NULL THEN messages.body
            ELSE excluded.body
          END,
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
          is_edited = CASE
            WHEN messages.pending_op IS NOT NULL THEN messages.is_edited
            ELSE excluded.is_edited
          END,
          edited_at = CASE
            WHEN messages.pending_op IS NOT NULL THEN messages.edited_at
            ELSE COALESCE(excluded.edited_at, messages.edited_at)
          END,
          is_deleted = CASE
            WHEN messages.pending_op IS NOT NULL THEN messages.is_deleted
            ELSE excluded.is_deleted
          END,
          deleted_at = CASE
            WHEN messages.pending_op IS NOT NULL THEN messages.deleted_at
            ELSE COALESCE(excluded.deleted_at, messages.deleted_at)
          END,
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
          ),
          image_remote_url = COALESCE(
            excluded.image_remote_url,
            messages.image_remote_url
          ),
          local_image_uri = COALESCE(
            excluded.local_image_uri,
            messages.local_image_uri
          ),
          image_width = COALESCE(excluded.image_width, messages.image_width),
          image_height = COALESCE(excluded.image_height, messages.image_height),
          image_file_size = COALESCE(
            excluded.image_file_size,
            messages.image_file_size
          ),
          image_pending_source_uri = COALESCE(
            excluded.image_pending_source_uri,
            messages.image_pending_source_uri
          ),
          image_downloaded_at = COALESCE(
            excluded.image_downloaded_at,
            messages.image_downloaded_at
          ),
          ciphertext = COALESCE(excluded.ciphertext, messages.ciphertext),
          iv = COALESCE(excluded.iv, messages.iv),
          enc_version = COALESCE(excluded.enc_version, messages.enc_version)`,
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

  async updateEncryptedPayload(
    id: string,
    payload: { ciphertext: string; iv: string; encVersion: number }
  ) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      conversationId = existing?.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET ciphertext = ?, iv = ?, enc_version = ?
         WHERE id = ?`,
        [payload.ciphertext, payload.iv, payload.encVersion, id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async decryptStoredMessages(conversationId: string): Promise<number> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<
      Pick<MessageRow, "id" | "ciphertext" | "iv" | "enc_version">
    >(
      `SELECT id, ciphertext, iv, enc_version
       FROM messages
       WHERE conversation_id = ?
         AND type = 'text'
         AND body IS NULL
         AND ciphertext IS NOT NULL
         AND iv IS NOT NULL
         AND COALESCE(is_deleted, 0) = 0`,
      [conversationId]
    );
    let repaired = 0;
    for (const row of rows) {
      const body = await decryptIncomingMessage(conversationId, {
        ciphertext: row.ciphertext,
        iv: row.iv,
      });
      if (body == null) continue;
      await withExclusiveWrite(async (tx) => {
        await tx.runAsync(
          `UPDATE messages
           SET body = ?
           WHERE id = ? AND body IS NULL`,
          [body, row.id]
        );
      });
      repaired++;
    }
    if (repaired > 0) emit(conversationId);
    return repaired;
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

  async updateLocalImageUri(
    id: string,
    localUri: string
  ) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      conversationId = existing?.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET local_image_uri = ?, image_downloaded_at = ?
         WHERE id = ?`,
        [localUri, new Date().toISOString(), id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async updateImageRemoteUrls(
    id: string,
    urls: { remote: string }
  ) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      conversationId = existing?.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET image_remote_url = ?
         WHERE id = ?`,
        [urls.remote, id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async getPendingImageMessages(): Promise<Message[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT *
       FROM messages
       WHERE status IN ('loading', 'failed')
         AND type = 'image'
       ORDER BY created_at ASC`
    );
    return rows.map(rowToMessage);
  },

  async getConversationIdsWithPendingImageMessages(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Pick<MessageRow, "conversation_id">>(
      `SELECT DISTINCT conversation_id
       FROM messages
       WHERE status IN ('loading', 'failed')
         AND type = 'image'`
    );
    return rows.map((row) => row.conversation_id);
  },

  async upsertRemoteMessage(
    conversationId: string,
    id: string,
    data: MessageDto,
    options: { notify?: boolean } = {}
  ) {
    const isAudio = data.type === "audio";
    const isImage = data.type === "image";
    const createdAt = data.created_at ? new Date(data.created_at) : new Date();
    const isDeleted = data.is_deleted === true;
    const editedAt = data.edited_at ? new Date(data.edited_at) : null;
    const deletedAt = data.deleted_at ? new Date(data.deleted_at) : null;

    let body: string | null;
    let type: MessageType;
    let status: MessageStatus = "sent";
    if (isAudio) {
      body = data.audio_url ?? null;
      type = "audio";
      if (!data.audio_url && !isDeleted) {
        status = "failed";
      }
    } else if (isImage) {
      body = null;
      type = "image";
    } else if (data.ciphertext && data.iv) {
      body = await decryptIncomingMessage(conversationId, data);
      type = "text";
    } else {
      body = null;
      type = "text";
    }

    await this.insertLocalMessage(
      {
        id,
        conversationId,
        senderId: data.sender_member_id,
        type,
        body,
        status,
        createdAt,
        syncedAt: new Date(),
        audioDuration: isAudio ? data.audio_duration ?? null : null,
        imageRemoteUrl: isImage ? data.image_url ?? null : null,
        imageWidth: isImage ? data.image_width ?? null : null,
        imageHeight: isImage ? data.image_height ?? null : null,
        imageFileSize: isImage ? data.image_file_size ?? null : null,
        replyTo: data.reply_to_message_id
          ? {
              id: data.reply_to_message_id,
              senderId: data.reply_to_sender_id ?? "",
              senderName: data.reply_to_sender_name ?? "Participante",
              type:
                data.reply_to_type === "audio" || data.reply_to_type === "image"
                  ? data.reply_to_type
                  : "text",
              preview: data.reply_to_preview ?? "",
            }
          : null,
        isEdited: editedAt != null,
        editedAt,
        isDeleted,
        deletedAt,
        ciphertext: data.ciphertext ?? null,
        iv: data.iv ?? null,
        encVersion: data.enc_version ?? null,
      },
      options
    );
  },

  async syncWithRemote(
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
         AND COALESCE(is_deleted, 0) = 0
       ORDER BY created_at ASC`
    );

    return rows.map(rowToMessage);
  },

  async getPendingOps(): Promise<Message[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT *
       FROM messages
       WHERE pending_op IN ('update', 'delete')
         AND status = 'sent'
       ORDER BY COALESCE(updated_at, created_at) ASC`
    );

    return rows.map(rowToMessage);
  },

  async markAsEdited(
    id: string,
    options: {
      newBody: string;
      editedAt: Date;
      pendingOp: MessagePendingOp | null;
      preserveOriginal: boolean;
    }
  ) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<
        Pick<MessageRow, "conversation_id" | "body" | "original_body">
      >(
        "SELECT conversation_id, body, original_body FROM messages WHERE id = ?",
        [id]
      );
      if (!existing) return;
      conversationId = existing.conversation_id;
      const original = options.preserveOriginal
        ? existing.original_body ?? existing.body
        : existing.original_body;
      const editedAtIso = options.editedAt.toISOString();
      await tx.runAsync(
        `UPDATE messages
         SET body = ?,
             original_body = ?,
             is_edited = 1,
             edited_at = ?,
             pending_op = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          options.newBody,
          original ?? null,
          editedAtIso,
          options.pendingOp,
          editedAtIso,
          id,
        ]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async overwritePendingCreateBody(id: string, newBody: string) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      if (!existing) return;
      conversationId = existing.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET body = ?, updated_at = ?
         WHERE id = ?`,
        [newBody, new Date().toISOString(), id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async markAsDeleted(
    id: string,
    options: { deletedAt: Date; pendingOp: MessagePendingOp | null }
  ) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      if (!existing) return;
      conversationId = existing.conversation_id;
      const deletedAtIso = options.deletedAt.toISOString();
      await tx.runAsync(
        `UPDATE messages
         SET is_deleted = 1,
             deleted_at = ?,
             pending_op = ?,
             updated_at = ?
         WHERE id = ?`,
        [deletedAtIso, options.pendingOp, deletedAtIso, id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async cancelPendingCreate(id: string) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      if (!existing) return;
      conversationId = existing.conversation_id;
      const now = new Date().toISOString();
      await tx.runAsync(
        `UPDATE messages
         SET status = 'sent',
             synced_at = ?,
             pending_op = NULL,
             updated_at = ?
         WHERE id = ?`,
        [now, now, id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async clearPendingOp(id: string) {
    let conversationId: string | undefined;
    await withExclusiveWrite(async (tx) => {
      const existing = await tx.getFirstAsync<Pick<MessageRow, "conversation_id">>(
        "SELECT conversation_id FROM messages WHERE id = ?",
        [id]
      );
      if (!existing) return;
      conversationId = existing.conversation_id;
      await tx.runAsync(
        `UPDATE messages
         SET pending_op = NULL,
             updated_at = ?
         WHERE id = ?`,
        [new Date().toISOString(), id]
      );
    });
    if (conversationId) emit(conversationId);
  },

  async incrementEditAttempts(id: string) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `UPDATE messages
         SET edit_attempts = COALESCE(edit_attempts, 0) + 1
         WHERE id = ?`,
        [id]
      );
    });
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
