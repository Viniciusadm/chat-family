import { getDatabase, withExclusiveWrite } from "@/lib/db";
import type { AppUser } from "@/types/chat";

type SessionRow = {
  auth_user_id: string;
  member_id: string;
  tenant_id: string;
  name: string;
  role: string;
  device_approved: number | null;
  photo_url: string | null;
  photo_path: string | null;
};

export type LocalSession = {
  authUserId: string;
  currentUser: AppUser;
  deviceApproved: boolean | null;
};

function rowToSession(row: SessionRow): LocalSession {
  return {
    authUserId: row.auth_user_id,
    currentUser: {
      id: row.member_id,
      tenantId: row.tenant_id,
      name: row.name,
      role: row.role === "child" ? "child" : "adult",
      photoUrl: row.photo_url,
      photoPath: row.photo_path,
    },
    deviceApproved:
      row.device_approved == null ? null : row.device_approved === 1,
  };
}

export const SessionRepository = {
  async getSession(authUserId: string): Promise<LocalSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT *
       FROM app_sessions
       WHERE auth_user_id = ?`,
      [authUserId]
    );

    return row ? rowToSession(row) : null;
  },

  async getLastApprovedSession(): Promise<LocalSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT *
       FROM app_sessions
       WHERE device_approved = 1
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    return row ? rowToSession(row) : null;
  },

  async getLastSession(): Promise<LocalSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT *
       FROM app_sessions
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    return row ? rowToSession(row) : null;
  },

  async saveSession({
    authUserId,
    currentUser,
    deviceApproved,
  }: {
    authUserId: string;
    currentUser: AppUser;
    deviceApproved: boolean | null;
  }) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `INSERT OR REPLACE INTO app_sessions (
          auth_user_id,
          member_id,
          tenant_id,
          name,
          role,
          device_approved,
          photo_url,
          photo_path,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          authUserId,
          currentUser.id,
          currentUser.tenantId,
          currentUser.name,
          currentUser.role,
          deviceApproved == null ? null : deviceApproved ? 1 : 0,
          currentUser.photoUrl ?? null,
          currentUser.photoPath ?? null,
          new Date().toISOString(),
        ]
      );
    });
  },

  async updateDeviceApproved(
    authUserId: string,
    deviceApproved: boolean | null
  ) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `UPDATE app_sessions
         SET device_approved = ?, updated_at = ?
         WHERE auth_user_id = ?`,
        [
          deviceApproved == null ? null : deviceApproved ? 1 : 0,
          new Date().toISOString(),
          authUserId,
        ]
      );
    });
  },

  async updateProfilePhoto(
    authUserId: string,
    photoUrl: string | null,
    photoPath: string | null
  ) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync(
        `UPDATE app_sessions
         SET photo_url = ?, photo_path = ?, updated_at = ?
         WHERE auth_user_id = ?`,
        [photoUrl, photoPath, new Date().toISOString(), authUserId]
      );
    });
  },

  async deleteSession(authUserId: string) {
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync("DELETE FROM app_sessions WHERE auth_user_id = ?", [
        authUserId,
      ]);
    });
  },
};
