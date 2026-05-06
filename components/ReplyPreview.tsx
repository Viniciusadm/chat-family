import type { MessageReplySnapshot } from "@/types/chat";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ReplyPreviewProps = {
  reply: MessageReplySnapshot;
  onCancel: () => void;
};

export function ReplyPreview({ reply, onCancel }: ReplyPreviewProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      wrap: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 12,
        backgroundColor: t.background,
        borderWidth: 1,
        borderColor: t.border,
        marginBottom: 8,
        overflow: "hidden",
      },
      accent: {
        alignSelf: "stretch",
        width: 3,
        backgroundColor: t.primary,
      },
      content: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
      },
      sender: {
        fontSize: 12,
        fontWeight: "700",
        color: t.primary,
      },
      preview: {
        marginTop: 2,
        fontSize: 13,
        color: t.mutedForeground,
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
        backgroundColor: t.muted,
      },
    })
  );
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
        <Ionicons name="close" size={18} color={theme.mutedForeground} />
      </Pressable>
    </View>
  );
}
