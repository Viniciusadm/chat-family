import { ScreenContainer } from "@/components/ScreenContainer";
import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function AguardandoScreen() {
  const router = useRouter();
  const {
    currentUser,
    deviceApproved,
    loading,
    sessionReady,
    needsPushToken,
  } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      screen: {
        flex: 1,
        backgroundColor: t.muted,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
      },
      iconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: t.primaryTint,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 24,
      },
      title: {
        fontSize: 22,
        fontWeight: "600",
        color: t.foreground,
        textAlign: "center",
        marginBottom: 12,
      },
      sub: {
        fontSize: 15,
        color: t.mutedForeground,
        textAlign: "center",
        maxWidth: 280,
      },
      dots: {
        marginTop: 28,
      },
      centerOnly: {
        justifyContent: "center",
      },
    })
  );
  const hasApprovedSession = currentUser != null && deviceApproved === true;

  useEffect(() => {
    if (!loading && sessionReady && deviceApproved === true) {
      router.replace("/");
    }
  }, [deviceApproved, loading, sessionReady, router]);

  if (loading || (currentUser && !sessionReady)) {
    return (
      <ScreenContainer
        style={[styles.screen, styles.centerOnly]}
        edges={["top", "bottom"]}
      >
        <LoadingDots />
      </ScreenContainer>
    );
  }

  if (!currentUser && !hasApprovedSession) {
    return <Redirect href="/login" />;
  }

  if (needsPushToken) {
    return <Redirect href="/login" />;
  }

  if (deviceApproved === true) {
    return <Redirect href="/" />;
  }

  return (
    <ScreenContainer style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.iconWrap}>
        <Ionicons name="time-outline" size={40} color={theme.primary} />
      </View>
      <Text style={styles.title}>Aguardando aprovação do dispositivo</Text>
      <Text style={styles.sub}>
        Peça para um responsável liberar o acesso
      </Text>
      <View style={styles.dots}>
        <LoadingDots />
      </View>
    </ScreenContainer>
  );
}
