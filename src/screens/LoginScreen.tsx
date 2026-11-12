import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { showAlert } from '../components/ui/AlertModal';
import { supabase } from '../lib/supabase';
import { customerAuthEmail } from '../lib/customerAuth';
import { Colors } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { getAppVersion } from '../services/deviceService';

export function LoginScreen({ route, navigation }: any) {
  const { isSmall, isCompact, isTablet } = useResponsive();
  const initialRole = route?.params?.role || 'store';
  const initialDocument = route?.params?.document || '';
  const [email, setEmail] = useState('');
  const [document, setDocument] = useState(initialDocument);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'store' | 'customer'>(initialRole);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const appVersion = getAppVersion();

  useEffect(() => {
    if (route?.params?.role) {
      setRole(route.params.role);
    }
    if (route?.params?.document !== undefined) {
      setDocument(route.params.document);
    }
  }, [route?.params?.role, route?.params?.document]);

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
      return showAlert({
        title: 'Faltan datos',
        message: 'Completa tus datos para ingresar',
        type: 'warning',
      });
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: role === 'store' ? email.trim() : customerAuthEmail(document),
      password,
    });
    setLoading(false);
    if (error) {
      return showAlert({
        title: 'No pudimos entrar',
        message: 'Verifica tu correo y contraseña.',
        type: 'destructive',
      });
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

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32, flexGrow: 1 },
        ]}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 48}
        extraHeight={Platform.OS === 'ios' ? 24 : 48}
        keyboardOpeningTime={0}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* ── Logo nuevo limpio sin contornos ni textos duplicados ── */}
        <View style={[styles.logoContainer, isSmall && styles.logoContainerSmall]}>
          <Image
            source={require('../assets/NuevoLogo.png')}
            style={[
              styles.logoImage,
              isSmall ? styles.logoImageSmall : isCompact ? styles.logoImageCompact : null,
            ]}
            resizeMode="contain"
          />
        </View>

        {/* ── Contenedor centralizado para tablets ── */}
        <View style={[styles.innerContent, isTablet && styles.innerContentTablet]}>
          {/* ── Selector de rol ── */}
          <View style={[styles.roleRow, isSmall && styles.roleRowSmall]}>
            {[
              { id: 'store', label: 'Soy tendero', icon: 'storefront-outline' },
              { id: 'customer', label: 'Soy cliente', icon: 'person-outline' },
            ].map(r => (
              <Pressable
                key={r.id}
                onPress={() => setRole(r.id as 'store' | 'customer')}
                style={[
                  styles.roleBtn,
                  isSmall && styles.roleBtnSmall,
                  role === r.id && styles.roleBtnActive,
                ]}>
                <Ionicons
                  name={r.icon as any}
                  size={isSmall ? 16 : 18}
                  color={role === r.id ? Colors.primary : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.roleTxt,
                    isSmall && styles.roleTxtSmall,
                    role === r.id && styles.roleTxtActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Formulario ── */}
          <Card style={[styles.form, isSmall && styles.formSmall]}>
            <Text style={[styles.formTitle, isSmall && styles.formTitleSmall]}>
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
        </View>

        {/* ── Confianza y versión ── */}
        <View style={styles.trustWrap}>
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
          <Text style={styles.versionText}>Versión {appVersion}</Text>
        </View>
      </KeyboardAwareScrollView>
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
  logoContainerSmall: {
    paddingVertical: 6,
  },
  logoImage: {
    width: 250,
    height: 155,
  },
  logoImageCompact: {
    width: 210,
    height: 130,
  },
  logoImageSmall: {
    width: 175,
    height: 105,
  },
  innerContent: {
    width: '100%',
    gap: 16,
  },
  innerContentTablet: {
    maxWidth: 460,
    alignSelf: 'center',
  },
  // Roles
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleRowSmall: {
    gap: 6,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 8,
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
    minHeight: 46,
  },
  roleBtnSmall: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 42,
    gap: 4,
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
  roleTxtSmall: {
    fontSize: 12.5,
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
  formSmall: {
    padding: 16,
    gap: 11,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  formTitleSmall: {
    fontSize: 17,
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
  // Confianza y versión
  trustWrap: {
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  trust: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignSelf: 'center',
    maxWidth: '100%',
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
  versionText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
