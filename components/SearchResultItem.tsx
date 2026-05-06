import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemeTokens } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useThemedStyles";
import type { SearchResult, SearchSnippet } from "@/lib/searchMessages";

interface SearchResultItemProps {
  result: SearchResult;
  chatName: string;
  senderLabel: string | null;
  isMine: boolean;
  onPress: () => void;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  if (isSameDay(date, now)) return formatTime(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: date.getFullYear() === now.getFullYear() ? undefined : "2-digit",
  });
}

function renderSnippet(
  snippet: SearchSnippet,
  styles: ReturnType<typeof buildStyles>
) {
  const { text, ranges } = snippet;
  if (!ranges.length) {
    return <Text style={styles.snippet} numberOfLines={2}>{text}</Text>;
  }
  const segments: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({
        text: text.slice(cursor, range.start),
        highlighted: false,
      });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      highlighted: true,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }
  return (
    <Text style={styles.snippet} numberOfLines={2}>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <Text key={i} style={styles.snippetMatch}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        )
      )}
    </Text>
  );
}

const buildStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
      gap: 12,
    },
    rowPressed: {
      backgroundColor: t.muted,
    },
    rail: {
      width: 3,
      borderRadius: 2,
      alignSelf: "stretch",
    },
    railMine: {
      backgroundColor: t.primary,
    },
    railOther: {
      backgroundColor: t.border,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    chatName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: t.foreground,
    },
    time: {
      fontSize: 12,
      color: t.timestamp,
    },
    senderLine: {
      marginTop: 2,
      fontSize: 12,
      color: t.mutedForeground,
    },
    snippet: {
      marginTop: 4,
      fontSize: 14,
      color: t.foreground,
    },
    snippetMatch: {
      backgroundColor: t.primaryTintStrong,
      color: t.foreground,
      fontWeight: "700",
    },
  });

export function SearchResultItem({
  result,
  chatName,
  senderLabel,
  isMine,
  onPress,
}: SearchResultItemProps) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Resultado em ${chatName}`}
    >
      <View
        style={[styles.rail, isMine ? styles.railMine : styles.railOther]}
      />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.chatName} numberOfLines={1}>
            {chatName}
          </Text>
          <Text style={styles.time}>
            {formatTimestamp(result.message.createdAtMs)}
          </Text>
        </View>
        {senderLabel ? (
          <Text style={styles.senderLine} numberOfLines={1}>
            {senderLabel}
          </Text>
        ) : null}
        {renderSnippet(result.snippet, styles)}
      </View>
    </Pressable>
  );
}
