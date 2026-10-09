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
    // Sombra más visible para separar cards del fondo cálido
    shadowColor: '#7C5230',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
});
