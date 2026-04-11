import { useAuth } from "@/context/AuthContext";
import { useExpoPushToken } from "@/hooks/useExpoPushToken";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useEffect } from "react";

export function PushTokenSync() {
  const { deviceId, firebaseUser, loading } = useAuth();
  const { token } = useExpoPushToken();

  useEffect(() => {
    if (loading || !deviceId || !firebaseUser || !token) return;
    updateDoc(doc(db, "devices", deviceId), { pushToken: token }).catch(() => {});
  }, [deviceId, firebaseUser, loading, token]);

  return null;
}
