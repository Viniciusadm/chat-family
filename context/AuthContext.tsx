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
import { fetchExpoPushToken, isValidExpoPushTokenString } from "@/lib/expoPushToken";
import { randomUuid } from "@/lib/randomUuid";
import { SessionRepository } from "@/lib/SessionRepository";
import type { AppUser, LoginCodeDoc, UserDoc } from "@/types/chat";

const DEVICE_ID_KEY = "deviceId";

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
        const done = (value: DocumentSnapshot | null) => {
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isOnline } = useConnectivity();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [deviceApproved, setDeviceApproved] = useState<boolean | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [needsPushToken, setNeedsPushToken] = useState(false);
  const [pushTokenError, setPushTokenError] = useState<string | null>(null);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const deviceIdRef = useRef("");
  const deviceUnsub = useRef<(() => void) | null>(null);
  const signingOutRef = useRef(false);

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

  const attachDeviceSnapshot = useCallback(
    (deviceRef: ReturnType<typeof doc>, uid: string) => {
      if (deviceUnsub.current) deviceUnsub.current();
      deviceUnsub.current = onSnapshot(deviceRef, (snap) => {
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
      });
    },
    []
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
      if (!isOnline) {
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
        await setDoc(deviceRef, mergePayload, { merge: true });
      }

      if (isStale()) return false;

      attachDeviceSnapshot(deviceRef, uid);
      return true;
    },
    [attachDeviceSnapshot, isOnline]
  );

  const retryDeviceRegistration = useCallback(async () => {
    const user = auth.currentUser;
    const activeDeviceId = deviceIdRef.current || deviceId;
    if (!user || !activeDeviceId || !isOnline) return;
    setLoading(true);
    setNeedsPushToken(false);
    setPushTokenError(null);
    const uid = user.uid;
    const stale = () => false;
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) {
      setLoading(false);
      return;
    }
    const userData = userSnap.data() as UserDoc;
    await syncDeviceWithToken(user, uid, userData, activeDeviceId, stale);
  }, [deviceId, isOnline, syncDeviceWithToken]);

  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      signingOutRef.current = false;

      if (!user) {
        if (deviceUnsub.current) deviceUnsub.current();
        deviceUnsub.current = null;
        if (!isOnline) {
          try {
            const cachedSession = await SessionRepository.getLastApprovedSession();
            if (!cancelled && cachedSession) {
              setCurrentUser(cachedSession.currentUser);
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
        setCurrentUser(null);
        setTenantId(null);
        setDeviceApproved(null);
        setSessionReady(true);
        setNeedsPushToken(false);
        setPushTokenError(null);
        setIsOfflineSession(false);
        setLoading(false);
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
          setTenantId(cachedSession.currentUser.tenantId);
          setDeviceApproved(cachedSession.deviceApproved);
          if (cachedSession.deviceApproved === true) {
            setLoading(false);
            setSessionReady(true);
          }
        }

        if (!isOnline) {
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
          if (cachedSession?.deviceApproved === true) {
            setLoading(false);
            setSessionReady(true);
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
        };
        setCurrentUser(appUser);
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
  }, [deviceId, isOnline, syncDeviceWithToken]);

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
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "users", uid), {
      memberId: uid,
      tenantId: tenantRef.id,
      name,
      role: "adult",
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "devices", registrationDeviceId),
      {
        tenantId: tenantRef.id,
        userId: uid,
        approved: true,
        pushToken,
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
    const payload = {
      memberId: d.memberId,
      tenantId: d.tenantId,
      name: d.name,
      role: d.role,
    };
    const childDeviceId = randomUuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, childDeviceId);
    deviceIdRef.current = childDeviceId;
    setDeviceId(childDeviceId);

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
      memberId: payload.memberId,
      tenantId: payload.tenantId,
      name: payload.name,
      role: payload.role,
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "devices", childDeviceId),
      {
        tenantId: payload.tenantId,
        userId: uid,
        approved: false,
        pushToken,
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
