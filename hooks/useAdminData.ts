import { useAuth } from "@/context/AuthContext";
import { db, functions, storage } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { randomUuid } from "@/lib/randomUuid";
import type {
  AppMember,
  Chat,
  ChatDoc,
  Device,
  DeviceDoc,
  MemberDoc,
  MessageDoc,
  UserDoc,
  UserRole,
} from "@/types/chat";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { useEffect, useState } from "react";

function newLoginCode(): string {
  return randomUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
}

async function readTenantIdForUid(uid: string): Promise<string | null> {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) return null;
  const t = (userSnap.data() as UserDoc).tenantId;
  return typeof t === "string" && t.length > 0 ? t : null;
}

export function useAdminData() {
  const { tenantId, currentUser, firebaseUser } = useAuth();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setResolvedTenantId(null);
      return;
    }
    setResolvedTenantId(null);
    let cancelled = false;
    readTenantIdForUid(uid).then((t) => {
      if (!cancelled) setResolvedTenantId(t);
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid]);

  const effectiveTenantId = tenantId ?? currentUser?.tenantId ?? resolvedTenantId ?? null;
  const [members, setMembers] = useState<AppMember[]>([]);
  const [sessionUserNames, setSessionUserNames] = useState<Record<string, string>>({});
  const [pendingDevices, setPendingDevices] = useState<Device[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!effectiveTenantId) {
      setMembers([]);
      setSessionUserNames({});
      setPendingDevices([]);
      setChats([]);
      setLoading(false);
      return;
    }

    let resolved = 0;
    const checkDone = () => {
      resolved++;
      if (resolved === 4) setLoading(false);
    };

    const unsubMembers = onSnapshot(
      query(collection(db, "members"), where("tenantId", "==", effectiveTenantId)),
      (snap) => {
        setMembers(
          snap.docs.map((d) => {
            const data = d.data() as MemberDoc;
            return {
              id: d.id,
              tenantId: data.tenantId,
              name: data.name,
              role: data.role,
              loginCode: data.loginCode,
            };
          })
        );
        checkDone();
      }
    );

    const unsubSessionUsers = onSnapshot(
      query(collection(db, "users"), where("tenantId", "==", effectiveTenantId)),
      (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as UserDoc;
          map[d.id] = data.name;
        });
        setSessionUserNames(map);
        checkDone();
      }
    );

    const unsubDevices = onSnapshot(
      query(
        collection(db, "devices"),
        where("tenantId", "==", effectiveTenantId),
        where("approved", "==", false)
      ),
      (snap) => {
        setPendingDevices(
          snap.docs.map((d) => {
            const data = d.data() as DeviceDoc;
            return {
              id: d.id,
              tenantId: data.tenantId,
              userId: data.userId,
              approved: data.approved,
              pushToken: data.pushToken,
              createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
            };
          })
        );
        checkDone();
      }
    );

    const unsubChats = onSnapshot(
      query(collection(db, "chats"), where("tenantId", "==", effectiveTenantId)),
      (snap) => {
        setChats(
          snap.docs.map((d) => {
            const data = d.data() as ChatDoc;
            return {
              id: d.id,
              tenantId: data.tenantId,
              participants: data.participants,
              isGroup: data.isGroup,
              name: data.name,
              unreadCount: 0,
            };
          })
        );
        checkDone();
      }
    );

    return () => {
      unsubMembers();
      unsubSessionUsers();
      unsubDevices();
      unsubChats();
    };
  }, [effectiveTenantId]);

  const addUser = async (name: string, role: UserRole) => {
    const uid = firebaseUser?.uid;
    let tid = effectiveTenantId;
    if (!tid && uid) {
      tid = await readTenantIdForUid(uid);
    }
    if (!tid) {
      throw new Error("Não foi possível identificar a família. Saia e entre de novo.");
    }
    const loginCode = newLoginCode();
    const memberRef = await addDoc(collection(db, "members"), {
      tenantId: tid,
      name,
      role,
      loginCode,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "loginCodes", loginCode), {
      memberId: memberRef.id,
      tenantId: tid,
      name,
      role,
    });
  };

  const approveDevice = async (deviceIdParam: string) => {
    const fn = httpsCallable(functions, "approveDevice");
    await fn({ deviceId: deviceIdParam });
  };

  const rejectDevice = async (deviceIdParam: string) => {
    await deleteDoc(doc(db, "devices", deviceIdParam));
  };

  const createChat = async (name: string, participantIds: string[]) => {
    if (!effectiveTenantId || participantIds.length < 2) return;
    await addDoc(collection(db, "chats"), {
      tenantId: effectiveTenantId,
      participants: participantIds,
      isGroup: participantIds.length > 2,
      name,
      lastMessageText: null,
      lastMessageAt: null,
      lastMessageType: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const updateChat = async (chatId: string, name: string, participantIds: string[]) => {
    if (participantIds.length < 2) return;
    await updateDoc(doc(db, "chats", chatId), {
      name,
      participants: participantIds,
      isGroup: participantIds.length > 2,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteChat = async (chatId: string) => {
    const msgsRef = collection(db, "chats", chatId, "messages");
    const snap = await getDocs(msgsRef);
    for (const d of snap.docs) {
      const data = d.data() as MessageDoc;
      if (data.audioUrl) {
        try {
          await deleteObject(ref(storage, data.audioUrl));
        } catch {}
      }
    }
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = writeBatch(db);
      docs.slice(i, i + 500).forEach((x) => batch.delete(x.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, "chats", chatId));
  };

  return {
    members,
    sessionUserNames,
    pendingDevices,
    chats,
    loading,
    addUser,
    approveDevice,
    rejectDevice,
    createChat,
    updateChat,
    deleteChat,
  };
}
