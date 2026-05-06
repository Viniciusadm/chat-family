import { AppHeader } from "@/components/AppHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Mode = "idle" | "setup" | "change" | "unlock";

const MIN_LENGTH = 8;

export default function EncryptionSettingsScreen() {
  const router = useRouter();
  const {
    currentUser,
    hasBackupPassword,
    backupUnlocked,
    setupBackupPassword,
    changeBackupPassword,
    disableBackupPassword,
    unlockBackupPassword,
    lockBackupPassword,
  } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      screen: {
        flex: 1,
        backgroundColor: t.background,
      },
      content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
      },
      center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      },
      statusBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: t.muted,
        marginBottom: 16,
      },
      statusText: {
        color: t.foreground,
        fontSize: 15,
        fontWeight: "600",
      },
      sub: {
        color: t.mutedForeground,
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 24,
      },
      actions: {
        gap: 12,
      },
      form: {
        gap: 12,
      },
      input: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.inputBorder,
        paddingHorizontal: 14,
        fontSize: 16,
        color: t.foreground,
        backgroundColor: t.background,
      },
      primaryBtn: {
        minHeight: 48,
        borderRadius: 12,
        backgroundColor: t.primary,
        alignItems: "center",
        justifyContent: "center",
      },
      primaryBtnText: {
        color: t.primaryForeground,
        fontSize: 16,
        fontWeight: "700",
      },
      secondaryBtn: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: "center",
        justifyContent: "center",
      },
      secondaryBtnText: {
        color: t.foreground,
        fontSize: 16,
        fontWeight: "600",
      },
      dangerBtn: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: "center",
        justifyContent: "center",
      },
      dangerBtnText: {
        color: t.destructive,
        fontSize: 16,
        fontWeight: "700",
      },
      cancelBtn: {
        paddingVertical: 10,
        alignItems: "center",
      },
      cancelText: {
        color: t.mutedForeground,
        fontSize: 14,
      },
      error: {
        color: t.destructive,
        fontSize: 13,
      },
      pressed: {
        opacity: 0.72,
      },
    })
  );
  const [mode, setMode] = useState<Mode>("idle");
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser || currentUser.role !== "adult") {
    return (
      <ScreenContainer style={styles.screen} edges={["bottom"]}>
        <AppHeader title="Senha de criptografia" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.sub}>Apenas adultos podem configurar.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const reset = () => {
    setOldPassword("");
    setPassword("");
    setConfirm("");
    setError(null);
  };

  const submitSetup = async () => {
    if (password.length < MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setupBackupPassword(password);
      reset();
      setMode("idle");
      Alert.alert("Senha criada", "Suas chaves estão protegidas e foram salvas com backup.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar a senha.");
    } finally {
      setBusy(false);
    }
  };

  const submitChange = async () => {
    if (password.length < MIN_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await changeBackupPassword(oldPassword, password);
      if (result.ok) {
        reset();
        setMode("idle");
        Alert.alert("Senha alterada", "Os backups foram atualizados.");
      } else if (result.reason === "wrong-password") {
        setError("Senha atual incorreta.");
      } else {
        setError("Não foi possível alterar a senha.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao alterar a senha.");
    } finally {
      setBusy(false);
    }
  };

  const submitUnlock = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unlockBackupPassword(password);
      if (result.ok) {
        reset();
        setMode("idle");
      } else if (result.reason === "wrong-password") {
        setError("Senha incorreta.");
      } else {
        setError("Sem senha configurada.");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = () => {
    Alert.alert(
      "Desativar senha",
      "Os backups serão apagados do servidor. Você não poderá restaurar conversas em outro aparelho até criar uma nova senha. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desativar",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await disableBackupPassword();
              } catch (e) {
                Alert.alert("Erro", e instanceof Error ? e.message : "Falha ao desativar.");
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const renderStatus = () => {
    if (!hasBackupPassword) {
      return (
        <View style={styles.statusBox}>
          <Ionicons name="lock-open-outline" size={22} color={theme.mutedForeground} />
          <Text style={styles.statusText}>Sem senha configurada</Text>
        </View>
      );
    }
    return (
      <View style={styles.statusBox}>
        <Ionicons
          name={backupUnlocked ? "shield-checkmark-outline" : "shield-outline"}
          size={22}
          color={backupUnlocked ? theme.primary : theme.mutedForeground}
        />
        <Text style={styles.statusText}>
          Senha configurada{backupUnlocked ? " (desbloqueada nesta sessão)" : ""}
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Senha de criptografia" onBack={() => router.back()} />
      <View style={styles.content}>
        {renderStatus()}
        <Text style={styles.sub}>
          A senha protege o backup das chaves das conversas no servidor. O servidor nunca vê a
          senha nem as chaves abertas. Se esquecer, conversas antigas não poderão ser restauradas
          em outros aparelhos.
        </Text>

        {mode === "idle" ? (
          <View style={styles.actions}>
            {!hasBackupPassword ? (
              <Pressable
                onPress={() => {
                  reset();
                  setMode("setup");
                }}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.primaryBtnText}>Criar senha</Text>
              </Pressable>
            ) : (
              <>
                {!backupUnlocked ? (
                  <Pressable
                    onPress={() => {
                      reset();
                      setMode("unlock");
                    }}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryBtnText}>Desbloquear nesta sessão</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={lockBackupPassword}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryBtnText}>Bloquear agora</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    reset();
                    setMode("change");
                  }}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryBtnText}>Alterar senha</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDisable}
                  disabled={busy}
                  style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.dangerBtnText}>Desativar senha</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={styles.form}>
            {mode === "change" ? (
              <TextInput
                value={oldPassword}
                onChangeText={setOldPassword}
                placeholder="Senha atual"
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                style={styles.input}
              />
            ) : null}
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={mode === "unlock" ? "Senha" : "Nova senha"}
              placeholderTextColor={theme.inputPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={styles.input}
            />
            {mode !== "unlock" ? (
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirmar senha"
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                style={styles.input}
              />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={() => {
                if (mode === "setup") void submitSetup();
                else if (mode === "change") void submitChange();
                else void submitUnlock();
              }}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryBtn,
                (pressed || busy) && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.primaryForeground} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {mode === "setup" ? "Salvar" : mode === "change" ? "Alterar" : "Desbloquear"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                reset();
                setMode("idle");
              }}
              disabled={busy}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
