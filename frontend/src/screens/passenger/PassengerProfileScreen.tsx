import { useAppTheme } from '../../hooks/useAppTheme';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Switch, Image, Alert, ActivityIndicator, Share, Modal, TextInput } from 'react-native';
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
  
  const [referralData, setReferralData] = useState<{code: string, count: number, bonus: number} | null>(null);

  // WALLET
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletTx, setWalletTx] = useState<any[]>([]);
  const [topupModal, setTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);

  useEffect(() => { loadSettings(); }, []);
  
  useEffect(() => {
     client.get('/auth/referral').then(res => setReferralData(res.data.data)).catch(() => {});
     fetchWallet();
  }, []);

  const fetchWallet = async () => {
     try {
       const resB = await client.get('/wallet/balance');
       if (resB.data.success) setWalletBalance(resB.data.data.balance);
       const resT = await client.get('/wallet/transactions');
       if (resT.data.success) setWalletTx(resT.data.data);
     } catch (e) {}
  };

  const handleTopup = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) return Alert.alert('Error', 'Monto inválido');
    setTopupLoading(true);
    try {
      const res = await client.post('/wallet/topup', { amount: amt });
      if (res.data.success) {
        Alert.alert('Éxito', 'Recarga realizada correctamente');
        setTopupModal(false);
        setTopupAmount('');
        fetchWallet();
      }
    } catch(e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Fallo de recarga');
    } finally {
      setTopupLoading(false);
    }
  };

  const handleShareReferral = async () => {
     if (!referralData?.code) return;
     try {
       await Share.share({
         message: `¡Únete a B-Ride y viaja seguro! Usa mi código ${referralData.code} al registrarte para obtener un descuento especial.`,
       });
     } catch (error) {}
  };

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
      
      {/* Referral System */}
      {referralData && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CÓDIGO DE REFERIDO</Text>
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
             <Text style={{ fontSize: 28, fontWeight: '800', color: theme.colors.primary, letterSpacing: 3 }}>
                 {referralData.code}
             </Text>
             <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
                 Referidos: {referralData.count} • Ganancias: ${referralData.bonus.toFixed(2)}
             </Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareReferral}>
             <Text style={styles.shareBtnText}>Compartir Código</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Wallet */}
      <View style={styles.section}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
           <Text style={styles.sectionLabel}>MI BILLETERA</Text>
           <TouchableOpacity onPress={() => setTopupModal(true)}>
             <Text style={{color: theme.colors.primary, fontWeight: 'bold'}}>+ Recargar</Text>
           </TouchableOpacity>
        </View>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
           <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Saldo Disponible</Text>
           <Text style={{ fontSize: 36, fontWeight: '800', color: theme.colors.text }}>${walletBalance?.toFixed(2) || '0.00'}</Text>
        </View>
        <Text style={{fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1}}>Últimos Movimientos</Text>
        {walletTx.slice(0, 5).map((tx, idx) => (
          <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
             <Text style={{ color: theme.colors.text }}>{tx.type === 'TOPUP' ? 'Recarga' : 'Pago de viaje'}</Text>
             <Text style={{ color: tx.type === 'TOPUP' ? theme.colors.success : theme.colors.text, fontWeight: 'bold' }}>
               {tx.type === 'TOPUP' ? '+' : '-'}${tx.amount.toFixed(2)}
             </Text>
          </View>
        ))}
        {walletTx.length === 0 && <Text style={{color: theme.colors.textMuted, fontSize: 13, fontStyle: 'italic'}}>Sin movimientos recientes.</Text>}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>{t('settings.logout')}</Text>
      </TouchableOpacity>

      <Modal visible={topupModal} transparent animationType="slide">
         <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 }}>
            <View style={{ backgroundColor: theme.colors.surface, padding: 24, borderRadius: 20 }}>
               <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: 20 }}>Recargar Billetera</Text>
               <TextInput 
                  style={{ backgroundColor: theme.colors.inputBackground, padding: 16, borderRadius: 12, color: theme.colors.text, fontSize: 24, textAlign: 'center', marginBottom: 20 }}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={topupAmount}
                  onChangeText={setTopupAmount}
               />
               <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.logoutBtn, { flex: 1, backgroundColor: theme.colors.surfaceHigh }]} onPress={() => setTopupModal(false)}>
                     <Text style={{ color: theme.colors.text, fontWeight: 'bold', textAlign: 'center' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.logoutBtn, { flex: 1, backgroundColor: theme.colors.primary }]} onPress={handleTopup} disabled={topupLoading}>
                     {topupLoading ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontWeight: 'bold', textAlign: 'center' }}>Abonar</Text>}
                  </TouchableOpacity>
               </View>
            </View>
         </View>
      </Modal>
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
  
  shareBtn: { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.primary, borderWidth: 1, padding: 12, borderRadius: theme.borderRadius.pill, alignItems: 'center', marginTop: 8 },
  shareBtnText: { ...theme.typography.button, color: theme.colors.primary },
  
  skeletonSection: { width: '100%', height: 160, backgroundColor: theme.colors.surfaceHigh, borderRadius: 20, padding: 24 },
});
