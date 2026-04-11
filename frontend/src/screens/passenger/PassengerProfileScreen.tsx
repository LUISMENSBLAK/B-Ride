import { useAppTheme } from '../../hooks/useAppTheme';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Switch, Image, Alert, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import client from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../theme';
import SkeletonLoader from '../../components/SkeletonLoader';
import { useTranslation } from '../../hooks/useTranslation';
import { useSettings } from '../../hooks/useSettings';

export default function PassengerProfileScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const { user, logout, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { t, lang } = useTranslation();
  // BUG 17 FIX: Conectar Switch al estado real de notificaciones
  const { notificationsEnabled, toggleNotifications, loadSettings } = useSettings();

  useEffect(() => { loadSettings(); }, []);

  const getLanguageLabel = (l: string) => {
    switch(l) {
      case 'en': return t('settings.english');
      case 'fr': return t('settings.french');
      case 'de': return t('settings.german');
      case 'it': return t('settings.italian');
      default: return t('settings.spanish');
    }
  };

  // Simulating load for premium feel
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string) => {
      setUploading(true);
      try {
          const filename = uri.split('/').pop() || 'avatar.jpg';
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : `image`;

          const formData = new FormData();
          // @ts-ignore
          formData.append('avatar', { uri, name: filename, type });

          const res = await client.post('/auth/profile/avatar', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          if (res.data.success && res.data.avatarUrl) {
              await updateUser({ avatarUrl: res.data.avatarUrl });
              Alert.alert('Éxito', 'Foto de perfil actualizada correctamente.');
          }
      } catch (err: any) {
          Alert.alert('Error', err.response?.data?.message || 'No se pudo subir la foto');
      } finally {
          setUploading(false);
      }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <SkeletonLoader width={80} height={80} borderRadius={40} style={{ alignSelf: 'center', marginTop: 40, marginBottom: 16 }} />
          <SkeletonLoader width={150} height={28} borderRadius={8} style={{ alignSelf: 'center', marginBottom: 8 }} />
          <SkeletonLoader width={200} height={16} borderRadius={4} style={{ alignSelf: 'center', marginBottom: 48 }} />
          
          <View style={styles.skeletonSection}>
            <SkeletonLoader width="100%" height={20} borderRadius={4} style={{ marginBottom: 24 }} />
            <SkeletonLoader width="100%" height={20} borderRadius={4} style={{ marginBottom: 24 }} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity activeOpacity={0.8} style={styles.profileCard} onPress={handlePickImage} disabled={uploading}>
        <View style={styles.avatar}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 40 }} />
          ) : (
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? 'P'}</Text>
          )}
          {uploading && (
             <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 40, justifyContent: 'center', alignItems: 'center' }]}>
                 <ActivityIndicator color="#fff" />
             </View>
          )}
        </View>
        <View style={styles.editBadge}><Text style={{fontSize: 12}}>✏️</Text></View>
        <Text style={styles.name}>{user?.name ?? 'Pasajero'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('settings.preferences')}</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingText}>🌐 {t('settings.language')}</Text>
          <Text style={styles.settingValue}>{getLanguageLabel(lang)}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingText}>🔔 {t('settings.notifications')}</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor={theme.colors.background}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>{t('settings.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: theme.spacing.xl, paddingBottom: 40 },
  profileCard: { alignItems: 'center', paddingVertical: theme.spacing.xl, marginBottom: theme.spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.m,
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: theme.colors.primaryText },
  editBadge: { position: 'absolute', top: 90, backgroundColor: theme.colors.surface, padding: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border },
  name: { ...theme.typography.header, fontSize: 24, marginBottom: 4, marginTop: 8 },
  email: { ...theme.typography.bodyMuted },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.l,
    marginBottom: theme.spacing.xl,
  },
  sectionLabel: { ...theme.typography.bodyMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: theme.spacing.m },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  settingText: { ...theme.typography.body, fontSize: 16 },
  settingValue: { ...theme.typography.bodyMuted },
  logoutBtn: { backgroundColor: theme.colors.error, padding: 16, borderRadius: theme.borderRadius.pill, alignItems: 'center' },
  logoutText: { ...theme.typography.button, color: theme.colors.primaryText },
  
  skeletonSection: { width: '100%', height: 160, backgroundColor: theme.colors.surfaceHigh, borderRadius: 20, padding: 24 },
});
