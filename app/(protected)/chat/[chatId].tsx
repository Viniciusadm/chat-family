import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput, type ChatInputHandle } from "@/components/ChatInput";
import { useAuth } from "@/context/AuthContext";
import { useChatReadReceipts } from "@/hooks/useChatReadReceipts";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import { colors } from "@/theme/colors";
import type { Message } from "@/types/chat";
import type { Timestamp } from "firebase/firestore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";

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

function getKeyboardOverlap(screenY: number): number {
  const windowHeight = Dimensions.get("window").height;
  return Math.max(0, windowHeight - screenY);
}

function useAndroidKeyboardOverlap() {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      setOverlap(getKeyboardOverlap(event.endCoordinates.screenY));
    });
    const change = Keyboard.addListener("keyboardDidChangeFrame", (event) => {
      setOverlap(getKeyboardOverlap(event.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setOverlap(0);
    });

    return () => {
      show.remove();
      change.remove();
      hide.remove();
    };
  }, []);

  return overlap;
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { chats } = useChats();
  const { messages, loading } = useMessages(chatId ?? "");
  const visibleMessages = loading ? [] : messages;
  const { readUpTo } = useChatReadReceipts(chatId ?? "", visibleMessages);
  const keyboardOverlap = useAndroidKeyboardOverlap();
  const inputRef = useRef<ChatInputHandle>(null);

  const chat = chats.find((c) => c.id === chatId);
  const participants = chat?.participants ?? [];

  const reversedMessages = useMemo(
    () => [...visibleMessages].reverse(),
    [visibleMessages]
  );

  const keepComposerFocused = useCallback(() => {
    if (keyboardOverlap <= 0) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [keyboardOverlap]);

  if (!chatId) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingBottom: keyboardOverlap }]}
    >
      <AppHeader
        title={chat?.name ?? ""}
        onBack={() => router.back()}
      />
      <View style={styles.messagesWrap}>
        <FlatList
          key={chatId}
          inverted
          data={reversedMessages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          onTouchStart={keepComposerFocused}
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
      <ChatInput
        ref={inputRef}
        chatId={chatId}
        keyboardVisible={keyboardOverlap > 0}
      />
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
  },
});
