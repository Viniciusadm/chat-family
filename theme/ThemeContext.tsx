import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, type ThemeTokens } from "./tokens";

const STORAGE_KEY = "themeMode";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedScheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeTokens;
  mode: ThemeMode;
  resolvedScheme: ResolvedScheme;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const osScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(STORAGE_KEY, m);
  };

  const resolvedScheme: ResolvedScheme =
    mode === "system" ? (osScheme === "dark" ? "dark" : "light") : mode;

  const theme = resolvedScheme === "dark" ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, resolvedScheme, setMode }),
    [theme, mode, resolvedScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
