import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  onClear,
  placeholder = "Buscar em mensagens",
}: SearchBarProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      container: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: t.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      },
      field: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        height: 40,
        borderRadius: 999,
        backgroundColor: t.muted,
      },
      input: {
        flex: 1,
        fontSize: 15,
        color: t.foreground,
        paddingVertical: 0,
      },
      clearBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
      },
      clearBtnPressed: {
        opacity: 0.6,
      },
    })
  );

  const handleClear = () => {
    onChangeText("");
    onClear?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Ionicons name="search" size={18} color={theme.mutedForeground} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.inputPlaceholder}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Campo de busca de mensagens"
        />
        {value.length > 0 ? (
          <Pressable
            onPress={handleClear}
            accessibilityLabel="Limpar busca"
            hitSlop={8}
            style={({ pressed }) => [
              styles.clearBtn,
              pressed && styles.clearBtnPressed,
            ]}
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={theme.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
