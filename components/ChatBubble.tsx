import type { Message } from "@/types/chat";
import { colors } from "@/theme/colors";
import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { AudioBubble } from "./AudioBubble";
import { ProfileAvatar } from "./ProfileAvatar";

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
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatBubble({
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
}: ChatBubbleProps) {
  const selfReadReceipt = isSelf ? readReceipt ?? "sent" : undefined;
  const audioSource =
    message.type === "audio"
      ? message.audioLocalUri ?? message.audioRemoteUrl ?? message.audioUrl
      : undefined;
  const audioUnavailableOffline =
    message.type === "audio" && !message.audioLocalUri && !isOnline;

  return (
    <View
      style={[styles.wrap, isSelf ? styles.wrapSelf : styles.wrapOther]}
    >
      {!isSelf && senderName ? (
        <ProfileAvatar name={senderName} photoUrl={senderPhotoUrl} size={28} />
      ) : null}
      <View
        style={[
          styles.bubble,
          isSelf ? styles.bubbleSelf : styles.bubbleOther,
        ]}
      >
        {senderName ? <Text style={styles.senderName}>{senderName}</Text> : null}
        {message.type === "audio" && audioUnavailableOffline ? (
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
                  selfReadReceipt === "read" ? colors.primary : colors.timestamp
                }
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleSelf: {
    backgroundColor: colors.bubbleSelf,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: 6,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  textSelf: {
    color: colors.bubbleSelfForeground,
  },
  textOther: {
    color: colors.bubbleOtherForeground,
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
    color: colors.timestamp,
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
    color: colors.timestamp,
  },
});
