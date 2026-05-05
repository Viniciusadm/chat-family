import { db } from "@/lib/firebase";
import type { ChatDoc, MessageReplySnapshot } from "@/types/chat";
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

export type LastMessagePreview =
  | { type: "text"; ciphertext: string; iv: string }
  | { type: "audio" };

export async function updateChatAfterOutgoingMessage(
  chatId: string,
  senderId: string,
  preview: LastMessagePreview
) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  const participants =
    (chatSnap.data() as ChatDoc | undefined)?.participants ?? [];
  const updates: Record<string, unknown> = {
    lastMessageText: null,
    lastMessageCiphertext: preview.type === "text" ? preview.ciphertext : null,
    lastMessageIv: preview.type === "text" ? preview.iv : null,
    lastMessageType: preview.type,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  for (const p of participants) {
    if (p !== senderId) {
      updates[`unreadBy.${p}`] = increment(1);
    }
  }

  await updateDoc(chatRef, updates);
}

export async function ensureTextMessageInFirestore({
  chatId,
  messageId,
  tenantId,
  senderId,
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
  const messageRef = doc(db, "chats", chatId, "messages", messageId);
  const existing = await getDoc(messageRef);
  if (existing.exists()) return;

  await setDoc(messageRef, {
    tenantId,
    senderId,
    text: null,
    audioUrl: null,
    audioDuration: null,
    ciphertext,
    iv,
    encVersion: 1,
    replyTo: replyTo ?? null,
    createdAt: serverTimestamp(),
  });
}

export async function ensureAudioMessageInFirestore({
  chatId,
  messageId,
  tenantId,
  senderId,
  audioUrl,
  audioDuration,
  replyTo,
}: {
  chatId: string;
  messageId: string;
  tenantId: string;
  senderId: string;
  audioUrl: string;
  audioDuration: number | null;
  replyTo?: MessageReplySnapshot | null;
}) {
  const messageRef = doc(db, "chats", chatId, "messages", messageId);
  const existing = await getDoc(messageRef);
  if (existing.exists()) return;

  await setDoc(messageRef, {
    tenantId,
    senderId,
    text: null,
    audioUrl,
    audioDuration,
    replyTo: replyTo ?? null,
    createdAt: serverTimestamp(),
  });
}
