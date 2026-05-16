import type { ExpoConfig } from "expo/config";

const ANDROID_PACKAGE = "com.archieapps.chatapp";

export default (): ExpoConfig => {
  return {
    name: "Chat Family",
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
        backgroundColor: "#1fa85c",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      softwareKeyboardLayoutMode: "resize",
      predictiveBackGestureEnabled: false,
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
          backgroundColor: "#1fa85c",
          dark: {
            backgroundColor: "#1fa85c",
          },
        },
      ],
      "expo-notifications",
      [
        "expo-audio",
        {
          microphonePermission:
            "Permitir acesso ao microfone para enviar mensagens de voz.",
        },
      ],
      "expo-sqlite",
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Permitir acesso às fotos para enviar imagens no chat.",
          cameraPermission:
            "Permitir acesso à câmera para tirar fotos no chat.",
        },
      ],
      [
        "expo-media-library",
        {
          photosPermission:
            "Permitir salvar as imagens do chat na galeria do aparelho.",
          savePhotosPermission:
            "Permitir salvar as imagens do chat na galeria do aparelho.",
          isAccessMediaLocationEnabled: false,
        },
      ],
      "expo-build-properties",
      "react-native-quick-crypto",
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
    },
    owner: "viniciusadm",
  };
};
