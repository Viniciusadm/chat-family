import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput, type ChatInputHandle } from "@/components/ChatInput";
import { useAuth } from "@/context/AuthContext";
import { useChatReadReceipts } from "@/hooks/useChatReadReceipts";
import { useChats } from "@/hooks/useChats";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useMemberNames } from "@/hooks/useMemberNames";
import { useMessages } from "@/hooks/useMessages";
import { colors } from "@/theme/colors";
import type { Message } from "@/types/chat";
import type { Timestamp } from "firebase/firestore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface DaySeparatorItem {
  id: string;
  type: "separator";
  date: Date;
  dayKey: string;
}

interface MessageItem {
  id: string;
  type: "message";
  message: Message;
  dayKey: string;
}

type ChatListItem = DaySeparatorItem | MessageItem;

function readReceiptStatus(
  message: Message,
  currentUserId: string | undefined,
  participants: string[],
  readUpTo: Record<string, Timestamp> | null
): "loading" | "sent" | "read" | undefined {
  if (!currentUserId || message.senderId !== currentUserId) return undefined;
  if (message.status === "loading") return "loading";
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

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";

  return target.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { isOnline } = useConnectivity();
  const { chats } = useChats();
  const { messages, loading } = useMessages(chatId ?? "");
  const memberNames = useMemberNames();
  const visibleMessages = useMemo(
    () => (loading ? [] : messages),
    [loading, messages]
  );
  const { readUpTo } = useChatReadReceipts(chatId ?? "", visibleMessages);
  const keyboardOverlap = useAndroidKeyboardOverlap();
  const inputRef = useRef<ChatInputHandle>(null);
  const badgeOpacity = useRef(new Animated.Value(1)).current;

  const chat = chats.find((c) => c.id === chatId);
  const participants = chat?.participants ?? [];

  const [activeDayLabel, setActiveDayLabel] = useState<string>("");
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const audioSequenceMap = useMemo(() => {
    const sequence = new Map<string, string | undefined>();
    for (let i = 0; i < visibleMessages.length; i += 1) {
      const current = visibleMessages[i];
      if (current.type !== "audio") continue;
      const next = visibleMessages[i + 1];
      if (
        next &&
        next.type === "audio" &&
        next.senderId === current.senderId
      ) {
        sequence.set(current.id, next.id);
      } else {
        sequence.set(current.id, undefined);
      }
    }
    return sequence;
  }, [visibleMessages]);


  useEffect(() => {
    setActiveAudioMessageId(null);
  }, [chatId]);

  const chatListData = useMemo<ChatListItem[]>(() => {
    const ordered = [...visibleMessages].reverse();
    const list: ChatListItem[] = [];

    ordered.forEach((message, index) => {
      const currentDayKey = getDayKey(message.timestamp);
      const previousDayKey =
        index > 0 ? getDayKey(ordered[index - 1].timestamp) : null;

      if (currentDayKey !== previousDayKey) {
        list.push({
          id: `separator-${currentDayKey}`,
          type: "separator",
          dayKey: currentDayKey,
          date: message.timestamp,
        });
      }

      list.push({
        id: message.id,
        type: "message",
        message,
        dayKey: currentDayKey,
      });
    });

    return list;
  }, [visibleMessages]);

  useEffect(() => {
    const first = chatListData.find((i) => i.type === "separator") as
      | DaySeparatorItem
      | undefined;
    setActiveDayLabel(first ? formatDayLabel(first.date) : "");
  }, [chatListData]);

  const keepComposerFocused = useCallback(() => {
    if (keyboardOverlap <= 0) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [keyboardOverlap]);

  const animateBadgeChange = useCallback((nextLabel: string) => {
    setActiveDayLabel((current) => {
      if (!nextLabel || nextLabel === current) return current;
      Animated.sequence([
        Animated.timing(badgeOpacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(badgeOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return nextLabel;
    });
  }, [badgeOpacity]);

  if (!chatId) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingBottom: keyboardOverlap }]}
    >
      <AppHeader title={chat?.name ?? ""} onBack={() => router.back()} />
      <View style={styles.messagesWrap}>
        {activeDayLabel ? (
          <Animated.View style={[styles.dayBadge, { opacity: badgeOpacity }]}>
            <Text style={styles.dayBadgeText}>{activeDayLabel}</Text>
          </Animated.View>
        ) : null}
        <FlatList
          key={chatId}
          inverted
          data={chatListData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          onTouchStart={keepComposerFocused}
          onViewableItemsChanged={({ viewableItems }) => {
            const firstVisible = viewableItems.find(
              (entry) => entry.item.type === "message" || entry.item.type === "separator"
            )?.item;

            if (!firstVisible) return;

            const dayKey = firstVisible.dayKey;
            const separator = chatListData.find(
              (entry) => entry.type === "separator" && entry.dayKey === dayKey
            ) as DaySeparatorItem | undefined;

            if (separator) {
              animateBadgeChange(formatDayLabel(separator.date));
            }
          }}
          viewabilityConfig={{ itemVisiblePercentThreshold: 35 }}
          renderItem={({ item }) => {
            if (item.type === "separator") {
              return (
                <View style={styles.separatorWrap}>
                  <View style={styles.separatorLine} />
                  <Text style={styles.separatorText}>{formatDayLabel(item.date)}</Text>
                  <View style={styles.separatorLine} />
                </View>
              );
            }

            return (
              <ChatBubble
                message={item.message}
                isSelf={item.message.senderId === currentUser?.id}
                isOnline={isOnline}
                shouldPlay={activeAudioMessageId === item.message.id}
                nextInSequenceId={audioSequenceMap.get(item.message.id)}
                playbackRate={audioPlaybackRate}
                onRequestPlay={setActiveAudioMessageId}
                onAudioFinished={(nextMessageId) => {
                  setActiveAudioMessageId(nextMessageId ?? null);
                }}
                onPlaybackRateChange={setAudioPlaybackRate}
                senderName={
                  chat?.isGroup && item.message.senderId !== currentUser?.id
                    ? memberNames[item.message.senderId] ?? "Participante"
                    : undefined
                }
                readReceipt={readReceiptStatus(
                  item.message,
                  currentUser?.id,
                  participants,
                  readUpTo
                )}
              />
            );
          }}
        />
      </View>
      <ChatInput ref={inputRef} chatId={chatId} keyboardVisible={keyboardOverlap > 0} />
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
  separatorWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 14,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  separatorText: {
    marginHorizontal: 10,
    fontSize: 12,
    fontWeight: "600",
    color: colors.timestamp,
    textTransform: "capitalize",
  },
  dayBadge: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    backgroundColor: "rgba(45, 143, 82, 0.9)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    zIndex: 2,
  },
  dayBadgeText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
