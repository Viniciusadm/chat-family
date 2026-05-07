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
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  imageFileSize: number;
  replyTo: MessageReplySnapshot | null;
}) {
  const imageRef = ref(
    storage,
    `images/${args.tenantId}/${args.chatId}/${args.messageId}.jpg`
  );

  const blob = await fetch(args.imageUri).then((r) => r.blob());

  await uploadBytes(imageRef, blob, { contentType: "image/jpeg" });

  const imageUrl = await getDownloadURL(imageRef);

  await ensureImageMessageInFirestore({
    chatId: args.chatId,
    messageId: args.messageId,
    tenantId: args.tenantId,
    senderId: args.senderId,
    imageUrl,
    imageWidth: args.imageWidth || null,
    imageHeight: args.imageHeight || null,
    imageFileSize: args.imageFileSize || null,
    replyTo: args.replyTo,
  });

  await MessageRepository.updateImageRemoteUrls(args.messageId, {
    remote: imageUrl,
  });
  await MessageRepository.updateStatus(args.messageId, "sent");
  await updateChatAfterOutgoingMessage(args.chatId, args.senderId, {
    type: "image",
  });
}
