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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { randomUuid } from "@/lib/randomUuid";
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
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  loginWithChildCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [deviceApproved, setDeviceApproved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const deviceUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDeviceId().then((id) => {
      if (!cancelled) setDeviceId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        setCurrentUser(null);
        setTenantId(null);
        setDeviceApproved(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const uid = user.uid;
      const stale = () =>
        cancelled || auth.currentUser?.uid !== uid;

      try {
        const userSnap = await waitForUserDoc(uid, stale);
        if (stale()) return;
        if (!userSnap?.exists()) {
          setLoading(false);
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

        const deviceRef = doc(db, "devices", deviceId);
        const deviceSnap = await getDoc(deviceRef);
        if (!deviceSnap.exists()) {
          await setDoc(deviceRef, {
            tenantId: userData.tenantId,
            userId: user.uid,
            approved: !user.isAnonymous,
            pushToken: randomUuid(),
            createdAt: serverTimestamp(),
          });
        } else if (!user.isAnonymous) {
          await setDoc(
            deviceRef,
            {
              tenantId: userData.tenantId,
              userId: user.uid,
              approved: true,
            },
            { merge: true }
          );
        }

        if (deviceUnsub.current) deviceUnsub.current();
        deviceUnsub.current = onSnapshot(deviceRef, (snap) => {
          if (snap.exists()) {
            setDeviceApproved(snap.data().approved === true);
          }
          setLoading(false);
        });
      } catch (err) {
        console.error("Auth initialization error:", err);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
      if (deviceUnsub.current) deviceUnsub.current();
    };
  }, [deviceId]);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const registerWithEmail = async (email: string, password: string, name: string) => {
    if (!deviceId) throw new Error("Dispositivo ainda a inicializar.");
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

    await setDoc(doc(db, "devices", deviceId), {
      tenantId: tenantRef.id,
      userId: uid,
      approved: true,
      pushToken: randomUuid(),
      createdAt: serverTimestamp(),
    });
  };

  const loginWithChildCode = async (rawCode: string) => {
    if (!deviceId) throw new Error("Dispositivo ainda a inicializar.");
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

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
      memberId: payload.memberId,
      tenantId: payload.tenantId,
      name: payload.name,
      role: payload.role,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "devices", deviceId), {
      tenantId: payload.tenantId,
      userId: uid,
      approved: false,
      pushToken: randomUuid(),
      createdAt: serverTimestamp(),
    });
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
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithChildCode,
        logout,
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
