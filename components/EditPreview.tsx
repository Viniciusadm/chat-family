import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type EditPreviewProps = {
  originalText: string;
  onCancel: () => void;
};

export function EditPreview({ originalText, onCancel }: EditPreviewProps) {
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
        backgroundColor: t.accent,
      },
      content: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      },
      textColumn: {
        flex: 1,
      },
      label: {
        fontSize: 12,
        fontWeight: "700",
        color: t.accent,
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
        <Ionicons name="pencil" size={16} color={theme.accent} />
        <View style={styles.textColumn}>
          <Text style={styles.label} numberOfLines={1}>
            Editando mensagem
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {originalText}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Cancelar edição"
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
