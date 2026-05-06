import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { KeyBackupDoc, PasswordVerifierField, UserDoc } from "@/types/chat";

export interface PasswordSettings {
  salt: string;
  verifier: PasswordVerifierField;
}

export async function getPasswordSettings(uid: string): Promise<PasswordSettings | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as UserDoc;
  if (!data.passwordSalt || !data.passwordVerifier) return null;
  return { salt: data.passwordSalt, verifier: data.passwordVerifier };
}

export async function writePasswordSettings(
  uid: string,
  settings: PasswordSettings,
): Promise<void> {
  await setDoc(
    doc(db, "users", uid),
    { passwordSalt: settings.salt, passwordVerifier: settings.verifier },
    { merge: true },
  );
}

export async function clearPasswordSettings(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    passwordSalt: deleteField(),
    passwordVerifier: deleteField(),
  });
}

export async function writeKeyBackup(
  uid: string,
  chatId: string,
  payload: { ciphertext: string; iv: string },
): Promise<void> {
  await setDoc(doc(db, "users", uid, "keyBackups", chatId), {
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    encVersion: 1,
    createdAt: serverTimestamp(),
  });
}

export async function listKeyBackups(
  uid: string,
): Promise<{ chatId: string; backup: KeyBackupDoc }[]> {
  const snap = await getDocs(collection(db, "users", uid, "keyBackups"));
  return snap.docs.map((d) => ({ chatId: d.id, backup: d.data() as KeyBackupDoc }));
}

export async function countKeyBackups(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, "users", uid, "keyBackups"));
  return snap.size;
}

export async function deleteAllKeyBackups(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, "users", uid, "keyBackups"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
