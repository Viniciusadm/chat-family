import * as Notifications from "expo-notifications";
import { fetchExpoPushToken } from "@/lib/expoPushToken";
import { useCallback, useEffect, useState } from "react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useExpoPushToken() {
  const [token, setToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const t = await fetchExpoPushToken();
    setToken(t);
    return t;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { token, refresh };
}
