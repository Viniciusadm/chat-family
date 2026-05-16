import { ScreenContainer } from "@/components/ScreenContainer";
import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ViewMode = "login" | "register";

function registerErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: string }).code;
    if (code === "auth/email-already-in-use") {
      return "Este e-mail já possui uma conta. Faça login ou use outro e-mail.";
    }
    if (code === "permission-denied") {
      return "Não foi possível registrar este aparelho. Saia e tente criar a conta novamente.";
    }
  }
  return e instanceof Error ? e.message : "Erro ao criar conta";
}

export default function LoginScreen() {
  const router = useRouter();
  const {
    currentUser,
    deviceApproved,
    loading,
    sessionReady,
    needsPushToken,
    pushTokenError,
    retryDeviceRegistration,
    logout,
    loginWithEmail,
    registerWithEmail,
    loginWithChildCode,
    deletedAccountMessage,
    clearDeletedAccountMessage,
  } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      loadingScreen: {
        flex: 1,
        backgroundColor: t.background,
        alignItems: "center",
        justifyContent: "center",
      },
      pushGate: {
        flex: 1,
        backgroundColor: t.background,
        paddingHorizontal: 24,
        justifyContent: "center",
        gap: 16,
      },
      pushGateTitle: {
        fontSize: 22,
        fontWeight: "600",
        color: t.foreground,
        textAlign: "center",
      },
      pushGateSub: {
        fontSize: 15,
        color: t.mutedForeground,
        textAlign: "center",
        lineHeight: 22,
      },
      secondaryBtn: {
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
      },
      secondaryBtnText: {
        color: t.foreground,
        fontSize: 16,
        fontWeight: "600",
      },
      textLink: {
        paddingVertical: 12,
        alignItems: "center",
      },
      textLinkLabel: {
        fontSize: 15,
        color: t.mutedForeground,
      },
      screen: {
        flex: 1,
        backgroundColor: t.background,
      },
      scroll: {
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 48,
        paddingBottom: 32,
        width: "100%",
      },
      logoWrap: {
        alignItems: "center",
        marginBottom: 32,
      },
      logoCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: t.primaryTint,
        alignItems: "center",
        justifyContent: "center",
      },
      title: {
        marginTop: 12,
        fontSize: 24,
        fontWeight: "600",
        color: t.foreground,
      },
      form: {
        gap: 12,
        maxWidth: 400,
        width: "100%",
        alignSelf: "center",
      },
      input: {
        borderWidth: 1,
        borderColor: t.inputBorder,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: t.foreground,
        backgroundColor: t.background,
      },
      error: {
        fontSize: 14,
        color: t.destructive,
      },
      primaryBtn: {
        backgroundColor: t.primary,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
      },
      primaryBtnText: {
        color: t.primaryForeground,
        fontSize: 16,
        fontWeight: "600",
      },
      ghostBtn: {
        paddingVertical: 12,
        alignItems: "center",
      },
      ghostBtnText: {
        color: t.mutedForeground,
        fontSize: 16,
      },
      outlineBtn: {
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
      },
      outlineBtnText: {
        color: t.foreground,
        fontSize: 16,
      },
      dividerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginVertical: 4,
      },
      divider: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: t.border,
      },
      dividerText: {
        fontSize: 12,
        color: t.mutedForeground,
      },
      backLink: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginBottom: 4,
      },
      backLinkText: {
        fontSize: 14,
        color: t.mutedForeground,
      },
      pressed: {
        opacity: 0.85,
      },
      btnDisabled: {
        opacity: 0.5,
      },
      modalRoot: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 24,
      },
      modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: t.modalBackdrop,
      },
      modalCard: {
        backgroundColor: t.card,
        borderRadius: 16,
        padding: 20,
        shadowColor: t.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: t.shadowOpacity * 1.5,
        shadowRadius: 12,
        elevation: 8,
      },
      modalTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: t.foreground,
        marginBottom: 16,
      },
      modalHint: {
        fontSize: 12,
        color: t.mutedForeground,
        marginTop: 8,
      },
      modalActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 12,
        marginTop: 20,
      },
      modalGhost: {
        paddingVertical: 10,
        paddingHorizontal: 12,
      },
      modalPrimary: {
        backgroundColor: t.primary,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 18,
      },
    })
  );

  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChildModal, setShowChildModal] = useState(false);
  const [childCode, setChildCode] = useState("");
  const [childError, setChildError] = useState("");

  useEffect(() => {
    if (!deletedAccountMessage) return;
    Alert.alert("", deletedAccountMessage);
    clearDeletedAccountMessage();
  }, [clearDeletedAccountMessage, deletedAccountMessage]);

  useEffect(() => {
    if (loading || !sessionReady || needsPushToken) return;
    if (deviceApproved === false) {
      router.replace("/aguardando");
    } else if (currentUser && deviceApproved === true) {
      router.replace("/");
    }
  }, [
    loading,
    currentUser,
    deviceApproved,
    sessionReady,
    needsPushToken,
    router,
  ]);

  if (loading && !sessionReady) {
    return (
      <ScreenContainer style={styles.loadingScreen} edges={["top", "bottom"]}>
        <LoadingDots />
      </ScreenContainer>
    );
  }

  if (currentUser && sessionReady && needsPushToken) {
    return (
      <ScreenContainer style={styles.pushGate} edges={["top", "bottom"]}>
        <Text style={styles.pushGateTitle}>Notificações necessárias</Text>
        {pushTokenError ? (
          <Text style={styles.pushGateSub}>{pushTokenError}</Text>
        ) : (
          <>
            <Text style={styles.pushGateSub}>
              Ative as notificações para este app nas configurações do sistema e tente novamente.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.primaryBtnText}>Abrir configurações</Text>
            </Pressable>
          </>
        )}
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => retryDeviceRegistration()}
        >
          <Text style={styles.secondaryBtnText}>Tentar novamente</Text>
        </Pressable>
        <Pressable style={styles.textLink} onPress={() => logout()}>
          <Text style={styles.textLinkLabel}>Sair</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  if (loading) {
    return (
      <ScreenContainer style={styles.loadingScreen} edges={["top", "bottom"]}>
        <LoadingDots />
      </ScreenContainer>
    );
  }

  if (currentUser && deviceApproved === true) {
    return <Redirect href="/" />;
  }

  if (currentUser && deviceApproved === false) {
    return <Redirect href="/aguardando" />;
  }

  const switchView = (next: ViewMode) => {
    setError("");
    setView(next);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setError("");
    setBusy(true);
    try {
      await loginWithEmail(email.trim(), password.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setError("");
    setBusy(true);
    try {
      await registerWithEmail(email.trim(), password.trim(), name.trim());
    } catch (e: unknown) {
      setError(registerErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleChildLogin = async () => {
    if (!childCode.trim()) return;
    setChildError("");
    setBusy(true);
    try {
      await loginWithChildCode(childCode.trim());
      setShowChildModal(false);
      setChildCode("");
      router.replace("/aguardando");
    } catch (e: unknown) {
      setChildError(e instanceof Error ? e.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={36}
              color={theme.primary}
            />
          </View>
          <Text style={styles.title}>Família Chat</Text>
        </View>

        {view === "login" ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={theme.inputPlaceholder}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={theme.inputPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={() => void handleLogin()}
              disabled={
                busy || !email.trim() || !password.trim()
              }
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                (busy || !email.trim() || !password.trim()) &&
                  styles.btnDisabled,
              ]}
            >
              <Text style={styles.primaryBtnText}>Entrar</Text>
            </Pressable>
            <Pressable
              onPress={() => switchView("register")}
              disabled={busy}
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.ghostBtnText}>Criar conta</Text>
            </Pressable>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.divider} />
            </View>
            <Pressable
              onPress={() => setShowChildModal(true)}
              disabled={busy}
              style={({ pressed }) => [
                styles.outlineBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.outlineBtnText}>Entrar como criança</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Pressable
              onPress={() => switchView("login")}
              style={styles.backLink}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={theme.mutedForeground}
              />
              <Text style={styles.backLinkText}>Voltar para login</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Seu nome"
              placeholderTextColor={theme.inputPlaceholder}
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={theme.inputPlaceholder}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={theme.inputPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={() => void handleRegister()}
              disabled={
                busy ||
                !name.trim() ||
                !email.trim() ||
                !password.trim()
              }
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                (busy ||
                  !name.trim() ||
                  !email.trim() ||
                  !password.trim()) &&
                  styles.btnDisabled,
              ]}
            >
              <Text style={styles.primaryBtnText}>Criar conta</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showChildModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowChildModal(false);
          setChildError("");
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              setShowChildModal(false);
              setChildError("");
            }}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Entrar como criança</Text>
            <TextInput
              style={styles.input}
              placeholder="Código do usuário"
              placeholderTextColor={theme.inputPlaceholder}
              value={childCode}
              onChangeText={setChildCode}
              autoCapitalize="characters"
            />
            {childError ? (
              <Text style={styles.error}>{childError}</Text>
            ) : null}
            <Text style={styles.modalHint}>
              Peça o código para um responsável
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowChildModal(false);
                  setChildError("");
                }}
                style={({ pressed }) => [
                  styles.modalGhost,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.ghostBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleChildLogin()}
                disabled={busy || !childCode.trim()}
                style={({ pressed }) => [
                  styles.modalPrimary,
                  pressed && styles.pressed,
                  (busy || !childCode.trim()) && styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>Entrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
