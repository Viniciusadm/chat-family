import { useSendMessage } from "@/hooks/useSendMessage";
import { colors } from "@/theme/colors";
import type { MessageReplySnapshot } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { ReplyPreview } from "./ReplyPreview";

interface ChatInputProps {
  chatId: string;
  replyTo?: MessageReplySnapshot | null;
  onCancelReply?: () => void;
  onSend?: () => void;
}

export interface ChatInputHandle {
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
function ChatInput({
  chatId,
  replyTo = null,
  onCancelReply,
  onSend,
}, ref) {
  const { sendText, sendAudio, isSending } = useSendMessage(chatId);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const insets = useSafeAreaInsets();
  const { progress } = useReanimatedKeyboardAnimation();
  const animatedBarStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(
      progress.value,
      [0, 1],
      [12 + insets.bottom, 12],
      "clamp"
    ),
  }));
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const recordingActiveRef = useRef(false);
  const recordSessionRef = useRef(0);
  const recordingStartMsRef = useRef(0);

  useEffect(() => {
    if (!isRecording) return;

    const updateElapsed = () => {
      setRecordingSeconds(
        Math.floor((Date.now() - recordingStartMsRef.current) / 1000)
      );
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 250);
    return () => {
      clearInterval(interval);
    };
  }, [isRecording]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (isRecording) return;
      inputRef.current?.focus();
    },
  }), [isRecording]);

  const handleSendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setText("");
    onSend?.();
    onCancelReply?.();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    const selectedReply = replyTo;
    await sendText(trimmed, { replyTo: selectedReply });
  }, [text, isSending, onCancelReply, onSend, replyTo, sendText]);

  const resetRecordingState = useCallback(() => {
    recordingActiveRef.current = false;
    recordingStartMsRef.current = 0;
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const restorePlaybackMode = async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {
      //
    }
  };

  const startRecording = async () => {
    if (isSending || isRecording || text.trim()) return;
    const session = ++recordSessionRef.current;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted || recordSessionRef.current !== session) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      await audioRecorder.prepareToRecordAsync();
      if (recordSessionRef.current !== session) {
        await restorePlaybackMode();
        return;
      }
      audioRecorder.record();
      if (recordSessionRef.current !== session) {
        await audioRecorder.stop().catch(() => {});
        resetRecordingState();
        await restorePlaybackMode();
        return;
      }
      recordingActiveRef.current = true;
      recordingStartMsRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      if (recordSessionRef.current === session) {
        resetRecordingState();
      }
      await restorePlaybackMode();
    }
  };

  const stopRecordingAndSend = async () => {
    recordSessionRef.current += 1;
    const wasRecording = recordingActiveRef.current;
    const selectedReply = replyTo;
    onSend?.();
    onCancelReply?.();
    resetRecordingState();
    if (!wasRecording) return;
    try {
      const durationMillis = audioRecorder.getStatus().durationMillis;
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) return;
      const res = await fetch(uri);
      const blob = await res.blob();
      await sendAudio(blob, {
        extension: "m4a",
        contentType: "audio/mp4",
        duration: durationMillis > 0 ? durationMillis / 1000 : undefined,
        replyTo: selectedReply,
      });
    } catch {
      //
    }
    await restorePlaybackMode();
  };

  return (
    <Animated.View style={[styles.bar, animatedBarStyle]}>
      {replyTo && onCancelReply ? (
        <ReplyPreview reply={replyTo} onCancel={onCancelReply} />
      ) : null}
      <View style={styles.row}>
        <View style={styles.inputShell}>
          <TextInput
            ref={inputRef}
            value={text}
            placeholder="Digite uma mensagem"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            multiline={true}
            editable
            onChangeText={(value) => {
              if (recordingActiveRef.current) return;
              setText(value);
            }}
          />
        </View>
        {text.trim() && !isRecording ? (
          <Pressable
            onPress={() => void handleSendText()}
            disabled={isSending}
            style={({ pressed }) => [
              styles.roundBtn,
              pressed && styles.pressed,
              isSending && styles.disabled,
            ]}
          >
            <Ionicons
              name="send"
              size={18}
              color={colors.primaryForeground}
            />
          </Pressable>
        ) : (
          <Pressable
            onPressIn={() => void startRecording()}
            onPressOut={() => void stopRecordingAndSend()}
            disabled={isSending}
            style={({ pressed }) => [
              styles.roundBtn,
              pressed && !isRecording && styles.pressed,
              isSending && styles.disabled,
            ]}
          >
            <Ionicons
              name="mic"
              size={20}
              color={colors.primaryForeground}
            />
          </Pressable>
        )}
        {isRecording && (
          <View style={styles.recordingOverlay}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>Solte para enviar</Text>
            <Text style={styles.recTimer}>
              {Math.floor(recordingSeconds / 60)}:
              {(recordingSeconds % 60).toString().padStart(2, "0")}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.chatInputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputShell: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    color: colors.foreground,
    padding: 0,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    right: 52,
    borderRadius: 12,
    backgroundColor: colors.muted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    pointerEvents: "none",
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.recording,
  },
  recText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.recording,
  },
  recTimer: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.foreground,
    minWidth: 38,
    textAlign: "right",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
