import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Colors } from '../../theme';

export interface ToastData {
  title: string;
  message?: string;
  type?: 'success' | 'info' | 'warning';
}

interface ToastStoreState {
  toast: ToastData | null;
  visible: boolean;
  show: (data: ToastData) => void;
  hide: () => void;
}

export const useToastStore = create<ToastStoreState>(set => ({
  toast: null,
  visible: false,
  show: (data: ToastData) => set({ toast: data, visible: true }),
  hide: () => set({ visible: false, toast: null }),
}));

export function showToast(
  titleOrData: string | ToastData,
  message?: string,
  type: 'success' | 'info' | 'warning' = 'success',
): void {
  if (typeof titleOrData === 'object' && titleOrData !== null) {
    useToastStore.getState().show(titleOrData);
    return;
  }
  useToastStore.getState().show({
    title: titleOrData,
    message,
    type,
  });
}

export function hideToast(): void {
  useToastStore.getState().hide();
}

export function Toast() {
  const insets = useSafeAreaInsets();
  const { toast, visible, hide } = useToastStore();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && toast) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 18,
          bounciness: 5,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      translateY.setValue(-100);
      opacity.setValue(0);
    }
  }, [visible, toast]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      hide();
    });
  };

  if (!visible || !toast) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        { top: Math.max(insets.top, 14) + 6 },
      ]}>
      <Animated.View
        style={[
          styles.toastCard,
          {
            transform: [{ translateY }],
            opacity,
          },
        ]}>
        <Pressable
          onPress={handleDismiss}
          style={styles.innerRow}
          accessibilityRole="alert"
          accessibilityLabel={`${toast.title}. ${toast.message || ''}`}>
          <View style={styles.iconWrap}>
            <Image
              source={require('../../assets/NuevoLogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>{toast.title}</Text>
            {toast.message ? (
              <Text style={styles.message}>{toast.message}</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toastCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.primaryMid,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF1E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 26,
    height: 26,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 12.5,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
});
