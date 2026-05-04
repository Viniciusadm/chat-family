import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AdminRepository } from "@/lib/AdminRepository";
import { ChatRepository } from "@/lib/ChatRepository";
import {
  ensureConversationKey,
} from "@/lib/conversationKeys";
import {
  distributeAllOwnedKeysToDevice,
  distributeConversationKey,
} from "@/lib/keyDistribution";
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
import { useCallback, useEffect, useState } from "react";

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
  const { isOnline } = useConnectivity();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || !isOnline) {
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
  }, [firebaseUser?.uid, isOnline]);

  const effectiveTenantId = tenantId ?? currentUser?.tenantId ?? resolvedTenantId ?? null;
  const canMutate = isOnline && firebaseUser != null && !firebaseUser.isAnonymous;
  const [members, setMembers] = useState<AppMember[]>([]);
  const [sessionUserNames, setSessionUserNames] = useState<Record<string, string>>({});
  const [pendingDevices, setPendingDevices] = useState<Device[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLocalData = useCallback(
    async (active: () => boolean) => {
      if (!effectiveTenantId) {
        setMembers([]);
        setSessionUserNames({});
        setPendingDevices([]);
        setChats([]);
        setLoading(false);
        return;
      }

      const [localMembers, localSessionUserNames, localPendingDevices, localChats] =
        await Promise.all([
          AdminRepository.getMembers(effectiveTenantId),
          AdminRepository.getSessionUserNames(effectiveTenantId),
          AdminRepository.getPendingDevices(effectiveTenantId),
          ChatRepository.getLocalChats(effectiveTenantId),
        ]);

      if (!active()) return;
      setMembers(localMembers);
      setSessionUserNames(localSessionUserNames);
      setPendingDevices(localPendingDevices);
      setChats(localChats);
      setLoading(false);
    },
    [effectiveTenantId]
  );

  useEffect(() => {
    if (!effectiveTenantId) {
      setMembers([]);
      setSessionUserNames({});
      setPendingDevices([]);
      setChats([]);
      setLoading(false);
      return;
    }

    let active = true;
    const unsubs: (() => void)[] = [];
    setLoading(true);
    void loadLocalData(() => active);

    const emitLocal = () => {
      void loadLocalData(() => active);
    };
    unsubs.push(AdminRepository.subscribe(emitLocal));
    unsubs.push(ChatRepository.subscribe(emitLocal));

    if (!isOnline || !firebaseUser) {
      return () => {
        active = false;
        unsubs.forEach((unsub) => unsub());
      };
    }

    const unsubMembers = onSnapshot(
      query(collection(db, "members"), where("tenantId", "==", effectiveTenantId)),
      (snap) => {
        const nextMembers = snap.docs.map((d) => {
            const data = d.data() as MemberDoc;
            return {
              id: d.id,
              tenantId: data.tenantId,
              name: data.name,
              role: data.role,
              loginCode: data.loginCode,
              photoUrl: data.photoUrl ?? null,
              photoPath: data.photoPath ?? null,
            };
          });
        void AdminRepository.replaceMembers(effectiveTenantId, nextMembers);
      },
      () => setLoading(false)
    );

    const unsubSessionUsers = onSnapshot(
      query(collection(db, "users"), where("tenantId", "==", effectiveTenantId)),
      (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as UserDoc;
          map[d.id] = data.name;
        });
        void AdminRepository.replaceSessionUserNames(effectiveTenantId, map);
      },
      () => setLoading(false)
    );

    const unsubDevices = onSnapshot(
      query(
        collection(db, "devices"),
        where("tenantId", "==", effectiveTenantId),
        where("approved", "==", false)
      ),
      (snap) => {
        const nextDevices = snap.docs.map((d) => {
            const data = d.data() as DeviceDoc;
            return {
              id: d.id,
              tenantId: data.tenantId,
              userId: data.userId,
              approved: data.approved,
              pushToken: data.pushToken,
              createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
            };
          });
        void AdminRepository.replacePendingDevices(effectiveTenantId, nextDevices);
      },
      () => setLoading(false)
    );

    const unsubChats = onSnapshot(
      query(collection(db, "chats"), where("tenantId", "==", effectiveTenantId)),
      (snap) => {
        const nextChats = snap.docs.map((d) => {
            const data = d.data() as ChatDoc;
            const chat: Chat = {
              id: d.id,
              tenantId: data.tenantId,
              participants: data.participants,
              isGroup: data.isGroup,
              name: data.name,
              unreadCount: 0,
            };
            if (data.lastMessageAt) {
              chat.lastMessage = {
                text: data.lastMessageText,
                type: data.lastMessageType,
                timestamp: data.lastMessageAt.toDate(),
              };
            }
            return chat;
          });
        void ChatRepository.replaceTenantChats(effectiveTenantId, nextChats);
      },
      () => setLoading(false)
    );
    unsubs.push(unsubMembers, unsubSessionUsers, unsubDevices, unsubChats);

    return () => {
      active = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, [effectiveTenantId, firebaseUser, isOnline, loadLocalData]);

  const addUser = async (name: string, role: UserRole) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
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
      photoUrl: null,
      photoPath: null,
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
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    if (!effectiveTenantId || !currentUser) {
      throw new Error("Estado de sessão inválido.");
    }

    const devSnap = await getDoc(doc(db, "devices", deviceIdParam));
    if (!devSnap.exists()) throw new Error("Dispositivo não encontrado.");
    const devData = devSnap.data() as DeviceDoc;
    const userSnap = await getDoc(doc(db, "users", devData.userId));
    if (!userSnap.exists()) throw new Error("Usuário do dispositivo não encontrado.");
    const userData = userSnap.data() as UserDoc;
    const targetMemberId = userData.memberId ?? devData.userId;
    const targetPublicKey = devData.publicKey;
    if (!targetPublicKey) throw new Error("Dispositivo sem chave pública.");

    const chatsSnap = await getDocs(
      query(
        collection(db, "chats"),
        where("tenantId", "==", effectiveTenantId),
        where("participants", "array-contains", targetMemberId),
      ),
    );
    const chatIds = chatsSnap.docs.map((d) => d.id);

    await distributeAllOwnedKeysToDevice(
      deviceIdParam,
      targetPublicKey,
      chatIds,
      currentUser.id,
    );

    const fn = httpsCallable(functions, "approveDevice");
    await fn({ deviceId: deviceIdParam });
  };

  const rejectDevice = async (deviceIdParam: string) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    await deleteDoc(doc(db, "devices", deviceIdParam));
  };

  const createChat = async (name: string, participantIds: string[]) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    if (!effectiveTenantId || participantIds.length < 2) return;
    const chatRef = await addDoc(collection(db, "chats"), {
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
    await ensureConversationKey(chatRef.id);
    if (currentUser) {
      await distributeConversationKey(
        chatRef.id,
        participantIds,
        effectiveTenantId,
        currentUser.id,
      );
    }
  };

  const updateChat = async (chatId: string, name: string, participantIds: string[]) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    if (participantIds.length < 2) return;
    await updateDoc(doc(db, "chats", chatId), {
      name,
      participants: participantIds,
      isGroup: participantIds.length > 2,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteChat = async (chatId: string) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
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

  const deleteChildMember = async (memberId: string, deleteMessages: boolean) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    const fn = httpsCallable(functions, "deleteChildMember");
    await fn({ memberId, deleteMessages });
  };

  return {
    members,
    sessionUserNames,
    pendingDevices,
    chats,
    loading,
    isOnline,
    canMutate,
    addUser,
    approveDevice,
    rejectDevice,
    createChat,
    updateChat,
    deleteChat,
    deleteChildMember,
  };
}
