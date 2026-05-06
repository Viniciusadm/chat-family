import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput, type ChatInputHandle } from "@/components/ChatInput";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ReactionMenu } from "@/components/ReactionMenu";
import { ReactionsDialog } from "@/components/ReactionsDialog";
import { useAuth } from "@/context/AuthContext";
import { useChatReadReceipts } from "@/hooks/useChatReadReceipts";
import { useChats } from "@/hooks/useChats";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useMemberProfiles } from "@/hooks/useMemberProfiles";
import { useMessages } from "@/hooks/useMessages";
import { useReactions } from "@/hooks/useReactions";
import {
  EDIT_DELETE_WINDOW_MS,
  useSendMessage,
} from "@/hooks/useSendMessage";
import * as Clipboard from "expo-clipboard";
import { getChatDisplayName } from "@/lib/chatDisplayName";
import { createReplySnapshot } from "@/lib/messageReply";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import type { Message, MessageReplySnapshot } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";
import type { Timestamp } from "firebase/firestore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";

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

const SHOW_JUMP_TO_LATEST_OFFSET = 120;
const HIDE_JUMP_TO_LATEST_OFFSET = 48;

function readReceiptStatus(
  message: Message,
  currentUserId: string | undefined,
  participants: string[],
  readUpTo: Record<string, Timestamp> | null
): "loading" | "sent" | "read" | undefined {
  if (!currentUserId || message.senderId !== currentUserId) return undefined;
  if (message.status === "loading") return "loading";
  if (participants.length === 0) return "sent";
  const others = participants.filter((p) => p !== message.senderId);
  if (others.length === 0) return "read";
  const ts = message.createdAtMs;
  const allRead = others.every((p) => {
    const r = readUpTo?.[p];
    return r != null && r.toMillis() >= ts;
  });
  return allRead ? "read" : "sent";
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
  const { chatId, messageId: deepLinkMessageId } = useLocalSearchParams<{
    chatId: string;
    messageId?: string;
  }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      screen: {
        flex: 1,
        backgroundColor: t.chatBg,
      },
      messagesWrap: {
        flex: 1,
      },
      listContent: {
        paddingVertical: 16,
        gap: 8,
      },
      separatorWrap: {
        flexDirection: "row",
        marginVertical: 12,
        paddingHorizontal: 14,
      },
      separatorLine: {
        flex: 1,
        height: 1,
        backgroundColor: t.border,
      },
      separatorText: {
        marginHorizontal: 10,
        fontSize: 12,
        fontWeight: "600",
        color: t.timestamp,
        textTransform: "capitalize",
      },
      dayBadge: {
        position: "absolute",
        top: 8,
        alignSelf: "center",
        backgroundColor: t.chatHeader,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 6,
        zIndex: 2,
      },
      dayBadgeText: {
        color: t.chatHeaderForeground,
        fontSize: 12,
        fontWeight: "700",
        textTransform: "capitalize",
      },
      jumpToLatestButton: {
        position: "absolute",
        right: 18,
        bottom: 18,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.primary,
        shadowColor: t.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: t.shadowOpacity * 2,
        shadowRadius: 4,
        elevation: 4,
        zIndex: 3,
      },
      jumpToLatestButtonPressed: {
        opacity: 0.85,
      },
    })
  );
  const currentUserId = currentUser?.id;
  const { isOnline } = useConnectivity();
  const { chats } = useChats();
  const { messages, loading } = useMessages(chatId ?? "");
  const { reactions, reactToMessage } = useReactions(chatId ?? "");
  const memberProfiles = useMemberProfiles();
  const visibleMessages = useMemo(
    () => (loading ? [] : messages),
    [loading, messages]
  );
  const chat = chats.find((c) => c.id === chatId);
  const chatTitle = getChatDisplayName(chat, currentUserId, memberProfiles);
  const participants = chat?.participants ?? [];
  const { readUpTo } = useChatReadReceipts(
    chatId ?? "",
    visibleMessages,
    chat?.readUpTo
  );
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const inputRef = useRef<ChatInputHandle>(null);
  const listRef = useRef<FlatList<ChatListItem>>(null);
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const hasScrolledRef = useRef(false);
  const visibleDayLabelRef = useRef("");
  const hideBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);

  const {
    retryImageMessage,
    deleteMessage,
    canModifyMessage,
  } = useSendMessage(chatId);

  const [activeDayLabel, setActiveDayLabel] = useState<string>("");
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageReplySnapshot | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [reactionTarget, setReactionTarget] = useState<{
    messageId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [reactionsDialogMessageId, setReactionsDialogMessageId] = useState<string | null>(null);

  const messagesWithReactions = useMemo<Message[]>(() => {
    return visibleMessages.map((msg) => ({
      ...msg,
      reactions: reactions[msg.id] ?? [],
    }));
  }, [visibleMessages, reactions]);

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

  const messagesById = useMemo(() => {
    return new Map(visibleMessages.map((message) => [message.id, message]));
  }, [visibleMessages]);


  useEffect(() => {
    setActiveAudioMessageId(null);
    setReplyTo(null);
    setEditingMessage(null);
    setHighlightedMessageId(null);
  }, [chatId]);

  useEffect(() => {
    if (!editingMessage) return;
    const fresh = messagesById.get(editingMessage.id);
    if (!fresh) return;
    if (fresh.isDeleted) {
      setEditingMessage(null);
      return;
    }
    if (Date.now() - fresh.timestamp.getTime() > EDIT_DELETE_WINDOW_MS) {
      setEditingMessage(null);
    }
  }, [editingMessage, messagesById]);

  const chatListData = useMemo<ChatListItem[]>(() => {
    const ordered = [...messagesWithReactions].reverse();
    const list: ChatListItem[] = [];

    ordered.forEach((message, index) => {
      const currentDayKey = getDayKey(message.timestamp);

      list.push({
        id: message.id,
        type: "message",
        message,
        dayKey: currentDayKey,
      });

      const nextDayKey =
        index < ordered.length - 1 ? getDayKey(ordered[index + 1].timestamp) : null;

      if (currentDayKey !== nextDayKey) {
        list.push({
          id: `separator-${currentDayKey}`,
          type: "separator",
          dayKey: currentDayKey,
          date: message.timestamp,
        });
      }
    });

    return list;
  }, [messagesWithReactions]);

  useEffect(() => {
    setActiveDayLabel("");
    visibleDayLabelRef.current = "";
    badgeOpacity.setValue(0);
    hasScrolledRef.current = false;
    setShowJumpToLatest(false);
    if (hideBadgeTimeoutRef.current) {
      clearTimeout(hideBadgeTimeoutRef.current);
      hideBadgeTimeoutRef.current = null;
    }
  }, [badgeOpacity, chatId]);

  useEffect(() => {
    return () => {
      if (hideBadgeTimeoutRef.current) {
        clearTimeout(hideBadgeTimeoutRef.current);
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const keepComposerFocused = useCallback(() => {
    if (!isKeyboardVisible) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [isKeyboardVisible]);

  const showBadge = useCallback(() => {
    if (!hasScrolledRef.current) return;
    Animated.timing(badgeOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [badgeOpacity]);

  const scheduleBadgeHide = useCallback(() => {
    if (hideBadgeTimeoutRef.current) {
      clearTimeout(hideBadgeTimeoutRef.current);
    }

    hideBadgeTimeoutRef.current = setTimeout(() => {
      Animated.timing(badgeOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
      hideBadgeTimeoutRef.current = null;
    }, 2000);
  }, [badgeOpacity]);

  const syncJumpToLatestVisibility = useCallback((offsetY: number) => {
    setShowJumpToLatest((current) => {
      if (current) {
        return offsetY >= HIDE_JUMP_TO_LATEST_OFFSET;
      }

      return offsetY > SHOW_JUMP_TO_LATEST_OFFSET;
    });
  }, []);

  const handleScrollActivity = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncJumpToLatestVisibility(event.nativeEvent.contentOffset.y);

      if (!hasScrolledRef.current) return;
      showBadge();
      scheduleBadgeHide();
    },
    [scheduleBadgeHide, showBadge, syncJumpToLatestVisibility]
  );

  const handleScrollPositionSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncJumpToLatestVisibility(event.nativeEvent.contentOffset.y);
    },
    [syncJumpToLatestVisibility]
  );

  const handleUserScrollStart = useCallback(() => {
    hasScrolledRef.current = true;
    if (visibleDayLabelRef.current) {
      setActiveDayLabel(visibleDayLabelRef.current);
    }
    showBadge();
    scheduleBadgeHide();
  }, [scheduleBadgeHide, showBadge]);

  const animateBadgeChange = useCallback((nextLabel: string) => {
    if (!hasScrolledRef.current) return;
    setActiveDayLabel((current) => {
      if (!nextLabel) return current;
      if (nextLabel === current) {
        showBadge();
        return current;
      }
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
  }, [badgeOpacity, showBadge]);

  const jumpToLatestMessages = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const getSenderName = useCallback(
    (message: Message) => {
      if (message.senderId === currentUserId) {
        return currentUser?.name ?? "Você";
      }

      return memberProfiles[message.senderId]?.name ?? "Participante";
    },
    [currentUser?.name, currentUserId, memberProfiles]
  );

  const handleReplySelect = useCallback(
    (message: Message) => {
      setReplyTo(createReplySnapshot(message, getSenderName(message)));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [getSenderName]
  );

  const clearReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const clearEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleEditPress = useCallback((message: Message) => {
    setReplyTo(null);
    setEditingMessage(message);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleDeletePress = useCallback(
    (message: Message) => {
      Alert.alert(
        "Apagar mensagem",
        "Tem certeza que deseja apagar esta mensagem? Essa ação não pode ser desfeita.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Apagar",
            style: "destructive",
            onPress: () => {
              if (editingMessage?.id === message.id) {
                setEditingMessage(null);
              }
              void deleteMessage(message);
            },
          },
        ]
      );
    },
    [deleteMessage, editingMessage]
  );

  const handleCopyMessage = useCallback(async (message: Message) => {
    if (message.type !== "text" || !message.content) return;
    await Clipboard.setStringAsync(message.content);
  }, []);

  const highlightMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === messageId ? null : current
      );
      highlightTimeoutRef.current = null;
    }, 1600);
  }, []);

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const index = chatListData.findIndex(
        (entry) => entry.type === "message" && entry.message.id === messageId
      );
      if (index < 0) return;

      pendingScrollIndexRef.current = index;
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
      highlightMessage(messageId);
    },
    [chatListData, highlightMessage]
  );

  const pendingDeepLinkMessageIdRef = useRef<string | null>(null);
  const consumedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof deepLinkMessageId !== "string" || deepLinkMessageId.length === 0) {
      return;
    }
    if (consumedDeepLinkRef.current === deepLinkMessageId) return;
    pendingDeepLinkMessageIdRef.current = deepLinkMessageId;
  }, [deepLinkMessageId]);

  useEffect(() => {
    const target = pendingDeepLinkMessageIdRef.current;
    if (!target) return;
    const exists = chatListData.some(
      (entry) => entry.type === "message" && entry.message.id === target
    );
    if (!exists) return;
    const handle = setTimeout(() => {
      jumpToMessage(target);
      consumedDeepLinkRef.current = target;
      pendingDeepLinkMessageIdRef.current = null;
    }, 120);
    return () => clearTimeout(handle);
  }, [chatListData, jumpToMessage]);

  const handleReactionPress = useCallback(
    (messageId: string, x: number, y: number, width: number, height: number) => {
      setReactionTarget({ messageId, x, y, width, height });
    },
    []
  );

  const handleQuickEmojiSelect = useCallback(
    (emoji: string) => {
      if (!reactionTarget) return;
      void reactToMessage(reactionTarget.messageId, emoji);
      setReactionTarget(null);
    },
    [reactionTarget, reactToMessage]
  );

  const handleReactionChipPress = useCallback(
    (messageId: string) => () => {
      setReactionsDialogMessageId(messageId);
    },
    []
  );

  const closeReactionMenu = useCallback(() => {
    setReactionTarget(null);
  }, []);

  const closeReactionsDialog = useCallback(() => {
    setReactionsDialogMessageId(null);
  }, []);

  const handleRemoveOwnReaction = useCallback(() => {
    if (!reactionsDialogMessageId || !currentUserId) return;
    const msgReactions = reactions[reactionsDialogMessageId] ?? [];
    const own = msgReactions.find((r) => r.userId === currentUserId);
    if (own) {
      void reactToMessage(reactionsDialogMessageId, own.emoji);
    }
  }, [reactionsDialogMessageId, currentUserId, reactions, reactToMessage]);

  const memberNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const [id, profile] of Object.entries(memberProfiles)) {
      names[id] = profile.name;
    }
    return names;
  }, [memberProfiles]);

  const dialogReactions = reactionsDialogMessageId
    ? (reactions[reactionsDialogMessageId] ?? [])
    : [];

  if (!chatId || !currentUserId) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <AppHeader
        title={chatTitle}
        onBack={() => router.back()}
        leading={(() => {
          const otherId =
            chat && !chat.isGroup
              ? chat.participants.find((id) => id !== currentUserId)
              : undefined;
          const otherProfile = otherId ? memberProfiles[otherId] : undefined;
          const photoUrl = chat?.isGroup
            ? chat?.photoUrl ?? undefined
            : otherProfile?.photoUrl ?? undefined;
          const icon: keyof typeof Ionicons.glyphMap = chat?.isGroup
            ? "people-outline"
            : "chatbubble-outline";
          return (
            <ProfileAvatar
              name={otherProfile?.name ?? chatTitle}
              photoUrl={photoUrl}
              icon={icon}
              size={32}
            />
          );
        })()}
      />
      <View style={styles.messagesWrap}>
        {activeDayLabel ? (
          <Animated.View style={[styles.dayBadge, { opacity: badgeOpacity }]}>
            <Text style={styles.dayBadgeText}>{activeDayLabel}</Text>
          </Animated.View>
        ) : null}
        <FlatList
          ref={listRef}
          key={chatId}
          inverted
          data={chatListData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          onTouchStart={keepComposerFocused}
          onScrollBeginDrag={handleUserScrollStart}
          onMomentumScrollBegin={handleUserScrollStart}
          onScroll={handleScrollActivity}
          onScrollEndDrag={handleScrollPositionSettled}
          onMomentumScrollEnd={handleScrollPositionSettled}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
            const retryIndex = pendingScrollIndexRef.current;
            if (retryIndex == null) return;
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: retryIndex,
                animated: true,
                viewPosition: 0.5,
              });
            }, 80);
          }}
          scrollEventThrottle={16}
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
              const nextLabel = formatDayLabel(separator.date);
              visibleDayLabelRef.current = nextLabel;
              animateBadgeChange(nextLabel);
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
                isSelf={item.message.senderId === currentUserId}
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
                  chat?.isGroup && item.message.senderId !== currentUserId
                    ? memberProfiles[item.message.senderId]?.name ?? "Participante"
                    : undefined
                }
                senderPhotoUrl={
                  chat?.isGroup && item.message.senderId !== currentUserId
                    ? memberProfiles[item.message.senderId]?.photoUrl ?? null
                    : null
                }
                readReceipt={readReceiptStatus(
                  item.message,
                  currentUserId,
                  participants,
                  readUpTo
                )}
                reactions={item.message.reactions}
                currentUserId={currentUserId}
                onReactionPress={handleReactionPress}
                onReactionChipPress={handleReactionChipPress(item.message.id)}
                onReply={handleReplySelect}
                onRetryImage={retryImageMessage}
                highlighted={highlightedMessageId === item.message.id}
                replyAvailable={
                  !item.message.replyTo || messagesById.has(item.message.replyTo.id)
                }
                onQuotedReplyPress={
                  item.message.replyTo && messagesById.has(item.message.replyTo.id)
                    ? () => jumpToMessage(item.message.replyTo!.id)
                    : undefined
                }
                onSenderPress={
                  chat?.isGroup && item.message.senderId !== currentUserId
                    ? () => {
                        router.push({
                          pathname: "/profile",
                          params: { memberId: item.message.senderId },
                        });
                      }
                    : undefined
                }
              />
            );
          }}
        />
        <ReactionsDialog
          visible={reactionsDialogMessageId !== null}
          reactions={dialogReactions}
          currentUserId={currentUserId}
          memberNames={memberNames}
          onRemoveReaction={handleRemoveOwnReaction}
          onClose={closeReactionsDialog}
        />
        {showJumpToLatest ? (
          <Pressable
            accessibilityLabel="Voltar para mensagens atuais"
            accessibilityRole="button"
            onPress={jumpToLatestMessages}
            style={({ pressed }) => [
              styles.jumpToLatestButton,
              pressed ? styles.jumpToLatestButtonPressed : null,
            ]}
          >
            <Ionicons
              name="chevron-down"
              size={24}
              color={theme.primaryForeground}
            />
          </Pressable>
        ) : null}
      </View>
      <ChatInput
        ref={inputRef}
        chatId={chatId}
        replyTo={replyTo}
        onCancelReply={clearReply}
        onSend={jumpToLatestMessages}
        editingMessage={editingMessage}
        onCancelEdit={clearEdit}
      />
    </KeyboardAvoidingView>
      {reactionTarget ? (() => {
        const targetMessage = messagesById.get(reactionTarget.messageId);
        const isOwn =
          targetMessage != null && targetMessage.senderId === currentUserId;
        const canModify =
          targetMessage != null && canModifyMessage(targetMessage);
        const isText = targetMessage?.type === "text";
        const isDeleted = targetMessage?.isDeleted === true;
        const closeAndRun = (fn: () => void) => () => {
          setReactionTarget(null);
          fn();
        };
        return (
          <ReactionMenu
            visible
            targetX={reactionTarget.x}
            targetY={reactionTarget.y}
            targetWidth={reactionTarget.width}
            targetHeight={reactionTarget.height}
            onEmojiSelect={handleQuickEmojiSelect}
            onClose={closeReactionMenu}
            onReply={
              targetMessage && !isDeleted
                ? closeAndRun(() => handleReplySelect(targetMessage))
                : undefined
            }
            onCopy={
              targetMessage && isText && !isDeleted
                ? closeAndRun(() => void handleCopyMessage(targetMessage))
                : undefined
            }
            onEdit={
              targetMessage && isOwn && isText && canModify
                ? closeAndRun(() => handleEditPress(targetMessage))
                : undefined
            }
            onDelete={
              targetMessage && isOwn && canModify
                ? closeAndRun(() => handleDeletePress(targetMessage))
                : undefined
            }
          />
        );
      })() : null}
    </View>
  );
}
