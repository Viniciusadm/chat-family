import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useConnectivity(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const update = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable === true);
    };
    const unsub = NetInfo.addEventListener(update);

    NetInfo.fetch()
      .then(update)
      .catch(() => {
        setIsOnline(false);
      });

    return unsub;
  }, []);

  return { isOnline };
}
