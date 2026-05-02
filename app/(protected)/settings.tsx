import { AppHeader } from "@/components/AppHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const { currentUser, firebaseUser } = useAuth();
  const [uploading, setUploading] = useState(false);

  if (!currentUser || !firebaseUser) return null;

  const pickAndUpload = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permissão necessária", "Permita acesso para alterar a foto de perfil.");
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9 });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    if (asset.width !== asset.height) {
      Alert.alert("Recorte inválido", "A foto precisa ser quadrada.");
      return;
    }

    setUploading(true);
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      const previousPath = currentUser.photoPath;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const photoPath = `profilePhotos/${firebaseUser.uid}/${Date.now()}.jpg`;
      const photoRef = ref(storage, photoPath);

      await uploadBytes(photoRef, blob, { contentType: "image/jpeg" });
      const photoUrl = await getDownloadURL(photoRef);

      await updateDoc(userRef, { photoUrl, photoPath });

      if (previousPath) {
        await deleteObject(ref(storage, previousPath)).catch(() => null);
      }

      Alert.alert("Sucesso", "Foto atualizada com sucesso.");
    } catch (error) {
      Alert.alert("Erro", "Não foi possível atualizar a foto.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScreenContainer style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Configurações" onBack={() => router.back()} />
      <View style={styles.content}>
        <Pressable style={styles.card} onPress={() => void pickAndUpload(false)} disabled={uploading}>
          <Ionicons name="image-outline" size={20} color={colors.primary} />
          <Text style={styles.cardText}>Escolher da galeria</Text>
        </Pressable>
        <Pressable style={styles.card} onPress={() => void pickAndUpload(true)} disabled={uploading}>
          <Ionicons name="camera-outline" size={20} color={colors.primary} />
          <Text style={styles.cardText}>Tirar foto</Text>
        </Pressable>

        {currentUser.role === "adult" && (
          <Pressable style={styles.adminBtn} onPress={() => router.push("/admin")}>
            <Ionicons name="settings-outline" size={18} color={colors.primaryForeground} />
            <Text style={styles.adminText}>Abrir gerenciamento</Text>
          </Pressable>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.card,
  },
  cardText: { fontSize: 16, color: colors.foreground, fontWeight: "600" },
  adminBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  adminText: { color: colors.primaryForeground, fontWeight: "700" },
});
