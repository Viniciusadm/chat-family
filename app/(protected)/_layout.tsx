import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";
import { Redirect, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function ProtectedLayout() {
  const {
    currentUser,
    firebaseUser,
    deviceApproved,
    loading,
    sessionReady,
    needsPushToken,
    needsPasswordRestore,
  } = useAuth();
  const hasApprovedSession = currentUser != null && deviceApproved === true;

  if (loading || (firebaseUser && !sessionReady)) {
    return (
      <View style={styles.center}>
        <LoadingDots />
      </View>
    );
  }

  if (!firebaseUser && !hasApprovedSession) {
    return <Redirect href="/login" />;
  }

  if (needsPushToken) {
    return <Redirect href="/login" />;
  }

  if (deviceApproved === false) {
    return <Redirect href="/aguardando" />;
  }

  if (deviceApproved === true && needsPasswordRestore) {
    return <Redirect href="/encryption-restore" />;
  }

  if (!hasApprovedSession) {
    return (
      <View style={styles.center}>
        <LoadingDots />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
