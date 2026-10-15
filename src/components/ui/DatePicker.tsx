import React, {useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Colors, Radius} from '../../theme';
import {Button} from './Button';

export interface DatePickerProps {
  label?: string;
  value?: string | null; // Formato esperado: 'AAAA-MM-DD'
  onChange: (date: string | null) => void;
  placeholder?: string;
  minDate?: string; // Formato: 'AAAA-MM-DD'
  maxDate?: string; // Formato: 'AAAA-MM-DD'
  error?: string;
  helperText?: string;
  disabled?: boolean;
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

const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Convierte componentes de fecha numérica en formato YYYY-MM-DD */
function formatYMD(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Descompone una cadena YYYY-MM-DD de forma segura sin sesgo horario */
function parseYMD(
  dateStr?: string | null,
): {year: number; month: number; day: number} | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    return null;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }
  return {year, month, day};
}

/** Obtiene la fecha de hoy en formato local YYYY-MM-DD */
function getTodayYMD(): string {
  const now = new Date();
  return formatYMD(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Formatea YYYY-MM-DD a texto legible en español */
function formatReadableDate(dateStr?: string | null): string {
  const parsed = parseYMD(dateStr);
  if (!parsed) {
    return '';
  }
  const d = new Date(parsed.year, parsed.month, parsed.day);
  const weekday = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()];
  const monthName = MONTH_NAMES[parsed.month].slice(0, 3).toLowerCase();
  return `${weekday}, ${parsed.day} de ${monthName}. ${parsed.year}`;
}

/** Calcula la diferencia de días respecto a hoy */
function getDaysDiffFromToday(dateStr: string): number {
  const todayParsed = parseYMD(getTodayYMD())!;
  const targetParsed = parseYMD(dateStr);
  if (!targetParsed) {
    return 0;
  }

  const t1 = new Date(
    todayParsed.year,
    todayParsed.month,
    todayParsed.day,
  ).getTime();
  const t2 = new Date(
    targetParsed.year,
    targetParsed.month,
    targetParsed.day,
  ).getTime();
  const diffDays = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
  return diffDays;
}

/** Genera etiqueta amigable relativa: "En 8 días", "Mañana", etc. */
function getRelativeBadge(dateStr: string): string | null {
  const diff = getDaysDiffFromToday(dateStr);
  if (diff === 0) {
    return 'Hoy';
  }
  if (diff === 1) {
    return 'Mañana';
  }
  if (diff > 1) {
    return `En ${diff} días`;
  }
  if (diff === -1) {
    return 'Ayer';
  }
  return `Vencido (${Math.abs(diff)} d)`;
}

export function DatePicker({
  label,
  value,
  onChange,
  placeholder = 'Selecciona una fecha',
  minDate,
  maxDate,
  error,
  helperText,
  disabled = false,
}: DatePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  // Inicializar el mes visible del calendario basado en el valor actual o hoy
  const initialDate = useMemo(() => {
    return parseYMD(value) || parseYMD(getTodayYMD())!;
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.year);
  const [viewMonth, setViewMonth] = useState<number>(initialDate.month);
  const [tempSelected, setTempSelected] = useState<string | null>(
    value || null,
  );

  const todayStr = useMemo(() => getTodayYMD(), []);

  // Al abrir el modal, sincronizar estado temporal
  const handleOpenModal = () => {
    if (disabled) {
      return;
    }
    const current = parseYMD(value) || parseYMD(getTodayYMD())!;
    setViewYear(current.year);
    setViewMonth(current.month);
    setTempSelected(value || null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  const handleConfirm = () => {
    onChange(tempSelected);
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange(null);
    setTempSelected(null);
    setModalVisible(false);
  };

  // Navegación de meses
  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Generador de atajos de fecha prácticos
  const shortcuts = useMemo(() => {
    const today = new Date();

    // +8 días
    const in8 = new Date(today);
    in8.setDate(today.getDate() + 8);

    // +15 días (quincena)
    const in15 = new Date(today);
    in15.setDate(today.getDate() + 15);

    // Fin de mes
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    // Si hoy ya es fin de mes o faltan menos de 3 días, fin del siguiente mes
    const targetEndOfMonth =
      endOfMonth.getDate() - today.getDate() <= 3
        ? new Date(today.getFullYear(), today.getMonth() + 2, 0)
        : endOfMonth;

    // +30 días (un mes)
    const in30 = new Date(today);
    in30.setDate(today.getDate() + 30);

    return [
      {
        label: '+8 días',
        ymd: formatYMD(in8.getFullYear(), in8.getMonth(), in8.getDate()),
      },
      {
        label: '+15 días (Quincena)',
        ymd: formatYMD(in15.getFullYear(), in15.getMonth(), in15.getDate()),
      },
      {
        label: 'Fin de mes',
        ymd: formatYMD(
          targetEndOfMonth.getFullYear(),
          targetEndOfMonth.getMonth(),
          targetEndOfMonth.getDate(),
        ),
      },
      {
        label: '+30 días',
        ymd: formatYMD(in30.getFullYear(), in30.getMonth(), in30.getDate()),
      },
    ];
  }, []);

  const handleSelectShortcut = (ymd: string) => {
    setTempSelected(ymd);
    const parsed = parseYMD(ymd);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  };

  // Matriz de días del mes
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // getDay(): 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    // Ajustar para que la semana inicie en Lunes (0 = Lunes, 6 = Domingo)
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

    const cells: Array<{
      day: number | null;
      ymd: string | null;
      isToday: boolean;
      isSelected: boolean;
      isDisabled: boolean;
    }> = [];

    // Celdas vacías al inicio
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({
        day: null,
        ymd: null,
        isToday: false,
        isSelected: false,
        isDisabled: true,
      });
    }

    // Días del mes
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = formatYMD(viewYear, viewMonth, d);
      const isToday = ymd === todayStr;
      const isSelected = ymd === tempSelected;

      let isDisabled = false;
      if (minDate && ymd < minDate) {
        isDisabled = true;
      }
      if (maxDate && ymd > maxDate) {
        isDisabled = true;
      }

      cells.push({
        day: d,
        ymd,
        isToday,
        isSelected,
        isDisabled,
      });
    }

    return cells;
  }, [viewYear, viewMonth, todayStr, tempSelected, minDate, maxDate]);

  const relativeText = value ? getRelativeBadge(value) : null;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Trigger Button que simula el Input de Tenderito */}
      <Pressable
        onPress={handleOpenModal}
        disabled={disabled}
        style={({pressed}) => [
          styles.field,
          error ? styles.invalid : null,
          pressed && styles.fieldPressed,
          disabled && styles.disabled,
        ]}>
        <View style={styles.leadingIconWrap}>
          <Ionicons
            name="calendar"
            size={20}
            color={value ? Colors.primary : Colors.textMuted}
          />
        </View>

        <View style={styles.textWrap}>
          {value ? (
            <View style={styles.valRow}>
              <Text style={styles.valueText}>{formatReadableDate(value)}</Text>
              {relativeText && (
                <View
                  style={[
                    styles.relativeBadge,
                    relativeText.includes('Vencido') &&
                      styles.relativeBadgeOverdue,
                  ]}>
                  <Text
                    style={[
                      styles.relativeBadgeText,
                      relativeText.includes('Vencido') &&
                        styles.relativeBadgeTextOverdue,
                    ]}>
                    {relativeText}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.placeholderText}>{placeholder}</Text>
          )}
        </View>

        {value ? (
          <TouchableOpacity
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            onPress={e => {
              e.stopPropagation();
              onChange(null);
            }}
            style={styles.clearBtn}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
        )}
      </Pressable>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}

      {/* Modal / Bottom Sheet del Calendario */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}>
        <TouchableWithoutFeedback onPress={handleCloseModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                {/* Cabecera del modal */}
                <View style={styles.modalHeader}>
                  <View style={styles.headerInfo}>
                    <Text style={styles.modalTitle}>Fecha para pagar</Text>
                    <Text style={styles.modalSubtitle}>
                      {tempSelected
                        ? formatReadableDate(tempSelected)
                        : 'Elige el día límite de pago'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleCloseModal}
                    style={styles.modalCloseBtn}
                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons
                      name="close"
                      size={22}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Atajos Rápidos */}
                <View style={styles.shortcutsWrap}>
                  <Text style={styles.shortcutsLabel}>PLAZO RÁPIDO</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.shortcutsScroll}>
                    {shortcuts.map(sc => {
                      const isActive = tempSelected === sc.ymd;
                      return (
                        <Pressable
                          key={sc.label}
                          onPress={() => handleSelectShortcut(sc.ymd)}
                          style={[
                            styles.shortcutChip,
                            isActive && styles.shortcutChipActive,
                          ]}>
                          <Ionicons
                            name="flash-outline"
                            size={13}
                            color={isActive ? '#FFFFFF' : Colors.primary}
                          />
                          <Text
                            style={[
                              styles.shortcutText,
                              isActive && styles.shortcutTextActive,
                            ]}>
                            {sc.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Navegación del mes */}
                <View style={styles.monthNav}>
                  <TouchableOpacity
                    onPress={goToPrevMonth}
                    style={styles.monthNavBtn}
                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={Colors.primary}
                    />
                  </TouchableOpacity>

                  <View style={styles.monthTitleWrap}>
                    <Text style={styles.monthTitle}>
                      {MONTH_NAMES[viewMonth]} {viewYear}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={goToNextMonth}
                    style={styles.monthNavBtn}
                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={Colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Días de la semana */}
                <View style={styles.weekHeader}>
                  {WEEK_DAYS.map((w, index) => (
                    <Text
                      key={w}
                      style={[
                        styles.weekDayText,
                        index >= 5 && styles.weekDayWeekend,
                      ]}>
                      {w}
                    </Text>
                  ))}
                </View>

                {/* Matriz de días */}
                <View style={styles.daysGrid}>
                  {calendarCells.map((cell, idx) => {
                    if (cell.day === null) {
                      return (
                        <View key={`empty-${idx}`} style={styles.dayCell} />
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={cell.ymd}
                        disabled={cell.isDisabled}
                        onPress={() => cell.ymd && setTempSelected(cell.ymd)}
                        style={[
                          styles.dayCell,
                          cell.isSelected && styles.dayCellSelected,
                          cell.isToday &&
                            !cell.isSelected &&
                            styles.dayCellToday,
                        ]}>
                        <Text
                          style={[
                            styles.dayText,
                            cell.isDisabled && styles.dayTextDisabled,
                            cell.isToday &&
                              !cell.isSelected &&
                              styles.dayTextToday,
                            cell.isSelected && styles.dayTextSelected,
                          ]}>
                          {cell.day}
                        </Text>
                        {cell.isToday && !cell.isSelected && (
                          <View style={styles.todayDot} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Resumen del plazo seleccionado */}
                {tempSelected ? (
                  <View style={styles.summaryBox}>
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.summaryText}>
                      {getDaysDiffFromToday(tempSelected) === 0
                        ? 'Vence hoy'
                        : getDaysDiffFromToday(tempSelected) > 0
                        ? `El cliente tendrá ${getDaysDiffFromToday(
                            tempSelected,
                          )} días para pagar`
                        : `Fecha anterior a hoy (${Math.abs(
                            getDaysDiffFromToday(tempSelected),
                          )} días atrás)`}
                    </Text>
                  </View>
                ) : null}

                {/* Botones de acción */}
                <View style={styles.modalActions}>
                  {tempSelected ? (
                    <Button
                      title="Quitar fecha"
                      variant="ghost"
                      onPress={handleClear}
                      style={styles.actionGhost}
                    />
                  ) : null}

                  <View style={styles.confirmButtonWrap}>
                    <Button
                      title={tempSelected ? 'Guardar fecha' : 'Sin fecha fija'}
                      variant={tempSelected ? 'primary' : 'secondary'}
                      onPress={handleConfirm}
                    />
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#7C5230',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  fieldPressed: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFCF9',
  },
  disabled: {
    opacity: 0.5,
  },
  invalid: {
    borderColor: Colors.destructive,
    borderWidth: 1.5,
  },
  leadingIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  valRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  valueText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  relativeBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  relativeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  relativeBadgeOverdue: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  relativeBadgeTextOverdue: {
    color: Colors.destructive,
  },
  placeholderText: {
    fontSize: 15,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 2,
  },
  error: {
    fontSize: 12,
    color: Colors.destructive,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Modal / Bottom Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 16, 8, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shortcuts
  shortcutsWrap: {
    marginTop: 14,
    gap: 8,
  },
  shortcutsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  shortcutsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  shortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  shortcutChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  shortcutTextActive: {
    color: '#FFFFFF',
  },

  // Month navigation
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleWrap: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'capitalize',
  },

  // Week header
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    paddingVertical: 4,
  },
  weekDayWeekend: {
    color: Colors.primary,
  },

  // Days grid
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    marginVertical: 2,
    position: 'relative',
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: Colors.primaryMid,
    backgroundColor: '#FFFBF7',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  dayTextDisabled: {
    color: Colors.borderStrong,
    opacity: 0.4,
  },
  dayTextToday: {
    color: Colors.primary,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  todayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  // Summary box
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    flex: 1,
  },

  // Actions
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  actionGhost: {
    paddingHorizontal: 12,
  },
  headerInfo: {
    flex: 1,
  },
  confirmButtonWrap: {
    flex: 1,
  },
});
