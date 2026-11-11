import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../theme';
import {useResponsive} from '../../hooks/useResponsive';

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
  const {isSmall, isTablet, maxContentWidth} = useResponsive();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + (isSmall ? 4 : 8),
          paddingHorizontal: isSmall ? 16 : isTablet ? 28 : 20,
          maxWidth: maxContentWidth,
          width: '100%',
          alignSelf: 'center',
        },
      ]}>
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
          <Text
            style={[
              styles.title,
              isSmall && styles.titleSmall,
            ]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.85}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, isSmall && styles.subtitleSmall]}
              numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
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
    backgroundColor: 'transparent',
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
    minWidth: 0,
    flexShrink: 1,
  },
  rightWrap: {
    marginLeft: 12,
    alignSelf: 'center',
    flexShrink: 0,
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
  titleSmall: {
    fontSize: 25,
    lineHeight: 31,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  subtitleSmall: {
    fontSize: 12.5,
    marginTop: 2,
  },
});

