import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useExpoPushToken } from "@/hooks/useExpoPushToken";
import { isValidExpoPushTokenString } from "@/lib/expoPushToken";
import { heartbeat, updateDevice } from "@/src/api/devices";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const LAST_ACTIVE_INTERVAL_MS = 60_000;

export function PushTokenSync() {
  const { deviceId, currentUser, loading, sessionReady, needsPushToken } = useAuth();
  const { isOnline } = useConnectivity();
  const { token, refresh } = useExpoPushToken();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!isOnline || loading || !sessionReady || needsPushToken) return;
    refresh();
  }, [isOnline, loading, sessionReady, needsPushToken, refresh]);

  useEffect(() => {
    if (!isOnline || loading || !sessionReady || needsPushToken) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        refresh();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [isOnline, loading, sessionReady, needsPushToken, refresh]);

  useEffect(() => {
    if (!isOnline || loading || !deviceId || !currentUser || !token || !isValidExpoPushTokenString(token)) {
      return;
    }
    updateDevice(deviceId, { device_id: deviceId, push_token: token }).catch(() => {});
  }, [currentUser, deviceId, isOnline, loading, token]);

  useEffect(() => {
    if (!isOnline || loading || !deviceId || !currentUser || needsPushToken) return;

    const tick = () => {
      heartbeat(deviceId).catch(() => {});
    };

    const id = setInterval(tick, LAST_ACTIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentUser, deviceId, isOnline, loading, needsPushToken]);

  return null;
}
