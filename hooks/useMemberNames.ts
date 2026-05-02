import { useMemberProfiles } from "@/hooks/useMemberProfiles";

export function useMemberNames() {
  const profiles = useMemberProfiles();
  return Object.fromEntries(
    Object.entries(profiles).map(([id, profile]) => [id, profile.name])
  );
}
