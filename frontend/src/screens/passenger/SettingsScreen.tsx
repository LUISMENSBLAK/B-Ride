/**
 * SettingsScreen — Pantalla de ajustes premium estilo Uber.
 *
 * Secciones:
 *  1. Perfil (avatar + datos)
 *  2. Métodos de pago (Stripe ready)
 *  3. Idioma (selector inline)
 *  4. Notificaciones (toggles persistentes)
 *  5. Privacidad
 *  6. Apariencia (dark mode base)
 *  7. Soporte
 *  8. Logout
 *
 * Compartido entre Passenger y Driver via prop `role`.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  CreditCard,
  Globe,
  Bell,
  Megaphone,
  FileText,
  Lock,
  Trash2,
  Moon,
  HelpCircle,
  Mail,
  LogOut,
  Check,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useSettings } from '../../hooks/useSettings';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { Theme } from '../../theme';
import SettingsItem from '../../components/settings/SettingsItem';
import SettingsSection, { SectionDivider } from '../../components/settings/SettingsSection';
import ToggleItem from '../../components/settings/ToggleItem';
import api from '../../api/client';

const APP_VERSION = '1.0.0';

// ─── Animated section wrapper for staggered entry ──────────────────────────
function AnimatedSection({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    const delay = index * 60; // 60ms stagger
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.ease) })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, logout, updateUser } = useAuthStore();
  const { t, lang, setLang } = useTranslation();
  const {
    notificationsEnabled,
    promoNotificationsEnabled,
    darkMode,
    loadSettings,
    toggleNotifications,
    togglePromo,
    toggleDarkMode,
    avatarUri,
    setAvatar,
  } = useSettings();

  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const theme = useAppTheme();
  
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  useEffect(() => {
    loadSettings();
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleLogoutAll = () => {
    Alert.alert(
      'Cerrar sesión global',
      '¿Estás seguro de cerrar la sesión en TODOS tus dispositivos activos?',
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: 'Sí, cerrar en todos', style: 'destructive', onPress: async () => {
            try {
              await api.post('/auth/logout-all');
              logout();
            } catch (e) {
              Alert.alert('Error', 'No se pudo cerrar sesión en todos los dispositivos');
            }
          }
        },
      ]
    );
  };

  const handleSetLang = async (next: string) => {
    await setLang(next);
    setLangPickerOpen(false);
  };

  // Avatar initials
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(t('general.locationDenied', { defaultValue: 'Permiso denegado' }), 'Se requiere acceso a la galería.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!pickerResult.canceled && pickerResult.assets?.[0]) {
      setIsUploading(true);
      try {
        const localUri = pickerResult.assets[0].uri;
        const filename = localUri.split('/').pop() || 'avatar.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image`;

        const formData = new FormData();
        // @ts-ignore
        formData.append('avatar', { uri: localUri, name: filename, type });

        const res = await api.post('/auth/profile/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data.success && res.data.avatarUrl) {
            await updateUser({ avatarUrl: res.data.avatarUrl });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (err) {
        console.error('Upload avatar error', err);
        Alert.alert('Error', 'No se pudo subir la foto de perfil');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const getLanguageLabel = (l: string) => {
    if (l === 'es') return '🇪🇸 ' + t('settings.spanish');
    if (l === 'en') return '🇬🇧 ' + t('settings.english');
    if (l === 'fr') return '🇫🇷 ' + (t('settings.french') || 'Français');
    if (l === 'de') return '🇩🇪 ' + (t('settings.german') || 'Deutsch');
    if (l === 'it') return '🇮🇹 ' + (t('settings.italian') || 'Italiano');
    return '🇪🇸  Español';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ 1. PERFIL ═══ */}
        <AnimatedSection index={0}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              {user?.avatarUrl ? (
                <Image key={user.avatarUrl} source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name ?? '—'}</Text>
              <Text style={styles.profileEmail}>{user?.email ?? '—'}</Text>
              {user?.avgRating != null && (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingValue}>
                    {user.avgRating.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </AnimatedSection>

        {/* ═══ 2. MÉTODOS DE PAGO ═══ */}
        <AnimatedSection index={1}>
          <SettingsSection label={t('settings.paymentMethods')}>
            <SettingsItem
              icon={<CreditCard size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.managePayments')}
              value="Stripe"
              onPress={() => {
                Alert.alert(t('general.underConstruction'), t('general.underConstructionMsg'));
              }}
            />
          </SettingsSection>
        </AnimatedSection>


        {/* ═══ 3. IDIOMA ═══ */}
        <AnimatedSection index={2}>
          <SettingsSection label={t('settings.language')}>
            <SettingsItem
              icon={<Globe size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.selectLanguage')}
              value={getLanguageLabel(lang)}
              onPress={() => setLangPickerOpen(!langPickerOpen)}
            />
            {langPickerOpen && (
              <View style={styles.langPicker}>
                <SettingsItem label={getLanguageLabel('es')} onPress={() => handleSetLang('es')} />
                <SettingsItem label={getLanguageLabel('en')} onPress={() => handleSetLang('en')} />
                <SettingsItem label={getLanguageLabel('fr')} onPress={() => handleSetLang('fr')} />
                <SettingsItem label={getLanguageLabel('de')} onPress={() => handleSetLang('de')} />
                <SettingsItem label={getLanguageLabel('it')} onPress={() => handleSetLang('it')} />
              </View>
            )}
          </SettingsSection>
        </AnimatedSection>

        {/* ═══ 4. NOTIFICACIONES ═══ */}
        <AnimatedSection index={3}>
          <SettingsSection label={t('settings.notifications')}>
            <ToggleItem
              icon={<Bell size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.rideNotifications')}
              value={notificationsEnabled}
              onToggle={toggleNotifications}
            />
            <SectionDivider />
            <ToggleItem
              icon={<Megaphone size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.promoNotifications')}
              value={promoNotificationsEnabled}
              onToggle={togglePromo}
            />
          </SettingsSection>
        </AnimatedSection>

        {/* ═══ 5. PRIVACIDAD ═══ */}
        <AnimatedSection index={4}>
          <SettingsSection label={t('settings.privacy')}>
            <SettingsItem
              icon={<FileText size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.termsOfService')}
              onPress={() => {
                 Alert.alert(t('general.underConstruction'), t('general.underConstructionMsg'));
              }}
            />
            <SectionDivider />
            <SettingsItem
              icon={<Lock size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.privacyPolicy')}
              onPress={() => {
                 Alert.alert(t('general.underConstruction'), t('general.underConstructionMsg'));
              }}
            />
            <SectionDivider />
            <SettingsItem
              icon={<Trash2 size={20} color={theme.colors.error} />}
              label={t('settings.deleteAccount')}
              destructive
              onPress={() => {
                Alert.alert(
                  t('settings.deleteAccount'),
                  t('settings.deleteAccountConfirm'),
                  [
                    { text: t('settings.cancel'), style: 'cancel' },
                    {
                      text: t('settings.delete'),
                      style: 'destructive',
                      onPress: () => {
                        // BUG 23 FIX: Informar al usuario que la función está en desarrollo
                        Alert.alert(
                          t('general.underConstruction', { defaultValue: 'Próximamente' }),
                          t('general.underConstructionMsg', { defaultValue: 'Esta función estará disponible pronto.' })
                        );
                      },
                    },
                  ]
                );
              }}
            />
          </SettingsSection>
        </AnimatedSection>

        {/* ═══ 6. APARIENCIA ═══ */}
        <AnimatedSection index={5}>
          <SettingsSection label={t('settings.theme')}>
            <ToggleItem
              icon={<Moon size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.darkMode')}
              value={darkMode}
              onToggle={toggleDarkMode}
            />
          </SettingsSection>
        </AnimatedSection>

        {/* ═══ 7. SOPORTE ═══ */}
        <AnimatedSection index={6}>
          <SettingsSection label={t('settings.support')}>
            <SettingsItem
              icon={<HelpCircle size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.helpCenter')}
              onPress={() => { Alert.alert(t('general.underConstruction'), t('general.underConstructionMsg')); }}
            />
            <SectionDivider />
            <SettingsItem
              icon={<Mail size={20} color={theme.wixarika.settingsIcon} />}
              label={t('settings.contactUs')}
              onPress={() => { Alert.alert(t('general.underConstruction'), t('general.underConstructionMsg')); }}
            />
          </SettingsSection>
        </AnimatedSection>

        {/* ═══ 8. LOGOUT ═══ */}
        <AnimatedSection index={7}>
          <View style={styles.logoutSection}>
            <SettingsSection>
              <SettingsItem
                icon={<LogOut size={20} color={theme.colors.danger} />}
                label={t('settings.logout')}
                destructive
                onPress={handleLogout}
              />
              <SectionDivider />
              <SettingsItem
                icon={<LogOut size={20} color={theme.colors.danger} />}
                label="Cerrar sesión en todos los dispositivos"
                destructive
                onPress={handleLogoutAll}
              />
            </SettingsSection>
          </View>
        </AnimatedSection>

        {/* ── Version ── */}
        <Text style={styles.version}>
          {t('settings.version')} {APP_VERSION}
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    ...theme.typography.header,
    fontSize: 28,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.m,
    paddingTop: theme.spacing.m,
    paddingBottom: 48,
  },

  // ── Profile Card ─────────────────────────────────────────────────
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    marginBottom: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    // Glow
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.primaryText,
    letterSpacing: 1,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingStar: {
    fontSize: 14,
    color: theme.colors.primary,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },

  // ── Language picker ──────────────────────────────────────────────
  langPicker: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  // ── Logout ───────────────────────────────────────────────────────
  logoutSection: {
    marginTop: theme.spacing.l,
  },

  // ── Version ──────────────────────────────────────────────────────
  version: {
    ...theme.typography.caption,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
});
