import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EMOJI_ROW_HEIGHT = 56;
const ACTIONS_ROW_HEIGHT = 56;
const GAP = 8;

type ActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

interface ReactionMenuProps {
  visible: boolean;
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
  onEmojiSelect: (emoji: string) => void;
  onClose: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
}

export function ReactionMenu({
  visible,
  targetX,
  targetY,
  targetWidth,
  targetHeight,
  onEmojiSelect,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopy,
}: ReactionMenuProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      backdrop: {
        flex: 1,
      },
      container: {
        position: "absolute",
        gap: 8,
      },
      menu: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: 8,
        height: EMOJI_ROW_HEIGHT,
        backgroundColor: t.card,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: t.border,
        shadowColor: t.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: t.shadowOpacity * 1.8,
        shadowRadius: 8,
        elevation: 8,
      },
      emojiButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
      },
      emojiButtonPressed: {
        backgroundColor: t.muted,
      },
      emojiText: {
        fontSize: 26,
      },
      actionsRow: {
        flexDirection: "row",
        alignItems: "stretch",
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 4,
        backgroundColor: t.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: t.border,
        shadowColor: t.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: t.shadowOpacity * 1.4,
        shadowRadius: 6,
        elevation: 6,
      },
      actionButton: {
        flex: 1,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: 14,
      },
      actionButtonPressed: {
        backgroundColor: t.muted,
      },
      actionLabel: {
        fontSize: 11,
        color: t.foreground,
        fontWeight: "500",
        textAlign: "center",
      },
      actionLabelDestructive: {
        color: t.destructive,
      },
    })
  );
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.5);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 200,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  const actions: ActionItem[] = [];
  if (onReply) {
    actions.push({
      key: "reply",
      label: "Responder",
      icon: "arrow-undo-outline",
      onPress: onReply,
    });
  }
  if (onCopy) {
    actions.push({
      key: "copy",
      label: "Copiar",
      icon: "copy-outline",
      onPress: onCopy,
    });
  }
  if (onEdit) {
    actions.push({
      key: "edit",
      label: "Editar",
      icon: "pencil-outline",
      onPress: onEdit,
    });
  }
  if (onDelete) {
    actions.push({
      key: "delete",
      label: "Apagar",
      icon: "trash-outline",
      onPress: onDelete,
      destructive: true,
    });
  }

  const { width: screenWidth } = Dimensions.get("window");
  const menuWidth = QUICK_EMOJIS.length * 44 + 16;

  let menuX = targetX + targetWidth / 2 - menuWidth / 2;
  if (menuX < 8) menuX = 8;
  if (menuX + menuWidth > screenWidth - 8) menuX = screenWidth - menuWidth - 8;

  const totalHeight =
    EMOJI_ROW_HEIGHT + (actions.length > 0 ? ACTIONS_ROW_HEIGHT + 8 : 0);
  const aboveY = targetY - totalHeight - GAP;
  const containerY = aboveY < 8 ? targetY + targetHeight + GAP : aboveY;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.container,
            {
              left: menuX,
              top: containerY,
              opacity,
              transform: [{ scale }],
              width: menuWidth,
            },
          ]}
        >
          <View style={styles.menu}>
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onEmojiSelect(emoji)}
                style={({ pressed }) => [
                  styles.emojiButton,
                  pressed ? styles.emojiButtonPressed : null,
                ]}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {actions.length > 0 ? (
            <View style={styles.actionsRow}>
              {actions.map((action) => (
                <Pressable
                  key={action.key}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed ? styles.actionButtonPressed : null,
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={20}
                    color={
                      action.destructive ? theme.destructive : theme.foreground
                    }
                  />
                  <Text
                    style={[
                      styles.actionLabel,
                      action.destructive ? styles.actionLabelDestructive : null,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
