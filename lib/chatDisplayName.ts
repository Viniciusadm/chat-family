import type { Chat } from "@/types/chat";

type NamedProfile = {
  name: string;
};

export function getChatDisplayName(
  chat: Chat | null | undefined,
  currentUserId: string | undefined,
  memberProfiles: Record<string, NamedProfile>
) {
  if (!chat) return "";
  if (chat.name.trim()) return chat.name;
  if (!currentUserId || chat.participants.length !== 2) return chat.name;

  const otherParticipantId = chat.participants.find((id) => id !== currentUserId);
  if (!otherParticipantId) return chat.name;

  return memberProfiles[otherParticipantId]?.name ?? chat.name;
}
