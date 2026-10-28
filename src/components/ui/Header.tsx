import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../theme';

export function Header({
  title,
  subtitle,
  showCurve = false,
  rightElement,
}: {
  title: string;
  subtitle?: string;
  showCurve?: boolean;
  rightElement?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, {paddingTop: insets.top + 8}]}>
      {/* Formas curvas decorativas de la marca en la esquina superior derecha */}
      {showCurve && (
        <View pointerEvents="none" style={styles.curveContainer}>
          <View style={styles.curveOuter} />
          <View style={styles.curveInner} />
        </View>
      )}

      <View style={styles.contentRow}>
        <View style={styles.textCol}>
          {/* Marca Tenderito */}
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.eyebrow}>TENDERITO</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {rightElement ? <View style={styles.rightWrap}>{rightElement}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    position: 'relative',
    overflow: 'hidden',
  },
  curveContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 220,
    height: 140,
    overflow: 'hidden',
  },
  curveOuter: {
    position: 'absolute',
    top: -45,
    right: -25,
    width: 210,
    height: 155,
    borderBottomLeftRadius: 110,
    borderTopLeftRadius: 40,
    backgroundColor: '#FFE4D0',
    transform: [{rotate: '-8deg'}],
  },
  curveInner: {
    position: 'absolute',
    top: -55,
    right: -30,
    width: 175,
    height: 130,
    borderBottomLeftRadius: 95,
    borderTopLeftRadius: 30,
    backgroundColor: Colors.primary,
    transform: [{rotate: '-6deg'}],
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  textCol: {
    flex: 1,
  },
  rightWrap: {
    marginLeft: 12,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: Colors.primary,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});

