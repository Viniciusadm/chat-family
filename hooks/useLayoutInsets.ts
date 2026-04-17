import { useEffect, useState } from "react";
import { Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useLayoutInsets() {
  const safe = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboard(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboard(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const totalBottom = Math.max(safe.bottom, keyboard);

  return {
    top: safe.top,
    bottom: totalBottom,
    left: safe.left,
    right: safe.right,
    keyboard: {
      visible: keyboard > 0,
      height: keyboard,
    },
    safeArea: safe,
    totalBottom,
  };
}
