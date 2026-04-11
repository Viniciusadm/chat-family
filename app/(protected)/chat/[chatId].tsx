import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { useAuth } from "@/context/AuthContext";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import { colors } from "@/theme/colors";
import type { Message } from "@/types/chat";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { chats } = useChats();
  const { messages } = useMessages(chatId ?? "");
  const listRef = useRef<FlatList<Message>>(null);

  const chat = chats.find((c) => c.id === chatId);

  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  if (!chatId) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
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
            />
          )}
        />
      </View>
      <ChatInput chatId={chatId} />
    </KeyboardAvoidingView>
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
