import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useExpoPushToken } from "@/hooks/useExpoPushToken";
import { db } from "@/lib/firebase";
import { isValidExpoPushTokenString } from "@/lib/expoPushToken";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const LAST_ACTIVE_INTERVAL_MS = 60_000;

export function PushTokenSync() {
  const { deviceId, firebaseUser, loading, sessionReady, needsPushToken } = useAuth();
  const { isOnline } = useConnectivity();
  const { token, refresh } = useExpoPushToken();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!isOnline) return;
    refresh();
  }, [isOnline, refresh]);

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
    if (!isOnline || loading || !deviceId || !firebaseUser || !token || !isValidExpoPushTokenString(token)) {
      return;
    }
    updateDoc(doc(db, "devices", deviceId), {
      pushToken: token,
      lastActiveAt: serverTimestamp(),
    }).catch(() => {});
  }, [deviceId, firebaseUser, isOnline, loading, token]);

  useEffect(() => {
    if (!isOnline || loading || !deviceId || !firebaseUser || needsPushToken) return;

    const tick = () => {
      updateDoc(doc(db, "devices", deviceId), {
        lastActiveAt: serverTimestamp(),
      }).catch(() => {});
    };

    const id = setInterval(tick, LAST_ACTIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [deviceId, firebaseUser, isOnline, loading, needsPushToken]);

  return null;
}
