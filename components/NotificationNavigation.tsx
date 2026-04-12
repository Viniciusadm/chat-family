import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

function openChatFromData(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown> | undefined
) {
  const chatId = data && typeof data.chatId === "string" ? data.chatId : null;
  if (!chatId) return;
  router.push(`/(protected)/chat/${chatId}`);
}

export function NotificationNavigation() {
  const router = useRouter();
  const coldStartHandled = useRef(false);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (coldStartHandled.current || !response) return;
      coldStartHandled.current = true;
      openChatFromData(
        router,
        response.notification.request.content.data as Record<string, unknown>
      );
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openChatFromData(
        router,
        response.notification.request.content.data as Record<string, unknown>
      );
    });

    return () => sub.remove();
  }, [router]);

  return null;
}
