import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export function isValidExpoPushTokenString(value: string): boolean {
  return value.startsWith("ExponentPushToken[");
}

export async function fetchExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const network = await NetInfo.fetch().catch(() => null);
  if (network?.isConnected !== true || network.isInternetReachable !== true) {
    return null;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages-v2", {
      name: "Mensagens",
      importance: Notifications.AndroidImportance.HIGH,
      groupId: "messages",
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== "granted") return null;
  const eas = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  const projectId = eas?.projectId;
  try {
    const t = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined
    );
    return t.data;
  } catch (e) {
    throw new Error(
      `Falha ao obter token de notificação: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
