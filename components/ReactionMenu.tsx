import { colors } from "@/theme/colors";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const MENU_HEIGHT = 56;
const GAP = 8;

interface ReactionMenuProps {
  visible: boolean;
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
  onEmojiSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionMenu({
  visible,
  targetX,
  targetY,
  targetWidth,
  targetHeight,
  onEmojiSelect,
  onClose,
}: ReactionMenuProps) {
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

  const { width: screenWidth } = Dimensions.get("window");
  const menuWidth = QUICK_EMOJIS.length * 44 + 16;

  let menuX = targetX + targetWidth / 2 - menuWidth / 2;
  if (menuX < 8) menuX = 8;
  if (menuX + menuWidth > screenWidth - 8) menuX = screenWidth - menuWidth - 8;

  const menuY = targetY - MENU_HEIGHT - GAP;

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
            styles.menu,
            {
              left: menuX,
              top: menuY < 8 ? targetY + targetHeight + GAP : menuY,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
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
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    height: MENU_HEIGHT,
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
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
    backgroundColor: colors.muted,
  },
  emojiText: {
    fontSize: 26,
  },
});
