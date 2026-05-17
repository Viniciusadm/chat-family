import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AdminRepository } from "@/lib/AdminRepository";
import { ChatRepository } from "@/lib/ChatRepository";
import { prepareConversationKeyForEncryption } from "@/lib/conversationKeyReadiness";
import { distributeAllOwnedKeysToDevice, distributeConversationKey } from "@/lib/keyDistribution";
import { uploadChatPhoto } from "@/src/api/media";
import {
  approveDevice as approveDeviceApi,
  deleteDevice,
  listPendingDevices,
} from "@/src/api/devices";
import {
  createChat as createChatApi,
  clearChatPhoto,
  deleteChat as deleteChatApi,
  listChats,
  updateChat as updateChatApi,
  type ChatDto,
} from "@/src/api/chats";
import {
  createMember,
  deleteMember,
  listMembers,
} from "@/src/api/members";
import { realtimeClient } from "@/src/api/realtime";
import { timestampFromIso } from "@/lib/localTimestamp";
import type { AppMember, Chat, Device, UserRole } from "@/types/chat";
import { useCallback, useEffect, useState } from "react";

function chatFromDto(data: ChatDto, currentMemberId: string): Chat {
  return {
    id: data.id,
    tenantId: data.tenant_id,
    participants: data.participant_ids ?? [],
    isGroup: data.is_group,
    name: data.name,
    photoUrl: data.photo_url ?? null,
    photoPath: data.photo_path ?? null,
    unreadCount: data.unread_by?.[currentMemberId] ?? 0,
    readUpTo: Object.fromEntries(
      Object.entries(data.read_up_to ?? {})
        .map(([memberId, value]) => [memberId, timestampFromIso(value)])
        .filter((entry): entry is [string, NonNullable<Chat["readUpTo"]>[string]] => entry[1] != null)
    ),
    lastMessage: data.last_message_at && data.last_message_type
      ? {
          text: null,
          type: data.last_message_type,
          timestamp: new Date(data.last_message_at),
        }
      : undefined,
  };
}

export function useAdminData() {
  const { tenantId, currentUser, deviceId: currentDeviceId } = useAuth();
  const { isOnline } = useConnectivity();
  const effectiveTenantId = tenantId ?? currentUser?.tenantId ?? null;
  const canMutate = isOnline && currentUser?.role === "adult";
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

  const refreshRemote = useCallback(
    async (active: () => boolean) => {
      if (!effectiveTenantId || !currentUser || !isOnline) return;
      const [memberRows, deviceRows, chatRows] = await Promise.all([
        listMembers(),
        listPendingDevices().catch(() => []),
        listChats(),
      ]);
      const nextMembers = memberRows.map((m): AppMember => ({
        id: m.id,
        tenantId: effectiveTenantId,
        name: m.name,
        role: m.role,
        loginCode: m.login_code ?? null,
        photoUrl: m.photo_url ?? null,
        photoPath: m.photo_path ?? null,
      }));
      const nextDevices = deviceRows.map((d): Device => ({
        id: d.id,
        tenantId: effectiveTenantId,
        userId: d.user_id,
        memberId: d.member_id ?? null,
        approved: false,
        pushToken: "",
        publicKey: d.public_key ?? null,
        createdAt: d.created_at ? new Date(d.created_at) : new Date(),
      }));
      const nextChats = chatRows.map((chat) => chatFromDto(chat, currentUser.id));
      await Promise.all([
        AdminRepository.replaceMembers(effectiveTenantId, nextMembers),
        AdminRepository.replaceSessionUserNames(
          effectiveTenantId,
          Object.fromEntries(nextMembers.map((m) => [m.id, m.name])),
        ),
        AdminRepository.replacePendingDevices(effectiveTenantId, nextDevices),
        ChatRepository.replaceTenantChats(effectiveTenantId, nextChats),
      ]);
      await loadLocalData(active);
    },
    [currentUser, effectiveTenantId, isOnline, loadLocalData]
  );

  useEffect(() => {
    if (!effectiveTenantId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void loadLocalData(() => active);
    void refreshRemote(() => active);
    const unsubAdmin = AdminRepository.subscribe(() => void loadLocalData(() => active));
    const unsubChats = ChatRepository.subscribe(() => void loadLocalData(() => active));
    const unsubRealtime = realtimeClient.subscribe((event) => {
      if (
        event.type.startsWith("member.") ||
        event.type.startsWith("device.") ||
        event.type.startsWith("chat.")
      ) {
        void refreshRemote(() => active);
      }
    });
    return () => {
      active = false;
      unsubAdmin();
      unsubChats();
      unsubRealtime();
    };
  }, [effectiveTenantId, loadLocalData, refreshRemote]);

  const addUser = async (name: string, role: UserRole) => {
    if (!canMutate || !effectiveTenantId) throw new Error("Esta ação precisa de conexão.");
    const created = await createMember({ name, role });
    await refreshRemote(() => true);
    const newChats = await ChatRepository.getLocalChats(effectiveTenantId);
    const directChats = newChats.filter((chat) => chat.participants.includes(created.id));
    await Promise.all(
      directChats.map((chat) =>
        prepareConversationKeyForEncryption(chat.id, currentDeviceId, {
          canCreate: true,
        })
      )
    );
    for (const chat of directChats) {
      if (currentUser) {
        void distributeConversationKey(chat.id, chat.participants, effectiveTenantId, currentUser.id);
      }
    }
  };

  const approveDevice = async (deviceId: string) => {
    if (!canMutate || !currentUser) throw new Error("Esta ação precisa de conexão.");
    const device = pendingDevices.find((item) => item.id === deviceId);
    if (device?.publicKey) {
      const chatIds = chats
        .filter((chat) => device.memberId && chat.participants.includes(device.memberId))
        .map((chat) => chat.id);
      await Promise.all(
        chatIds.map((chatId) =>
          prepareConversationKeyForEncryption(chatId, currentDeviceId, {
            canCreate: true,
          })
        )
      );
      await distributeAllOwnedKeysToDevice(deviceId, device.publicKey, chatIds, currentUser.id);
    }
    await approveDeviceApi(deviceId);
    await refreshRemote(() => true);
  };

  const rejectDevice = async (deviceId: string) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    await deleteDevice(deviceId);
    await refreshRemote(() => true);
  };

  const createChat = async (name: string, participantIds: string[]) => {
    if (!canMutate || !effectiveTenantId) throw new Error("Esta ação precisa de conexão.");
    if (participantIds.length < 3) throw new Error("Grupos precisam de pelo menos 3 participantes.");
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Informe um nome para o grupo.");
    const created = await createChatApi({
      name: trimmedName,
      is_group: true,
      participant_ids: participantIds,
    });
    await prepareConversationKeyForEncryption(created.id, currentDeviceId, {
      canCreate: true,
    });
    if (currentUser) {
      void distributeConversationKey(created.id, participantIds, effectiveTenantId, currentUser.id);
    }
    await refreshRemote(() => true);
  };

  const updateChat = async (chatId: string, name: string, participantIds: string[]) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    if (participantIds.length < 3) throw new Error("Grupos precisam de pelo menos 3 participantes.");
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Informe um nome para o grupo.");
    await updateChatApi(chatId, {
      name: trimmedName,
      is_group: true,
      participant_ids: participantIds,
    });
    await refreshRemote(() => true);
  };

  const deleteChat = async (chatId: string) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    await deleteChatApi(chatId);
    await ChatRepository.deleteChat(chatId);
  };

  const deleteChildMember = async (memberId: string, deleteMessages: boolean) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    if (deleteMessages) {
      const directChats = chats.filter((c) => !c.isGroup && c.participants.includes(memberId));
      for (const chat of directChats) await deleteChat(chat.id);
    }
    await deleteMember(memberId);
    await refreshRemote(() => true);
  };

  const updateChatPhoto = async (chatId: string, localUri: string) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    const uploaded = await uploadChatPhoto(chatId, {
      uri: localUri,
      name: `${chatId}.jpg`,
      type: "image/jpeg",
    });
    void uploaded;
    await refreshRemote(() => true);
  };

  const removeChatPhoto = async (chatId: string) => {
    if (!canMutate) throw new Error("Esta ação precisa de conexão.");
    await clearChatPhoto(chatId);
    await refreshRemote(() => true);
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
    updateChatPhoto,
    removeChatPhoto,
    deleteChat,
    deleteChildMember,
  };
}
