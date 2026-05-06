import { storage } from "@/lib/firebase";
import {
  ensureImageMessageInFirestore,
  updateChatAfterOutgoingMessage,
} from "@/lib/firestoreMessages";
import { MessageRepository } from "@/lib/MessageRepository";
import type { MessageReplySnapshot } from "@/types/chat";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export async function uploadAndPersistImage(args: {
  chatId: string;
  messageId: string;
  tenantId: string;
  senderId: string;
  fullUri: string;
  thumbUri: string;
  imageWidth: number;
  imageHeight: number;
  imageFileSize: number;
  replyTo: MessageReplySnapshot | null;
}) {
  const fullRef = ref(
    storage,
    `images/${args.tenantId}/${args.chatId}/${args.messageId}.jpg`
  );
  const thumbRef = ref(
    storage,
    `images/${args.tenantId}/${args.chatId}/${args.messageId}_thumb.jpg`
  );

  const [fullBlob, thumbBlob] = await Promise.all([
    fetch(args.fullUri).then((r) => r.blob()),
    fetch(args.thumbUri).then((r) => r.blob()),
  ]);

  await Promise.all([
    uploadBytes(fullRef, fullBlob, { contentType: "image/jpeg" }),
    uploadBytes(thumbRef, thumbBlob, { contentType: "image/jpeg" }),
  ]);

  const [imageUrl, thumbnailUrl] = await Promise.all([
    getDownloadURL(fullRef),
    getDownloadURL(thumbRef),
  ]);

  await ensureImageMessageInFirestore({
    chatId: args.chatId,
    messageId: args.messageId,
    tenantId: args.tenantId,
    senderId: args.senderId,
    imageUrl,
    thumbnailUrl,
    imageWidth: args.imageWidth || null,
    imageHeight: args.imageHeight || null,
    imageFileSize: args.imageFileSize || null,
    replyTo: args.replyTo,
  });

  await MessageRepository.updateImageRemoteUrls(args.messageId, {
    remote: imageUrl,
    thumbnail: thumbnailUrl,
  });
  await MessageRepository.updateStatus(args.messageId, "sent");
  await updateChatAfterOutgoingMessage(args.chatId, args.senderId, {
    type: "image",
  });
}
