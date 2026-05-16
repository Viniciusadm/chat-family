import {
  createMessage,
  deleteMessage,
  replyToBody,
  updateMessage,
} from "@/src/api/chats";
import type { MessageReplySnapshot } from "@/types/chat";

export async function ensureTextMessageRemote({
  chatId,
  messageId,
  ciphertext,
  iv,
  replyTo,
}: {
  chatId: string;
  messageId: string;
  tenantId: string;
  senderId: string;
  ciphertext: string;
  iv: string;
  replyTo?: MessageReplySnapshot | null;
}) {
  await createMessage(chatId, {
    id: messageId,
    type: "text",
    ciphertext,
    iv,
    enc_version: 1,
    ...replyToBody(replyTo),
  });
}

export async function ensureAudioMessageRemote({
  chatId,
  messageId,
  audioUrl,
  audioDuration,
  replyTo,
}: {
  chatId: string;
  messageId: string;
  tenantId: string;
  senderId: string;
  audioUrl: string | null;
  audioDuration: number | null;
  replyTo?: MessageReplySnapshot | null;
}) {
  await createMessage(chatId, {
    id: messageId,
    type: "audio",
    audio_url: audioUrl,
    audio_duration: audioDuration,
    ...replyToBody(replyTo),
  });
}

export async function ensureImageMessageRemote({
  chatId,
  messageId,
  imageUrl,
  thumbnailUrl,
  imageWidth,
  imageHeight,
  imageFileSize,
  replyTo,
}: {
  chatId: string;
  messageId: string;
  tenantId: string;
  senderId: string;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageFileSize: number | null;
  replyTo?: MessageReplySnapshot | null;
}) {
  await createMessage(chatId, {
    id: messageId,
    type: "image",
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl ?? null,
    image_width: imageWidth,
    image_height: imageHeight,
    image_file_size: imageFileSize,
    ...replyToBody(replyTo),
  });
}

export async function updateTextMessageRemote({
  chatId,
  messageId,
  ciphertext,
  iv,
}: {
  chatId: string;
  messageId: string;
  ciphertext: string;
  iv: string;
}) {
  await updateMessage(chatId, messageId, {
    id: messageId,
    type: "text",
    ciphertext,
    iv,
    enc_version: 1,
  });
}

export async function softDeleteMessageRemote({
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: string;
}) {
  await deleteMessage(chatId, messageId);
}
