import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
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
import type { AppUser, LoginCodeDoc, MemberDoc, UserDoc } from "@/types/chat";

const DEVICE_ID_KEY = "deviceId";

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

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        setCurrentUser(null);
        setTenantId(null);
        setDeviceApproved(null);
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) {
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
          approved: false,
          pushToken: randomUuid(),
          createdAt: serverTimestamp(),
        });
      }

      if (deviceUnsub.current) deviceUnsub.current();
      deviceUnsub.current = onSnapshot(deviceRef, (snap) => {
        if (snap.exists()) {
          setDeviceApproved(snap.data().approved === true);
        }
        setLoading(false);
      });
    });

    return () => {
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
    type Payload = {
      memberId: string;
      tenantId: string;
      name: string;
      role: "adult" | "child";
    };
    let payload: Payload | null = null;

    if (codeSnap.exists()) {
      const d = codeSnap.data() as LoginCodeDoc;
      payload = {
        memberId: d.memberId,
        tenantId: d.tenantId,
        name: d.name,
        role: d.role,
      };
    }

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    if (!payload) {
      const snap = await getDocs(
        query(collection(db, "members"), where("loginCode", "==", code))
      );
      if (snap.empty) {
        await signOut(auth);
        throw new Error("Código inválido");
      }
      const m = snap.docs[0]!;
      const md = m.data() as MemberDoc;
      payload = {
        memberId: m.id,
        tenantId: md.tenantId,
        name: md.name,
        role: md.role,
      };
    }

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
