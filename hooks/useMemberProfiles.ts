import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AdminRepository } from "@/lib/AdminRepository";
import { db } from "@/lib/firebase";
import type { AppMember, MemberDoc } from "@/types/chat";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

export type MemberProfile = {
  id: string;
  name: string;
  role: AppMember["role"];
  photoUrl: string | null;
};

function membersToProfiles(members: AppMember[]): Record<string, MemberProfile> {
  return Object.fromEntries(
    members.map((member) => [
      member.id,
      {
        id: member.id,
        name: member.name,
        role: member.role,
        photoUrl: member.photoUrl ?? null,
      },
    ])
  );
}

export function useMemberProfiles() {
  const { tenantId, currentUser, firebaseUser } = useAuth();
  const { isOnline } = useConnectivity();
  const [profiles, setProfiles] = useState<Record<string, MemberProfile>>({});
  const effectiveTenantId = tenantId ?? currentUser?.tenantId ?? null;

  const currentUserProfile = useCallback(() => {
    if (!currentUser) return {};
    return {
      [currentUser.id]: {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        photoUrl: currentUser.photoUrl ?? null,
      },
    };
  }, [currentUser]);

  const loadLocalProfiles = useCallback(
    async (active: () => boolean) => {
      if (!effectiveTenantId) {
        setProfiles({});
        return;
      }

      const members = await AdminRepository.getMembers(effectiveTenantId);
      if (!active()) return;
      setProfiles(
        members.length > 0 ? membersToProfiles(members) : currentUserProfile()
      );
    },
    [currentUserProfile, effectiveTenantId]
  );

  useEffect(() => {
    if (!effectiveTenantId) {
      setProfiles({});
      return;
    }

    let active = true;
    void loadLocalProfiles(() => active);

    const unsubLocal = AdminRepository.subscribe(() => {
      void loadLocalProfiles(() => active);
    });

    if (!isOnline || !firebaseUser) {
      return () => {
        active = false;
        unsubLocal();
      };
    }

    const q = query(
      collection(db, "members"),
      where("tenantId", "==", effectiveTenantId)
    );

    const unsubRemote = onSnapshot(
      q,
      (snap) => {
        const members = snap.docs.map((d): AppMember => {
          const data = d.data() as MemberDoc;
          return {
            id: d.id,
            tenantId: data.tenantId,
            name: data.name,
            role: data.role,
            loginCode: data.loginCode,
            photoUrl: data.photoUrl ?? null,
            photoPath: data.photoPath ?? null,
          };
        });
        void AdminRepository.replaceMembers(effectiveTenantId, members);
      }
    );

    return () => {
      active = false;
      unsubLocal();
      unsubRemote();
    };
  }, [
    effectiveTenantId,
    firebaseUser,
    isOnline,
    loadLocalProfiles,
  ]);

  return profiles;
}
