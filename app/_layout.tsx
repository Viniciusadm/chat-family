import "react-native-get-random-values";

import { NotificationNavigation } from "@/components/NotificationNavigation";
import { PushTokenSync } from "@/components/PushTokenSync";
import { AuthProvider } from "@/context/AuthContext";
import { registerBackgroundNotificationTask } from "@/lib/backgroundNotifications";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreLogs([
  /\[expo-notifications\] Error thrown while updating the device push token/,
]);

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
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthProvider>
          <PushTokenSync />
          <StatusBar style="auto" />
          <RootLayoutNav />
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
