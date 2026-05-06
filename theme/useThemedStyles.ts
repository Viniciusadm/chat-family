import { useMemo } from "react";
import { useTheme } from "./ThemeContext";
import type { ThemeTokens } from "./tokens";

export function useThemedStyles<T>(factory: (t: ThemeTokens) => T): T {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
