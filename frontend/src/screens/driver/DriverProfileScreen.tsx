import { useAppTheme } from '../../hooks/useAppTheme';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Switch, Image } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../theme';
import { useTranslation } from '../../hooks/useTranslation';
import { useSettings } from '../../hooks/useSettings';

export default function DriverProfileScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const { t, lang } = useTranslation();

  const getLanguageLabel = (l: string) => {
    switch(l) {
      case 'en': return t('settings.english');
      case 'fr': return t('settings.french');
      case 'de': return t('settings.german');
      case 'it': return t('settings.italian');
      default: return t('settings.spanish');
    }
  };

  const { user, logout } = useAuthStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + Info */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 40 }} />
          ) : (
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? 'D'}</Text>
          )}
        </View>
        <Text style={styles.name}>{user?.name ?? t('auth.roleDriver')}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.ratingRow}>
          <Text style={styles.ratingText}>⭐ {(user?.avgRating ?? 5.0).toFixed(1)}</Text>
          <Text style={styles.ratingCount}> ({user?.totalRatings === 1 ? t('driver.reviews_one', { count: 1 }) : t('driver.reviews_other', { count: user?.totalRatings ?? 0 })})</Text>
        </View>
      </View>

      {/* Opciones */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('settings.configuration')}</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>🌐 {t('settings.language')}</Text>
          <Text style={styles.settingValue}>{getLanguageLabel(lang)}</Text>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>🔔 {t('settings.notifications')}</Text>
          <Switch
            value={true}
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
    justifyContent: 'center', alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: theme.colors.primaryText },
  name: { ...theme.typography.header, fontSize: 24, marginBottom: 4 },
  email: { ...theme.typography.bodyMuted, marginBottom: theme.spacing.s },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { ...theme.typography.body, fontWeight: '700', fontSize: 16 },
  ratingCount: { ...theme.typography.bodyMuted, fontSize: 14 },
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
  logoutBtn: {
    backgroundColor: theme.colors.error,
    padding: 16, borderRadius: theme.borderRadius.pill,
    alignItems: 'center',
  },
  logoutText: { ...theme.typography.button, color: theme.colors.primaryText },
});
