import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAuthStore } from '../store/authStore';

/**
 * UX-E: Card del vehículo del conductor en su dashboard
 */
export default function DriverVehicleCard() {
  const theme = useAppTheme();
  const { user } = useAuthStore();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const vehicle = (user as any)?.vehicle;
  if (!vehicle?.make) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.emoji}>🚗</Text>
        <View style={styles.info}>
          <Text style={styles.vehicleName}>
            {vehicle.color} {vehicle.make} {vehicle.model}
          </Text>
          <Text style={styles.plate}>{vehicle.plate}</Text>
        </View>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{vehicle.type || 'SEDAN'}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{vehicle.year || '—'}</Text>
          <Text style={styles.statLabel}>Año</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{vehicle.capacity || 4}</Text>
          <Text style={styles.statLabel}>Pasajeros</Text>
        </View>
      </View>
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.m,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  emoji: { fontSize: 28 },
  info: { flex: 1 },
  vehicleName: { ...theme.typography.body, fontWeight: '700', fontSize: 16, marginBottom: 2 },
  plate: { ...theme.typography.bodyMuted, fontSize: 14, fontWeight: '600', letterSpacing: 1 },
  typeBadge: {
    backgroundColor: theme.colors.primaryLight, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: theme.borderRadius.pill,
  },
  typeText: { color: theme.colors.primary, fontSize: 11, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 16 },
  stat: { alignItems: 'center' },
  statValue: { ...theme.typography.body, fontWeight: '700', fontSize: 16 },
  statLabel: { ...theme.typography.caption, color: theme.colors.textMuted },
});
