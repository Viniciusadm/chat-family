import { colors } from "@/theme/colors";
import type { Reaction } from "@/types/chat";
import React, { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface ReactionsDialogProps {
  visible: boolean;
  reactions: Reaction[];
  currentUserId: string;
  memberNames: Record<string, string>;
  onRemoveReaction: () => void;
  onClose: () => void;
}

export function ReactionsDialog({
  visible,
  reactions,
  currentUserId,
  memberNames,
  onRemoveReaction,
  onClose,
}: ReactionsDialogProps) {
  const { emojiBar, entries } = useMemo(() => {
    const counts = new Map<string, number>();
    const userOrder: Reaction[] = [];
    for (const r of reactions) {
      counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
      userOrder.push(r);
    }

    const sortedEmojis = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([emoji]) => emoji);

    const ownIdx = userOrder.findIndex((r) => r.userId === currentUserId);
    const own = ownIdx >= 0 ? [userOrder[ownIdx]] : [];
    const others = userOrder.filter((_, i) => i !== ownIdx);

    const entries = [
      ...own.map((r) => ({ ...r, isOwn: true as const })),
      ...others.map((r) => ({ ...r, isOwn: false as const })),
    ];

    return { emojiBar: sortedEmojis, entries };
  }, [reactions, currentUserId]);

  const total = reactions.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{total} reaç{total !== 1 ? "ões" : "ão"}</Text>

          <View style={styles.barRow}>
            {emojiBar.map((emoji) => {
              const count = reactions.filter((r) => r.emoji === emoji).length;
              const barWidth = emojiBar.length === 1
                ? 100
                : (count / Math.max(...emojiBar.map((e) =>
                    reactions.filter((r) => r.emoji === e).length
                  ))) * 100;
              return (
                <View key={emoji} style={styles.barItem}>
                  <Text style={styles.barEmoji}>{emoji}</Text>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.max(barWidth, 20)}%` },
                    ]}
                  />
                  <Text style={styles.barCount}>{count}</Text>
                </View>
              );
            })}
          </View>

          <ScrollView style={styles.list} bounces={false}>
            {entries.map((entry, idx) => (
              <React.Fragment key={`${entry.userId}-${entry.emoji}`}>
                {idx > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.entry}>
                  <View style={styles.entryLeft}>
                    <Text style={styles.entryEmoji}>{entry.emoji}</Text>
                    <Text style={styles.entryName}>
                      {entry.isOwn
                        ? "Você"
                        : memberNames[entry.userId] ?? "Participante"}
                    </Text>
                  </View>
                  {entry.isOwn ? (
                    <Pressable
                      onPress={() => {
                        onRemoveReaction();
                        onClose();
                      }}
                      style={({ pressed }) => [
                        styles.removeButton,
                        pressed && styles.removeButtonPressed,
                      ]}
                    >
                      <Text style={styles.removeText}>Toque para remover</Text>
                    </Pressable>
                  ) : null}
                </View>
              </React.Fragment>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    maxHeight: "80%",
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 16,
  },
  barRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 6,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  barItem: {
    alignItems: "center",
    gap: 4,
  },
  barEmoji: {
    fontSize: 22,
  },
  barFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    minWidth: 8,
  },
  barCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  list: {
    maxHeight: 260,
  },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  entryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  entryEmoji: {
    fontSize: 20,
  },
  entryName: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: "500",
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  removeButtonPressed: {
    backgroundColor: colors.muted,
  },
  removeText: {
    fontSize: 12,
    color: colors.destructive,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
