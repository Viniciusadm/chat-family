import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function AguardandoScreen() {
  const router = useRouter();
  const { firebaseUser, deviceApproved, loading } = useAuth();

  useEffect(() => {
    if (!loading && deviceApproved === true) {
      router.replace("/");
    }
  }, [deviceApproved, loading, router]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centerOnly]}>
        <LoadingDots />
      </View>
    );
  }

  if (!firebaseUser) {
    return <Redirect href="/login" />;
  }

  if (deviceApproved === true) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.iconWrap}>
        <Ionicons name="time-outline" size={40} color={colors.primary} />
      </View>
      <Text style={styles.title}>Aguardando aprovação do dispositivo</Text>
      <Text style={styles.sub}>
        Peça para um responsável liberar o acesso
      </Text>
      <View style={styles.dots}>
        <LoadingDots />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(31, 168, 92, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    fontSize: 15,
    color: colors.mutedForeground,
    textAlign: "center",
    maxWidth: 280,
  },
  dots: {
    marginTop: 28,
  },
  centerOnly: {
    justifyContent: "center",
  },
});
