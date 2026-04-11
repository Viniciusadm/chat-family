import { useSendMessage } from "@/hooks/useSendMessage";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCallback, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface ChatInputProps {
  chatId: string;
}

export function ChatInput({ chatId }: ChatInputProps) {
  const { sendText, sendAudio, isSending } = useSendMessage(chatId);
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordSessionRef = useRef(0);

  const handleSendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setText("");
    Keyboard.dismiss();
    await sendText(trimmed);
  }, [text, isSending, sendText]);

  const startRecording = async () => {
    if (isSending || text.trim()) return;
    const session = ++recordSessionRef.current;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted || recordSessionRef.current !== session) return;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      if (recordSessionRef.current !== session) {
        await recording.stopAndUnloadAsync();
        return;
      }
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      if (recordSessionRef.current === session) {
        recordingRef.current = null;
        setIsRecording(false);
      }
    }
  };

  const stopRecordingAndSend = async () => {
    recordSessionRef.current += 1;
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
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
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      //
    }
  };

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <View
          style={[
            styles.inputShell,
            isRecording && styles.inputCollapsed,
          ]}
          pointerEvents={isRecording ? "none" : "auto"}
        >
          <TextInput
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
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.chatInputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
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
