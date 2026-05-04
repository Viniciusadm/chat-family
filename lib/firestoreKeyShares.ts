import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { WrappedKey } from "./crypto/asymmetric";
import type { KeyShareDoc } from "@/types/chat";

export async function writeKeyShare(
  deviceId: string,
  chatId: string,
  wrappedBy: string,
  share: WrappedKey,
): Promise<void> {
  await setDoc(doc(db, "devices", deviceId, "keyShares", chatId), {
    ephemeralPublicKey: share.ephemeralPublicKey,
    iv: share.iv,
    ciphertext: share.ciphertext,
    wrappedBy,
    createdAt: serverTimestamp(),
  });
}

export async function listKeyShares(
  deviceId: string,
): Promise<{ chatId: string; share: KeyShareDoc }[]> {
  const snap = await getDocs(collection(db, "devices", deviceId, "keyShares"));
  return snap.docs.map((d) => ({ chatId: d.id, share: d.data() as KeyShareDoc }));
}
