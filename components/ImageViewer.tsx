import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ImageViewerProps {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

export function ImageViewer({ uri, visible, onClose }: ImageViewerProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const scaleValue = useRef(MIN_SCALE);
  const translateXValue = useRef(0);
  const translateYValue = useRef(0);

  scale.addListener(({ value }) => {
    scaleValue.current = value;
  });
  translateX.addListener(({ value }) => {
    translateXValue.current = value;
  });
  translateY.addListener(({ value }) => {
    translateYValue.current = value;
  });

  const pinchBaseDistance = useRef(0);
  const pinchBaseScale = useRef(MIN_SCALE);
  const panBaseX = useRef(0);
  const panBaseY = useRef(0);
  const tapTimestamp = useRef(0);

  useEffect(() => {
    if (visible) {
      scale.setValue(MIN_SCALE);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }, [visible, scale, translateX, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) =>
          evt.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponder: (evt, gesture) => {
          if (evt.nativeEvent.touches.length >= 2) return true;
          if (scaleValue.current > MIN_SCALE + 0.01) {
            return Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
          }
          return false;
        },
        onPanResponderGrant: (evt) => {
          pinchBaseScale.current = scaleValue.current;
          panBaseX.current = translateXValue.current;
          panBaseY.current = translateYValue.current;

          if (evt.nativeEvent.touches.length >= 2) {
            const [t1, t2] = evt.nativeEvent.touches;
            pinchBaseDistance.current = Math.hypot(
              t2.pageX - t1.pageX,
              t2.pageY - t1.pageY,
            );
          }
        },
        onPanResponderMove: (evt, gesture) => {
          if (evt.nativeEvent.touches.length >= 2) {
            const [t1, t2] = evt.nativeEvent.touches;
            const distance = Math.hypot(
              t2.pageX - t1.pageX,
              t2.pageY - t1.pageY,
            );
            const ratio = distance / (pinchBaseDistance.current || 1);
            const next = Math.min(
              MAX_SCALE,
              Math.max(MIN_SCALE, pinchBaseScale.current * ratio),
            );
            scale.setValue(next);
          } else if (scaleValue.current > MIN_SCALE + 0.01) {
            translateX.setValue(panBaseX.current + gesture.dx);
            translateY.setValue(panBaseY.current + gesture.dy);
          }
        },
        onPanResponderRelease: (evt, gesture) => {
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          const wasPinch =
            pinchBaseScale.current !== scaleValue.current ||
            evt.nativeEvent.touches.length >= 2;

          if (!wasPinch && dx < 8 && dy < 8) {
            const now = Date.now();
            if (now - tapTimestamp.current < 320 && scaleValue.current <= MIN_SCALE + 0.1) {
              Animated.spring(scale, {
                toValue: DOUBLE_TAP_SCALE,
                useNativeDriver: true,
              }).start();
              tapTimestamp.current = 0;
            } else if (scaleValue.current <= MIN_SCALE + 0.01) {
              onClose();
            }
            tapTimestamp.current = now;
            return;
          }

          if (scaleValue.current <= MIN_SCALE + 0.05) {
            Animated.parallel([
              Animated.spring(scale, {
                toValue: MIN_SCALE,
                useNativeDriver: true,
              }),
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }),
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(scale, {
            toValue: MIN_SCALE,
            useNativeDriver: true,
          }).start();
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [scale, translateX, translateY, onClose],
  );

  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      root: {
        flex: 1,
        backgroundColor: t.viewerBackdrop,
        alignItems: "center",
        justifyContent: "center",
      },
      header: {
        position: "absolute",
        top: insets.top + 12,
        right: 20,
        zIndex: 2,
      },
      close: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.overlayLight,
      },
      image: {
        width: "100%",
        height: "82%",
      },
    }),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Ionicons name="close" size={28} color={theme.primaryForeground} />
          </Pressable>
        </View>
        {uri ? (
          <Animated.View
            {...panResponder.panHandlers}
            style={{
              transform: [
                { translateX },
                { translateY },
                { scale },
              ],
            }}
          >
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              transition={120}
            />
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
