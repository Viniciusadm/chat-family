import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface ImagePreviewModalProps {
  visible: boolean;
  uri: string | null;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ImagePreviewModal({
  visible,
  uri,
  sending,
  onCancel,
  onConfirm,
}: ImagePreviewModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Pressable onPress={onCancel} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color={colors.primaryForeground} />
          </Pressable>
        </View>

        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="contain" />
        ) : null}

        <View style={styles.bottomBar}>
          <Text style={styles.hint}>Enviar imagem?</Text>
          <Pressable
            onPress={onConfirm}
            disabled={sending}
            style={({ pressed }) => [
              styles.sendBtn,
              (pressed || sending) && styles.pressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Ionicons name="send" size={22} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  topBar: {
    paddingTop: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  image: {
    flex: 1,
    width: "100%",
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  hint: {
    flex: 1,
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "500",
  },
  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
