import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { create } from 'zustand';
import { Colors } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

export type AlertType = 'info' | 'success' | 'warning' | 'destructive';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertData {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

interface AlertStoreState {
  alert: AlertData | null;
  visible: boolean;
  show: (data: AlertData) => void;
  hide: () => void;
}

export const useAlertStore = create<AlertStoreState>(set => ({
  alert: null,
  visible: false,
  show: (data: AlertData) => set({ alert: data, visible: true }),
  hide: () => set({ visible: false, alert: null }),
}));

/**
 * Función global para mostrar alertas estilizadas desde cualquier parte del código.
 * Admite tanto objeto de opciones como firma tradicional (title, message, buttons).
 */
export function showAlert(
  titleOrData: string | AlertData,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (typeof titleOrData === 'object' && titleOrData !== null) {
    useAlertStore.getState().show(titleOrData);
    return;
  }

  const title = titleOrData;
  const lower = `${title} ${message ?? ''}`.toLowerCase();

  // Auto-detección inteligente del tipo si no se especifica
  let type: AlertType = 'info';
  if (
    lower.includes('error') ||
    lower.includes('no se pudo') ||
    lower.includes('eliminar') ||
    lower.includes('supera') ||
    lower.includes('vencido') ||
    lower.includes('falló')
  ) {
    type = 'destructive';
  } else if (
    lower.includes('faltan') ||
    lower.includes('tope') ||
    lower.includes('atención') ||
    lower.includes('cuidado') ||
    lower.includes('ya vinculado')
  ) {
    type = 'warning';
  } else if (
    lower.includes('éxito') ||
    lower.includes('exito') ||
    lower.includes('encontrado') ||
    lower.includes('guardado') ||
    lower.includes('activada') ||
    lower.includes('al día') ||
    lower.includes('listo')
  ) {
    type = 'success';
  }

  useAlertStore.getState().show({
    title,
    message,
    type,
    buttons,
  });
}

/** Cierra la alerta global programáticamente */
export function hideAlert(): void {
  useAlertStore.getState().hide();
}

export function AlertModal() {
  const { alert, visible, hide } = useAlertStore();
  const { isSmall, width, height } = useResponsive();
  const [reduceMotion, setReduceMotion] = useState(false);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const translateYAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      enabled => setReduceMotion(Boolean(enabled)),
    );

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;

    if (reduceMotion) {
      opacityAnim.setValue(1);
      scaleAnim.setValue(1);
      translateYAnim.setValue(0);
      return;
    }

    opacityAnim.setValue(0);
    scaleAnim.setValue(0.95);
    translateYAnim.setValue(8);

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reduceMotion, opacityAnim, scaleAnim, translateYAnim]);

  const handleButtonPress = useCallback(
    (btn?: AlertButton) => {
      hide();
      if (btn?.onPress) {
        // Ejecutar después de cerrar el modal para transiciones suaves
        setTimeout(() => {
          btn.onPress?.();
        }, 120);
      }
    },
    [hide],
  );

  if (!visible || !alert) {
    return null;
  }

  const type = alert.type ?? 'info';
  const buttons =
    alert.buttons && alert.buttons.length > 0
      ? alert.buttons
      : [{ text: 'Entendido', style: 'default' as const }];

  const lowerText = `${alert.title} ${alert.message ?? ''}`.toLowerCase();

  // Icono y color según el tipo con estética de plataforma
  let iconName:
    | 'information-circle-outline'
    | 'checkmark-circle-outline'
    | 'close-circle-outline'
    | 'alert-circle-outline'
    | 'trash-outline' = 'information-circle-outline';
  let iconColor: string = Colors.primary;
  let iconBg: string = '#FFF0E5';
  let iconBorderColor: string = 'rgba(255, 107, 0, 0.16)';

  if (type === 'success') {
    iconName = 'checkmark-circle-outline';
    iconColor = Colors.success;
    iconBg = '#DCFCE7';
    iconBorderColor = 'rgba(34, 197, 94, 0.16)';
  } else if (type === 'destructive') {
    const isTrash =
      lowerText.includes('eliminar') ||
      lowerText.includes('borrar') ||
      lowerText.includes('anular');
    iconName = isTrash ? 'trash-outline' : 'close-circle-outline';
    iconColor = Colors.destructive;
    iconBg = '#FEE2E2';
    iconBorderColor = 'rgba(239, 68, 68, 0.16)';
  } else if (type === 'warning') {
    iconName = 'alert-circle-outline';
    iconColor = Colors.warning;
    iconBg = '#FEF3C7';
    iconBorderColor = 'rgba(245, 158, 11, 0.16)';
  }

  const hasLongButtonText = buttons.some(b => b.text.length > 12);
  const fontScale = PixelRatio.getFontScale ? PixelRatio.getFontScale() : 1;
  const isTwoButtons =
    buttons.length === 2 && !isSmall && width >= 340 && !hasLongButtonText && fontScale <= 1.15;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={() =>
        handleButtonPress(buttons.find(b => b.style === 'cancel') ?? buttons[0])
      }>
      <TouchableWithoutFeedback
        onPress={() => {
          const cancelBtn = buttons.find(b => b.style === 'cancel');
          if (cancelBtn) {
            handleButtonPress(cancelBtn);
          }
        }}>
        <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              accessibilityViewIsModal={true}
              style={[
                styles.card,
                {
                  maxHeight: Math.min(height * 0.88, 560),
                  opacity: opacityAnim,
                  transform: [
                    { scale: scaleAnim },
                    { translateY: translateYAnim },
                  ],
                },
              ]}>
              {/* Curvas orgánicas decorativas de plataforma Tenderito */}
              <View pointerEvents="none" style={styles.decorTopRight}>
                <View style={styles.decorTopCurve} />
                <View style={styles.decorDotLarge} />
                <View style={styles.decorDotSmall} />
              </View>
              <View pointerEvents="none" style={styles.decorBottomLeft}>
                <View style={styles.decorBottomCurve} />
              </View>

              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}>
                {/* Icono superior temático */}
                <View
                  style={[
                    styles.iconContainer,
                    {
                      backgroundColor: iconBg,
                      borderColor: iconBorderColor,
                      shadowColor: iconColor,
                    },
                  ]}>
                  <Ionicons name={iconName} size={28} color={iconColor} />
                </View>

                {/* Título y Mensaje */}
                <Text style={styles.title}>{alert.title}</Text>
                {alert.message ? (
                  <Text style={styles.message}>{alert.message}</Text>
                ) : null}
              </ScrollView>

              {/* Botones de acción */}
              <View
                style={[
                  styles.buttonsContainer,
                  isTwoButtons ? styles.twoButtonsRow : styles.buttonsColumn,
                ]}>
                {buttons.map((btn, idx) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';
                  const isPrimary = !isCancel && !isDestructive;
                  const isDeleteAction =
                    isDestructive &&
                    (lowerText.includes('eliminar') ||
                      lowerText.includes('borrar') ||
                      btn.text.toLowerCase().includes('eliminar'));

                  return (
                    <Pressable
                      key={`${btn.text}-${idx}`}
                      onPress={() => handleButtonPress(btn)}
                      style={({ pressed }) => [
                        styles.button,
                        isCancel && styles.cancelButton,
                        isDestructive && styles.destructiveButton,
                        isPrimary && styles.primaryButton,
                        isTwoButtons && (isCancel ? styles.flexCancel : styles.flexConfirm),
                        pressed &&
                          (isCancel
                            ? styles.cancelPressed
                            : isDestructive
                            ? styles.destructivePressed
                            : styles.primaryPressed),
                      ]}>
                      {isDeleteAction && (
                        <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                      )}
                      <Text
                        style={[
                          styles.buttonText,
                          isCancel && styles.cancelButtonText,
                          isDestructive && styles.destructiveButtonText,
                          isPrimary && styles.primaryButtonText,
                        ]}
                        numberOfLines={2}>
                        {btn.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 51, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 999999,
  },
  card: {
    position: 'relative',
    backgroundColor: '#FFFDFB',
    borderRadius: 26,
    paddingTop: 28,
    paddingHorizontal: 22,
    paddingBottom: 22,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F6E4D5',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 14,
  },
  decorTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 110,
    height: 110,
  },
  decorTopCurve: {
    position: 'absolute',
    top: -42,
    right: -36,
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#FFF0E5',
    opacity: 0.9,
  },
  decorDotLarge: {
    position: 'absolute',
    top: 20,
    right: 22,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFD7B8',
    opacity: 0.75,
  },
  decorDotSmall: {
    position: 'absolute',
    top: 44,
    right: 12,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 107, 0, 0.2)',
  },
  decorBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 90,
    height: 80,
  },
  decorBottomCurve: {
    position: 'absolute',
    bottom: -44,
    left: -36,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFF5EC',
    opacity: 0.95,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  message: {
    marginTop: 10,
    fontSize: 14.5,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  buttonsContainer: {
    width: '100%',
    gap: 10,
  },
  twoButtonsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  buttonsColumn: {
    flexDirection: 'column',
    gap: 10,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  flexCancel: {
    flex: 1,
  },
  flexConfirm: {
    flex: 1.25,
  },
  cancelButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  cancelPressed: {
    backgroundColor: '#F1F5F9',
    transform: [{ scale: 0.985 }],
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryPressed: {
    backgroundColor: Colors.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  destructiveButton: {
    backgroundColor: Colors.destructive,
    shadowColor: Colors.destructive,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  destructivePressed: {
    backgroundColor: '#DC2626',
    transform: [{ scale: 0.985 }],
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelButtonText: {
    color: Colors.text,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  destructiveButtonText: {
    color: '#FFFFFF',
  },
});
