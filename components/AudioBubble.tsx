import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface AudioBubbleProps {
  messageId: string;
  audioUrl: string;
  audioDuration?: number;
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
  audioDuration,
  isSelf,
  shouldPlay,
  nextInSequenceId,
  playbackRate,
  onRequestPlay,
  onAudioFinished,
  onPlaybackRateChange,
}: AudioBubbleProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minWidth: 240,
      },
      playBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
      },
      playSelf: {
        backgroundColor: t.primaryTintStrong,
      },
      playOther: {
        backgroundColor: t.muted,
      },
      playDisabled: {
        opacity: 0.7,
      },
      trackCol: {
        flex: 1,
        gap: 2,
      },
      rateBtn: {
        minWidth: 34,
        paddingHorizontal: 7,
        paddingVertical: 5,
        borderRadius: 11,
        backgroundColor: t.progressTrack,
      },
      rateText: {
        fontSize: 11,
        fontWeight: "600",
        color: t.timestamp,
      },
      trackHitArea: {
        height: 28,
        justifyContent: "center",
      },
      track: {
        height: 6,
        borderRadius: 3,
        backgroundColor: t.border,
        overflow: "hidden",
      },
      fill: {
        height: "100%",
        borderRadius: 3,
        backgroundColor: t.audioProgress,
      },
      knob: {
        position: "absolute",
        top: 7,
        width: 14,
        height: 14,
        marginLeft: -7,
        borderRadius: 7,
        backgroundColor: t.audioProgress,
        borderWidth: 2,
        borderColor: t.background,
        shadowColor: t.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: t.shadowOpacity * 2,
        shadowRadius: 2,
        elevation: 2,
      },
      time: {
        fontSize: 11,
        color: t.timestamp,
      },
    })
  );
  const player = useAudioPlayer({ uri: audioUrl }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [waitingForPlayback, setWaitingForPlayback] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayAttemptedRef = useRef(false);
  const trackRef = useRef<View>(null);
  const trackMetricsRef = useRef({ x: 0, width: 0 });

  const stopWaitingForPlayback = useCallback(() => {
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    setWaitingForPlayback(false);
  }, []);

  const startWaitingForPlayback = useCallback(() => {
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
    }
    setWaitingForPlayback(true);
    playbackTimeoutRef.current = setTimeout(() => {
      playbackTimeoutRef.current = null;
      setWaitingForPlayback(false);
    }, 8000);
  }, []);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    player.setPlaybackRate(playbackRate);
  }, [playbackRate, player]);

  useEffect(() => {
    if (!shouldPlay) {
      autoPlayAttemptedRef.current = false;
      return;
    }
    if (status.playing || waitingForPlayback || autoPlayAttemptedRef.current) return;

    autoPlayAttemptedRef.current = true;
    startWaitingForPlayback();
    try {
      player.play();
    } catch {
      stopWaitingForPlayback();
    }
  }, [
    player,
    shouldPlay,
    startWaitingForPlayback,
    status.playing,
    stopWaitingForPlayback,
    waitingForPlayback,
  ]);

  useEffect(() => {
    if (status.playing || status.didJustFinish || !shouldPlay) {
      stopWaitingForPlayback();
    }
  }, [shouldPlay, status.didJustFinish, status.playing, stopWaitingForPlayback]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    onAudioFinished(nextInSequenceId);
  }, [nextInSequenceId, onAudioFinished, player, status.didJustFinish]);

  const togglePlay = useCallback(async () => {
    if (status.playing) {
      stopWaitingForPlayback();
      player.pause();
    } else {
      if (status.didJustFinish || status.currentTime >= status.duration) {
        await player.seekTo(0);
      }
      onRequestPlay(messageId);
      startWaitingForPlayback();
      try {
        await player.play();
      } catch {
        stopWaitingForPlayback();
      }
    }
  }, [
    messageId,
    onRequestPlay,
    player,
    startWaitingForPlayback,
    status.currentTime,
    status.didJustFinish,
    status.duration,
    status.playing,
    stopWaitingForPlayback,
  ]);

  const cyclePlaybackRate = useCallback(() => {
    const index = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
    onPlaybackRateChange(nextRate);
  }, [onPlaybackRateChange, playbackRate]);

  const statusDuration = Number.isFinite(status.duration) ? status.duration : 0;
  const persistedDuration =
    typeof audioDuration === "number" && Number.isFinite(audioDuration)
      ? audioDuration
      : 0;
  const duration = statusDuration > 0 ? statusDuration : persistedDuration;
  const progress = duration > 0 ? Math.min(status.currentTime / duration, 1) : 0;
  const currentTime = duration ? progress * duration : 0;
  const isPlaying = status.playing;
  const isLoading = waitingForPlayback && !isPlaying;
  const canSeek = duration > 0 && trackWidth > 0;

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      trackMetricsRef.current = { x, width };
      setTrackWidth(width);
    });
  }, []);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackMetricsRef.current = { ...trackMetricsRef.current, width };
    setTrackWidth(width);
    measureTrack();
  }, [measureTrack]);

  const seekToPagePosition = useCallback((pageX: number) => {
    const { x, width } = trackMetricsRef.current;
    if (!canSeek || width <= 0) return;

    const nextProgress = Math.min(Math.max((pageX - x) / width, 0), 1);
    stopWaitingForPlayback();
    void player.seekTo(nextProgress * duration).catch(() => {});
  }, [canSeek, duration, player, stopWaitingForPlayback]);

  const syncTrackPositionFromTouch = useCallback((pageX: number, locationX: number) => {
    const width = trackMetricsRef.current.width || trackWidth;
    trackMetricsRef.current = { x: pageX - locationX, width };
  }, [trackWidth]);

  const trackPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canSeek,
        onMoveShouldSetPanResponder: () => canSeek,
        onPanResponderGrant: (event) => {
          measureTrack();
          syncTrackPositionFromTouch(
            event.nativeEvent.pageX,
            event.nativeEvent.locationX,
          );
          seekToPagePosition(event.nativeEvent.pageX);
        },
        onPanResponderMove: (_event, gestureState) => {
          seekToPagePosition(gestureState.moveX);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [canSeek, measureTrack, seekToPagePosition, syncTrackPositionFromTouch],
  );

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => void togglePlay()}
        disabled={isLoading}
        style={[
          styles.playBtn,
          isSelf ? styles.playSelf : styles.playOther,
          isLoading ? styles.playDisabled : undefined,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={20}
            color={theme.primary}
            style={isPlaying ? undefined : { marginLeft: 2 }}
          />
        )}
      </Pressable>
      <Pressable onPress={cyclePlaybackRate} style={styles.rateBtn}>
        <Text style={styles.rateText}>{playbackRate.toFixed(1)}x</Text>
      </Pressable>
      <View style={styles.trackCol}>
        <View
          ref={trackRef}
          style={styles.trackHitArea}
          onLayout={handleTrackLayout}
          {...trackPanResponder.panHandlers}
        >
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.knob,
              { left: `${progress * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.time}>
          {isPlaying ? formatTime(currentTime) : formatTime(duration ?? 0)}
        </Text>
      </View>
    </View>
  );
}
