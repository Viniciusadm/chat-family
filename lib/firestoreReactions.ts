import { db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";

export async function ensureReactionInFirestore({
  chatId,
  messageId,
  userId,
  emoji,
}: {
  chatId: string;
  messageId: string;
  userId: string;
  emoji: string;
}) {
  const reactionId = `${messageId}_${userId}`;
  const ref = doc(db, "chats", chatId, "reactions", reactionId);
  const existing = await getDoc(ref);

  if (existing.exists() && existing.data().emoji === emoji) {
    return;
  }

  await setDoc(ref, {
    messageId,
    userId,
    emoji,
    updatedAt: serverTimestamp(),
  });
}

export async function removeReactionFromFirestore({
  chatId,
  messageId,
  userId,
}: {
  chatId: string;
  messageId: string;
  userId: string;
}) {
  const reactionId = `${messageId}_${userId}`;
  const ref = doc(db, "chats", chatId, "reactions", reactionId);
  await deleteDoc(ref);
}
