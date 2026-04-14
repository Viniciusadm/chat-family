import type { ExpoConfig } from "expo/config";
import fs from "node:fs";
import path from "node:path";

const googleServicesFile = "./google-services.json";
const hasGoogleServices = fs.existsSync(
  path.resolve(process.cwd(), googleServicesFile)
);

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  android: {
    ...config.android,
    ...(hasGoogleServices ? { googleServicesFile } : {}),
  },
  plugins: [
    ...(config.plugins ?? []),
    "expo-notifications",
    [
      "expo-av",
      {
        microphonePermission:
          "Permitir acesso ao microfone para enviar mensagens de voz.",
      },
    ],
  ],
  extra: {
    ...config.extra,
    eas: {
      ...((config.extra as { eas?: { projectId?: string } } | undefined)?.eas ?? {}),
      projectId:
        (config.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
        "3c81d144-9377-4842-962f-ce4c62ec61d2",
    },
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
    },
  },
});
