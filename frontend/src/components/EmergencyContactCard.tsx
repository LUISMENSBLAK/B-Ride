import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import client from '../api/client';

/**
 * S4: Gestión de contacto de emergencia
 */
export default function EmergencyContactCard() {
  const theme = useAppTheme();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Cargar contacto de emergencia existente
    client.get('/auth/me').then(res => {
      const ec = res.data?.data?.emergencyContact;
      if (ec?.name) {
        setName(ec.name);
        setPhone(ec.phone || '');
        setRelation(ec.relation || '');
        setSaved(true);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!name || !phone) {
      Alert.alert(t('general.error', { defaultValue: 'Error' }), 'Nombre y teléfono son obligatorios');
      return;
    }
    setLoading(true);
    try {
      await client.put('/auth/profile', {
        emergencyContact: { name, phone, relation }
      });
      setSaved(true);
      Alert.alert('✅', t('emergency.saved', { defaultValue: 'Contacto de emergencia guardado' }));
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar');
    } finally {
      setLoading(false);
    }
  };

  const styles = React.useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🆘 {t('emergency.title', { defaultValue: 'Contacto de emergencia' })}</Text>
      <Text style={styles.subtitle}>
        {t('emergency.subtitle', { defaultValue: 'Se notificará a esta persona si activas SOS' })}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('emergency.namePlaceholder', { defaultValue: 'Nombre' })}
        placeholderTextColor={theme.colors.inputPlaceholder}
        value={name}
        onChangeText={setName}
        returnKeyType="next"
      />
      <TextInput
        style={styles.input}
        placeholder={t('emergency.phonePlaceholder', { defaultValue: 'Teléfono' })}
        placeholderTextColor={theme.colors.inputPlaceholder}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        returnKeyType="next"
      />
      <TextInput
        style={styles.input}
        placeholder={t('emergency.relationPlaceholder', { defaultValue: 'Relación (ej: mamá, pareja)' })}
        placeholderTextColor={theme.colors.inputPlaceholder}
        value={relation}
        onChangeText={setRelation}
        returnKeyType="done"
      />

      <TouchableOpacity
        style={[styles.saveBtn, loading && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={loading}
      >
        <Text style={styles.saveBtnText}>
          {saved
            ? t('emergency.update', { defaultValue: 'Actualizar' })
            : t('emergency.save', { defaultValue: 'Guardar' })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: { ...theme.typography.title, fontSize: 18, marginBottom: 4 },
  subtitle: { ...theme.typography.bodyMuted, fontSize: 13, marginBottom: theme.spacing.m },
  input: {
    backgroundColor: theme.colors.background,
    padding: 14,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.s,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: theme.borderRadius.pill,
    alignItems: 'center',
    marginTop: theme.spacing.s,
  },
  saveBtnText: { ...theme.typography.button, fontSize: 15 },
});
