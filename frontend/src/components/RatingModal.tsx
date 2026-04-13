import { useAppTheme } from '../hooks/useAppTheme';
import React, { useState, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput } from 'react-native';
import { theme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';

interface RatingModalProps {
  visible: boolean;
  targetName: string;
  isDriver?: boolean;
  onSubmit: (score: number, comment: string) => void;
  onSkip: () => void;
}

export const RatingModal = memo(({
 visible, targetName, isDriver = false, onSubmit, onSkip }: RatingModalProps) => {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { t } = useTranslation();

  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState('');

  // When closing, reset selection
  const handleSkip = () => {
    setSelected(0);
    setComment('');
    onSkip();
  };

  const handleSubmit = () => {
    if (selected > 0) {
      onSubmit(selected, comment);
      setSelected(0);
      setComment('');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('rating.howWasRide')}</Text>
          <Text style={styles.subtitle}>
            {t('rating.rate', { name: targetName })} {isDriver ? `(${t('auth.rolePassenger')})` : `(${t('auth.roleDriver')})`}
          </Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setSelected(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={[styles.star, selected >= n && styles.starActive]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selected > 0 && (
            <TextInput
              style={styles.commentInput}
              placeholder={t('rating.leaveComment', { defaultValue: 'Deja un comentario (opcional)' })}
              placeholderTextColor={theme.colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={300}
            />
          )}

          <TouchableOpacity
            style={[styles.submitBtn, !selected && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!selected}
          >
            <Text style={styles.submitBtnText}>{t('rating.send')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>{t('rating.skip')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const getStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.xl,
    width: '100%',
    alignItems: 'center',
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
  },
  title: {
    ...theme.typography.header,
    fontSize: 24,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.bodyMuted,
    marginBottom: theme.spacing.l,
    textAlign: 'center',
  },
  stars: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.xl,
  },
  star: {
    fontSize: 44,
    color: theme.colors.border,
  },
  starActive: {
    color: theme.colors.primary,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.pill,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  submitBtnDisabled: {
    backgroundColor: theme.colors.border,
  },
  submitBtnText: {
    ...theme.typography.button,
  },
  skipBtn: {
    padding: theme.spacing.s,
  },
  skipText: {
    ...theme.typography.bodyMuted,
    textDecorationLine: 'underline',
  },
  commentInput: {
    width: '100%',
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
