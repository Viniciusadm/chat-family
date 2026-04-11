import { AppHeader } from "@/components/AppHeader";
import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { useAdminData } from "@/hooks/useAdminData";
import type { Chat, UserRole } from "@/types/chat";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminScreen() {
  const router = useRouter();
  const { currentUser, firebaseUser, logout } = useAuth();
  if (
    currentUser?.role !== "adult" ||
    !firebaseUser ||
    firebaseUser.isAnonymous
  ) {
    return <Redirect href="/" />;
  }

  const {
    members,
    sessionUserNames,
    pendingDevices,
    chats,
    loading,
    addUser,
    approveDevice,
    rejectDevice,
    createChat,
    updateChat,
    deleteChat,
  } = useAdminData();

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("child");
  const [addParticipantError, setAddParticipantError] = useState("");

  const [showCreateChat, setShowCreateChat] = useState(false);
  const [chatName, setChatName] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    []
  );

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatName, setEditChatName] = useState("");
  const [editChatParticipants, setEditChatParticipants] = useState<string[]>(
    []
  );

  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  const copyLoginCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert("", "Código copiado");
  };

  const handleAddUser = async () => {
    if (!newUserName.trim()) return;
    setAddParticipantError("");
    try {
      await addUser(newUserName.trim(), newUserRole);
      setNewUserName("");
      setNewUserRole("child");
      setShowAddUser(false);
    } catch (e: unknown) {
      setAddParticipantError(
        e instanceof Error ? e.message : "Erro ao criar participante"
      );
    }
  };

  const toggleParticipant = (userId: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleEditParticipant = (userId: string) => {
    setEditChatParticipants((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateChat = async () => {
    if (selectedParticipants.length < 2) return;
    const name =
      chatName.trim() ||
      selectedParticipants
        .map((id) => members.find((m) => m.id === id)?.name)
        .filter(Boolean)
        .join(", ");
    await createChat(name, selectedParticipants);
    setChatName("");
    setSelectedParticipants([]);
    setShowCreateChat(false);
  };

  const openEditChat = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditChatName(chat.name);
    setEditChatParticipants([...chat.participants]);
  };

  const handleUpdateChat = async () => {
    if (!editingChatId || editChatParticipants.length < 2) return;
    const name =
      editChatName.trim() ||
      editChatParticipants
        .map((id) => members.find((m) => m.id === id)?.name)
        .filter(Boolean)
        .join(", ");
    await updateChat(editingChatId, name, editChatParticipants);
    setEditingChatId(null);
  };

  const handleConfirmDeleteChat = async () => {
    if (!chatToDelete) return;
    await deleteChat(chatToDelete.id);
    setChatToDelete(null);
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Gerenciamento"
        onBack={() => router.back()}
        rightIcon="log-out-outline"
        onRightPress={() => void logout()}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <View style={{ height: 16 }} />
          <LoadingDots />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <SectionTitle icon="people-outline" label="Participantes" />
          {members.map((member) => (
            <View key={member.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.avatar}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{member.name}</Text>
                  {member.loginCode ? (
                    <View style={styles.codeRow}>
                      <Text style={styles.codeText}>{member.loginCode}</Text>
                      <Pressable
                        onPress={() => void copyLoginCode(member.loginCode!)}
                        hitSlop={8}
                        style={({ pressed }) => pressed && styles.pressed}
                      >
                        <Ionicons
                          name="copy-outline"
                          size={18}
                          color={colors.mutedForeground}
                        />
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.cardMeta}>Conta com e-mail</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.badge,
                    member.role === "adult"
                      ? styles.badgeAdult
                      : styles.badgeChild,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      member.role === "adult" && styles.badgeTextAdult,
                    ]}
                  >
                    {member.role === "adult" ? "Adulto" : "Criança"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          <Pressable
            onPress={() => setShowAddUser(true)}
            style={({ pressed }) => [
              styles.outlineBtn,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.foreground} />
            <Text style={styles.outlineBtnText}>Adicionar participante</Text>
          </Pressable>

          <SectionTitle icon="phone-portrait-outline" label="Dispositivos pendentes" />
          {pendingDevices.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Nenhum dispositivo pendente</Text>
            </View>
          ) : (
            pendingDevices.map((device) => {
              const ownerName = sessionUserNames[device.userId];
              return (
                <View key={device.id} style={styles.card}>
                  <View style={styles.deviceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {ownerName ?? "Dispositivo desconhecido"}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {device.id.slice(0, 8)}… ·{" "}
                        {formatTime(device.createdAt)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void approveDevice(device.id)}
                      style={styles.iconAct}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={28}
                        color={colors.primary}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => void rejectDevice(device.id)}
                      style={styles.iconAct}
                    >
                      <Ionicons
                        name="close-circle"
                        size={28}
                        color={colors.destructive}
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          <SectionTitle icon="chatbubbles-outline" label="Conversas" />
          {chats.map((chat) => (
            <View key={chat.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.avatar}>
                  <Ionicons
                    name="chatbubble-outline"
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{chat.name}</Text>
                  <Text style={styles.cardMeta}>
                    {chat.participants.length} membros
                  </Text>
                </View>
                <Pressable
                  onPress={() => openEditChat(chat)}
                  style={styles.iconAct}
                >
                  <Ionicons
                    name="pencil-outline"
                    size={22}
                    color={colors.primary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setChatToDelete(chat)}
                  style={styles.iconAct}
                >
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color={colors.destructive}
                  />
                </Pressable>
              </View>
            </View>
          ))}
          <Pressable
            onPress={() => setShowCreateChat(true)}
            style={({ pressed }) => [
              styles.outlineBtn,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.foreground} />
            <Text style={styles.outlineBtnText}>Criar conversa</Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={showAddUser} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              setShowAddUser(false);
              setAddParticipantError("");
            }}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adicionar participante</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome"
              placeholderTextColor={colors.mutedForeground}
              value={newUserName}
              onChangeText={setNewUserName}
            />
            <Text style={styles.fieldLabel}>Papel</Text>
            <View style={styles.roleRow}>
              <Pressable
                onPress={() => setNewUserRole("child")}
                style={[
                  styles.roleChip,
                  newUserRole === "child" && styles.roleChipOn,
                ]}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    newUserRole === "child" && styles.roleChipTextOn,
                  ]}
                >
                  Criança
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setNewUserRole("adult")}
                style={[
                  styles.roleChip,
                  newUserRole === "adult" && styles.roleChipOn,
                ]}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    newUserRole === "adult" && styles.roleChipTextOn,
                  ]}
                >
                  Adulto
                </Text>
              </Pressable>
            </View>
            {addParticipantError ? (
              <Text style={styles.error}>{addParticipantError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowAddUser(false);
                  setAddParticipantError("");
                }}
                style={styles.modalGhost}
              >
                <Text style={styles.ghostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleAddUser()}
                disabled={!newUserName.trim()}
                style={[
                  styles.modalPrimary,
                  !newUserName.trim() && styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryText}>Criar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreateChat} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowCreateChat(false)}
          />
          <View style={[styles.modalCard, styles.modalTall]}>
            <Text style={styles.modalTitle}>Criar conversa</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do grupo (opcional)"
              placeholderTextColor={colors.mutedForeground}
              value={chatName}
              onChangeText={setChatName}
            />
            <Text style={styles.fieldLabel}>Participantes</Text>
            <ScrollView style={styles.participantList} nestedScrollEnabled>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => toggleParticipant(m.id)}
                  style={styles.checkRow}
                >
                  <Ionicons
                    name={
                      selectedParticipants.includes(m.id)
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={22}
                    color={
                      selectedParticipants.includes(m.id)
                        ? colors.primary
                        : colors.border
                    }
                  />
                  <Text style={styles.checkLabel}>{m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowCreateChat(false)}
                style={styles.modalGhost}
              >
                <Text style={styles.ghostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleCreateChat()}
                disabled={selectedParticipants.length < 2}
                style={[
                  styles.modalPrimary,
                  selectedParticipants.length < 2 && styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryText}>Criar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editingChatId !== null} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setEditingChatId(null)}
          />
          <View style={[styles.modalCard, styles.modalTall]}>
            <Text style={styles.modalTitle}>Editar conversa</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do grupo (opcional)"
              placeholderTextColor={colors.mutedForeground}
              value={editChatName}
              onChangeText={setEditChatName}
            />
            <Text style={styles.fieldLabel}>Participantes</Text>
            <ScrollView style={styles.participantList} nestedScrollEnabled>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => toggleEditParticipant(m.id)}
                  style={styles.checkRow}
                >
                  <Ionicons
                    name={
                      editChatParticipants.includes(m.id)
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={22}
                    color={
                      editChatParticipants.includes(m.id)
                        ? colors.primary
                        : colors.border
                    }
                  />
                  <Text style={styles.checkLabel}>{m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditingChatId(null)}
                style={styles.modalGhost}
              >
                <Text style={styles.ghostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleUpdateChat()}
                disabled={editChatParticipants.length < 2}
                style={[
                  styles.modalPrimary,
                  editChatParticipants.length < 2 && styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={chatToDelete !== null} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setChatToDelete(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apagar conversa?</Text>
            <Text style={styles.deleteDesc}>
              Esta ação não pode ser desfeita. Todas as mensagens desta conversa
              serão removidas permanentemente.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setChatToDelete(null)}
                style={styles.modalGhost}
              >
                <Text style={styles.ghostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleConfirmDeleteChat()}
                style={styles.modalDanger}
              >
                <Text style={styles.primaryText}>Apagar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionTitle({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.sectionHead}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(31, 168, 92, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.mutedForeground,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: colors.mutedForeground,
    letterSpacing: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeAdult: {
    backgroundColor: colors.primary,
  },
  badgeChild: {
    backgroundColor: colors.muted,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.foreground,
  },
  badgeTextAdult: {
    color: colors.primaryForeground,
  },
  emptyBox: {
    backgroundColor: colors.muted,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  outlineBtnText: {
    fontSize: 15,
    color: colors.foreground,
  },
  iconAct: {
    padding: 6,
  },
  pressed: {
    opacity: 0.85,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  modalTall: {
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.foreground,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  roleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  roleChipOn: {
    borderColor: colors.primary,
    backgroundColor: "rgba(31, 168, 92, 0.1)",
  },
  roleChipText: {
    fontSize: 15,
    color: colors.foreground,
  },
  roleChipTextOn: {
    fontWeight: "600",
    color: colors.primary,
  },
  error: {
    fontSize: 14,
    color: colors.destructive,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
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
  modalDanger: {
    backgroundColor: colors.destructive,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  ghostText: {
    fontSize: 16,
    color: colors.mutedForeground,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  participantList: {
    maxHeight: 220,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  checkLabel: {
    fontSize: 15,
    color: colors.foreground,
  },
  deleteDesc: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
});
