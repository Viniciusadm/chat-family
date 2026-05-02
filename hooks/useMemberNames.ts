import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import type { MemberDoc } from "@/types/chat";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

export function useMemberNames() {
  const { tenantId, currentUser } = useAuth();
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const effectiveTenantId = tenantId ?? currentUser?.tenantId ?? null;
    if (!effectiveTenantId) {
      setMemberNames({});
      return;
    }

    const q = query(
      collection(db, "members"),
      where("tenantId", "==", effectiveTenantId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as MemberDoc;
        map[d.id] = data.name;
      });
      setMemberNames(map);
    });

    return () => unsub();
  }, [tenantId, currentUser?.tenantId]);

  return memberNames;
}
