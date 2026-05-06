import { db, storage } from "@/lib/firebase";
import { randomUuid } from "@/lib/randomUuid";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

async function fetchBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return await res.blob();
}

export async function uploadGroupPhoto(params: {
  tenantId: string;
  chatId: string;
  localUri: string;
}): Promise<{ photoUrl: string; photoPath: string }> {
  const { tenantId, chatId, localUri } = params;
  const path = `groupPhotos/${tenantId}/${chatId}/${randomUuid()}.jpg`;
  const blob = await fetchBlob(localUri);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const photoUrl = await getDownloadURL(storageRef);
  return { photoUrl, photoPath: path };
}

export async function setChatPhoto(
  chatId: string,
  next: { photoUrl: string; photoPath: string },
  previousPath: string | null,
): Promise<void> {
  await updateDoc(doc(db, "chats", chatId), {
    photoUrl: next.photoUrl,
    photoPath: next.photoPath,
    updatedAt: serverTimestamp(),
  });
  if (previousPath && previousPath !== next.photoPath) {
    try {
      await deleteObject(ref(storage, previousPath));
    } catch {
      // foto antiga já pode ter sido removida; seguir.
    }
  }
}

export async function clearChatPhoto(
  chatId: string,
  previousPath: string | null,
): Promise<void> {
  await updateDoc(doc(db, "chats", chatId), {
    photoUrl: null,
    photoPath: null,
    updatedAt: serverTimestamp(),
  });
  if (previousPath) {
    try {
      await deleteObject(ref(storage, previousPath));
    } catch {
      // ok
    }
  }
}
