import { colors } from "@/theme/colors";
import type { MessageReplySnapshot } from "@/types/chat";
import { Pressable, StyleSheet, Text, View } from "react-native";

type QuotedReplyProps = {
  reply: MessageReplySnapshot;
  available: boolean;
  isSelf: boolean;
  onPress?: () => void;
};

export function QuotedReply({
  reply,
  available,
  isSelf,
  onPress,
}: QuotedReplyProps) {
  return (
    <Pressable
      disabled={!available || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        isSelf ? styles.wrapSelf : styles.wrapOther,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.accent} />
      <View style={styles.content}>
        {available ? (
          <>
            <Text style={styles.sender} numberOfLines={1}>
              {reply.senderName}
            </Text>
            <Text style={styles.preview} numberOfLines={2}>
              {reply.preview}
            </Text>
          </>
        ) : (
          <Text style={styles.unavailable} numberOfLines={1}>
            Mensagem indisponível
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 180,
    maxWidth: 280,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 8,
  },
  wrapSelf: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  wrapOther: {
    backgroundColor: colors.background,
  },
  accent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sender: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  preview: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedForeground,
  },
  unavailable: {
    fontSize: 13,
    fontStyle: "italic",
    color: colors.mutedForeground,
  },
  pressed: {
    opacity: 0.75,
  },
});
