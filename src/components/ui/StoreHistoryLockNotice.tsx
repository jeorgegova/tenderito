import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

interface StoreHistoryLockNoticeProps {
  style?: any;
  text?: string;
  tooltipTitle?: string;
  tooltipDesc?: string;
}

export function StoreHistoryLockNotice({
  style,
  text = 'El historial entre tiendas está disponible en planes pagos.',
  tooltipTitle = 'Función de planes de pago',
  tooltipDesc = 'Esta funcionalidad te permite conocer el comportamiento de pago del cliente en otras tiendas de la red Tenderito antes de fiarle. Solo está disponible en planes de pago (Básico y Pro).',
}: StoreHistoryLockNoticeProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <Pressable
        onPress={() => setVisible(prev => !prev)}
        style={styles.lockedRow}
        accessibilityRole="button"
        accessibilityLabel="Información sobre planes de pago">
        <View style={styles.lockIconBtn}>
          <Ionicons name="lock-closed" size={13} color="#B45309" />
        </View>
        <Text style={styles.lockedText} numberOfLines={2}>
          {text}
        </Text>
        <Ionicons
          name={visible ? 'chevron-up' : 'information-circle-outline'}
          size={16}
          color="#94A3B8"
          style={styles.infoIcon}
        />
      </Pressable>

      {visible && (
        <View style={styles.tooltipBox}>
          <View style={styles.tooltipArrow} />
          <View style={styles.tooltipHeader}>
            <View style={styles.tooltipTitleRow}>
              <Ionicons name="lock-closed" size={14} color="#FBBF24" />
              <Text style={styles.tooltipTitle}>{tooltipTitle}</Text>
            </View>
            <Pressable
              onPress={() => setVisible(false)}
              hitSlop={8}
              style={styles.closeBtn}>
              <Ionicons name="close" size={16} color="#94A3B8" />
            </Pressable>
          </View>
          <Text style={styles.tooltipDesc}>{tooltipDesc}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  lockIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    lineHeight: 16,
  },
  infoIcon: {
    marginLeft: 4,
  },
  tooltipBox: {
    marginTop: 8,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tooltipArrow: {
    position: 'absolute',
    top: -6,
    left: 20,
    width: 12,
    height: 12,
    backgroundColor: '#0F172A',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#334155',
    transform: [{ rotate: '45deg' }],
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tooltipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tooltipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 2,
  },
  tooltipDesc: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18,
    fontWeight: '400',
  },
});
