import React, { memo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { type Theme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ActiveRidePanelProps {
  status: string;
  driverName?: string;
  driverPhotoUrl?: string;
  driverRating?: number;
  totalRatings?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  vehicleColor?: string;
  onChatPress: () => void;
  onCallPress: () => void;
  onSosPress: () => void;
}

const ActiveRidePanel = memo((props: ActiveRidePanelProps) => {
  const { status, driverName, driverPhotoUrl, driverRating, totalRatings, vehicleMake, vehicleModel, vehiclePlate, vehicleColor, onChatPress, onCallPress, onSosPress } = props;
  const theme = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
  // Status logic
  let statusText = 'Tu driver está en camino';
  let statusColor = theme.colors.primary;
  
  if (status === 'ARRIVING' || status === 'ARRIVED') {
    statusText = '¡Tu conductor ha llegado!';
    statusColor = theme.colors.success;
  } else if (status === 'IN_PROGRESS' || status === 'ACTIVE') {
    statusText = 'Disfruta tu viaje';
    statusColor = '#00B8AD';
  }
  
  const initial = driverName ? driverName.charAt(0).toUpperCase() : '?';

  return (
    <Animated.View 
      entering={FadeInUp.duration(400).springify()} 
      exiting={FadeOutDown.duration(300)}
      style={[styles.container, { paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.handle} />
      
      {/* ── Status Header ── */}
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusTitle, { color: statusColor }]}>{statusText}</Text>
      </View>

      {/* ── Driver & Vehicle Info ── */}
      <View style={styles.driverRow}>
        <View style={styles.avatarContainer}>
          {driverPhotoUrl ? (
            <Image source={{ uri: driverPhotoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>★ {driverRating ? driverRating.toFixed(1) : 'Nuevo'}</Text>
          </View>
        </View>

        <View style={styles.infoCol}>
          <Text style={styles.driverName}>{driverName || 'Conductor asignado'}</Text>
          <Text style={styles.vehicleInfo}>
            {vehicleColor || ''} {vehicleMake || ''} {vehicleModel || ''}
          </Text>
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{vehiclePlate || 'EN RUTA'}</Text>
          </View>
        </View>
      </View>

      {/* ── Action Buttons ── */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onCallPress} activeOpacity={0.7}>
          <View style={styles.iconCircle}>
            <Ionicons name="call" size={22} color="#0D0520" />
          </View>
          <Text style={styles.actionLabel}>Llamar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onChatPress} activeOpacity={0.7}>
          <View style={styles.iconCircle}>
            <Ionicons name="chatbubble" size={22} color="#0D0520" />
          </View>
          <Text style={styles.actionLabel}>Mensaje</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtnSos} onPress={onSosPress} activeOpacity={0.7}>
          <View style={styles.iconCircleSos}>
            <Ionicons name="shield-checkmark" size={22} color="#FFF" />
          </View>
          <Text style={styles.actionLabelSos}>SOS</Text>
        </TouchableOpacity>
      </View>

    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#120828',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    justifyContent: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  avatarContainer: {
    marginRight: 20,
    alignItems: 'center',
  },
  avatarImg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#F5C518',
  },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245,197,24,0.15)',
    borderWidth: 2,
    borderColor: '#F5C518',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F5C518',
  },
  ratingBadge: {
    position: 'absolute',
    bottom: -8,
    backgroundColor: '#F5C518',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#120828',
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D0520',
  },
  infoCol: {
    flex: 1,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  plateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  plateText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#000',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  actionBtn: {
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F5C518',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#F5C518',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  actionBtnSos: {
    alignItems: 'center',
    flex: 1,
  },
  iconCircleSos: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(229,57,53,0.15)',
    borderWidth: 1,
    borderColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabelSos: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E53935',
  },
});

export default ActiveRidePanel;
