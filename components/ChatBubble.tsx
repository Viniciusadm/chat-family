import type { Message } from "@/types/chat";
import { colors } from "@/theme/colors";
import { StyleSheet, Text, View } from "react-native";
import { AudioBubble } from "./AudioBubble";

interface ChatBubbleProps {
  message: Message;
  isSelf: boolean;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatBubble({ message, isSelf }: ChatBubbleProps) {
  return (
    <View
      style={[styles.wrap, isSelf ? styles.wrapSelf : styles.wrapOther]}
    >
      <View
        style={[
          styles.bubble,
          isSelf ? styles.bubbleSelf : styles.bubbleOther,
        ]}
      >
        {message.type === "audio" && message.audioUrl ? (
          <AudioBubble audioUrl={message.audioUrl} isSelf={isSelf} />
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
  },
  wrapSelf: {
    justifyContent: "flex-end",
  },
  wrapOther: {
    justifyContent: "flex-start",
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
  },
  metaSelf: {
    alignItems: "flex-end",
  },
  metaOther: {
    alignItems: "flex-start",
  },
  timestamp: {
    fontSize: 10,
    color: colors.timestamp,
  },
});
