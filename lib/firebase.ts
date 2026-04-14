import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const rnAuth = require("@firebase/auth/dist/rn/index.js") as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

const extra = Constants.expoConfig?.extra as { firebase?: FirebaseOptions } | undefined;
const firebaseConfig = extra?.firebase;
if (!firebaseConfig?.apiKey) {
  throw new Error("Firebase config missing in expo extra.firebase");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: rnAuth.getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { app, auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "southamerica-east1");
