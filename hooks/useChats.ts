import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { ChatRepository } from "@/lib/ChatRepository";
import { decryptIncomingMessage } from "@/lib/encryptedMessages";
import { timestampFromIso } from "@/lib/localTimestamp";
import {
  syncChatHistories,
  syncPendingImageMessages,
  syncPendingOps,
  syncPendingTextMessages,
} from "@/lib/offlineSync";
import { listChats, type ChatDto } from "@/src/api/chats";
import { realtimeClient } from "@/src/api/realtime";
import type { Chat } from "@/types/chat";
import { useCallback, useEffect, useState } from "react";

async function dtoToChat(data: ChatDto, currentMemberId: string): Promise<Chat> {
  const chat: Chat = {
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
  };
  if (data.last_message_at && data.last_message_type) {
    const timestamp = new Date(data.last_message_at);
    if (data.last_message_type === "text") {
      const text = await decryptIncomingMessage(data.id, {
        ciphertext: data.last_message_ciphertext,
        iv: data.last_message_iv,
      });
      if (text != null) {
        chat.lastMessage = { text, type: "text", timestamp };
      }
    } else {
      chat.lastMessage = { text: null, type: data.last_message_type, timestamp };
    }
  }
  return chat;
}

export function useChats(): { chats: Chat[]; loading: boolean } {
  const { currentUser, tenantId } = useAuth();
  const { isOnline } = useConnectivity();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLocalChats = useCallback(
    async (active: () => boolean) => {
      if (!tenantId) {
        setLoading(false);
        return;
      }
      const localChats = await ChatRepository.getLocalChats(tenantId);
      if (!active()) return;
      const memberId = currentUser?.id;
      setChats(memberId ? localChats.filter((c) => c.participants.includes(memberId)) : localChats);
      setLoading(false);
    },
    [tenantId, currentUser?.id]
  );

  const refreshRemoteChats = useCallback(
    async (active: () => boolean) => {
      if (!currentUser || !tenantId || !isOnline) return;
      const remote = await listChats();
      const next = await Promise.all(remote.map((chat) => dtoToChat(chat, currentUser.id)));
      for (const chat of next) {
        await ChatRepository.upsertChat(chat, { notify: false });
      }
      if (!active()) return;
      syncChatHistories(next.map((chat) => chat.id), isOnline);
      await syncPendingTextMessages(currentUser, tenantId, isOnline);
      await syncPendingImageMessages(currentUser, tenantId, isOnline);
      await syncPendingOps(currentUser, isOnline);
      await loadLocalChats(active);
    },
    [currentUser, isOnline, loadLocalChats, tenantId]
  );

  useEffect(() => {
    if (!tenantId || !currentUser) {
      setChats([]);
      setLoading(false);
      return;
    }

    let active = true;
    void loadLocalChats(() => active);
    const unsubLocal = ChatRepository.subscribe(() => {
      void loadLocalChats(() => active);
    });
    void refreshRemoteChats(() => active);
    const unsubRealtime = realtimeClient.subscribe((event) => {
      if (event.type.startsWith("chat.") || event.type.startsWith("message.")) {
        void refreshRemoteChats(() => active);
      }
    });
    return () => {
      active = false;
      unsubLocal();
      unsubRealtime();
    };
  }, [currentUser, loadLocalChats, refreshRemoteChats, tenantId]);

  return { chats, loading };
}
