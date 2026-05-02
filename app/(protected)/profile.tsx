import { AppHeader } from "@/components/AppHeader";
import { LoadingDots } from "@/components/LoadingDots";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { randomUuid } from "@/lib/randomUuid";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function roleLabel(role: string) {
  return role === "adult" ? "Adulto" : "Criança";
}

async function blobFromUri(uri: string) {
  const response = await fetch(uri);
  return response.blob();
}

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser, firebaseUser, setCurrentUserPhoto } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!currentUser || !firebaseUser) {
    return (
      <ScreenContainer style={styles.screen} edges={["bottom"]}>
        <View style={styles.center}>
          <LoadingDots />
        </View>
      </ScreenContainer>
    );
  }

  const updatePhotoDocs = async (photoUrl: string | null, photoPath: string | null) => {
    await Promise.all([
      updateDoc(doc(db, "members", currentUser.id), {
        photoUrl,
        photoPath,
      }),
      updateDoc(doc(db, "users", firebaseUser.uid), {
        photoUrl,
        photoPath,
      }),
    ]);
    await setCurrentUserPhoto(photoUrl, photoPath);
  };

  const deletePreviousPhoto = async (path?: string | null) => {
    if (!path) return;
    try {
      await deleteObject(ref(storage, path));
    } catch {}
  };

  const choosePhoto = async () => {
    if (saving) return;
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
    let uploadedPath: string | null = null;
    try {
      const blob = await blobFromUri(asset.uri);
      uploadedPath = `profilePhotos/${currentUser.tenantId}/${currentUser.id}/${randomUuid()}.jpg`;
      const storageRef = ref(storage, uploadedPath);
      await uploadBytes(storageRef, blob, {
        contentType: asset.mimeType ?? "image/jpeg",
      });
      const photoUrl = await getDownloadURL(storageRef);
      const previousPath = currentUser.photoPath ?? null;
      await updatePhotoDocs(photoUrl, uploadedPath);
      await deletePreviousPhoto(previousPath);
    } catch (e) {
      if (uploadedPath) {
        await deletePreviousPhoto(uploadedPath);
      }
      Alert.alert(
        "",
        e instanceof Error ? e.message : "Não foi possível salvar a foto."
      );
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async () => {
    if (saving || !currentUser.photoUrl) return;
    setSaving(true);
    const previousPath = currentUser.photoPath ?? null;
    try {
      await updatePhotoDocs(null, null);
      await deletePreviousPhoto(previousPath);
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
        <View style={styles.avatarWrap}>
          <ProfileAvatar
            name={currentUser.name}
            photoUrl={currentUser.photoUrl}
            size={132}
          />
          {saving ? (
            <View style={styles.savingOverlay}>
              <ActivityIndicator color={colors.primaryForeground} />
            </View>
          ) : null}
        </View>

        <Text style={styles.name}>{currentUser.name}</Text>
        <Text style={styles.meta}>{roleLabel(currentUser.role)}</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void choosePhoto()}
            disabled={saving}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || saving) && styles.pressed,
            ]}
          >
            <Ionicons name="image-outline" size={18} color={colors.primaryForeground} />
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
              <Ionicons name="trash-outline" size={18} color={colors.destructive} />
              <Text style={styles.dangerBtnText}>Remover foto</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  name: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
  },
  meta: {
    marginTop: 6,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  actions: {
    alignSelf: "stretch",
    marginTop: 32,
    gap: 12,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "700",
  },
  dangerBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dangerBtnText: {
    color: colors.destructive,
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
});
