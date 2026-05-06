import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentSnapshot,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useConnectivity } from "@/hooks/useConnectivity";
import { auth, db } from "@/lib/firebase";
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
import {
  showCryptoSuccessNotification,
  showCryptoErrorNotification,
} from "@/lib/cryptoNotifications";
import { syncChatHistory } from "@/lib/offlineSync";
import { randomUuid } from "@/lib/randomUuid";
import { SecureKeyStore } from "@/lib/secureKeyStore";
import { SessionRepository } from "@/lib/SessionRepository";
import type { AppUser, LoginCodeDoc, UserDoc } from "@/types/chat";

const DEVICE_ID_KEY = "deviceId";
const ACCOUNT_DELETED_MESSAGE = "A conta foi apagada.";
const USER_DOC_WAIT_MS = 8000;

function waitForUserDoc(
  uid: string,
  isStale: () => boolean
): Promise<DocumentSnapshot | null> {
  const userRef = doc(db, "users", uid);
  return getDoc(userRef)
    .catch(() => null)
    .then((first) => {
      if (isStale()) return null;
      if (first?.exists()) return first;
      return new Promise<DocumentSnapshot | null>((resolve) => {
        let unsub: () => void;
        const timeout = setTimeout(() => done(null), USER_DOC_WAIT_MS);
        const done = (value: DocumentSnapshot | null) => {
          clearTimeout(timeout);
          unsub();
          resolve(value);
        };
        unsub = onSnapshot(
          userRef,
          (s) => {
            if (isStale()) {
              done(null);
              return;
            }
            if (s.exists()) {
              done(s);
            }
          },
          () => {
            done(null);
          }
        );
      });
    });
}

async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  currentUser: AppUser | null;
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
  const { isOnline } = useConnectivity();
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
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
  const deviceUnsub = useRef<(() => void) | null>(null);
  const signingOutRef = useRef(false);
  const [backupUnlocked, setBackupUnlocked] = useState(false);
  const [hasBackupPassword, setHasBackupPassword] = useState(false);
  const [needsPasswordRestore, setNeedsPasswordRestore] = useState(false);
  const [cryptoInProgress, setCryptoInProgress] = useState(false);
  const [cryptoProgress, setCryptoProgress] = useState<CryptoProgress | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  const currentUserRoleRef = useRef<"adult" | "child" | null>(null);

  const clearDeletedAccountMessage = useCallback(() => {
    setDeletedAccountMessage(null);
  }, []);

  const resetSignedOutState = useCallback(() => {
    setCurrentUser(null);
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
    currentUserRoleRef.current = null;
  }, []);

  const signOutDeletedAccount = useCallback(async (uid: string) => {
    signingOutRef.current = true;
    if (deviceUnsub.current) {
      deviceUnsub.current();
      deviceUnsub.current = null;
    }
    await SessionRepository.deleteSession(uid);
    setDeletedAccountMessage(ACCOUNT_DELETED_MESSAGE);
    resetSignedOutState();
    await signOut(auth).catch(() => {});
  }, [resetSignedOutState]);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDeviceId().then((id) => {
      if (!cancelled) {
        deviceIdRef.current = id;
        setDeviceId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastImportedKeysFor = useRef<string | null>(null);
  const importPendingKeyShares = useCallback(async (currentDeviceId: string) => {
    if (!currentDeviceId) return;
    if (lastImportedKeysFor.current === currentDeviceId) return;
    lastImportedKeysFor.current = currentDeviceId;
    try {
      const importedChatIds = await consumePendingKeyShares(currentDeviceId);
      for (const chatId of importedChatIds) {
        void syncChatHistory(chatId, true);
      }
    } catch {
      // Permission or transient error; will retry on next listener fire.
      lastImportedKeysFor.current = null;
    }
  }, []);

  const evaluatePasswordRestore = useCallback(
    async (uid: string, role: "adult" | "child") => {
      if (role !== "adult") {
        setHasBackupPassword(false);
        setNeedsPasswordRestore(false);
        return;
      }
      try {
        const configured = await hasPasswordConfigured(uid);
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
        const localChatIds = await SecureKeyStore.listConversationKeyChatIds();
        if (localChatIds.length > 0) {
          setNeedsPasswordRestore(false);
          return;
        }
        const remote = await hasRemoteBackups(uid);
        setNeedsPasswordRestore(remote);
      } catch {
        setNeedsPasswordRestore(false);
      }
    },
    [],
  );

  const attachDeviceSnapshot = useCallback(
    (deviceRef: ReturnType<typeof doc>, uid: string) => {
      if (deviceUnsub.current) deviceUnsub.current();
      deviceUnsub.current = onSnapshot(
        deviceRef,
        (snap) => {
          if (signingOutRef.current) return;
          if (!snap.exists()) {
            setDeviceApproved(null);
            setLoading(false);
            setSessionReady(true);
            setNeedsPushToken(false);
            return;
          }
          const data = snap.data();
          if (data.active === false) {
            const reason = typeof data.deactivationReason === "string"
              ? data.deactivationReason
              : null;
            if (reason === "account-deleted") {
              void signOutDeletedAccount(uid);
              return;
            }
            signingOutRef.current = true;
            if (deviceUnsub.current) {
              deviceUnsub.current();
              deviceUnsub.current = null;
            }
            signOut(auth).catch(() => {});
            return;
          }
          const approved = data.approved === true;
          setDeviceApproved(approved);
          void SessionRepository.updateDeviceApproved(uid, approved);
          setLoading(false);
          setSessionReady(true);
          setNeedsPushToken(false);
          if (approved) {
            void importPendingKeyShares(deviceRef.id);
            void evaluatePasswordRestore(uid, currentUserRoleRef.current ?? "child");
          }
        },
        () => {
          // Offline ou permission denied: mantém o estado restaurado do
          // SessionRepository; o listener é recriado em uma próxima sessão online.
        }
      );
    },
    [evaluatePasswordRestore, importPendingKeyShares, signOutDeletedAccount]
  );

  const syncDeviceWithToken = useCallback(
    async (
      user: FirebaseUser,
      uid: string,
      userData: UserDoc,
      did: string,
      isStale: () => boolean,
      allowOfflineSession = false
    ): Promise<boolean> => {
      if (!isOnlineRef.current) {
        if (allowOfflineSession) {
          setDeviceApproved(true);
          setSessionReady(true);
          setNeedsPushToken(false);
        }
        setLoading(false);
        return false;
      }

      let pushToken: string | null;
      try {
        pushToken = await fetchExpoPushToken();
      } catch (e) {
        if (isStale()) return false;
        if (allowOfflineSession) {
          setDeviceApproved(true);
          setSessionReady(true);
          setNeedsPushToken(false);
          setLoading(false);
          return false;
        }
        setDeviceApproved(null);
        setSessionReady(true);
        setNeedsPushToken(true);
        setPushTokenError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        return false;
      }
      if (isStale()) return false;

      if (!pushToken || !isValidExpoPushTokenString(pushToken)) {
        if (allowOfflineSession) {
          setDeviceApproved(true);
          setSessionReady(true);
          setNeedsPushToken(false);
          setPushTokenError(null);
          setLoading(false);
          return false;
        }
        setDeviceApproved(null);
        setSessionReady(true);
        setNeedsPushToken(true);
        setPushTokenError(null);
        setLoading(false);
        return false;
      }

      const deviceRef = doc(db, "devices", did);
      const deviceSnap = await getDoc(deviceRef);
      if (isStale()) return false;

      const { publicKeyBase64 } = await ensureDeviceKeyPair();
      if (isStale()) return false;

      const basePayload = {
        tenantId: userData.tenantId,
        userId: uid,
        pushToken,
        lastActiveAt: serverTimestamp(),
        sessionAt: serverTimestamp(),
      };

      if (!deviceSnap.exists()) {
        await setDoc(deviceRef, {
          ...basePayload,
          publicKey: publicKeyBase64,
          approved: !user.isAnonymous,
          createdAt: serverTimestamp(),
        });
      } else {
        const mergePayload: Record<string, unknown> = {
          ...basePayload,
        };
        if (!user.isAnonymous) {
          mergePayload.approved = true;
        }
        const existing = deviceSnap.data() as { publicKey?: string };
        if (!existing.publicKey) {
          mergePayload.publicKey = publicKeyBase64;
        }
        await setDoc(deviceRef, mergePayload, { merge: true });
      }

      if (isStale()) return false;

      attachDeviceSnapshot(deviceRef, uid);
      return true;
    },
    [attachDeviceSnapshot]
  );

  const retryDeviceRegistration = useCallback(async () => {
    const user = auth.currentUser;
    const activeDeviceId = deviceIdRef.current || deviceId;
    if (!user || !activeDeviceId || !isOnlineRef.current) return;
    setLoading(true);
    setNeedsPushToken(false);
    setPushTokenError(null);
    const uid = user.uid;
    const stale = () => false;
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) {
      const cachedSession = await SessionRepository.getSession(uid);
      if (cachedSession) {
        await signOutDeletedAccount(uid);
        return;
      }
      setLoading(false);
      return;
    }
    const userData = userSnap.data() as UserDoc;
    await syncDeviceWithToken(user, uid, userData, activeDeviceId, stale);
  }, [deviceId, syncDeviceWithToken]);

  const setCurrentUserPhoto = useCallback(
    async (photoUrl: string | null, photoPath: string | null) => {
      const uid = auth.currentUser?.uid;
      setCurrentUser((user) => {
        if (!user) return user;
        const next = { ...user, photoUrl, photoPath };
        if (uid) {
          void SessionRepository.updateProfilePhoto(uid, photoUrl, photoPath);
        }
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      signingOutRef.current = false;

      if (!user) {
        if (deviceUnsub.current) deviceUnsub.current();
        deviceUnsub.current = null;
        if (!isOnlineRef.current) {
          try {
            const cachedSession = await SessionRepository.getLastApprovedSession();
            if (!cancelled && cachedSession) {
              setCurrentUser(cachedSession.currentUser);
              currentUserRoleRef.current = cachedSession.currentUser.role;
              setTenantId(cachedSession.currentUser.tenantId);
              setDeviceApproved(true);
              setSessionReady(true);
              setNeedsPushToken(false);
              setPushTokenError(null);
              setIsOfflineSession(true);
              setLoading(false);
              return;
            }
          } catch {
            // Fall through to the signed-out state if local session restore fails.
          }
        }
        resetSignedOutState();
        return;
      }

      setIsOfflineSession(false);
      setLoading(true);
      setSessionReady(false);
      setNeedsPushToken(false);
      setPushTokenError(null);

      const uid = user.uid;
      const stale = () =>
        cancelled || auth.currentUser?.uid !== uid;

      try {
        const cachedSession = await SessionRepository.getSession(uid);
        if (!stale() && cachedSession) {
          setCurrentUser(cachedSession.currentUser);
          currentUserRoleRef.current = cachedSession.currentUser.role;
          setTenantId(cachedSession.currentUser.tenantId);
          setDeviceApproved(cachedSession.deviceApproved);
          if (cachedSession.deviceApproved === true) {
            setLoading(false);
            setSessionReady(true);
          }
        }

        if (!isOnlineRef.current) {
          if (cachedSession?.deviceApproved === true) {
            setLoading(false);
            setSessionReady(true);
            return;
          }
          setLoading(false);
          setSessionReady(true);
          return;
        }

        const userSnap = await waitForUserDoc(uid, stale);
        if (stale()) return;
        if (!userSnap?.exists()) {
          if (cachedSession) {
            await signOutDeletedAccount(uid);
            return;
          }
          setLoading(false);
          setSessionReady(true);
          return;
        }
        const userData = userSnap.data() as UserDoc;
        let memberId = userData.memberId ?? user.uid;
        if (userData.memberId === undefined) {
          const memberRef = doc(db, "members", user.uid);
          const memberSnap = await getDoc(memberRef);
          if (!memberSnap.exists()) {
            await setDoc(memberRef, {
              tenantId: userData.tenantId,
              name: userData.name,
              role: userData.role,
              loginCode: null,
              createdAt: serverTimestamp(),
            });
          }
          await setDoc(doc(db, "users", user.uid), { memberId: user.uid }, { merge: true });
          memberId = user.uid;
        }
        if (userData.chatIndexBuiltAt == null) {
          await setDoc(
            doc(db, "users", uid),
            { chatIndexBuiltAt: serverTimestamp() },
            { merge: true }
          );
        }
        const appUser: AppUser = {
          id: memberId,
          tenantId: userData.tenantId,
          name: userData.name,
          role: userData.role,
          photoUrl: userData.photoUrl ?? null,
          photoPath: userData.photoPath ?? null,
        };
        setCurrentUser(appUser);
        currentUserRoleRef.current = appUser.role;
        setTenantId(userData.tenantId);
        await SessionRepository.saveSession({
          firebaseUid: uid,
          currentUser: appUser,
          deviceApproved: cachedSession?.deviceApproved ?? null,
        });

        const activeDeviceId = deviceIdRef.current || deviceId;
        if (!activeDeviceId) {
          setLoading(false);
          setSessionReady(true);
          return;
        }

        await syncDeviceWithToken(
          user,
          uid,
          userData,
          activeDeviceId,
          stale,
          cachedSession?.deviceApproved === true
        );
      } catch (err) {
        console.error("Auth initialization error:", err);
        setLoading(false);
        setSessionReady(true);
      }
    });

    return () => {
      cancelled = true;
      unsub();
      if (deviceUnsub.current) deviceUnsub.current();
    };
  }, [deviceId, resetSignedOutState, signOutDeletedAccount, syncDeviceWithToken]);

  const setupBackupPassword = useCallback((password: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      void showCryptoErrorNotification("Não autenticado.");
      return;
    }
    if (currentUserRoleRef.current !== "adult") {
      void showCryptoErrorNotification("Apenas adultos podem configurar a senha.");
      return;
    }
    setCryptoInProgress(true);
    setCryptoProgress({ phase: "deriving", percent: 0 });
    void setupBackupPasswordImpl(uid, password, setCryptoProgress)
      .then(() => {
        if (auth.currentUser?.uid !== uid) return;
        setHasBackupPassword(true);
        setBackupUnlocked(true);
        setNeedsPasswordRestore(false);
        setCryptoInProgress(false);
        setCryptoProgress(null);
        void showCryptoSuccessNotification();
      })
      .catch((e: unknown) => {
        if (auth.currentUser?.uid !== uid) return;
        setCryptoInProgress(false);
        setCryptoProgress(null);
        void showCryptoErrorNotification(
          e instanceof Error ? e.message : "Falha ao salvar a senha.",
        );
      });
  }, []);

  const changeBackupPassword = useCallback((oldPassword: string, newPassword: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      void showCryptoErrorNotification("Não autenticado.");
      return;
    }
    setCryptoInProgress(true);
    setCryptoProgress({ phase: "deriving", percent: 0 });
    void changeBackupPasswordImpl(uid, oldPassword, newPassword, setCryptoProgress)
      .then((result) => {
        if (auth.currentUser?.uid !== uid) return;
        setCryptoInProgress(false);
        setCryptoProgress(null);
        if (result.ok) {
          setHasBackupPassword(true);
          setBackupUnlocked(true);
          setNeedsPasswordRestore(false);
          void showCryptoSuccessNotification();
        } else if (result.reason === "wrong-password") {
          void showCryptoErrorNotification("Senha atual incorreta.");
        } else {
          void showCryptoErrorNotification("Sem senha configurada.");
        }
      })
      .catch((e: unknown) => {
        if (auth.currentUser?.uid !== uid) return;
        setCryptoInProgress(false);
        setCryptoProgress(null);
        void showCryptoErrorNotification(
          e instanceof Error ? e.message : "Falha ao alterar a senha.",
        );
      });
  }, []);

  const disableBackupPassword = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not signed in.");
    await disableBackupPasswordImpl(uid);
    setHasBackupPassword(false);
    setBackupUnlocked(false);
    setNeedsPasswordRestore(false);
  }, []);

  const unlockBackupPassword = useCallback(async (password: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ok: false, reason: "no-settings" } as const;
    const result = await unlockBackupWithPassword(uid, password);
    if (result.ok) setBackupUnlocked(true);
    return result;
  }, []);

  const restorePasswordBackups = useCallback(async (password: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ok: false, reason: "no-settings" } as const;
    const result = await restoreBackupsImpl(uid, password);
    if (result.ok || (!result.ok && result.reason === "no-backups")) {
      setBackupUnlocked(true);
      setNeedsPasswordRestore(false);
    }
    return result;
  }, []);

  const lockBackupPassword = useCallback(() => {
    lockBackupImpl();
    setBackupUnlocked(false);
  }, []);

  const dismissPasswordRestore = useCallback(() => {
    setRestoreDismissed(true);
    setNeedsPasswordRestore(false);
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const registerWithEmail = async (email: string, password: string, name: string) => {
    if (!deviceIdRef.current && !deviceId) throw new Error("Dispositivo ainda a inicializar.");
    const pushToken = await fetchExpoPushToken();
    if (!pushToken || !isValidExpoPushTokenString(pushToken)) {
      throw new Error("Não foi possível obter token de notificação. Verifique permissões.");
    }
    const registrationDeviceId = randomUuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, registrationDeviceId);
    deviceIdRef.current = registrationDeviceId;
    setDeviceId(registrationDeviceId);

    const { publicKeyBase64 } = await ensureDeviceKeyPair();

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    const tenantRef = await addDoc(collection(db, "tenants"), {
      name: `${name}'s family`,
      ownerId: uid,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "members", uid), {
      tenantId: tenantRef.id,
      name,
      role: "adult",
      loginCode: null,
      photoUrl: null,
      photoPath: null,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "users", uid), {
      memberId: uid,
      tenantId: tenantRef.id,
      name,
      role: "adult",
      photoUrl: null,
      photoPath: null,
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "devices", registrationDeviceId),
      {
        tenantId: tenantRef.id,
        userId: uid,
        approved: true,
        pushToken,
        publicKey: publicKeyBase64,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        sessionAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const loginWithChildCode = async (rawCode: string) => {
    if (!deviceId) throw new Error("Dispositivo ainda a inicializar.");
    const pushToken = await fetchExpoPushToken();
    if (!pushToken || !isValidExpoPushTokenString(pushToken)) {
      throw new Error("Não foi possível obter token de notificação. Verifique permissões.");
    }
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new Error("Informe o código");

    const codeSnap = await getDoc(doc(db, "loginCodes", code));
    if (!codeSnap.exists()) {
      throw new Error("Código inválido");
    }
    const d = codeSnap.data() as LoginCodeDoc;

    const childDeviceId = randomUuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, childDeviceId);
    deviceIdRef.current = childDeviceId;
    setDeviceId(childDeviceId);

    const { publicKeyBase64 } = await ensureDeviceKeyPair();

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
      memberId: d.memberId,
      tenantId: d.tenantId,
      name: d.name,
      role: d.role,
      photoUrl: null,
      photoPath: null,
      createdAt: serverTimestamp(),
    });

    try {
      const memberSnap = await getDoc(doc(db, "members", d.memberId));
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        const photoUrl =
          typeof memberData.photoUrl === "string" ? memberData.photoUrl : null;
        const photoPath =
          typeof memberData.photoPath === "string" ? memberData.photoPath : null;
        if (photoUrl !== null || photoPath !== null) {
          await setDoc(
            doc(db, "users", uid),
            { photoUrl, photoPath },
            { merge: true }
          );
        }
      }
    } catch {}

    await setDoc(
      doc(db, "devices", childDeviceId),
      {
        tenantId: d.tenantId,
        userId: uid,
        approved: false,
        pushToken,
        publicKey: publicKeyBase64,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        sessionAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        currentUser,
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
        needsPasswordRestore: needsPasswordRestore && !restoreDismissed,
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
