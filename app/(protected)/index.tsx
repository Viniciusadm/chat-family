import { AppHeader } from "@/components/AppHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SearchBar } from "@/components/SearchBar";
import { SearchResultItem } from "@/components/SearchResultItem";
import { useAuth } from "@/context/AuthContext";
import { useChats } from "@/hooks/useChats";
import { useMemberProfiles } from "@/hooks/useMemberProfiles";
import { useMessageSearch } from "@/hooks/useMessageSearch";
import {
  getChatDisplayName,
  isOtherParticipantDeleted,
} from "@/lib/chatDisplayName";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
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
  const memberProfiles = useMemberProfiles();
  const search = useMessageSearch();
  const chatById = useMemo(
    () => new Map(chats.map((c) => [c.id, c])),
    [chats]
  );
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      screen: {
        flex: 1,
        backgroundColor: t.background,
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
        borderBottomColor: t.border,
      },
      rowPressed: {
        backgroundColor: t.muted,
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
        color: t.foreground,
      },
      time: {
        fontSize: 12,
        color: t.timestamp,
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
        color: t.mutedForeground,
      },
      previewSpacer: {
        flex: 1,
      },
      unreadBadge: {
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 11,
        backgroundColor: t.primary,
        alignItems: "center",
        justifyContent: "center",
      },
      unreadBadgeText: {
        fontSize: 12,
        fontWeight: "700",
        color: t.primaryForeground,
      },
      deletedBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: t.muted,
      },
      deletedBadgeText: {
        fontSize: 11,
        fontWeight: "600",
        color: t.mutedForeground,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      },
      rowDeleted: {
        opacity: 0.7,
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
        backgroundColor: t.primaryTintStrong,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 24,
      },
      emptyTitle: {
        fontSize: 20,
        fontWeight: "600",
        color: t.foreground,
        textAlign: "center",
      },
      emptySub: {
        marginTop: 12,
        fontSize: 14,
        lineHeight: 20,
        color: t.mutedForeground,
        textAlign: "center",
        maxWidth: 280,
      },
      searchEmpty: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        paddingTop: 48,
      },
      searchEmptyTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: t.foreground,
        textAlign: "center",
      },
      searchEmptySub: {
        marginTop: 6,
        fontSize: 14,
        lineHeight: 20,
        color: t.mutedForeground,
        textAlign: "center",
        maxWidth: 280,
      },
    })
  );
  const canAccessAdmin =
    currentUser?.role === "adult" &&
    (firebaseUser == null || !firebaseUser.isAnonymous);

  return (
    <ScreenContainer style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="Conversas"
        rightActions={[
          {
            key: "profile",
            content: (
              <ProfileAvatar
                name={currentUser?.name}
                photoUrl={currentUser?.photoUrl}
                size={30}
              />
            ),
            onPress: () => router.push("/profile"),
            accessibilityLabel: "Perfil",
          },
          ...(canAccessAdmin
            ? [
                {
                  key: "admin",
                  icon: "settings-outline" as const,
                  onPress: () => router.push("/admin"),
                  accessibilityLabel: "Gerenciamento",
                },
              ]
            : []),
        ]}
      />
      <SearchBar value={search.query} onChangeText={search.setQuery} />
      {search.isSearching ? (
        search.loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : search.error ? (
          <View style={styles.searchEmpty}>
            <Text style={styles.searchEmptyTitle}>
              Não foi possível buscar
            </Text>
            <Text style={styles.searchEmptySub}>
              Tente novamente em alguns instantes.
            </Text>
          </View>
        ) : search.results.length === 0 ? (
          <View style={styles.searchEmpty}>
            <Text style={styles.searchEmptyTitle}>Nenhum resultado</Text>
            <Text style={styles.searchEmptySub}>
              Não encontramos mensagens com “{search.query.trim()}”.
            </Text>
          </View>
        ) : (
          <FlatList
            data={search.results}
            keyExtractor={(r) => r.message.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const chat = chatById.get(item.message.chatId);
              const isMine = item.message.senderId === currentUser?.id;
              const chatName = chat
                ? getChatDisplayName(chat, currentUser?.id, memberProfiles)
                : "Conversa";
              const isGroup = chat?.isGroup ?? false;
              const otherName =
                memberProfiles[item.message.senderId]?.name ?? null;
              const senderLabel = isMine
                ? "Você"
                : isGroup
                  ? otherName
                  : null;
              return (
                <SearchResultItem
                  result={item}
                  chatName={chatName}
                  senderLabel={senderLabel}
                  isMine={isMine}
                  onPress={() =>
                    router.push(
                      `/chat/${item.message.chatId}?messageId=${item.message.id}`
                    )
                  }
                />
              );
            }}
          />
        )
      ) : chats.length === 0 && loading ? (
        <View style={styles.center} />
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons
              name="chatbubbles-outline"
              size={44}
              color={theme.primary}
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
          renderItem={({ item: chat }) => {
            const otherParticipantId =
              !chat.isGroup && currentUser
                ? chat.participants.find((id) => id !== currentUser.id)
                : undefined;
            const otherProfile = otherParticipantId
              ? memberProfiles[otherParticipantId]
              : undefined;
            const displayName = getChatDisplayName(
              chat,
              currentUser?.id,
              memberProfiles
            );
            const isDeleted = isOtherParticipantDeleted(
              chat,
              currentUser?.id,
              memberProfiles
            );
            const avatarPhotoUrl = chat.isGroup
              ? chat.photoUrl ?? undefined
              : otherProfile?.photoUrl ?? undefined;
            const avatarIcon = chat.isGroup
              ? "people-outline"
              : "chatbubble-ellipses-outline";

            return (
              <Pressable
                onPress={() => router.push(`/chat/${chat.id}`)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                  isDeleted && styles.rowDeleted,
                ]}
              >
                <ProfileAvatar
                  name={otherProfile?.name ?? displayName}
                  photoUrl={avatarPhotoUrl}
                  icon={avatarIcon}
                  size={48}
                />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {isDeleted ? (
                      <View style={styles.deletedBadge}>
                        <Text style={styles.deletedBadgeText}>Excluído</Text>
                      </View>
                    ) : null}
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
                            : chat.lastMessage.type === "image"
                              ? "Foto"
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
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
