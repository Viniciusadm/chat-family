import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface AudioBubbleProps {
  audioUrl: string;
  isSelf: boolean;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioBubble({ audioUrl, isSelf }: AudioBubbleProps) {
  const player = useAudioPlayer({ uri: audioUrl }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [wasPlaying, setWasPlaying] = useState(false);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!status.didJustFinish) return;
    setWasPlaying(false);
    player.seekTo(0).catch(() => {});
  }, [player, status.didJustFinish]);

  const togglePlay = useCallback(async () => {
    if (status.playing) {
      player.pause();
      setWasPlaying(false);
    } else {
      if (status.didJustFinish || status.currentTime >= status.duration) {
        await player.seekTo(0);
      }
      player.play();
      setWasPlaying(true);
    }
  }, [player, status.currentTime, status.didJustFinish, status.duration, status.playing]);

  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(status.currentTime / duration, 1) : 0;
  const currentTime = progress * duration;
  const isPlaying = status.playing || wasPlaying;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => void togglePlay()}
        style={[
          styles.playBtn,
          isSelf ? styles.playSelf : styles.playOther,
        ]}
      >
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={18}
          color={colors.primary}
          style={isPlaying ? undefined : { marginLeft: 2 }}
        />
      </Pressable>
      <View style={styles.trackCol}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 180,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  playSelf: {
    backgroundColor: "rgba(31, 168, 92, 0.2)",
  },
  playOther: {
    backgroundColor: colors.muted,
  },
  trackCol: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.audioProgress,
  },
  time: {
    fontSize: 11,
    color: colors.timestamp,
  },
});
