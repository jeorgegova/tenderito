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
    borderRadius: Radius.xl, // 20-24px rounded corners
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#142033',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
});
