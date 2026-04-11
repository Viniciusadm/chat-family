import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
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
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let active = true;
    let loaded: Audio.Sound | null = null;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false },
          (status) => {
            if (!status.isLoaded) return;
            if (status.durationMillis != null && status.durationMillis > 0) {
              setDuration(status.durationMillis / 1000);
            }
            if (status.positionMillis != null && status.durationMillis) {
              setProgress(
                status.positionMillis / Math.max(status.durationMillis, 1)
              );
            }
            if (status.didJustFinish) {
              setIsPlaying(false);
              setProgress(0);
            }
          }
        );
        if (!active) {
          await s.unloadAsync();
          return;
        }
        loaded = s;
        setSound(s);
        const st = await s.getStatusAsync();
        if (st.isLoaded && st.durationMillis) {
          setDuration(st.durationMillis / 1000);
        }
      } catch {
        if (active) setSound(null);
      }
    })();
    return () => {
      active = false;
      if (loaded) {
        loaded.unloadAsync().catch(() => {});
      }
    };
  }, [audioUrl]);

  const togglePlay = useCallback(async () => {
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  }, [sound, isPlaying]);

  const currentTime = progress * duration;

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
