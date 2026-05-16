import { apiFetch } from "./client";
import type { MessageReplySnapshot, MessageType } from "@/types/chat";

export type ChatDto = {
  id: string;
  tenant_id: string;
  is_group: boolean;
  name: string;
  photo_url?: string | null;
  photo_path?: string | null;
  last_message_ciphertext?: string | null;
  last_message_iv?: string | null;
  last_message_type?: MessageType | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  participant_ids?: string[];
  read_up_to?: Record<string, string>;
  unread_by?: Record<string, number>;
};

export type MessageDto = {
  id: string;
  chat_id: string;
  tenant_id: string;
  sender_member_id: string;
  type: MessageType;
  ciphertext?: string | null;
  iv?: string | null;
  enc_version?: number | null;
  audio_url?: string | null;
  audio_duration?: number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  image_file_size?: number | null;
  reply_to_message_id?: string | null;
  reply_to_sender_id?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_type?: MessageType | null;
  reply_to_preview?: string | null;
  created_at?: string;
  edited_at?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
};

export type ReactionDto = {
  message_id: string;
  member_id: string;
  emoji: string;
  updated_at?: string;
};

export function listChats() {
  return apiFetch<ChatDto[]>("/chats");
}

export function getChat(chatId: string) {
  return apiFetch<ChatDto>(`/chats/${chatId}`);
}

export function createChat(body: {
  name?: string;
  is_group?: boolean;
  participant_ids?: string[];
  photo_url?: string | null;
  photo_path?: string | null;
}) {
  return apiFetch<{ id: string }>("/chats", { method: "POST", body });
}

export function updateChat(chatId: string, body: {
  name?: string;
  is_group?: boolean;
  participant_ids?: string[];
  photo_url?: string | null;
  photo_path?: string | null;
}) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}`, { method: "PATCH", body });
}

export function deleteChat(chatId: string) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}`, { method: "DELETE" });
}

export function clearChatPhoto(chatId: string) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}/photo`, { method: "DELETE" });
}

export function markRead(chatId: string, readUpTo?: string) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}/read`, {
    method: "POST",
    body: { read_up_to: readUpTo },
  });
}

export function listMessages(chatId: string, params: { after?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.after) qs.set("after", params.after);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<MessageDto[]>(`/chats/${chatId}/messages${suffix}`);
}

export function createMessage(chatId: string, body: MessageBody) {
  return apiFetch<{ id: string }>(`/chats/${chatId}/messages`, {
    method: "POST",
    body,
  });
}

export function updateMessage(chatId: string, messageId: string, body: MessageBody) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}/messages/${messageId}`, {
    method: "PATCH",
    body,
  });
}

export function deleteMessage(chatId: string, messageId: string) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
  });
}

export function listReactions(chatId: string, params: { after?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.after) qs.set("after", params.after);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<ReactionDto[]>(`/chats/${chatId}/reactions${suffix}`);
}

export function upsertReaction(chatId: string, messageId: string, emoji: string) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}/messages/${messageId}/reaction`, {
    method: "PUT",
    body: { emoji },
  });
}

export function removeReaction(chatId: string, messageId: string) {
  return apiFetch<{ ok: true }>(`/chats/${chatId}/messages/${messageId}/reaction`, {
    method: "DELETE",
  });
}

export type MessageBody = {
  id: string;
  type: MessageType;
  ciphertext?: string | null;
  iv?: string | null;
  enc_version?: number | null;
  audio_url?: string | null;
  audio_duration?: number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  image_file_size?: number | null;
  reply_to_message_id?: string | null;
  reply_to_sender_id?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_type?: string | null;
  reply_to_preview?: string | null;
};

export function replyToBody(replyTo?: MessageReplySnapshot | null) {
  return {
    reply_to_message_id: replyTo?.id ?? null,
    reply_to_sender_id: replyTo?.senderId ?? null,
    reply_to_sender_name: replyTo?.senderName ?? null,
    reply_to_type: replyTo?.type ?? null,
    reply_to_preview: replyTo?.preview ?? null,
  };
}
