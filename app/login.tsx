import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ViewMode = "login" | "register";

export default function LoginScreen() {
  const router = useRouter();
  const {
    firebaseUser,
    deviceApproved,
    loading,
    loginWithEmail,
    registerWithEmail,
    loginWithChildCode,
  } = useAuth();

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
    if (loading || !firebaseUser) return;
    if (deviceApproved === false) {
      router.replace("/aguardando");
    } else if (deviceApproved === true) {
      router.replace("/");
    }
  }, [loading, firebaseUser, deviceApproved, router]);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <LoadingDots />
      </View>
    );
  }

  if (firebaseUser && deviceApproved === true) {
    return <Redirect href="/" />;
  }

  if (firebaseUser && deviceApproved === false) {
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
      router.replace("/");
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
      router.replace("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar conta");
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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={36}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>Família Chat</Text>
        </View>

        {view === "login" ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={colors.mutedForeground}
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
                color={colors.mutedForeground}
              />
              <Text style={styles.backLinkText}>Voltar para login</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Seu nome"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={colors.mutedForeground}
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
              placeholderTextColor={colors.mutedForeground}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(31, 168, 92, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "600",
    color: colors.foreground,
  },
  form: {
    gap: 12,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  error: {
    fontSize: 14,
    color: colors.destructive,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "600",
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostBtnText: {
    color: colors.mutedForeground,
    fontSize: 16,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  outlineBtnText: {
    color: colors.foreground,
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
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  backLinkText: {
    fontSize: 14,
    color: colors.mutedForeground,
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
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  modalHint: {
    fontSize: 12,
    color: colors.mutedForeground,
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
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
});
