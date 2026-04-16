import fs from "node:fs";
import path from "path";
import type { ExpoConfig } from "expo/config";
import type { FirebaseOptions } from "firebase/app";

const ANDROID_PACKAGE = "com.archieapps.chatapp";

function firebaseOptionsFromGoogleServices(packageName: string): FirebaseOptions {
  const filePath = path.join(__dirname, "google-services.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    project_info?: {
      project_number?: string | number;
      project_id?: string;
      storage_bucket?: string;
    };
    client?: Array<{
      client_info?: {
        mobilesdk_app_id?: string;
        android_client_info?: { package_name?: string };
      };
      api_key?: Array<{ current_key?: string }>;
    }>;
  };
  const client = raw.client?.find(
    (c) => c.client_info?.android_client_info?.package_name === packageName,
  );
  const pi = raw.project_info;
  const apiKey = client?.api_key?.[0]?.current_key;
  const appId = client?.client_info?.mobilesdk_app_id;
  const projectId = pi?.project_id;
  const storageBucket = pi?.storage_bucket;
  const projectNumber = pi?.project_number;
  if (!apiKey || !appId || !projectId || !storageBucket || projectNumber == null) {
    throw new Error("google-services.json: missing fields for Firebase config");
  }
  return {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket,
    messagingSenderId: String(projectNumber),
    appId,
  };
}

export default (): ExpoConfig => {
  const firebase = firebaseOptionsFromGoogleServices(ANDROID_PACKAGE);
  return {
    name: "chat",
    slug: "chat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "chat",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.archieapps.chatapp",
    },
    android: {
      package: ANDROID_PACKAGE,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      googleServicesFile: path.join(__dirname, "google-services.json"),
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "expo-notifications",
      [
        "expo-av",
        {
          microphonePermission:
            "Permitir acesso ao microfone para enviar mensagens de voz.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "3c81d144-9377-4842-962f-ce4c62ec61d2",
      },
      firebase,
    },
    owner: "viniciusadm",
  };
};
