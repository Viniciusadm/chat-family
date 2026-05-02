import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Ion = keyof typeof Ionicons.glyphMap;

interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightIcon?: Ion;
  onRightPress?: () => void;
  rightActions?: {
    key: string;
    icon?: Ion;
    content?: ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
  }[];
}

export function AppHeader({
  title,
  onBack,
  rightIcon,
  onRightPress,
  rightActions,
}: AppHeaderProps) {
  const actions =
    rightActions ??
    (rightIcon && onRightPress
      ? [{ key: "right", icon: rightIcon, onPress: onRightPress }]
      : []);

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
        ) : null}

        <View style={styles.titleWrap}>
          <Text
            style={[
              styles.title,
              onBack ? styles.titleWithBack : styles.titleLarge,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={action.onPress}
                accessibilityLabel={action.accessibilityLabel}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.pressed,
                ]}
                hitSlop={8}
              >
                {action.content ??
                  (action.icon ? (
                    <Ionicons
                      name={action.icon}
                      size={22}
                      color={colors.chatHeaderForeground}
                    />
                  ) : null)}
              </Pressable>
            ))}
          </View>
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
    paddingBottom: 10,
    paddingTop: 10,
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
  actions: {
    minWidth: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  titleWrap: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    minHeight: 36,
  },
  title: {
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
