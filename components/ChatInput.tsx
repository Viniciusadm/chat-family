import { useSendMessage } from "@/hooks/useSendMessage";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import type { Message, MessageReplySnapshot } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Alert,
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
import { AttachmentMenu } from "./AttachmentMenu";
import { EditPreview } from "./EditPreview";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { ReplyPreview } from "./ReplyPreview";

interface ChatInputProps {
  chatId: string;
  replyTo?: MessageReplySnapshot | null;
  onCancelReply?: () => void;
  onSend?: () => void;
  editingMessage?: Message | null;
  onCancelEdit?: () => void;
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
  editingMessage = null,
  onCancelEdit,
}, ref) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      bar: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: t.border,
        backgroundColor: t.chatInputBg,
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
        borderColor: t.inputBorder,
        backgroundColor: t.background,
        paddingHorizontal: 16,
        paddingVertical: 10,
        minHeight: 44,
        justifyContent: "center",
      },
      input: {
        fontSize: 15,
        color: t.foreground,
        padding: 0,
      },
      roundBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: t.primary,
        alignItems: "center",
        justifyContent: "center",
      },
      attachBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
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
        backgroundColor: t.muted,
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
        backgroundColor: t.recording,
      },
      recText: {
        flex: 1,
        fontSize: 14,
        fontWeight: "600",
        color: t.recording,
      },
      recTimer: {
        fontSize: 14,
        fontWeight: "700",
        color: t.foreground,
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
    })
  );
  const {
    sendText,
    sendAudio,
    sendImage,
    editTextMessage,
    isSending,
  } = useSendMessage(chatId);
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
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [imageSending, setImageSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const recordingActiveRef = useRef(false);
  const recordSessionRef = useRef(0);
  const recordingStartMsRef = useRef(0);
  const editingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (editingMessage && editingMessage.id !== editingIdRef.current) {
      setText(editingMessage.content);
      editingIdRef.current = editingMessage.id;
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!editingMessage && editingIdRef.current) {
      setText("");
      editingIdRef.current = null;
    }
  }, [editingMessage]);

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
    if (editingMessage) {
      if (trimmed === editingMessage.content) {
        onCancelEdit?.();
        return;
      }
      const target = editingMessage;
      setText("");
      onCancelEdit?.();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      await editTextMessage(target, trimmed);
      return;
    }
    setText("");
    onSend?.();
    onCancelReply?.();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    const selectedReply = replyTo;
    await sendText(trimmed, { replyTo: selectedReply });
  }, [
    text,
    isSending,
    editingMessage,
    onCancelEdit,
    editTextMessage,
    onCancelReply,
    onSend,
    replyTo,
    sendText,
  ]);

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

  const openGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("", "Permita acesso às fotos para enviar imagens.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPendingImage({
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    });
  }, []);

  const openCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("", "Permita acesso à câmera para tirar fotos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPendingImage({
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    });
  }, []);

  const confirmSendImage = useCallback(async () => {
    if (!pendingImage || imageSending) return;
    const selectedReply = replyTo;
    const payload = pendingImage;
    setImageSending(true);
    try {
      onSend?.();
      onCancelReply?.();
      setPendingImage(null);
      await sendImage(payload, { replyTo: selectedReply });
    } finally {
      setImageSending(false);
    }
  }, [pendingImage, imageSending, replyTo, onCancelReply, onSend, sendImage]);

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

  const isEditing = editingMessage != null;
  const trimmedText = text.trim();
  const editIsUnchanged = isEditing && trimmedText === editingMessage.content;
  const editSendDisabled =
    isEditing && (isSending || trimmedText.length === 0 || editIsUnchanged);

  return (
    <Animated.View style={[styles.bar, animatedBarStyle]}>
      {isEditing && onCancelEdit ? (
        <EditPreview
          originalText={editingMessage.content}
          onCancel={onCancelEdit}
        />
      ) : replyTo && onCancelReply ? (
        <ReplyPreview reply={replyTo} onCancel={onCancelReply} />
      ) : null}
      <View style={styles.row}>
        {!isEditing ? (
          <Pressable
            onPress={() => setAttachmentMenuVisible(true)}
            disabled={isSending || isRecording}
            hitSlop={6}
            style={({ pressed }) => [
              styles.attachBtn,
              pressed && styles.pressed,
              (isSending || isRecording) && styles.disabled,
            ]}
          >
            <Ionicons
              name="add"
              size={26}
              color={theme.mutedForeground}
            />
          </Pressable>
        ) : null}
        <View style={styles.inputShell}>
          <TextInput
            ref={inputRef}
            value={text}
            placeholder={isEditing ? "Edite a mensagem" : "Digite uma mensagem"}
            placeholderTextColor={theme.mutedForeground}
            style={styles.input}
            multiline={true}
            editable
            onChangeText={(value) => {
              if (recordingActiveRef.current) return;
              setText(value);
            }}
          />
        </View>
        {isEditing ? (
          <Pressable
            onPress={() => void handleSendText()}
            disabled={editSendDisabled}
            style={({ pressed }) => [
              styles.roundBtn,
              pressed && styles.pressed,
              editSendDisabled && styles.disabled,
            ]}
          >
            <Ionicons
              name="checkmark"
              size={20}
              color={theme.primaryForeground}
            />
          </Pressable>
        ) : trimmedText && !isRecording ? (
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
              color={theme.primaryForeground}
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
              color={theme.primaryForeground}
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
      <AttachmentMenu
        visible={attachmentMenuVisible}
        onClose={() => setAttachmentMenuVisible(false)}
        onChooseGallery={() => void openGallery()}
        onChooseCamera={() => void openCamera()}
      />
      <ImagePreviewModal
        visible={pendingImage != null}
        uri={pendingImage?.uri ?? null}
        sending={imageSending}
        onCancel={() => setPendingImage(null)}
        onConfirm={() => void confirmSendImage()}
      />
    </Animated.View>
  );
});
