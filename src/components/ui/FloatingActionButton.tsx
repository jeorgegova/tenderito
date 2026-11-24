import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

export interface FloatingActionButtonProps {
  onPress: () => void;
  label: string;
  iconName?: any;
  accessibilityLabel?: string;
  bottomOffset?: number;
  testID?: string;
}

export function FloatingActionButton({
  onPress,
  label,
  iconName = 'add-circle',
  accessibilityLabel,
  bottomOffset = 90,
  testID,
}: FloatingActionButtonProps) {
  const insets = useSafeAreaInsets();
  const { tabletContainerStyle } = useResponsive();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  // Separación inferior calculada para flotar elegantemente sobre el banner de navegación
  const baseBottom = insets.bottom > 0 ? insets.bottom : 10;
  const computedBottom = baseBottom + bottomOffset;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.fabWrapper, { bottom: computedBottom }]}>
      <View
        pointerEvents="box-none"
        style={[styles.fabInner, tabletContainerStyle(720)]}>
        <Pressable
          testID={testID}
          onPress={onPress}
          accessibilityLabel={accessibilityLabel || label}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.fab,
            pressed && styles.fabPressed,
          ]}>
          <Ionicons name={iconName} size={22} color="#FFFFFF" />
          <Text style={styles.fabText}>{label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fabWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1001,
  },
  fabInner: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
