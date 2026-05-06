import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

interface AttachmentMenuProps {
  visible: boolean;
  onClose: () => void;
  onChooseGallery: () => void;
  onChooseCamera: () => void;
}

export function AttachmentMenu({
  visible,
  onClose,
  onChooseGallery,
  onChooseCamera,
}: AttachmentMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Pressable
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            onPress={() => {
              onClose();
              onChooseCamera();
            }}
          >
            <View
              style={[styles.iconCircle, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="camera" size={24} color={colors.primaryForeground} />
            </View>
            <Text style={styles.optionLabel}>Câmera</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            onPress={() => {
              onClose();
              onChooseGallery();
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#7c3aed" }]}>
              <Ionicons name="image" size={24} color="#ffffff" />
            </View>
            <Text style={styles.optionLabel}>Galeria</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    flexDirection: "row",
    gap: 24,
  },
  option: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  pressed: {
    opacity: 0.72,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
});
