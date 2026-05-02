import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useConnectivity(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    NetInfo.fetch()
      .then((state) => {
        setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
      })
      .catch(() => {
        setIsOnline(false);
      });

    return unsub;
  }, []);

  return { isOnline };
}
