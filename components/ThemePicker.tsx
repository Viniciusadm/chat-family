import { useTheme, type ThemeMode } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

export function ThemePicker() {
  const { mode, setMode, theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      section: { marginTop: 32, alignSelf: "stretch" },
      title: {
        fontSize: 13,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: t.mutedForeground,
        marginBottom: 8,
      },
      group: {
        backgroundColor: t.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.border,
        overflow: "hidden",
      },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      },
      rowLast: { borderBottomWidth: 0 },
      label: { fontSize: 16, color: t.foreground },
      pressed: { opacity: 0.6 },
    })
  );

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Aparência</Text>
      <View style={styles.group}>
        {OPTIONS.map((opt, idx) => {
          const selected = mode === opt.value;
          const isLast = idx === OPTIONS.length - 1;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setMode(opt.value)}
              style={({ pressed }) => [
                styles.row,
                isLast && styles.rowLast,
                pressed && styles.pressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={styles.label}>{opt.label}</Text>
              {selected ? (
                <Ionicons name="checkmark" size={22} color={theme.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
