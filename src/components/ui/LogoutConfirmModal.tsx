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

export interface LogoutConfirmOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
}

interface LogoutModalState {
  visible: boolean;
  options: LogoutConfirmOptions | null;
  show: (options: LogoutConfirmOptions) => void;
  hide: () => void;
}

export const useLogoutModalStore = create<LogoutModalState>(set => ({
  visible: false,
  options: null,
  show: (options: LogoutConfirmOptions) => set({ visible: true, options }),
  hide: () => set({ visible: false, options: null }),
}));

export function showLogoutConfirmModal(options: LogoutConfirmOptions): void {
  useLogoutModalStore.getState().show(options);
}

export function hideLogoutConfirmModal(): void {
  useLogoutModalStore.getState().hide();
}

const DEFAULT_TITLE = '¿Cerrar sesión?';
const DEFAULT_MESSAGE =
  'Vas a salir de tu cuenta de Tenderito. Podrás volver a ingresar cuando lo necesites.';

export function LogoutConfirmModal() {
  const { visible, options, hide } = useLogoutModalStore();
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

  const handleCancel = useCallback(() => {
    hide();
  }, [hide]);

  const handleConfirm = useCallback(() => {
    const onConfirm = options?.onConfirm;
    hide();
    if (onConfirm) {
      setTimeout(() => {
        void onConfirm();
      }, 120);
    }
  }, [hide, options]);

  if (!visible || !options) {
    return null;
  }

  const fontScale = PixelRatio.getFontScale ? PixelRatio.getFontScale() : 1;
  const useHorizontalRow = !isSmall && width >= 400 && fontScale <= 1.15;
  const confirmText = options.confirmText || 'Sí, cerrar sesión';
  const cancelText = options.cancelText || 'Cancelar';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={handleCancel}>
      <TouchableWithoutFeedback onPress={handleCancel}>
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
              {/* Curvas orgánicas sutiles de marca */}
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
                {/* Icono superior */}
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="log-out-outline"
                    size={28}
                    color={Colors.primary}
                    style={styles.iconOffset}
                  />
                </View>

                {/* Título */}
                <Text style={styles.title}>{options.title || DEFAULT_TITLE}</Text>

                {/* Descripción */}
                <Text style={styles.message}>{options.message || DEFAULT_MESSAGE}</Text>
              </ScrollView>

              {/* Botones de acción */}
              <View
                style={[
                  styles.actionsContainer,
                  useHorizontalRow ? styles.actionsRow : styles.actionsColumn,
                ]}>
                {useHorizontalRow ? (
                  <>
                    <Pressable
                      onPress={handleCancel}
                      accessibilityRole="button"
                      accessibilityLabel={cancelText}
                      style={({ pressed }) => [
                        styles.button,
                        styles.cancelButton,
                        styles.flexCancel,
                        pressed && styles.cancelPressed,
                      ]}>
                      <Text style={styles.cancelButtonText}>{cancelText}</Text>
                    </Pressable>

                    <Pressable
                      onPress={handleConfirm}
                      accessibilityRole="button"
                      accessibilityLabel={confirmText}
                      style={({ pressed }) => [
                        styles.button,
                        styles.confirmButton,
                        styles.flexConfirm,
                        pressed && styles.confirmPressed,
                      ]}>
                      <Ionicons
                        name="log-out-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.confirmButtonText}>
                        {confirmText}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={handleConfirm}
                      accessibilityRole="button"
                      accessibilityLabel={confirmText}
                      style={({ pressed }) => [
                        styles.button,
                        styles.confirmButton,
                        styles.fullWidthBtn,
                        pressed && styles.confirmPressed,
                      ]}>
                      <Ionicons
                        name="log-out-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.confirmButtonText}>
                        {confirmText}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleCancel}
                      accessibilityRole="button"
                      accessibilityLabel={cancelText}
                      style={({ pressed }) => [
                        styles.button,
                        styles.cancelButton,
                        styles.fullWidthBtn,
                        pressed && styles.cancelPressed,
                      ]}>
                      <Text style={styles.cancelButtonText}>{cancelText}</Text>
                    </Pressable>
                  </>
                )}
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
    paddingBottom: 22,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF0E5',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 107, 0, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  iconOffset: {
    marginLeft: 3,
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
  actionsContainer: {
    width: '100%',
    gap: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionsColumn: {
    flexDirection: 'column',
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
  fullWidthBtn: {
    width: '100%',
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
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  confirmPressed: {
    backgroundColor: Colors.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
