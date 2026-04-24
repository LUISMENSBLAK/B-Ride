/**
 * NotificationsScreen — [V2-001]
 * Pantalla básica de notificaciones. Extensible cuando haya un sistema de notificaciones.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('notifications.title', { defaultValue: 'Notificaciones' })}
        </Text>
      </View>
      <View style={styles.emptyState}>
        <Ionicons name="notifications-off-outline" size={64} color={theme.colors.textMuted ?? 'rgba(255,255,255,0.25)'} />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          {t('notifications.empty', { defaultValue: 'Sin notificaciones' })}
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted ?? 'rgba(255,255,255,0.45)' }]}>
          {t('notifications.emptySub', { defaultValue: 'Aquí aparecerán tus alertas de viaje y actualizaciones.' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
