import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { AdminRepository } from "@/lib/AdminRepository";
import { listMembers } from "@/src/api/members";
import { realtimeClient } from "@/src/api/realtime";
import type { AppMember } from "@/types/chat";
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
  const { tenantId, currentUser } = useAuth();
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

    const refreshRemote = async () => {
      if (!isOnline) return;
      const rows = await listMembers();
      const members = rows.map((data): AppMember => ({
        id: data.id,
        tenantId: effectiveTenantId,
        name: data.name,
        role: data.role,
        loginCode: data.login_code ?? null,
        photoUrl: data.photo_url ?? null,
        photoPath: data.photo_path ?? null,
      }));
      await AdminRepository.replaceMembers(effectiveTenantId, members);
    };
    void refreshRemote();
    const unsubRemote = realtimeClient.subscribe((event) => {
      if (event.type === "member.updated") void refreshRemote();
    });

    return () => {
      active = false;
      unsubLocal();
      unsubRemote();
    };
  }, [effectiveTenantId, isOnline, loadLocalProfiles]);

  return profiles;
}
