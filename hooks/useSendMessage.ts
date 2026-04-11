import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useState } from "react";

export type SendableAudio = Blob | Uint8Array | ArrayBuffer;

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
      await updateDoc(doc(db, "chats", chatId), {
        lastMessageText: text.trim(),
        lastMessageType: "text",
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
      await updateDoc(doc(db, "chats", chatId), {
        lastMessageText: null,
        lastMessageType: "audio",
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setIsSending(false);
    }
  };

  return { sendText, sendAudio, isSending };
}
