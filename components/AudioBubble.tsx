import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface AudioBubbleProps {
  messageId: string;
  audioUrl: string;
  isSelf: boolean;
  shouldPlay: boolean;
  nextInSequenceId?: string;
  playbackRate: 1 | 1.5 | 2;
  onRequestPlay: (messageId: string) => void;
  onAudioFinished: (nextMessageId?: string) => void;
  onPlaybackRateChange: (rate: 1 | 1.5 | 2) => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLAYBACK_RATES: (1 | 1.5 | 2)[] = [1, 1.5, 2];

export function AudioBubble({
  messageId,
  audioUrl,
  isSelf,
  shouldPlay,
  nextInSequenceId,
  playbackRate,
  onRequestPlay,
  onAudioFinished,
  onPlaybackRateChange,
}: AudioBubbleProps) {
  const player = useAudioPlayer({ uri: audioUrl }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);


  useEffect(() => {
    player.setPlaybackRate(playbackRate);
  }, [playbackRate, player]);

  useEffect(() => {
    if (!shouldPlay || !status.isLoaded || status.playing) return;
    player.play();
  }, [player, shouldPlay, status.isLoaded, status.playing]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    onAudioFinished(nextInSequenceId);
  }, [nextInSequenceId, onAudioFinished, player, status.didJustFinish]);

  const togglePlay = useCallback(async () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || status.currentTime >= status.duration) {
        await player.seekTo(0);
      }
      onRequestPlay(messageId);
      await player.play();
    }
  }, [messageId, onRequestPlay, player, status.currentTime, status.didJustFinish, status.duration, status.playing]);

  const cyclePlaybackRate = useCallback(() => {
    const index = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
    onPlaybackRateChange(nextRate);
  }, [onPlaybackRateChange, playbackRate]);

  const duration = status.duration ?? null;
  const progress = duration > 0 ? Math.min(status.currentTime / duration, 1) : 0;
  const currentTime = duration ? progress * duration : 0;
  const isPlaying = status.playing;

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
      <Pressable onPress={cyclePlaybackRate} style={styles.rateBtn}>
        <Text style={styles.rateText}>{playbackRate.toFixed(1)}x</Text>
      </Pressable>
      <View style={styles.trackCol}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>
          {!status.isLoaded
            ? "Carregando..."
            : isPlaying
              ? formatTime(currentTime)
              : formatTime(duration ?? 0)}
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
  rateBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  rateText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.timestamp,
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
