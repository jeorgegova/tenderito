import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../../theme';

interface StoreStatusRingProps {
  size?: number;
  strokeWidth?: number;
  count?: number;
  unviewedCount?: number;
  showAddBadge?: boolean;
  onAddPress?: () => void;
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function StoreStatusRing({
  size = 60,
  strokeWidth = 2.5,
  count = 0,
  unviewedCount = 0,
  showAddBadge = false,
  onAddPress,
  onPress,
  children,
  style,
}: StoreStatusRingProps) {
  const hasStatuses = count > 0;
  const isAllViewed = hasStatuses && unviewedCount === 0;
  const ringColor = isAllViewed ? '#94A3B8' : Colors.primary;

  const content = (
    <View
      style={[
        styles.container,
        { width: size, height: size },
        hasStatuses && {
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: ringColor,
          padding: 2,
        },
        style,
      ]}>
      <View
        style={[
          styles.innerCircle,
          {
            width: hasStatuses ? size - strokeWidth * 2 - 4 : size,
            height: hasStatuses ? size - strokeWidth * 2 - 4 : size,
            borderRadius: (size - strokeWidth * 2 - 4) / 2,
          },
        ]}>
        {children}
      </View>

      {showAddBadge && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAddPress}
          style={styles.addBadge}>
          <Ionicons name="add" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  innerCircle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    zIndex: 10,
  },
});
