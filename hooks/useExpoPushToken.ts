import * as Notifications from "expo-notifications";
import { fetchExpoPushToken } from "@/lib/expoPushToken";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const inForeground = AppState.currentState === "active";
    if (inForeground) {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
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
