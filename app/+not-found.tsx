import { colors } from "@/theme/colors";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.msg}>Oops! Página não encontrada</Text>
      <Link href="/" style={styles.link}>
        <Text style={styles.linkText}>Voltar ao início</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  code: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.foreground,
  },
  msg: {
    marginTop: 16,
    fontSize: 18,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  link: {
    marginTop: 24,
  },
  linkText: {
    fontSize: 16,
    color: colors.primary,
    textDecorationLine: "underline",
  },
});
