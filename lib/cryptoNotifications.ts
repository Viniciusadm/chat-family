import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const ANDROID_TRIGGER =
  Platform.OS === "android" ? ({ channelId: "messages-v2" } as const) : null;

export async function showCryptoSuccessNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Senha configurada",
        body: "Suas chaves estão protegidas e salvas com backup.",
      },
      trigger: ANDROID_TRIGGER,
    });
  } catch {
    // Notificações são best-effort; falha silenciosa é intencional.
  }
}

export async function showCryptoErrorNotification(reason: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Erro ao configurar senha",
        body: reason,
      },
      trigger: ANDROID_TRIGGER,
    });
  } catch {
    // Notificações são best-effort; falha silenciosa é intencional.
  }
}
