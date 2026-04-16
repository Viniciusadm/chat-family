import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Ion = keyof typeof Ionicons.glyphMap;

interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightIcon?: Ion;
  onRightPress?: () => void;
}

export function AppHeader({
  title,
  onBack,
  rightIcon,
  onRightPress,
}: AppHeaderProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View style={styles.bar}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.chatHeaderForeground}
            />
          </Pressable>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}

        <Text
          style={[
            styles.title,
            onBack ? styles.titleWithBack : styles.titleLarge,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {rightIcon && onRightPress ? (
          <Pressable
            onPress={onRightPress}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Ionicons
              name={rightIcon}
              size={22}
              color={colors.chatHeaderForeground}
            />
          </Pressable>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.chatHeader,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  iconPlaceholder: {
    width: 36,
    height: 36,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    flex: 1,
    fontWeight: "600",
    color: colors.chatHeaderForeground,
  },
  titleWithBack: {
    fontSize: 18,
  },
  titleLarge: {
    fontSize: 20,
  },
});