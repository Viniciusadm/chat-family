import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { db } from "@/lib/firebase";
import type { MemberDoc } from "@/types/chat";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

export type MemberProfile = {
  id: string;
  name: string;
  photoUrl: string | null;
};

export function useMemberProfiles() {
  const { tenantId, currentUser, firebaseUser } = useAuth();
  const { isOnline } = useConnectivity();
  const [profiles, setProfiles] = useState<Record<string, MemberProfile>>({});

  useEffect(() => {
    const effectiveTenantId = tenantId ?? currentUser?.tenantId ?? null;
    if (!effectiveTenantId) {
      setProfiles({});
      return;
    }

    if (!isOnline || !firebaseUser) {
      if (currentUser) {
        setProfiles({
          [currentUser.id]: {
            id: currentUser.id,
            name: currentUser.name,
            photoUrl: currentUser.photoUrl ?? null,
          },
        });
      }
      return;
    }

    const q = query(
      collection(db, "members"),
      where("tenantId", "==", effectiveTenantId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, MemberProfile> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as MemberDoc;
        map[d.id] = {
          id: d.id,
          name: data.name,
          photoUrl: data.photoUrl ?? null,
        };
      });
      setProfiles(map);
    });

    return () => unsub();
  }, [
    tenantId,
    currentUser?.tenantId,
    currentUser?.id,
    currentUser?.name,
    currentUser?.photoUrl,
    firebaseUser,
    isOnline,
  ]);

  return profiles;
}
