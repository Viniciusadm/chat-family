import { useLayoutInsets } from "@/hooks/useLayoutInsets";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

type ScreenContainerProps = {
  children: ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
  behavior?: "padding" | "translate";
  extraBottom?: number;
  style?: StyleProp<ViewStyle>;
};

export function ScreenContainer({
  children,
  edges = ["top", "bottom"],
  behavior = "padding",
  extraBottom = 0,
  style,
}: ScreenContainerProps) {
  const insets = useLayoutInsets();

  if (behavior === "translate") {
    const paddingTop = edges.includes("top") ? insets.top : 0;
    const translateY = -Math.max(
      0,
      insets.keyboard.height - insets.safeArea.bottom
    );
    return (
      <View
        style={[
          { flex: 1, paddingTop },
          { transform: [{ translateY }] },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flex: 1,
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom")
            ? insets.bottom + extraBottom
            : 0,
          paddingLeft: edges.includes("left") ? insets.left : 0,
          paddingRight: edges.includes("right") ? insets.right : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
