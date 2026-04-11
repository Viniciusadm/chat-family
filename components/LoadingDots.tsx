import { colors } from "@/theme/colors";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export function LoadingDots() {
  const a1 = useRef(new Animated.Value(0.35)).current;
  const a2 = useRef(new Animated.Value(0.35)).current;
  const a3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.35,
            duration: 350,
            useNativeDriver: true,
          }),
        ])
      );
    const l1 = pulse(a1, 0);
    const l2 = pulse(a2, 150);
    const l3 = pulse(a3, 300);
    l1.start();
    l2.start();
    l3.start();
    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
    };
  }, [a1, a2, a3]);

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, { opacity: a1 }]} />
      <Animated.View style={[styles.dot, { opacity: a2 }]} />
      <Animated.View style={[styles.dot, { opacity: a3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
