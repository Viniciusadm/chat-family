import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as authApi from "@/src/api/auth";
import { getDeviceStatus, updateDevice } from "@/src/api/devices";
import { loadStoredTokens, onApiLogout } from "@/src/api/client";
import { realtimeClient } from "@/src/api/realtime";
import { ensureDeviceKeyPair } from "@/lib/deviceIdentity";
import { fetchExpoPushToken, isValidExpoPushTokenString } from "@/lib/expoPushToken";
import { consumePendingKeyShares } from "@/lib/keyDistribution";
import {
  changeBackupPassword as changeBackupPasswordImpl,
  disableBackupPassword as disableBackupPasswordImpl,
  hasPasswordConfigured,
  hasRemoteBackups,
  isBackupUnlockedFor,
  lockBackup as lockBackupImpl,
  restoreBackups as restoreBackupsImpl,
  setupBackupPassword as setupBackupPasswordImpl,
  unlockBackupWithPassword,
  type CryptoProgress,
} from "@/lib/keyBackup";
import { syncChatHistories } from "@/lib/offlineSync";
import { randomUuid } from "@/lib/randomUuid";
import { SessionRepository } from "@/lib/SessionRepository";
import type { AppUser } from "@/types/chat";

const DEVICE_ID_KEY = "deviceId";
const ACCOUNT_DELETED_MESSAGE = "A conta foi apagada.";

async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function userFromApi(user: authApi.ApiUser): AppUser {
  return {
    id: user.member_id,
    tenantId: user.tenant_id,
    name: user.name,
    role: user.role,
  };
}

interface AuthContextValue {
  currentUser: AppUser | null;
  authUserId: string | null;
  tenantId: string | null;
  deviceId: string;
  deviceApproved: boolean | null;
  sessionReady: boolean;
  needsPushToken: boolean;
  pushTokenError: string | null;
  isOfflineSession: boolean;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  loginWithChildCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  retryDeviceRegistration: () => Promise<void>;
  setCurrentUserPhoto: (photoUrl: string | null, photoPath: string | null) => Promise<void>;
  deletedAccountMessage: string | null;
  clearDeletedAccountMessage: () => void;
  backupUnlocked: boolean;
  needsPasswordRestore: boolean;
  hasBackupPassword: boolean;
  cryptoInProgress: boolean;
  cryptoProgress: CryptoProgress | null;
  setupBackupPassword: (password: string) => void;
  changeBackupPassword: (oldPassword: string, newPassword: string) => void;
  disableBackupPassword: () => Promise<void>;
  unlockBackupPassword: (
    password: string,
  ) => Promise<{ ok: true } | { ok: false; reason: "wrong-password" | "no-settings" }>;
  restorePasswordBackups: (
    password: string,
  ) => Promise<
    | { ok: true; restoredChatIds: string[] }
    | { ok: false; reason: "wrong-password" | "no-settings" | "no-backups" }
  >;
  lockBackupPassword: () => void;
  dismissPasswordRestore: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [deviceApproved, setDeviceApproved] = useState<boolean | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [needsPushToken, setNeedsPushToken] = useState(false);
  const [pushTokenError, setPushTokenError] = useState<string | null>(null);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [deletedAccountMessage, setDeletedAccountMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const deviceIdRef = useRef("");
  const [backupUnlocked, setBackupUnlocked] = useState(false);
  const [hasBackupPassword, setHasBackupPassword] = useState(false);
  const [needsPasswordRestore, setNeedsPasswordRestore] = useState(false);
  const [cryptoInProgress, setCryptoInProgress] = useState(false);
  const [cryptoProgress, setCryptoProgress] = useState<CryptoProgress | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);

  const resetSignedOutState = useCallback(() => {
    realtimeClient.stop();
    setCurrentUser(null);
    setAuthUserId(null);
    setTenantId(null);
    setDeviceApproved(null);
    setSessionReady(true);
    setNeedsPushToken(false);
    setPushTokenError(null);
    setIsOfflineSession(false);
    setLoading(false);
    lockBackupImpl();
    setBackupUnlocked(false);
    setHasBackupPassword(false);
    setNeedsPasswordRestore(false);
    setCryptoInProgress(false);
    setRestoreDismissed(false);
  }, []);

  const clearDeletedAccountMessage = useCallback(() => {
    setDeletedAccountMessage(null);
  }, []);

  const evaluatePasswordRestore = useCallback(
    async (uid: string, role: "adult" | "child") => {
      if (role !== "adult") {
        setHasBackupPassword(false);
        setNeedsPasswordRestore(false);
        return;
      }
      const configured = await hasPasswordConfigured(uid).catch(() => false);
      setHasBackupPassword(configured);
      if (!configured) {
        setNeedsPasswordRestore(false);
        return;
      }
      if (isBackupUnlockedFor(uid)) {
        setBackupUnlocked(true);
        setNeedsPasswordRestore(false);
        return;
      }
      const remote = await hasRemoteBackups(uid).catch(() => false);
      setNeedsPasswordRestore(remote && !restoreDismissed);
    },
    [restoreDismissed]
  );

  const establishSession = useCallback(
    async (apiUser: authApi.ApiUser, approved: boolean | null) => {
      const appUser = userFromApi(apiUser);
      setAuthUserId(apiUser.id);
      setCurrentUser(appUser);
      setTenantId(apiUser.tenant_id);
      setDeviceApproved(approved);
      setSessionReady(true);
      setIsOfflineSession(false);
      setLoading(false);
      await SessionRepository.saveSession({
        authUserId: apiUser.id,
        currentUser: appUser,
        deviceApproved: approved,
      });
      if (approved === true) {
        realtimeClient.start();
        void realtimeClient.catchUp();
      }
      void evaluatePasswordRestore(apiUser.id, apiUser.role);
    },
    [evaluatePasswordRestore]
  );

  const refreshPushToken = useCallback(async () => {
    try {
      const token = await fetchExpoPushToken();
      if (!token || !isValidExpoPushTokenString(token)) return null;
      return token;
    } catch (error) {
      setPushTokenError(error instanceof Error ? error.message : "Falha ao obter notificações.");
      return null;
    }
  }, []);

  const devicePayload = useCallback(async () => {
    const [pushToken, keyPair] = await Promise.all([
      refreshPushToken(),
      ensureDeviceKeyPair(),
    ]);
    return {
      push_token: pushToken,
      public_key: keyPair.publicKeyBase64,
    };
  }, [refreshPushToken]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = await getOrCreateDeviceId();
      if (cancelled) return;
      deviceIdRef.current = id;
      setDeviceId(id);

      const tokens = await loadStoredTokens();
      if (!tokens.accessToken) {
        const cached = await SessionRepository.getLastApprovedSession();
        if (cached) {
          setCurrentUser(cached.currentUser);
          setAuthUserId(cached.authUserId);
          setTenantId(cached.currentUser.tenantId);
          setDeviceApproved(cached.deviceApproved);
          setIsOfflineSession(true);
        }
        setSessionReady(true);
        setLoading(false);
        return;
      }

      try {
        const me = await authApi.me();
        await establishSession(me, true);
        const payload = await devicePayload();
        await updateDevice(id, { device_id: id, ...payload }).catch(() => {});
      } catch {
        const cached = await SessionRepository.getLastSession();
        if (cached) {
          setCurrentUser(cached.currentUser);
          setAuthUserId(cached.authUserId);
          setTenantId(cached.currentUser.tenantId);
          setDeviceApproved(cached.deviceApproved);
          setIsOfflineSession(cached.deviceApproved === true);
          setSessionReady(true);
          setLoading(false);
          if (cached.deviceApproved !== true) {
            void getDeviceStatus(id)
              .then((status) => setDeviceApproved(status.approved && status.active))
              .catch(() => {});
          }
        } else {
          resetSignedOutState();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [devicePayload, establishSession, resetSignedOutState]);

  useEffect(() => {
    const unsubscribe = onApiLogout(resetSignedOutState);
    return () => {
      unsubscribe();
    };
  }, [resetSignedOutState]);

  useEffect(() => {
    if (!deviceId || deviceApproved !== false) return;
    let cancelled = false;
    const tick = async () => {
      const status = await getDeviceStatus(deviceId).catch(() => null);
      if (cancelled || !status) return;
      setDeviceApproved(status.approved && status.active);
      if (authUserId) {
        await SessionRepository.updateDeviceApproved(
          authUserId,
          status.approved && status.active,
        ).catch(() => {});
      }
      if (status.approved && status.active) {
        realtimeClient.start();
        void authApi.me().then((me) => establishSession(me, true)).catch(() => {});
      }
    };
    void tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authUserId, deviceApproved, deviceId, establishSession]);

  useEffect(() => {
    if (!deviceId || deviceApproved !== true) return;
    void consumePendingKeyShares(deviceId).then((chatIds) => {
      if (chatIds.length > 0) syncChatHistories(chatIds, true);
    }).catch(() => {});
  }, [deviceApproved, deviceId]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const id = deviceIdRef.current || await getOrCreateDeviceId();
        const payload = await devicePayload();
        const response = await authApi.login({
          email,
          password,
          device_id: id,
          ...payload,
        });
        await establishSession(response.user, true);
      } catch (error) {
        setLoading(false);
        throw error;
      }
    },
    [devicePayload, establishSession]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, name: string) => {
      setLoading(true);
      try {
        const id = deviceIdRef.current || await getOrCreateDeviceId();
        const payload = await devicePayload();
        const response = await authApi.register({
          email,
          password,
          name,
          device_id: id,
          ...payload,
        });
        await establishSession(response.user, true);
      } catch (error) {
        setLoading(false);
        throw error;
      }
    },
    [devicePayload, establishSession]
  );

  const loginWithChildCode = useCallback(
    async (code: string) => {
      setLoading(true);
      try {
        const id = deviceIdRef.current || await getOrCreateDeviceId();
        const payload = await devicePayload();
        const response = await authApi.childLogin({
          code,
          device_id: id,
          ...payload,
        });
        await establishSession(response.user, false);
      } catch (error) {
        setLoading(false);
        throw error;
      }
    },
    [devicePayload, establishSession]
  );

  const logout = useCallback(async () => {
    const uid = authUserId;
    await authApi.logout();
    if (uid) await SessionRepository.deleteSession(uid).catch(() => {});
    resetSignedOutState();
  }, [authUserId, resetSignedOutState]);

  const retryDeviceRegistration = useCallback(async () => {
    if (!deviceId || !currentUser) return;
    const payload = await devicePayload();
    await updateDevice(deviceId, { device_id: deviceId, ...payload }).catch(() => {});
    const status = await getDeviceStatus(deviceId).catch(() => null);
    if (status) setDeviceApproved(status.approved && status.active);
  }, [currentUser, deviceId, devicePayload]);

  const setCurrentUserPhoto = useCallback(
    async (photoUrl: string | null, photoPath: string | null) => {
      if (!currentUser || !authUserId) return;
      const next = { ...currentUser, photoUrl, photoPath };
      setCurrentUser(next);
      await SessionRepository.updateProfilePhoto(authUserId, photoUrl, photoPath);
    },
    [authUserId, currentUser]
  );

  const setupBackupPassword = useCallback((password: string) => {
    if (!authUserId) return;
    setCryptoInProgress(true);
    void setupBackupPasswordImpl(authUserId, password, setCryptoProgress)
      .then(() => {
        setBackupUnlocked(true);
        setHasBackupPassword(true);
        setNeedsPasswordRestore(false);
      })
      .finally(() => setCryptoInProgress(false));
  }, [authUserId]);

  const changeBackupPassword = useCallback((oldPassword: string, newPassword: string) => {
    if (!authUserId) return;
    setCryptoInProgress(true);
    void changeBackupPasswordImpl(authUserId, oldPassword, newPassword, setCryptoProgress)
      .then((result) => {
        if (result.ok) {
          setBackupUnlocked(true);
          setHasBackupPassword(true);
          setNeedsPasswordRestore(false);
        }
      })
      .finally(() => setCryptoInProgress(false));
  }, [authUserId]);

  const disableBackupPassword = useCallback(async () => {
    if (!authUserId) throw new Error("Not signed in.");
    await disableBackupPasswordImpl(authUserId);
    setBackupUnlocked(false);
    setHasBackupPassword(false);
    setNeedsPasswordRestore(false);
  }, [authUserId]);

  const unlockBackupPassword = useCallback(async (password: string) => {
    if (!authUserId) return { ok: false, reason: "no-settings" } as const;
    const result = await unlockBackupWithPassword(authUserId, password);
    if (result.ok) {
      setBackupUnlocked(true);
      setNeedsPasswordRestore(false);
    }
    return result;
  }, [authUserId]);

  const restorePasswordBackups = useCallback(async (password: string) => {
    if (!authUserId) return { ok: false, reason: "no-settings" } as const;
    const result = await restoreBackupsImpl(authUserId, password);
    if (result.ok) {
      setBackupUnlocked(true);
      setNeedsPasswordRestore(false);
    }
    return result;
  }, [authUserId]);

  const lockBackupPassword = useCallback(() => {
    lockBackupImpl();
    setBackupUnlocked(false);
  }, []);

  const dismissPasswordRestore = useCallback(() => {
    setRestoreDismissed(true);
    setNeedsPasswordRestore(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authUserId,
        tenantId,
        deviceId,
        deviceApproved,
        sessionReady,
        needsPushToken,
        pushTokenError,
        isOfflineSession,
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithChildCode,
        logout,
        retryDeviceRegistration,
        setCurrentUserPhoto,
        deletedAccountMessage,
        clearDeletedAccountMessage,
        backupUnlocked,
        needsPasswordRestore,
        hasBackupPassword,
        cryptoInProgress,
        cryptoProgress,
        setupBackupPassword,
        changeBackupPassword,
        disableBackupPassword,
        unlockBackupPassword,
        restorePasswordBackups,
        lockBackupPassword,
        dismissPasswordRestore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
