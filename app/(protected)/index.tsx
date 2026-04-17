import { AppHeader } from "@/components/AppHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { LoadingDots } from "@/components/LoadingDots";
import { useAuth } from "@/context/AuthContext";
import { useChats } from "@/hooks/useChats";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function unreadBadgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

export default function ChatListScreen() {
  const router = useRouter();
  const { chats, loading } = useChats();
  const { currentUser, firebaseUser } = useAuth();
  const canAccessAdmin =
    currentUser?.role === "adult" &&
    firebaseUser != null &&
    !firebaseUser.isAnonymous;

  return (
    <ScreenContainer style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="Conversas"
        rightIcon={canAccessAdmin ? "settings-outline" : undefined}
        onRightPress={
          canAccessAdmin ? () => router.push("/admin") : undefined
        }
      />
      {loading ? (
        <View style={styles.center}>
          <LoadingDots />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons
              name="chatbubbles-outline"
              size={44}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>Nenhuma conversa por aqui</Text>
          <Text style={styles.emptySub}>
            Quando alguém iniciar um chat, ele aparecerá nesta lista.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: chat }) => (
            <Pressable
              onPress={() => router.push(`/chat/${chat.id}`)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.avatar}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.chatName} numberOfLines={1}>
                    {chat.name}
                  </Text>
                  {chat.lastMessage && (
                    <Text style={styles.time}>
                      {formatTime(chat.lastMessage.timestamp)}
                    </Text>
                  )}
                </View>
                {(chat.lastMessage || chat.unreadCount > 0) && (
                  <View style={styles.previewRow}>
                    {chat.lastMessage ? (
                      <Text style={styles.preview} numberOfLines={1}>
                        {chat.lastMessage.type === "audio"
                          ? "Áudio"
                          : (chat.lastMessage.text ?? "")}
                      </Text>
                    ) : (
                      <View style={styles.previewSpacer} />
                    )}
                    {chat.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {unreadBadgeLabel(chat.unreadCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
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
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.muted,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(31, 168, 92, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  chatName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  time: {
    fontSize: 12,
    color: colors.timestamp,
  },
  previewRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 22,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  previewSpacer: {
    flex: 1,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: "rgba(31, 168, 92, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
  },
  emptySub: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
    textAlign: "center",
    maxWidth: 280,
  },
});
