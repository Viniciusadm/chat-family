import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useLayoutInsets } from "@/hooks/useLayoutInsets";
import { useAuth } from "@/context/AuthContext";
import { useChatReadReceipts } from "@/hooks/useChatReadReceipts";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import { colors } from "@/theme/colors";
import type { Message } from "@/types/chat";
import type { Timestamp } from "firebase/firestore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { FlatList, StyleSheet, View } from "react-native";

function readReceiptStatus(
  message: Message,
  currentUserId: string | undefined,
  participants: string[],
  readUpTo: Record<string, Timestamp> | null
): "sent" | "read" | undefined {
  if (!currentUserId || message.senderId !== currentUserId) return undefined;
  const others = participants.filter((p) => p !== message.senderId);
  if (others.length === 0) return "read";
  const ts = message.createdAtMs;
  const allRead = others.every((p) => {
    const r = readUpTo?.[p];
    return r != null && r.toMillis() >= ts;
  });
  return allRead ? "read" : "sent";
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { chats } = useChats();
  const { messages } = useMessages(chatId ?? "");
  const { readUpTo } = useChatReadReceipts(chatId ?? "", messages);
  const listRef = useRef<FlatList<Message>>(null);
  const layoutInsets = useLayoutInsets();

  const chat = chats.find((c) => c.id === chatId);
  const participants = chat?.participants ?? [];

  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  if (!chatId) {
    return null;
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingBottom: layoutInsets.safeArea.bottom },
      ]}
    >
      <ScreenContainer behavior="translate" edges={[]} style={{ flex: 1 }}>
        <AppHeader
          title={chat?.name ?? ""}
          onBack={() => router.back()}
        />
        <View style={styles.messagesWrap}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
            renderItem={({ item }) => (
              <ChatBubble
                message={item}
                isSelf={item.senderId === currentUser?.id}
                readReceipt={readReceiptStatus(
                  item,
                  currentUser?.id,
                  participants,
                  readUpTo
                )}
              />
            )}
          />
        </View>
        <ChatInput chatId={chatId} />
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.chatBg,
  },
  messagesWrap: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 16,
    flexGrow: 1,
  },
});
