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
  if (chat.participants.length !== 2) return chat.name;

  if (currentUserId && chat.participants.includes(currentUserId)) {
    const otherParticipantId = chat.participants.find(
      (id) => id !== currentUserId
    );
    if (!otherParticipantId) return chat.name;
    return memberProfiles[otherParticipantId]?.name ?? chat.name;
  }

  const names = chat.participants
    .map((id) => memberProfiles[id]?.name)
    .filter((n): n is string => Boolean(n && n.trim()));
  if (names.length === 2) return names.join(" e ");
  return chat.name;
}

export function isOtherParticipantDeleted(
  chat: Chat | null | undefined,
  currentUserId: string | undefined,
  memberProfiles: Record<string, NamedProfile>
): boolean {
  if (!chat || chat.isGroup || !currentUserId) return false;
  if (chat.participants.length !== 2) return false;
  const otherId = chat.participants.find((id) => id !== currentUserId);
  if (!otherId) return false;
  return !(otherId in memberProfiles);
}
