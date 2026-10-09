import {StyleSheet, Text, View} from 'react-native';

export type IconName =
  | 'home'
  | 'clients'
  | 'alerts'
  | 'profile'
  | 'receipt'
  | 'search'
  | 'plus'
  | 'back'
  | 'enter'
  | 'close'
  | 'check'
  | 'down'
  | 'filter'
  | 'store'
  | 'credit'
  | 'wallet'
  | 'clock'
  | 'calendar'
  | 'incoming'
  | 'outgoing'
  | 'logout'
  | 'bell'
  | 'eye'
  | 'eyeOff'
  | 'chart'
  | 'person';

/** Iconos hechos con primitivas nativas para no requerir react-native-svg. */
export function MonochromeIcon({
  name,
  color,
  size = 22,
  strokeWidth = 2,
}: {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const line = Math.max(1.5, size * 0.09 * (strokeWidth / 2));
  const textStyle = {color, fontSize: size * 0.9, lineHeight: size, fontWeight: '700' as const};
  const frame = (children: React.ReactNode) => (
    <View accessible={false} style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      {children}
    </View>
  );

  if (name === 'home') return frame(<>
    <View style={[styles.roof, {borderLeftWidth: size * 0.45, borderRightWidth: size * 0.45, borderBottomWidth: size * 0.39, borderBottomColor: color}]} />
    <View style={{width: size * 0.66, height: size * 0.43, backgroundColor: color, alignItems: 'center', justifyContent: 'flex-end'}}><View style={{width: size * 0.18, height: size * 0.26, backgroundColor: '#fff', borderTopLeftRadius: 3, borderTopRightRadius: 3}} /></View>
  </>);

  if (name === 'clients') return frame(<>
    <View style={{flexDirection: 'row', gap: size * 0.12, alignItems: 'center'}}><View style={{width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: color}} /><View style={{width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: color, opacity: 0.62}} /></View>
    <View style={{flexDirection: 'row', alignItems: 'flex-end', marginTop: size * 0.1}}><View style={{width: size * 0.43, height: size * 0.34, borderTopLeftRadius: size * 0.22, borderTopRightRadius: size * 0.22, backgroundColor: color}} /><View style={{width: size * 0.4, height: size * 0.28, borderTopLeftRadius: size * 0.2, borderTopRightRadius: size * 0.2, marginLeft: -size * 0.08, backgroundColor: color, opacity: 0.62}} /></View>
  </>);

  if (name === 'profile') return frame(<>
    <View style={{width: size * 0.34, height: size * 0.34, borderRadius: size, borderWidth: line, borderColor: color, marginBottom: size * 0.08}} />
    <View style={{width: size * 0.76, height: size * 0.35, borderTopLeftRadius: size, borderTopRightRadius: size, borderWidth: line, borderBottomWidth: 0, borderColor: color}} />
  </>);

  if (name === 'alerts' || name === 'bell') return frame(<View style={{width: size * 0.78, height: size * 0.78, borderRadius: size, borderWidth: line, borderColor: color, alignItems: 'center', justifyContent: 'center'}}><Text style={{color, fontSize: size * 0.52, fontWeight: '800', lineHeight: size * 0.58}}>{name === 'bell' ? '!' : '!'}</Text></View>);

  if (name === 'receipt') return frame(<View style={{width: size * 0.64, height: size * 0.82, borderWidth: line, borderColor: color, borderRadius: 3, paddingHorizontal: size * 0.11, justifyContent: 'space-evenly'}}><View style={{height: line, backgroundColor: color}} /><View style={{height: line, backgroundColor: color}} /><View style={{height: line, width: '66%', backgroundColor: color}} /></View>);

  if (name === 'search') return frame(<><View style={{width: size * 0.58, height: size * 0.58, borderRadius: size, borderWidth: line, borderColor: color, marginTop: -size * 0.12, marginLeft: -size * 0.1}} /><View style={{position: 'absolute', width: size * 0.32, height: line, backgroundColor: color, transform: [{rotate: '45deg'}], right: size * 0.02, bottom: size * 0.12, borderRadius: line}} /></>);

  if (name === 'clock') return frame(<View style={{width: size * 0.78, height: size * 0.78, borderRadius: size, borderWidth: line, borderColor: color, alignItems: 'center', justifyContent: 'center'}}><View style={{position: 'absolute', height: size * 0.26, width: line, backgroundColor: color, top: size * 0.14, borderRadius: line}} /><View style={{position: 'absolute', width: size * 0.23, height: line, backgroundColor: color, top: size * 0.37, left: size * 0.39, transform: [{rotate: '20deg'}], borderRadius: line}} /></View>);

  if (name === 'credit' || name === 'wallet') return frame(<View style={{width: size * 0.84, height: size * 0.62, borderWidth: line, borderColor: color, borderRadius: size * 0.15, justifyContent: 'center', paddingHorizontal: size * 0.08}}><View style={{position: 'absolute', left: -line, right: -line, top: size * 0.17, height: line * 1.2, backgroundColor: color}} /><View style={{position: 'absolute', right: size * 0.08, top: size * 0.29, width: size * 0.12, height: size * 0.1, borderRadius: size, backgroundColor: color}} /></View>);

  if (name === 'calendar') return frame(<View style={{width: size * 0.76, height: size * 0.74, borderRadius: size * 0.12, borderWidth: line, borderColor: color, alignItems: 'center'}}><View style={{height: line * 1.3, backgroundColor: color, width: '100%', marginTop: size * 0.2}} /><View style={{flexDirection: 'row', flexWrap: 'wrap', width: size * 0.47, gap: size * 0.06, marginTop: size * 0.08}}>{[0, 1, 2, 3].map(i => <View key={i} style={{width: size * 0.13, height: size * 0.1, borderRadius: 2, backgroundColor: color, opacity: 0.75}} />)}</View></View>);

  if (name === 'store') return frame(<><View style={{width: size * 0.82, height: size * 0.25, borderTopLeftRadius: size * 0.12, borderTopRightRadius: size * 0.12, backgroundColor: color, marginBottom: size * 0.04}} /><View style={{width: size * 0.68, height: size * 0.48, borderWidth: line, borderColor: color, alignItems: 'center', justifyContent: 'flex-end'}}><View style={{width: size * 0.2, height: size * 0.28, backgroundColor: color}} /></View></>);

  if (name === 'filter') return frame(<View style={{gap: size * 0.15}}>{[0.85, 0.58, 0.32].map((width, i) => <View key={i} style={{width: size * width, height: line, backgroundColor: color, borderRadius: line}} />)}</View>);

  if (name === 'chart') return frame(
    <View style={{flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.1, height: size * 0.78}}>
      <View style={{width: size * 0.18, height: size * 0.38, backgroundColor: color, borderRadius: 2, opacity: 0.7}} />
      <View style={{width: size * 0.18, height: size * 0.62, backgroundColor: color, borderRadius: 2}} />
      <View style={{width: size * 0.18, height: size * 0.46, backgroundColor: color, borderRadius: 2, opacity: 0.85}} />
      <View style={{width: size * 0.18, height: size * 0.78, backgroundColor: color, borderRadius: 2}} />
    </View>
  );

  if (name === 'person') return frame(<>
    <View style={{width: size * 0.34, height: size * 0.34, borderRadius: size, borderWidth: line, borderColor: color, marginBottom: size * 0.06}} />
    <View style={{width: size * 0.64, height: size * 0.3, borderTopLeftRadius: size, borderTopRightRadius: size, borderWidth: line, borderBottomWidth: 0, borderColor: color}} />
  </>);

  if (name === 'eye' || name === 'eyeOff') return frame(<View style={{width: size * 0.92, height: size * 0.58, borderRadius: size * 0.29, borderWidth: line, borderColor: color, alignItems: 'center', justifyContent: 'center'}}>{name === 'eye' ? <View style={{width: size * 0.26, height: size * 0.26, borderRadius: size, backgroundColor: color}} /> : <View style={{position: 'absolute', width: size * 0.95, height: line, backgroundColor: color, transform: [{rotate: '-18deg'}], borderRadius: line}} />}</View>);

  if (name === 'plus' || name === 'close' || name === 'check' || name === 'back' || name === 'enter' || name === 'down' || name === 'incoming' || name === 'outgoing' || name === 'logout') {
    const glyphs: Record<string, string> = {plus: '+', close: '×', check: '✓', back: '‹', enter: '›', down: '⌄', incoming: '↓', outgoing: '↑', logout: '⇥'};
    return frame(<Text style={[textStyle, (name === 'back' || name === 'enter') && {fontSize: size * 1.55, lineHeight: size * 0.95}, name === 'plus' && {fontWeight: '400', fontSize: size * 1.2}, name === 'check' && {fontSize: size * 0.82}]}>{glyphs[name]}</Text>);
  }

  return frame(<Text style={textStyle}>•</Text>);
}

const styles = StyleSheet.create({
  roof: {width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomWidth: 0},
});
