import type {
  Message,
  MessageReplySnapshot,
  MessageReplyType,
} from "@/types/chat";

const REPLY_PREVIEW_MAX_CHARS = 90;

export function replyPreviewForType(type: MessageReplyType, content: string) {
  if (type === "audio") return "Áudio";
  if (type === "image") return "Imagem";

  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Mensagem";
  if (trimmed.length <= REPLY_PREVIEW_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, REPLY_PREVIEW_MAX_CHARS - 1)}…`;
}

export function createReplySnapshot(
  message: Message,
  senderName: string
): MessageReplySnapshot {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName,
    type: message.type,
    preview: replyPreviewForType(message.type, message.content),
  };
}
