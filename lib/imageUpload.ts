import { ensureImageMessageRemote } from "@/lib/remoteMessages";
import { MessageRepository } from "@/lib/MessageRepository";
import { uploadMessageImage } from "@/src/api/media";
import type { MessageReplySnapshot } from "@/types/chat";

export async function uploadAndPersistImage(args: {
  chatId: string;
  messageId: string;
  tenantId: string;
  senderId: string;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  imageFileSize: number;
  replyTo: MessageReplySnapshot | null;
}) {
  await ensureImageMessageRemote({
    chatId: args.chatId,
    messageId: args.messageId,
    tenantId: args.tenantId,
    senderId: args.senderId,
    imageUrl: null,
    thumbnailUrl: null,
    imageWidth: null,
    imageHeight: null,
    imageFileSize: null,
    replyTo: args.replyTo,
  });

  const uploaded = await uploadMessageImage(args.chatId, args.messageId, {
    uri: args.imageUri,
    name: `${args.messageId}.jpg`,
    type: "image/jpeg",
  });
  const imageUrl = uploaded.url;

  await MessageRepository.updateImageRemoteUrls(args.messageId, {
    remote: imageUrl,
  });
  await MessageRepository.updateStatus(args.messageId, "sent");
}
