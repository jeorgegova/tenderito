import {StyleSheet, View, type ViewProps} from 'react-native';
import {Colors, Radius} from '../../theme';

export function Card({children, style, ...rest}: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
});
