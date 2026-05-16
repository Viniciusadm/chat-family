import { AppHeader } from "@/components/AppHeader";
import { LoadingDots } from "@/components/LoadingDots";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ThemePicker } from "@/components/ThemePicker";
import { useAuth } from "@/context/AuthContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useMemberProfiles } from "@/hooks/useMemberProfiles";
import { uploadProfilePhoto, deleteProfilePhoto } from "@/src/api/media";
import { useTheme } from "@/theme/ThemeContext";
import { useThemedStyles } from "@/theme/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function roleLabel(role: string) {
  return role === "adult" ? "Adulto" : "Criança";
}

export default function ProfileScreen() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { currentUser, setCurrentUserPhoto } = useAuth();
  const { isOnline } = useConnectivity();
  const memberProfiles = useMemberProfiles();
  const [saving, setSaving] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const { theme } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      screen: {
        flex: 1,
        backgroundColor: t.background,
      },
      center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      },
      content: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 36,
      },
      avatarWrap: {
        width: 132,
        height: 132,
        borderRadius: 66,
        overflow: "hidden",
      },
      savingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.modalBackdrop,
      },
      name: {
        marginTop: 18,
        fontSize: 22,
        fontWeight: "700",
        color: t.foreground,
        textAlign: "center",
      },
      meta: {
        marginTop: 6,
        fontSize: 14,
        color: t.mutedForeground,
      },
      actions: {
        alignSelf: "stretch",
        marginTop: 32,
        gap: 12,
      },
      primaryBtn: {
        minHeight: 48,
        borderRadius: 12,
        backgroundColor: t.primary,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      },
      primaryBtnText: {
        color: t.primaryForeground,
        fontSize: 16,
        fontWeight: "700",
      },
      dangerBtn: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.border,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      },
      dangerBtnText: {
        color: t.destructive,
        fontSize: 16,
        fontWeight: "700",
      },
      photoModalRoot: {
        flex: 1,
        backgroundColor: t.viewerBackdrop,
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      },
      photoModalHeader: {
        position: "absolute",
        top: 48,
        right: 20,
        zIndex: 2,
      },
      photoClose: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.overlayLight,
      },
      fullPhoto: {
        width: "100%",
        height: "82%",
      },
      pressed: {
        opacity: 0.72,
      },
    })
  );

  if (!currentUser) {
    return (
      <ScreenContainer style={styles.screen} edges={["bottom"]}>
        <View style={styles.center}>
          <LoadingDots />
        </View>
      </ScreenContainer>
    );
  }

  const isOwnProfile = !memberId || memberId === currentUser.id;
  const viewedProfile = isOwnProfile ? currentUser : memberProfiles[memberId];
  const canMutatePhoto = isOwnProfile && isOnline;

  if (!viewedProfile) {
    return (
      <ScreenContainer style={styles.screen} edges={["bottom"]}>
        <AppHeader title="Perfil" onBack={() => router.back()} />
        <View style={styles.center}>
          <LoadingDots />
        </View>
      </ScreenContainer>
    );
  }

  const choosePhoto = async () => {
    if (saving || !canMutatePhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("", "Permita acesso às fotos para escolher uma imagem.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.86,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.width !== asset.height) {
      Alert.alert("", "A foto precisa ser cortada em formato quadrado antes do envio.");
      return;
    }

    setSaving(true);
    try {
      const uploaded = await uploadProfilePhoto({
        uri: asset.uri,
        name: "profile.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      await setCurrentUserPhoto(uploaded.url, uploaded.path ?? null);
    } catch (e) {
      Alert.alert(
        "",
        e instanceof Error ? e.message : "Não foi possível salvar a foto."
      );
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async () => {
    if (saving || !canMutatePhoto || !currentUser.photoUrl) return;
    setSaving(true);
    const previousPath = currentUser.photoPath ?? null;
    try {
      void previousPath;
      await deleteProfilePhoto();
      await setCurrentUserPhoto(null, null);
    } catch (e) {
      Alert.alert(
        "",
        e instanceof Error ? e.message : "Não foi possível remover a foto."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Perfil" onBack={() => router.back()} />
      <View style={styles.content}>
        <Pressable
          onPress={() => {
            if (viewedProfile.photoUrl) setPhotoModalVisible(true);
          }}
          disabled={!viewedProfile.photoUrl}
          style={({ pressed }) => [
            styles.avatarWrap,
            pressed && styles.pressed,
          ]}
        >
          <ProfileAvatar
            name={viewedProfile.name}
            photoUrl={viewedProfile.photoUrl}
            size={132}
          />
          {saving && isOwnProfile ? (
            <View style={styles.savingOverlay}>
              <ActivityIndicator color={theme.primaryForeground} />
            </View>
          ) : null}
        </Pressable>

        <Text style={styles.name}>{viewedProfile.name}</Text>
        <Text style={styles.meta}>{roleLabel(viewedProfile.role)}</Text>

        {canMutatePhoto ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => void choosePhoto()}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryBtn,
                (pressed || saving) && styles.pressed,
              ]}
            >
              <Ionicons
                name="image-outline"
                size={18}
                color={theme.primaryForeground}
              />
              <Text style={styles.primaryBtnText}>
                {currentUser.photoUrl ? "Trocar foto" : "Adicionar foto"}
              </Text>
            </Pressable>

            {currentUser.photoUrl ? (
              <Pressable
                onPress={() => void removePhoto()}
                disabled={saving}
                style={({ pressed }) => [
                  styles.dangerBtn,
                  (pressed || saving) && styles.pressed,
                ]}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={theme.destructive}
                />
                <Text style={styles.dangerBtnText}>Remover foto</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isOwnProfile ? <ThemePicker /> : null}
      </View>

      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <Pressable
          style={styles.photoModalRoot}
          onPress={() => setPhotoModalVisible(false)}
        >
          <View style={styles.photoModalHeader}>
            <Pressable
              onPress={() => setPhotoModalVisible(false)}
              hitSlop={12}
              style={styles.photoClose}
            >
              <Ionicons name="close" size={28} color={theme.primaryForeground} />
            </Pressable>
          </View>
          {viewedProfile.photoUrl ? (
            <Image
              source={{ uri: viewedProfile.photoUrl }}
              style={styles.fullPhoto}
              contentFit="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}
