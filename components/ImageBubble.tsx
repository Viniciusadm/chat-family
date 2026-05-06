import { colors } from "@/theme/colors";
import type { Message } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface ImageBubbleProps {
  message: Message;
  isSelf: boolean;
  onPress: () => void;
  onRetry?: () => void;
}

const MAX_BUBBLE_WIDTH = 240;
const DEFAULT_RATIO = 4 / 3;
const MIN_RATIO = 0.6;
const MAX_RATIO = 2.4;

function ImageBubbleImpl({ message, onPress, onRetry }: ImageBubbleProps) {
  const aspect = useMemo(() => {
    if (!message.imageWidth || !message.imageHeight) return DEFAULT_RATIO;
    const raw = message.imageWidth / message.imageHeight;
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RATIO;
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, raw));
  }, [message.imageWidth, message.imageHeight]);

  const height = MAX_BUBBLE_WIDTH / aspect;

  const source =
    message.imageThumbnailLocalUri ??
    message.imageThumbnailUrl ??
    message.imageLocalUri ??
    message.imageRemoteUrl ??
    message.imageUrl;

  const isUploading = message.status === "loading";
  const isFailed = message.status === "failed";

  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, { width: MAX_BUBBLE_WIDTH, height }]}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={message.id}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
      )}

      {isUploading ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.primaryForeground} />
        </View>
      ) : null}

      {isFailed ? (
        <Pressable
          style={styles.errorOverlay}
          onPress={onRetry}
          hitSlop={8}
        >
          <Ionicons
            name="alert-circle"
            size={32}
            color={colors.primaryForeground}
          />
          <Text style={styles.errorText}>Toque para tentar de novo</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const ImageBubble = memo(ImageBubbleImpl);

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.muted,
  },
  placeholder: {
    backgroundColor: colors.muted,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 6,
  },
  errorText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: "600",
  },
});
