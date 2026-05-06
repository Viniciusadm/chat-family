import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export function PermissionsGate() {
  const { sessionReady, needsPushToken } = useAuth();
  const ready = sessionReady && !needsPushToken;

  usePermissions(ready);

  return null;
}
