import * as Notifications from "expo-notifications";

export async function showCryptoSuccessNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Senha configurada",
      body: "Suas chaves estão protegidas e salvas com backup.",
    },
    trigger: null,
  });
}

export async function showCryptoErrorNotification(reason: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Erro ao configurar senha",
      body: reason,
    },
    trigger: null,
  });
}
