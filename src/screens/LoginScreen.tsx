import React, {useCallback, useState} from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
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

  // En el login, presionar atrás no debe hacer nada para mantener la app abierta
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );
      return () => subscription.remove();
    }, []),
  );

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
      return Alert.alert(
        'No pudimos entrar',
        'Verifica tu correo y contraseña.',
      );
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
      <View style={styles.heroCard}>
        <View style={styles.heroBgCircle1} />
        <View style={styles.heroBgCircle2} />

        <Image
          source={require('../assets/LogoSinFondo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.appName}>Tenderito</Text>
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
          title={
            loading
              ? 'Entrando…'
              : role === 'store'
              ? 'Entrar a mi tienda'
              : 'Ver mis fiados'
          }
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
        title={
          role === 'store'
            ? 'Crear mi tienda gratis'
            : 'Activar mi cuenta de cliente'
        }
        variant="secondary"
        onPress={() =>
          navigation.navigate(
            role === 'store' ? 'Register' : 'CustomerRegister',
          )
        }
      />

      {/* ── Confianza ── */}
      <View style={styles.trust}>
        <View style={styles.trustItem}>
          <Ionicons
            name="shield-checkmark-outline"
            size={13}
            color={Colors.textMuted}
          />
          <Text style={styles.trustText}>Tus datos siempre seguros</Text>
        </View>
        <View style={styles.trustItem}>
          <Ionicons
            name="cloud-offline-outline"
            size={13}
            color={Colors.textMuted}
          />
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
  heroCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    gap: 4,
  },
  heroBgCircle1: {
    display: 'none',
  },
  heroBgCircle2: {
    display: 'none',
  },
  logoImage: {
    width: 140,
    height: 112,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
    marginTop: 2,
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
