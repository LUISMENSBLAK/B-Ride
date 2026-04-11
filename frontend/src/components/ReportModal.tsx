import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView
} from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import client from '../api/client';

interface ReportModalProps {
  rideId: string;
  reportedUserId: string;
  reportedUserName: string;
  onClose: () => void;
}

const REPORT_TYPES = [
  { key: 'SAFETY', emoji: '🛡️', label: 'Seguridad' },
  { key: 'BEHAVIOR', emoji: '😤', label: 'Comportamiento' },
  { key: 'ROUTE', emoji: '🗺️', label: 'Ruta incorrecta' },
  { key: 'VEHICLE', emoji: '🚗', label: 'Estado del vehículo' },
  { key: 'PAYMENT', emoji: '💳', label: 'Problema de pago' },
  { key: 'OTHER', emoji: '📝', label: 'Otro' },
];

/**
 * S5: Modal de reporte post-viaje
 */
export default function ReportModal({ rideId, reportedUserId, reportedUserName, onClose }: ReportModalProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('', 'Selecciona el tipo de reporte');
      return;
    }
    if (!description.trim()) {
      Alert.alert('', 'Describe lo que pasó');
      return;
    }

    setLoading(true);
    try {
      await client.post('/reports', {
        rideId,
        reportedUserId,
        type: selectedType,
        description: description.trim(),
      });
      Alert.alert('✅ Reporte enviado', 'Nuestro equipo lo revisará pronto. Gracias por reportar.');
      onClose();
    } catch (e) {
      Alert.alert('Error', 'No se pudo enviar el reporte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>⚠️ Reportar a {reportedUserName}</Text>
      <Text style={styles.subtitle}>¿Qué tipo de problema tuviste?</Text>

      <View style={styles.typesGrid}>
        {REPORT_TYPES.map(rt => (
          <TouchableOpacity
            key={rt.key}
            style={[styles.typeBtn, selectedType === rt.key && styles.typeBtnActive]}
            onPress={() => setSelectedType(rt.key)}
          >
            <Text style={styles.typeEmoji}>{rt.emoji}</Text>
            <Text style={[styles.typeLabel, selectedType === rt.key && styles.typeLabelActive]}>{rt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.textArea}
        placeholder="Describe lo que pasó..."
        placeholderTextColor={theme.colors.inputPlaceholder}
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.5 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.submitBtnText}>Enviar reporte</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
        <Text style={styles.cancelBtnText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { ...theme.typography.title, fontSize: 20, marginBottom: 4 },
  subtitle: { ...theme.typography.bodyMuted, marginBottom: 20 },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeBtn: {
    width: '47%', padding: 14, borderRadius: 12, borderWidth: 1,
    borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface,
  },
  typeBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  typeEmoji: { fontSize: 24, marginBottom: 4 },
  typeLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  typeLabelActive: { color: theme.colors.primary },
  textArea: {
    backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16,
    minHeight: 100, fontSize: 15, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary, padding: 16, borderRadius: 30,
    alignItems: 'center', marginBottom: 12,
  },
  submitBtnText: { ...theme.typography.button },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelBtnText: { color: theme.colors.textMuted, fontWeight: '600' },
});
