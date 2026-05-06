import { requestRecordingPermissionsAsync } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef } from "react";

export function usePermissions(ready: boolean) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!ready || ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      await requestRecordingPermissionsAsync().catch(() => {});
      await ImagePicker.requestCameraPermissionsAsync().catch(() => {});
      await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => {});
    })();
  }, [ready]);
}
