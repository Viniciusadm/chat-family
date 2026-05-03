import type { MessageReplySnapshot } from "@/types/chat";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ReplyPreviewProps = {
  reply: MessageReplySnapshot;
  onCancel: () => void;
};

export function ReplyPreview({ reply, onCancel }: ReplyPreviewProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.accent} />
      <View style={styles.content}>
        <Text style={styles.sender} numberOfLines={1}>
          {reply.senderName}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {reply.preview}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Cancelar resposta"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onCancel}
        style={({ pressed }) => [
          styles.cancelButton,
          pressed ? styles.cancelButtonPressed : null,
        ]}
      >
        <Ionicons name="close" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    overflow: "hidden",
  },
  accent: {
    alignSelf: "stretch",
    width: 3,
    backgroundColor: colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sender: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  preview: {
    marginTop: 2,
    fontSize: 13,
    color: colors.mutedForeground,
  },
  cancelButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
    borderRadius: 18,
  },
  cancelButtonPressed: {
    backgroundColor: colors.muted,
  },
});
