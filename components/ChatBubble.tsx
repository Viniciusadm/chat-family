import { ReactionBubble } from "@/components/ReactionBubble";
import type { Message, Reaction } from "@/types/chat";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AudioBubble } from "./AudioBubble";
import { ImageBubble } from "./ImageBubble";
import { ImageViewer } from "./ImageViewer";
import { ProfileAvatar } from "./ProfileAvatar";
import { QuotedReply } from "./QuotedReply";

interface ChatBubbleProps {
  message: Message;
  isSelf: boolean;
  isOnline: boolean;
  shouldPlay?: boolean;
  nextInSequenceId?: string;
  playbackRate: 1 | 1.5 | 2;
  onRequestPlay: (messageId: string) => void;
  onAudioFinished: (nextMessageId?: string) => void;
  onPlaybackRateChange: (rate: 1 | 1.5 | 2) => void;
  readReceipt?: "loading" | "sent" | "read";
  senderName?: string;
  senderPhotoUrl?: string | null;
  reactions?: Reaction[];
  currentUserId?: string;
  onReactionPress?: (messageId: string, pageX: number, pageY: number, width: number, height: number) => void;
  onReactionChipPress?: () => void;
  onSenderPress?: () => void;
  onReply?: (message: Message) => void;
  onQuotedReplyPress?: () => void;
  onRetryImage?: (message: Message) => void;
  replyAvailable?: boolean;
  highlighted?: boolean;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChatBubbleImpl({
  message,
  isSelf,
  isOnline,
  shouldPlay,
  nextInSequenceId,
  playbackRate,
  onRequestPlay,
  onAudioFinished,
  onPlaybackRateChange,
  readReceipt,
  senderName,
  senderPhotoUrl,
  reactions,
  currentUserId,
  onReactionPress,
  onReactionChipPress,
  onSenderPress,
  onReply,
  onQuotedReplyPress,
  onRetryImage,
  replyAvailable = true,
  highlighted = false,
}: ChatBubbleProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      wrap: {
        flexDirection: "row",
        paddingHorizontal: 12,
        marginBottom: 8,
        gap: 8,
      },
      wrapSelf: {
        justifyContent: "flex-end",
      },
      wrapOther: {
        justifyContent: "flex-start",
        alignItems: "flex-end",
      },
      bubble: {
        borderRadius: 16,
        borderWidth: 2,
        borderColor: "transparent",
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: t.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: t.shadowOpacity * 0.75,
        shadowRadius: 2,
        elevation: 1,
      },
      column: {
        maxWidth: "80%",
      },
      columnSelf: {
        alignItems: "flex-end",
      },
      columnOther: {
        alignItems: "flex-start",
      },
      reactionRow: {
        marginTop: -8,
        zIndex: 1,
      },
      reactionRowSelf: {
        alignItems: "flex-end",
      },
      reactionRowOther: {
        alignItems: "flex-start",
      },
      bubbleSelf: {
        backgroundColor: t.bubbleSelf,
        borderBottomRightRadius: 6,
      },
      bubbleOther: {
        backgroundColor: t.bubbleOther,
        borderBottomLeftRadius: 6,
      },
      bubbleImage: {
        paddingHorizontal: 4,
        paddingVertical: 4,
      },
      bubblePressed: {
        opacity: 0.85,
      },
      bubbleHighlighted: {
        borderColor: t.primary,
      },
      text: {
        fontSize: 15,
        lineHeight: 22,
      },
      textSelf: {
        color: t.bubbleSelfForeground,
      },
      textOther: {
        color: t.bubbleOtherForeground,
      },
      encryptedFallback: {
        fontStyle: "italic",
        opacity: 0.75,
      },
      meta: {
        marginTop: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      },
      metaSelf: {
        alignItems: "flex-end",
        justifyContent: "flex-end",
      },
      metaOther: {
        alignItems: "flex-start",
      },
      timestamp: {
        fontSize: 10,
        color: t.timestamp,
      },
      receiptIconSlot: {
        width: 16,
        alignItems: "center",
        marginLeft: 2,
      },
      senderName: {
        fontSize: 12,
        fontWeight: "600",
        marginBottom: 4,
        color: t.timestamp,
      },
      senderPressed: {
        opacity: 0.72,
      },
    })
  );
  const selfReadReceipt = isSelf ? readReceipt ?? "sent" : undefined;
  const audioSource =
    message.type === "audio"
      ? message.audioLocalUri ?? message.audioRemoteUrl ?? message.audioUrl
      : undefined;
  const audioUnavailableOffline =
    message.type === "audio" && !message.audioLocalUri && !isOnline;
  const isImage = message.type === "image";
  const fullImageUri = isImage
    ? message.imageLocalUri ??
      message.imageRemoteUrl ??
      message.imageUrl ??
      null
    : null;
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const bubbleRef = useRef<View>(null);
  const swipeX = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_, gesture) => {
          swipeX.setValue(Math.min(gesture.dx, 56));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 48) {
            onReply?.(message);
          }
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [message, onReply, swipeX]
  );

  const handleLongPress = () => {
    if (!onReactionPress) return;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      onReactionPress(message.id, x, y, width, height);
    });
  };

  return (
    <View style={[styles.wrap, isSelf ? styles.wrapSelf : styles.wrapOther]}>
      {!isSelf && senderName ? (
        <Pressable
          onPress={onSenderPress}
          disabled={!onSenderPress}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.senderPressed}
        >
          <ProfileAvatar name={senderName} photoUrl={senderPhotoUrl} size={28} />
        </Pressable>
      ) : null}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.column,
          isSelf ? styles.columnSelf : styles.columnOther,
          { transform: [{ translateX: swipeX }] },
        ]}
      >
        <Pressable
          ref={bubbleRef}
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={({ pressed }) => [
            styles.bubble,
            isSelf ? styles.bubbleSelf : styles.bubbleOther,
            isImage ? styles.bubbleImage : null,
            highlighted ? styles.bubbleHighlighted : null,
            pressed ? styles.bubblePressed : null,
          ]}
        >
          {senderName ? (
            <Text
              style={styles.senderName}
              onPress={onSenderPress}
              suppressHighlighting
            >
              {senderName}
            </Text>
          ) : null}
          {message.replyTo ? (
            <QuotedReply
              reply={message.replyTo}
              available={replyAvailable}
              isSelf={isSelf}
              onPress={onQuotedReplyPress}
            />
          ) : null}
          {isImage ? (
            <ImageBubble
              message={message}
              isSelf={isSelf}
              onPress={() => {
                if (fullImageUri) setImageViewerOpen(true);
              }}
              onRetry={
                message.status === "failed"
                  ? () => onRetryImage?.(message)
                  : undefined
              }
            />
          ) : message.type === "audio" && audioUnavailableOffline ? (
            <Text
              style={[
                styles.text,
                isSelf
                  ? styles.textSelf
                  : styles.textOther,
              ]}
            >
              Áudio indisponível offline
            </Text>
          ) : message.type === "audio" && audioSource ? (
            <AudioBubble
              messageId={message.id}
              audioUrl={audioSource}
              audioDuration={message.audioDuration}
              isSelf={isSelf}
              shouldPlay={Boolean(shouldPlay)}
              nextInSequenceId={nextInSequenceId}
              playbackRate={playbackRate}
              onRequestPlay={onRequestPlay}
              onAudioFinished={onAudioFinished}
              onPlaybackRateChange={onPlaybackRateChange}
            />
          ) : message.decryptionFailed ? (
            <Text
              style={[
                styles.text,
                styles.encryptedFallback,
                isSelf ? styles.textSelf : styles.textOther,
              ]}
            >
              Não foi possível decifrar esta mensagem.
            </Text>
          ) : (
            <Text
              style={[
                styles.text,
                isSelf
                  ? styles.textSelf
                  : styles.textOther,
              ]}
            >
              {message.content}
            </Text>
          )}
          <View style={[styles.meta, isSelf ? styles.metaSelf : styles.metaOther]}>
            <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
            {selfReadReceipt ? (
              <View style={styles.receiptIconSlot}>
                <MaterialIcons
                  name={
                    selfReadReceipt === "loading"
                      ? "schedule"
                      : selfReadReceipt === "read"
                        ? "done-all"
                        : "done"
                  }
                  size={14}
                  color={
                    selfReadReceipt === "read" ? theme.primary : theme.timestamp
                  }
                />
              </View>
            ) : null}
          </View>
        </Pressable>
        {reactions && currentUserId && onReactionChipPress ? (
          <View style={[styles.reactionRow, isSelf ? styles.reactionRowSelf : styles.reactionRowOther]}>
            <ReactionBubble
              reactions={reactions}
              currentUserId={currentUserId}
              onPress={onReactionChipPress}
            />
          </View>
        ) : null}
      </Animated.View>
      {isImage ? (
        <ImageViewer
          uri={fullImageUri}
          visible={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
        />
      ) : null}
    </View>
  );
}

export const ChatBubble = React.memo(ChatBubbleImpl);
