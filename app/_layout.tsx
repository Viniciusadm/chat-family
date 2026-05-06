import "react-native-get-random-values";

import { NotificationNavigation } from "@/components/NotificationNavigation";
import { PermissionsGate } from "@/components/PermissionsGate";
import { PushTokenSync } from "@/components/PushTokenSync";
import { AuthProvider } from "@/context/AuthContext";
import { registerBackgroundNotificationTask } from "@/lib/backgroundNotifications";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreLogs([
  /\[expo-notifications\] Error thrown while updating the device push token/,
]);

function ThemedChrome() {
  const { theme, resolvedScheme } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);
  return <StatusBar style={resolvedScheme === "dark" ? "light" : "dark"} />;
}

function RootLayoutNav() {
  return (
    <>
      <NotificationNavigation />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </View>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
  });

  useEffect(() => {
    void registerBackgroundNotificationTask();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AuthProvider>
            <PermissionsGate />
            <PushTokenSync />
            <ThemedChrome />
            <RootLayoutNav />
          </AuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
