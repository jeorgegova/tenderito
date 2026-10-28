import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { customerAuthEmail } from '../lib/customerAuth';
import { Colors } from '../theme';

export function LoginScreen({ navigation }: any) {
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
    const { error } = await supabase.auth.signInWithPassword({
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
    <View style={styles.container}>
      {/* Fondo completo de la pantalla */}
      <Image
        source={require('../assets/FondoLogin.png')}
        style={styles.bgImage}
        resizeMode="cover"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* ── Logo nuevo limpio sin contornos ni textos duplicados ── */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/NuevoLogo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* ── Selector de rol ── */}
        <View style={styles.roleRow}>
          {[
            { id: 'store', label: 'Soy tendero', icon: 'storefront-outline' },
            { id: 'customer', label: 'Soy cliente', icon: 'person-outline' },
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

          {/* ── Registro dentro del mismo recuadro ── */}
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
        </Card>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  wrap: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  // Logo
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  logoImage: {
    width: 250,
    height: 160,
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
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  roleBtnActive: {
    backgroundColor: '#FFF1E5',
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
  form: {
    gap: 14,
    padding: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
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
    marginTop: 6,
    marginBottom: 2,
  },
  divider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  // Confianza
  trust: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignSelf: 'center',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustText: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
