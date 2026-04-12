import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import type { ChatDoc } from "@/types/chat";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useState } from "react";

export type SendableAudio = Blob | Uint8Array | ArrayBuffer;

async function updateChatAfterOutgoingMessage(
  chatId: string,
  senderId: string,
  lastMessageText: string | null,
  lastMessageType: "text" | "audio"
) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  const participants =
    (chatSnap.data() as ChatDoc | undefined)?.participants ?? [];
  const updates: Record<string, unknown> = {
    lastMessageText,
    lastMessageType,
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

export function useSendMessage(chatId: string) {
  const { currentUser, tenantId } = useAuth();
  const [isSending, setIsSending] = useState(false);

  const sendText = async (text: string) => {
    if (!currentUser || !tenantId || !text.trim()) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        tenantId,
        senderId: currentUser.id,
        text: text.trim(),
        audioUrl: null,
        audioDuration: null,
        createdAt: serverTimestamp(),
      });
      await updateChatAfterOutgoingMessage(
        chatId,
        currentUser.id,
        text.trim(),
        "text"
      );
    } finally {
      setIsSending(false);
    }
  };

  const sendAudio = async (
    audio: SendableAudio,
    options?: { extension?: string; contentType?: string }
  ) => {
    if (!currentUser || !tenantId) return;
    setIsSending(true);
    try {
      const msgRef = doc(collection(db, "chats", chatId, "messages"));
      const ext = options?.extension ?? "webm";
      const storageRef = ref(
        storage,
        `audios/${tenantId}/${chatId}/${msgRef.id}.${ext}`
      );

      await uploadBytes(
        storageRef,
        audio,
        options?.contentType
          ? { contentType: options.contentType }
          : undefined
      );
      const audioUrl = await getDownloadURL(storageRef);

      await setDoc(msgRef, {
        tenantId,
        senderId: currentUser.id,
        text: null,
        audioUrl,
        audioDuration: null,
        createdAt: serverTimestamp(),
      });
      await updateChatAfterOutgoingMessage(
        chatId,
        currentUser.id,
        null,
        "audio"
      );
    } finally {
      setIsSending(false);
    }
  };

  return { sendText, sendAudio, isSending };
}
