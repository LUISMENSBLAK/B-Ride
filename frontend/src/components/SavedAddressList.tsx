import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Alert } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import client from '../api/client';

interface SavedAddress {
  _id?: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface Props {
  onSelect: (address: SavedAddress) => void;
  recentDestinations?: SavedAddress[];
}

/**
 * UX-B + UX-D: Direcciones guardadas + destinos recientes
 */
export default function SavedAddressList({ onSelect, recentDestinations = [] }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/auth/me').then(res => {
      setSavedAddresses(res.data?.data?.savedAddresses || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (index: number) => {
    const updated = savedAddresses.filter((_, i) => i !== index);
    try {
      await client.put('/auth/profile', { savedAddresses: updated });
      setSavedAddresses(updated);
    } catch {
      Alert.alert('Error', 'No se pudo eliminar');
    }
  };

  return (
    <View style={styles.container}>
      {/* Direcciones guardadas */}
      {savedAddresses.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>📌 {t('addresses.saved', { defaultValue: 'Guardados' })}</Text>
          {savedAddresses.map((addr, i) => (
            <TouchableOpacity key={i} style={styles.row} onPress={() => onSelect(addr)}>
              <View style={styles.iconBox}>
                <Text style={styles.iconText}>{addr.label === 'Casa' ? '🏠' : addr.label === 'Trabajo' ? '🏢' : '📍'}</Text>
              </View>
              <View style={styles.textCol}>
                <Text style={styles.label}>{addr.label}</Text>
                <Text style={styles.address} numberOfLines={1}>{addr.address}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Destinos recientes */}
      {recentDestinations.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>🕐 {t('addresses.recent', { defaultValue: 'Recientes' })}</Text>
          {recentDestinations.slice(0, 5).map((addr, i) => (
            <TouchableOpacity key={`recent-${i}`} style={styles.row} onPress={() => onSelect(addr)}>
              <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceHigh }]}>
                <Text style={styles.iconText}>🔄</Text>
              </View>
              <View style={styles.textCol}>
                <Text style={styles.address} numberOfLines={1}>{addr.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {savedAddresses.length === 0 && recentDestinations.length === 0 && !loading && (
        <Text style={styles.emptyText}>
          {t('addresses.empty', { defaultValue: 'No tienes direcciones guardadas aún' })}
        </Text>
      )}
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { paddingVertical: 8 },
  sectionTitle: { ...theme.typography.body, fontWeight: '700', fontSize: 14, marginBottom: 8, color: theme.colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    paddingHorizontal: 4, gap: 12,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  iconText: { fontSize: 16 },
  textCol: { flex: 1 },
  label: { ...theme.typography.body, fontWeight: '600', fontSize: 14, marginBottom: 2 },
  address: { ...theme.typography.bodyMuted, fontSize: 13 },
  deleteText: { color: theme.colors.textMuted, fontSize: 16, paddingHorizontal: 8 },
  emptyText: { ...theme.typography.bodyMuted, textAlign: 'center', paddingVertical: 20 },
});
