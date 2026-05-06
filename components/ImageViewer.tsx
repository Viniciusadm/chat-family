import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

interface ImageViewerProps {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}

export function ImageViewer({ uri, visible, onClose }: ImageViewerProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.root} onPress={onClose}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Ionicons name="close" size={28} color={colors.primaryForeground} />
          </Pressable>
        </View>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            transition={120}
          />
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    position: "absolute",
    top: 48,
    right: 20,
    zIndex: 2,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  image: {
    width: "100%",
    height: "82%",
  },
});
