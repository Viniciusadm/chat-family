# Crypto Password Setup — Background + Notificação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o setup/change de senha de criptografia para segundo plano, permitindo que o usuário navegue pela tela enquanto o PBKDF2 roda, recebendo notificação local ao concluir.

**Architecture:** `AuthContext` passa a gerenciar o estado `cryptoInProgress: boolean`; `setupBackupPassword` e `changeBackupPassword` viram fire-and-forget, disparando notificações locais ao terminar. A tela de criptografia exibe uma view de progresso quando `cryptoInProgress` é `true`.

**Tech Stack:** expo-notifications (já instalado), React Context, TypeScript

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/cryptoNotifications.ts` | Criar | Helpers de notificação local para sucesso/erro |
| `context/AuthContext.tsx` | Modificar | Tipo + estado `cryptoInProgress`; funções fire-and-forget |
| `app/(protected)/encryption.tsx` | Modificar | View de progresso; remoção de busy/Alert.alert em setup/change |

---

## Task 1: Criar `lib/cryptoNotifications.ts`

**Files:**
- Create: `lib/cryptoNotifications.ts`

- [ ] **Criar o arquivo com as duas funções de notificação**

```typescript
import * as Notifications from "expo-notifications";

export async function showCryptoSuccessNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Senha configurada",
      body: "Suas chaves estão protegidas e salvas com backup.",
    },
    trigger: null,
  });
}

export async function showCryptoErrorNotification(reason: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Erro ao configurar senha",
      body: reason,
    },
    trigger: null,
  });
}
```

- [ ] **Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros relacionados ao novo arquivo.

- [ ] **Commit**

```bash
git add lib/cryptoNotifications.ts
git commit -m "feat: helpers de notificação local para setup de senha de criptografia"
```

---

## Task 2: Modificar `context/AuthContext.tsx`

**Files:**
- Modify: `context/AuthContext.tsx`

### 2a — Adicionar import

- [ ] **Adicionar import de `cryptoNotifications` no topo do arquivo, junto com os outros imports de lib**

Localizar o bloco de imports (próximo à linha 28–35) e adicionar:

```typescript
import {
  showCryptoSuccessNotification,
  showCryptoErrorNotification,
} from "@/lib/cryptoNotifications";
```

### 2b — Adicionar `cryptoInProgress` ao tipo `AuthContextValue`

- [ ] **Adicionar o campo no tipo, após `hasBackupPassword` (linha ~114)**

Encontrar:
```typescript
  hasBackupPassword: boolean;
  setupBackupPassword: (password: string) => Promise<void>;
  changeBackupPassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: true } | { ok: false; reason: "wrong-password" | "no-settings" }>;
```

Substituir por:
```typescript
  hasBackupPassword: boolean;
  cryptoInProgress: boolean;
  setupBackupPassword: (password: string) => void;
  changeBackupPassword: (oldPassword: string, newPassword: string) => void;
```

### 2c — Adicionar o estado `cryptoInProgress`

- [ ] **Adicionar após a linha `const [needsPasswordRestore, setNeedsPasswordRestore] = useState(false);` (~linha 156)**

```typescript
  const [cryptoInProgress, setCryptoInProgress] = useState(false);
```

### 2d — Reescrever `setupBackupPassword` como fire-and-forget

- [ ] **Substituir a função inteira (~linhas 595–608)**

Encontrar:
```typescript
  const setupBackupPassword = useCallback(
    async (password: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not signed in.");
      if (currentUserRoleRef.current !== "adult") {
        throw new Error("Apenas adultos podem configurar a senha.");
      }
      await setupBackupPasswordImpl(uid, password);
      setHasBackupPassword(true);
      setBackupUnlocked(true);
      setNeedsPasswordRestore(false);
    },
    [],
  );
```

Substituir por:
```typescript
  const setupBackupPassword = useCallback((password: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      void showCryptoErrorNotification("Não autenticado.");
      return;
    }
    if (currentUserRoleRef.current !== "adult") {
      void showCryptoErrorNotification("Apenas adultos podem configurar a senha.");
      return;
    }
    setCryptoInProgress(true);
    void setupBackupPasswordImpl(uid, password)
      .then(() => {
        setHasBackupPassword(true);
        setBackupUnlocked(true);
        setNeedsPasswordRestore(false);
        setCryptoInProgress(false);
        void showCryptoSuccessNotification();
      })
      .catch((e: unknown) => {
        setCryptoInProgress(false);
        void showCryptoErrorNotification(
          e instanceof Error ? e.message : "Falha ao salvar a senha.",
        );
      });
  }, []);
```

### 2e — Reescrever `changeBackupPassword` como fire-and-forget

- [ ] **Substituir a função inteira (~linhas 610–622)**

Encontrar:
```typescript
  const changeBackupPassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not signed in.");
      const result = await changeBackupPasswordImpl(uid, oldPassword, newPassword);
      if (result.ok) {
        setHasBackupPassword(true);
        setBackupUnlocked(true);
      }
      return result;
    },
    [],
  );
```

Substituir por:
```typescript
  const changeBackupPassword = useCallback((oldPassword: string, newPassword: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      void showCryptoErrorNotification("Não autenticado.");
      return;
    }
    setCryptoInProgress(true);
    void changeBackupPasswordImpl(uid, oldPassword, newPassword)
      .then((result) => {
        setCryptoInProgress(false);
        if (result.ok) {
          setHasBackupPassword(true);
          setBackupUnlocked(true);
          void showCryptoSuccessNotification();
        } else if (result.reason === "wrong-password") {
          void showCryptoErrorNotification("Senha atual incorreta.");
        } else {
          void showCryptoErrorNotification("Sem senha configurada.");
        }
      })
      .catch((e: unknown) => {
        setCryptoInProgress(false);
        void showCryptoErrorNotification(
          e instanceof Error ? e.message : "Falha ao alterar a senha.",
        );
      });
  }, []);
```

### 2f — Expor `cryptoInProgress` no provider

- [ ] **Adicionar `cryptoInProgress` ao objeto de value do `<AuthContext.Provider>` (~linha 818), após `hasBackupPassword`**

Encontrar:
```typescript
        hasBackupPassword,
        setupBackupPassword,
```

Substituir por:
```typescript
        hasBackupPassword,
        cryptoInProgress,
        setupBackupPassword,
```

- [ ] **Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Commit**

```bash
git add context/AuthContext.tsx
git commit -m "feat: cryptoInProgress no AuthContext; setup/change de senha viram fire-and-forget"
```

---

## Task 3: Atualizar `app/(protected)/encryption.tsx`

**Files:**
- Modify: `app/(protected)/encryption.tsx`

### 3a — Adicionar `cryptoInProgress` ao destructuring de `useAuth`

- [ ] **Localizar o destructuring de `useAuth()` (~linha 27) e adicionar `cryptoInProgress`**

Encontrar:
```typescript
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
```

Substituir por:
```typescript
  const {
    currentUser,
    hasBackupPassword,
    backupUnlocked,
    cryptoInProgress,
    setupBackupPassword,
    changeBackupPassword,
    disableBackupPassword,
    unlockBackupPassword,
    lockBackupPassword,
  } = useAuth();
```

### 3b — Reescrever `submitSetup` como função síncrona

- [ ] **Substituir a função inteira (~linhas 176–198)**

Encontrar:
```typescript
  const submitSetup = async () => {
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
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
```

Substituir por:
```typescript
  const submitSetup = () => {
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setError(null);
    reset();
    setMode("idle");
    setupBackupPassword(password);
  };
```

### 3c — Reescrever `submitChange` como função síncrona

- [ ] **Substituir a função inteira (~linhas 200–228)**

Encontrar:
```typescript
  const submitChange = async () => {
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
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
```

Substituir por:
```typescript
  const submitChange = () => {
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setError(null);
    reset();
    setMode("idle");
    changeBackupPassword(oldPassword, password);
  };
```

### 3d — Atualizar o `onPress` do botão de submit (remover `void` desnecessário)

- [ ] **Localizar o `onPress` do botão de submit (~linha 404) e simplificar**

Encontrar:
```typescript
              onPress={() => {
                if (mode === "setup") void submitSetup();
                else if (mode === "change") void submitChange();
                else void submitUnlock();
              }}
```

Substituir por:
```typescript
              onPress={() => {
                if (mode === "setup") submitSetup();
                else if (mode === "change") submitChange();
                else void submitUnlock();
              }}
```

### 3e — Adicionar a view de progresso na área de conteúdo

- [ ] **Localizar a abertura da área de conteúdo renderizado (~linha 309) e adicionar a view de progresso antes da condicional existente**

Encontrar:
```typescript
        {mode === "idle" ? (
```

Substituir por:
```typescript
        {cryptoInProgress ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.statusText, { marginTop: 20, textAlign: "center" }]}>
              Configurando sua senha...
            </Text>
            <Text style={[styles.sub, { textAlign: "center", marginTop: 8, marginBottom: 0 }]}>
              Isso pode levar alguns segundos. Você pode sair desta tela, mas não feche o app.
            </Text>
          </View>
        ) : mode === "idle" ? (
```

- [ ] **Fechar o ternário corretamente — localizar o fechamento da condicional existente (~linha 434)**

Encontrar:
```typescript
        )}
      </View>
    </ScreenContainer>
```

Substituir por:
```typescript
        )}
      </View>
    </ScreenContainer>
```

> Nota: o ternário `cryptoInProgress ? ... : mode === "idle" ? ... : ...` fecha automaticamente com o `)}` existente — não é necessário alterar.

- [ ] **Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Commit**

```bash
git add app/\(protected\)/encryption.tsx
git commit -m "feat: tela de criptografia mostra progresso em segundo plano com notificação"
```

---

## Task 4: Teste manual

- [ ] **Iniciar o app e navegar para Configurações → Senha de criptografia**

- [ ] **Criar senha**
  - Tocar "Criar senha"
  - Digitar senha válida nos dois campos
  - Tocar "Salvar"
  - Verificar: tela muda para spinner com texto "Configurando sua senha..."
  - Navegar para outra tela enquanto processa
  - Aguardar notificação local aparecer: título "Senha configurada"
  - Voltar à tela: deve mostrar "Senha configurada (desbloqueada nesta sessão)"

- [ ] **Alterar senha**
  - Tocar "Alterar senha"
  - Preencher campos e tocar "Alterar"
  - Verificar: spinner aparece, pode navegar
  - Notificação "Senha configurada" ao terminar

- [ ] **Senha atual errada (no change)**
  - Tocar "Alterar senha", digitar senha atual errada
  - Verificar: notificação "Erro ao configurar senha" com body "Senha atual incorreta."

- [ ] **Fluxos não alterados continuam funcionando**
  - Desbloquear senha (unlock): spinner no botão como antes
  - Bloquear agora: funciona instantaneamente
  - Desativar senha: confirmação + disable como antes
