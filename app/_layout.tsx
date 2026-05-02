import { NotificationNavigation } from "@/components/NotificationNavigation";
import { PushTokenSync } from "@/components/PushTokenSync";
import { AuthProvider } from "@/context/AuthContext";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

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

  if (!fontsLoaded) {
    return null;
  }

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
