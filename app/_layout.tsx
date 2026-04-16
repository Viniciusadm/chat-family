import { NotificationNavigation } from "@/components/NotificationNavigation";
import { PushTokenSync } from "@/components/PushTokenSync";
import { AuthProvider } from "@/context/AuthContext";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

function RootLayoutNav() {
  return (
    <>
      <NotificationNavigation />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </SafeAreaView>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushTokenSync />
        <StatusBar style="auto" />
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
