import React, {useCallback, useEffect, useRef} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {create} from 'zustand';
import {Colors, Radius} from '../../theme';

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
  show: (data: AlertData) => set({alert: data, visible: true}),
  hide: () => set({visible: false, alert: null}),
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
  const {alert, visible, hide} = useAlertStore();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

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
      : [{text: 'Entendido', style: 'default' as const}];

  // Icono y color según el tipo
  let iconName:
    | 'information-circle'
    | 'checkmark-circle'
    | 'close-circle'
    | 'alert-circle' = 'information-circle';
  let iconColor: string = Colors.primary;
  let iconBg: string = Colors.primaryLight;

  if (type === 'success') {
    iconName = 'checkmark-circle';
    iconColor = Colors.success;
    iconBg = '#DCFCE7';
  } else if (type === 'destructive') {
    iconName = 'close-circle';
    iconColor = Colors.destructive;
    iconBg = '#FEE2E2';
  } else if (type === 'warning') {
    iconName = 'alert-circle';
    iconColor = Colors.warning;
    iconBg = '#FEF3C7';
  }

  const isTwoButtons = buttons.length === 2;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
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
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.card,
                {
                  opacity: opacityAnim,
                  transform: [{scale: scaleAnim}],
                },
              ]}>
              {/* Icono temático */}
              <View style={[styles.iconContainer, {backgroundColor: iconBg}]}>
                <Ionicons name={iconName} size={32} color={iconColor} />
              </View>

              {/* Título y Mensaje */}
              <Text style={styles.title}>{alert.title}</Text>
              {alert.message ? (
                <Text style={styles.message}>{alert.message}</Text>
              ) : null}

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

                  return (
                    <Pressable
                      key={`${btn.text}-${idx}`}
                      onPress={() => handleButtonPress(btn)}
                      style={({pressed}) => [
                        styles.button,
                        isCancel && styles.cancelButton,
                        isDestructive && styles.destructiveButton,
                        isPrimary && styles.primaryButton,
                        isTwoButtons && styles.flexButton,
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text
                        style={[
                          styles.buttonText,
                          isCancel && styles.cancelButtonText,
                          isDestructive && styles.destructiveButtonText,
                          isPrimary && styles.primaryButtonText,
                        ]}>
                        {btn.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 16, 8, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#1C1008',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    fontWeight: '500',
  },
  buttonsContainer: {
    width: '100%',
    marginTop: 20,
  },
  twoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonsColumn: {
    gap: 8,
  },
  flexButton: {
    flex: 1,
  },
  button: {
    minHeight: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{scale: 0.98}],
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelButton: {
    backgroundColor: Colors.cardAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  destructiveButton: {
    backgroundColor: Colors.destructive,
    shadowColor: Colors.destructive,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  cancelButtonText: {
    color: Colors.textSecondary,
  },
  destructiveButtonText: {
    color: '#FFFFFF',
  },
});
