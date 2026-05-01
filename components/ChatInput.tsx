import { useSendMessage } from "@/hooks/useSendMessage";
import { colors } from "@/theme/colors";
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

interface ChatInputProps {
  chatId: string;
  keyboardVisible?: boolean;
}

export interface ChatInputHandle {
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
function ChatInput({ chatId, keyboardVisible = false }, ref) {
  const { sendText, sendAudio, isSending } = useSendMessage(chatId);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const insets = useSafeAreaInsets();
  const bottomPadding = 12 + (keyboardVisible ? 0 : insets.bottom);
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const recordingActiveRef = useRef(false);
  const recordSessionRef = useRef(0);

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
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    await sendText(trimmed);
  }, [text, isSending, sendText]);

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
        recordingActiveRef.current = false;
        await restorePlaybackMode();
        return;
      }
      recordingActiveRef.current = true;
      setIsRecording(true);
    } catch {
      if (recordSessionRef.current === session) {
        recordingActiveRef.current = false;
        setIsRecording(false);
      }
      await restorePlaybackMode();
    }
  };

  const stopRecordingAndSend = async () => {
    recordSessionRef.current += 1;
    const wasRecording = recordingActiveRef.current;
    recordingActiveRef.current = false;
    setIsRecording(false);
    if (!wasRecording) return;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) return;
      const res = await fetch(uri);
      const blob = await res.blob();
      await sendAudio(blob, {
        extension: "m4a",
        contentType: "audio/mp4",
      });
    } catch {
      //
    }
    await restorePlaybackMode();
  };

  return (
    <View style={[styles.bar, { paddingBottom: bottomPadding }]}>
      <View style={styles.row}>
        <View
          style={[
            styles.inputShell,
            isRecording && styles.inputCollapsed,
          ]}
          pointerEvents={isRecording ? "none" : "auto"}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Digite uma mensagem"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            multiline={false}
            editable={!isRecording}
            onSubmitEditing={() => void handleSendText()}
            returnKeyType="send"
            blurOnSubmit={false}
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
              isRecording ? styles.recordBar : styles.roundBtn,
              pressed && !isRecording && styles.pressed,
              isSending && styles.disabled,
            ]}
          >
            {isRecording ? (
              <View style={styles.recInner}>
                <View style={styles.recDot} />
                <Text style={styles.recText}>Solte para enviar</Text>
              </View>
            ) : (
              <Ionicons
                name="mic"
                size={20}
                color={colors.primaryForeground}
              />
            )}
          </Pressable>
        )}
      </View>
    </View>
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
  inputCollapsed: {
    flex: 0,
    width: 0,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
    borderWidth: 0,
    opacity: 0,
    overflow: "hidden",
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
  recordBar: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.muted,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  recInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
