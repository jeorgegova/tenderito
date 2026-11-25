import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../../theme';
import { Button } from './Button';

interface StatusDatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  valueYMD: string | null;
  minYMD?: string | null;
  onChangeYMD: (ymd: string) => void;
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function StatusDatePickerModal({
  visible,
  onClose,
  title = 'Seleccionar fecha',
  valueYMD,
  minYMD,
  onChangeYMD,
}: StatusDatePickerModalProps) {
  const initialDate = valueYMD ? new Date(`${valueYMD}T12:00:00`) : new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());
  const [selectedYMD, setSelectedYMD] = useState<string | null>(valueYMD);

  if (!visible) return null;

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  let startingDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startingDayOfWeek === -1) startingDayOfWeek = 6;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const daysList: (number | null)[] = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    daysList.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysList.push(d);
  }

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const ymd = `${viewYear}-${mStr}-${dStr}`;

    if (minYMD && ymd < minYMD) return;

    setSelectedYMD(ymd);
  };

  const handleConfirm = () => {
    if (selectedYMD) {
      onChangeYMD(selectedYMD);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.titleText}>{title}</Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Month / Year bar */}
          <View style={styles.monthBar}>
            <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={16} color={Colors.text} />
            </TouchableOpacity>

            <Text style={styles.monthText}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>

            <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={16} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Days */}
          <View style={styles.calendarBody}>
            {/* Weekdays */}
            <View style={styles.weekdaysRow}>
              {WEEKDAY_NAMES.map(w => (
                <Text key={w} style={styles.weekdayText}>
                  {w}
                </Text>
              ))}
            </View>

            {/* Grid */}
            <View style={styles.grid}>
              {daysList.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }

                const mStr = String(viewMonth + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const currentYMD = `${viewYear}-${mStr}-${dStr}`;

                const isSelected = selectedYMD === currentYMD;
                const isDisabled = Boolean(minYMD && currentYMD < minYMD);

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    disabled={isDisabled}
                    onPress={() => handleSelectDay(day)}
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        isSelected && styles.dayTextSelected,
                        isDisabled && styles.dayTextDisabled,
                      ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.footer}>
            <Button
              title="Cancelar"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <Button
              title="Aplicar"
              variant="primary"
              style={{ flex: 1.5 }}
              onPress={handleConfirm}
              disabled={!selectedYMD}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  calendarBody: {
    padding: 14,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextDisabled: {
    color: '#CBD5E1',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
});
