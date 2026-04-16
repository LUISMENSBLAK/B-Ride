import { useAppTheme } from '../hooks/useAppTheme';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { useRideFlowStore } from '../store/useRideFlowStore';
import { CreditCard, Banknote, Wallet, Check } from 'lucide-react-native';
import { useTranslation } from '../hooks/useTranslation';
import client from '../api/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PaymentMethodSelectorProps {
  onSelected?: () => void;
  visible?: boolean;
  onClose?: () => void;
  onSelect?: (method: PaymentMethodType) => void;
}

type PaymentMethodType = 'CASH' | 'CARD' | 'APPLE_PAY' | 'WALLET';

export default function PaymentMethodSelector({
  onSelected, visible: externalVisible, onClose, onSelect
}: PaymentMethodSelectorProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [internalVisible, setInternalVisible] = useState(false);
  const paymentMethod = useRideFlowStore(state => state.paymentMethod);
  const setPaymentMethod = useRideFlowStore(state => state.setPaymentMethod);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const isVisible = externalVisible !== undefined ? externalVisible : internalVisible;

  const handleClose = () => {
    if (onClose) onClose();
    else setInternalVisible(false);
  };

  React.useEffect(() => {
    if (isVisible) {
      client.get('/wallet/balance').then(res => {
        if (res.data.success) setWalletBalance(res.data.data.balance);
      }).catch(() => {});
    }
  }, [isVisible]);

  const selectMethod = (method: PaymentMethodType) => {
    setPaymentMethod(method);
    if (onSelect) onSelect(method);
    handleClose();
    if (onSelected) onSelected();
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'CASH': return t('payment.cash');
      case 'CARD': return t('payment.creditCard');
      case 'APPLE_PAY': return 'Apple Pay';
      case 'WALLET': return 'B-Ride Wallet';
      default: return t('payment.selectPayment');
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH': return <Banknote size={20} color={theme.colors.success} />;
      case 'CARD': return <CreditCard size={20} color={theme.colors.primary} />;
      case 'APPLE_PAY': return <Text style={{ fontSize: 20, color: theme.colors.text, fontWeight: '700' }}></Text>;
      case 'WALLET': return <Wallet size={20} color={'#F5C518'} />;
      default: return <CreditCard size={20} color={theme.colors.textSecondary} />;
    }
  };

  const renderMethodRow = (
    method: PaymentMethodType,
    icon: React.ReactNode,
    label: string,
    subtitle?: string,
  ) => {
    const isActive = paymentMethod === method;
    return (
      <TouchableOpacity
        style={[styles.methodOption, isActive && styles.methodOptionActive]}
        onPress={() => selectMethod(method)}
        activeOpacity={0.7}
      >
        <View style={styles.methodIconWrap}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.methodText}>{label}</Text>
          {subtitle ? <Text style={styles.methodSubtext}>{subtitle}</Text> : null}
        </View>
        {isActive && (
          <View style={styles.checkWrap}>
            <Check size={16} color={theme.colors.primaryText} strokeWidth={3} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      {externalVisible === undefined && (
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setInternalVisible(true)}>
          <View style={styles.leftRow}>
            {getMethodIcon(paymentMethod)}
            <Text style={styles.selectorText}>{getMethodLabel(paymentMethod)}</Text>
          </View>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
      )}

      <Modal visible={isVisible} transparent animationType="slide" onRequestClose={handleClose}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
          <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.dragHandle} />
            <Text style={styles.sheetTitle}>{t('payment.methodSelectTitle')}</Text>

            {renderMethodRow(
              'CASH',
              <Banknote size={22} color={theme.colors.success} />,
              t('payment.cash'),
            )}

            {renderMethodRow(
              'CARD',
              <CreditCard size={22} color={theme.colors.primary} />,
              t('payment.creditCard'),
              'Visa, Mastercard, Amex',
            )}

            {renderMethodRow(
              'WALLET',
              <Wallet size={22} color={'#F5C518'} />,
              'B-Ride Wallet',
              walletBalance !== null ? `Saldo: $${walletBalance.toFixed(2)}` : undefined,
            )}

            {Platform.OS === 'ios' && renderMethodRow(
              'APPLE_PAY',
              <Text style={{ fontSize: 24, color: theme.colors.text, fontWeight: '700' }}></Text>,
              'Apple Pay',
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.m,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectorText: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  chevron: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    ...theme.typography.title,
    marginBottom: 16,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.m,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
  },
  methodOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}15`,
  },
  methodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodText: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  methodSubtext: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  checkWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
