import {useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Input} from '../components/ui/Input';
import {supabase} from '../lib/supabase';
import {customerAuthEmail} from '../lib/customerAuth';
import {Colors} from '../theme';

export function LoginScreen({navigation}: any) {
  const [email, setEmail] = useState('');
  const [document, setDocument] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'store' | 'customer'>('store');
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  async function onLogin() {
    if (
      (!email && role === 'store') ||
      (!document && role === 'customer') ||
      !password
    ) {
      return Alert.alert('Faltan datos', 'Completa tus datos para ingresar');
    }
    setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({
      email: role === 'store' ? email.trim() : customerAuthEmail(document),
      password,
    });
    setLoading(false);
    if (error) {
      return Alert.alert('No pudimos entrar', 'Verifica tu correo y contraseña.');
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.wrap,
        {paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32},
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>

      {/* ── Hero de la marca ── */}
      <View style={styles.hero}>
        {/* Ícono del logo: toldo de tienda */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            {/* Toldo con rayas */}
            <View style={styles.awning}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[styles.stripe, i % 2 === 0 && styles.stripeDark]} />
              ))}
            </View>
            {/* Frente de la tienda */}
            <View style={styles.storeFront}>
              <View style={styles.storeWindow} />
              <View style={styles.storeDoor} />
            </View>
          </View>
        </View>
        <Text style={styles.appName}>tenderito</Text>
        <Text style={styles.tagline}>
          Los fiados de tu tienda,{'\n'}siempre bajo control
        </Text>
      </View>

      {/* ── Selector de rol ── */}
      <View style={styles.roleRow}>
        {[
          {id: 'store', label: 'Soy tendero', icon: 'storefront-outline'},
          {id: 'customer', label: 'Soy cliente', icon: 'person-outline'},
        ].map(r => (
          <Pressable
            key={r.id}
            onPress={() => setRole(r.id as 'store' | 'customer')}
            style={[styles.roleBtn, role === r.id && styles.roleBtnActive]}>
            <Ionicons
              name={r.icon as any}
              size={18}
              color={role === r.id ? Colors.primary : Colors.textSecondary}
            />
            <Text
              style={[styles.roleTxt, role === r.id && styles.roleTxtActive]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Formulario ── */}
      <Card style={styles.form}>
        <Text style={styles.formTitle}>
          {role === 'store' ? 'Entra a tu tienda' : 'Entra a tu cuenta'}
        </Text>
        {role === 'store' ? (
          <Input
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tutienda@mail.com"
          />
        ) : (
          <Input
            label="Número de identificación"
            value={document}
            onChangeText={setDocument}
            keyboardType="number-pad"
            placeholder="Tu cédula"
          />
        )}
        <Input
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />
        <Button
          title={loading ? 'Entrando…' : role === 'store' ? 'Entrar a mi tienda' : 'Ver mis fiados'}
          onPress={onLogin}
          disabled={loading}
        />
      </Card>

      {/* ── Registro ── */}
      <View style={styles.registerWrap}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>¿Primera vez?</Text>
        <View style={styles.divider} />
      </View>
      <Button
        title={role === 'store' ? 'Crear mi tienda gratis' : 'Activar mi cuenta de cliente'}
        variant="secondary"
        onPress={() =>
          navigation.navigate(role === 'store' ? 'Register' : 'CustomerRegister')
        }
      />

      {/* ── Confianza ── */}
      <View style={styles.trust}>
        <View style={styles.trustItem}>
          <Ionicons name="shield-checkmark-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.trustText}>Tus datos siempre seguros</Text>
        </View>
        <View style={styles.trustItem}>
          <Ionicons name="cloud-offline-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.trustText}>Funciona sin internet</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {backgroundColor: Colors.background},
  wrap: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  // Hero
  hero: {alignItems: 'center', paddingVertical: 8, gap: 8},
  logoWrap: {marginBottom: 4},
  logoIcon: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    // Sombra naranja profunda para presencia
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  awning: {
    flexDirection: 'row',
    width: '100%',
    height: 32,
    position: 'absolute',
    top: 0,
  },
  stripe: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  stripeDark: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  storeFront: {
    width: 56,
    height: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingBottom: 0,
  },
  storeWindow: {
    width: 16,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 3,
  },
  storeDoor: {
    width: 14,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  appName: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  // Roles
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  roleTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  roleTxtActive: {
    color: Colors.primary,
  },
  // Formulario
  form: {gap: 14, padding: 20},
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  // Registro
  registerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: -4,
  },
  divider: {flex: 1, height: 1, backgroundColor: Colors.border},
  dividerText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  // Confianza
  trust: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
