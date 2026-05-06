# Crypto Password Setup — Background + Notificação

**Data:** 2026-05-06

## Problema

O PBKDF2 com 600.000 iterações rodando em JS puro (`@noble/hashes`) bloqueia a percepção do usuário por vários segundos ao configurar ou alterar a senha de criptografia. O `asyncTick: 20` já cede o event loop a cada 20ms, então a UI não congela completamente — mas o usuário fica preso na tela sem poder navegar.

## Objetivo

Permitir que o usuário saia da tela de criptografia enquanto o processo roda, recebendo notificação local do sistema ao terminar (sucesso ou erro). O app precisa permanecer aberto; não é necessário suporte a execução com o app fechado.

## Abordagem: Estado no AuthContext + notificações locais

### 1. AuthContext — `cryptoInProgress`

Adicionar campo `cryptoInProgress: boolean` (padrão `false`) ao contexto e ao tipo `AuthContextValue`.

As funções `setupBackupPassword` e `changeBackupPassword` passam a:

1. Setar `cryptoInProgress = true` imediatamente
2. Disparar a operação assíncrona **sem await** (fire-and-forget)
3. `.then()`: atualizar `hasBackupPassword`, `backupUnlocked`, `needsPasswordRestore`, setar `cryptoInProgress = false`, chamar `showCryptoSuccessNotification()`
4. `.catch(e)`: setar `cryptoInProgress = false`, chamar `showCryptoErrorNotification(mensagem)`

`disableBackupPassword` **não** entra nesse fluxo — opera só em deletes do Firebase e é rápido o suficiente para manter o comportamento síncrono atual.

### 2. `lib/cryptoNotifications.ts` (novo arquivo)

```ts
showCryptoSuccessNotification(): Promise<void>
showCryptoErrorNotification(reason: string): Promise<void>
```

- Usam `Notifications.scheduleNotificationAsync({ trigger: null })` — mesmo padrão de `backgroundNotifications.ts`
- Canal Android: `"default"` (já criado em `expoPushToken.ts`)
- Textos:
  - Sucesso: título `"Senha configurada"`, body `"Suas chaves estão protegidas e salvas com backup."`
  - Erro: título `"Erro ao configurar senha"`, body com a mensagem recebida

### 3. Tela `app/(protected)/encryption.tsx`

**Enquanto `cryptoInProgress` é `true`:**
- Substituir formulário/botões por:
  - `ActivityIndicator`
  - `"Configurando sua senha... isso pode levar alguns segundos."`
  - `"Você pode sair desta tela. Não feche o app."` (texto menor, `mutedForeground`)

**Mudanças no `submitSetup` / `submitChange`:**
- Remover `setBusy(true/false)` como controle de fluxo de navegação — `cryptoInProgress` assume esse papel
- Remover o `Alert.alert` de sucesso (substituído pela notificação do sistema)
- Manter validações síncronas (force check, senhas conferem) antes de iniciar

**Estado local `busy` residual:** pode ser mantido apenas para desabilitar o botão de submit durante a validação síncrona inicial (opcional — pode ser removido completamente).

## Fora do escopo

- Execução com app fechado (background task real)
- Barra de progresso com percentual do PBKDF2
- Migração para crypto nativa (`react-native-quick-crypto`)

## Fluxo completo (setup)

```
Usuário digita senha → toca "Salvar"
  → validação síncrona (força + confirmação)
  → cryptoInProgress = true
  → tela mostra spinner + aviso
  → usuário pode navegar para outra tela
  → PBKDF2 + backupAllLocalKeys rodam no JS thread
  → .then(): cryptoInProgress = false, notificação "Senha configurada"
  → .catch(): cryptoInProgress = false, notificação "Erro ao configurar senha"
```
