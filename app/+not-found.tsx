import { ScreenContainer } from "@/components/ScreenContainer";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

export default function NotFoundScreen() {
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      screen: {
        flex: 1,
        backgroundColor: t.muted,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      },
      code: {
        fontSize: 40,
        fontWeight: "700",
        color: t.foreground,
      },
      msg: {
        marginTop: 16,
        fontSize: 18,
        color: t.mutedForeground,
        textAlign: "center",
      },
      link: {
        marginTop: 24,
      },
      linkText: {
        fontSize: 16,
        color: t.primary,
        textDecorationLine: "underline",
      },
    })
  );
  return (
    <ScreenContainer style={styles.screen} edges={["top", "bottom"]}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.msg}>Oops! Página não encontrada</Text>
      <Link href="/" style={styles.link}>
        <Text style={styles.linkText}>Voltar ao início</Text>
      </Link>
    </ScreenContainer>
  );
}
