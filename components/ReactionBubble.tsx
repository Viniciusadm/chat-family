import { useThemedStyles } from "@/theme/useThemedStyles";
import type { Reaction } from "@/types/chat";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface ReactionBubbleProps {
  reactions: Reaction[];
  currentUserId: string;
  onPress: () => void;
}

function groupReactions(reactions: Reaction[], currentUserId: string) {
  const counts = new Map<string, { count: number; hasMine: boolean }>();
  for (const r of reactions) {
    const entry = counts.get(r.emoji) ?? { count: 0, hasMine: false };
    entry.count += 1;
    if (r.userId === currentUserId) entry.hasMine = true;
    counts.set(r.emoji, entry);
  }
  return Array.from(counts.entries()).map(([emoji, { count, hasMine }]) => ({
    emoji,
    count,
    hasMine,
  }));
}

export const ReactionBubble = React.memo(function ReactionBubble({
  reactions,
  currentUserId,
  onPress,
}: ReactionBubbleProps) {
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      wrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
      },
      chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 12,
        backgroundColor: t.muted,
        borderWidth: 1,
        borderColor: t.border,
      },
      chipMine: {
        backgroundColor: t.bubbleSelf,
        borderColor: t.primary,
      },
      chipPressed: {
        opacity: 0.7,
      },
      emoji: {
        fontSize: 14,
      },
      count: {
        fontSize: 12,
        fontWeight: "600",
        color: t.mutedForeground,
      },
      countMine: {
        color: t.primary,
      },
    })
  );
  if (reactions.length === 0) return null;

  const grouped = groupReactions(reactions, currentUserId);

  return (
    <View style={styles.wrap}>
      {grouped.map(({ emoji, count, hasMine }) => (
        <Pressable
          key={emoji}
          onPress={onPress}
          style={({ pressed }) => [
            styles.chip,
            hasMine ? styles.chipMine : null,
            pressed ? styles.chipPressed : null,
          ]}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={[styles.count, hasMine ? styles.countMine : null]}>
            {count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});
