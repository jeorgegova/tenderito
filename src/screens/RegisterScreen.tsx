import React, { useState, useRef, useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { Input } from '../components/ui/Input';
import { showAlert } from '../components/ui/AlertModal';
import { useResponsive } from '../hooks/useResponsive';
import { supabase } from '../lib/supabase';
import { Colors } from '../theme';

export function RegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isSmall, isCompact, isTablet } = useResponsive();
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Validación estilo Formik (touched + errors en tiempo real)
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const phoneRef = useRef<TextInput>(null);
  const merchantNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const logoW = isSmall ? 175 : isCompact ? 200 : 220;
  const logoH = Math.round(logoW * (120 / 220));

  const errors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!storeName.trim()) {
      errs.storeName = 'El nombre de la tienda es requerido';
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      errs.phone = 'El teléfono de contacto es requerido';
    } else if (cleanPhone.length < 7) {
      errs.phone = 'Ingresa un número de teléfono válido (mínimo 7 dígitos)';
    }
    if (!merchantName.trim()) {
      errs.merchantName = 'Tu nombre completo es requerido';
    }
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      errs.email = 'El correo electrónico es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errs.email = 'Ingresa un correo electrónico válido';
    }
    if (!password) {
      errs.password = 'La contraseña es requerida';
    } else if (password.length < 6) {
      errs.password = 'La contraseña debe tener al menos 6 caracteres';
    }
    if (!confirmPassword) {
      errs.confirmPassword = 'Debes confirmar tu contraseña';
    } else if (confirmPassword !== password) {
      errs.confirmPassword = 'Las contraseñas no coinciden';
    }
    return errs;
  }, [storeName, merchantName, email, password, confirmPassword]);

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Al digitar confirmar contraseña, valida inmediatamente si no coincide
  const confirmPasswordError =
    (touched.confirmPassword || confirmPassword.length > 0) && errors.confirmPassword
      ? errors.confirmPassword
      : undefined;

  const passwordError =
    (touched.password || (password.length > 0 && password.length < 6 && (touched.confirmPassword || confirmPassword.length > 0))) && errors.password
      ? errors.password
      : touched.password && errors.password
      ? errors.password
      : undefined;

  async function onRegister() {
    setTouched({
      storeName: true,
      phone: true,
      merchantName: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    if (Object.keys(errors).length > 0) {
      const firstError =
        errors.storeName ||
        errors.phone ||
        errors.merchantName ||
        errors.email ||
        errors.password ||
        errors.confirmPassword;
      return showAlert({
        title: 'Verifica los campos',
        message: firstError,
        type: 'warning',
      });
    }
    setLoading(true);
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          store_name: storeName,
          phone: cleanPhone,
          store_phone: cleanPhone,
          merchant_name: merchantName,
          subscription_plan: 'free',
        },
      },
    });
    if (error || !data.user) {
      setLoading(false);
      return showAlert({
        title: 'Error',
        message: error?.message ?? 'No se pudo registrar',
        type: 'destructive',
      });
    }

    if (data?.session && data?.user) {
      try {
        await supabase
          .from('profiles')
          .update({ phone: cleanPhone })
          .eq('id', data.user.id);
      } catch (_pErr) {}

      try {
        await supabase
          .from('stores')
          .update({ phone: cleanPhone })
          .eq('owner_id', data.user.id);
      } catch (_sErr) {}
    }

    setLoading(false);

    if (!data.session) {
      return showAlert({
        title: 'Revisa tu correo',
        message:
          'Te enviamos un correo de comprobación. Valida tu cuenta para poder iniciar sesión.',
        type: 'info',
        buttons: [
          {
            text: 'Ir al inicio de sesión',
            onPress: () => navigation.replace('Login'),
          },
        ],
      });
    }

    showAlert({
      title: 'Cuenta creada',
      message: 'Tu cuenta ya está lista para usar.',
      type: 'success',
    });
  }

  return (
    <View style={styles.container}>
      {/* ── Curvas abstractas dinámicas de la app ── */}
      <DynamicBrandCurves position="top-right" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: 16, paddingBottom: insets.bottom + 32 },
          isTablet ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* ── Logo nuevo ── */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/NuevoLogo.png')}
            style={{ width: logoW, height: logoH }}
            resizeMode="contain"
          />
        </View>

        {/* ── Tarjeta del formulario ── */}
        <Card style={styles.card}>
          <Text style={styles.title}>Crear mi tienda gratis</Text>
          <Text style={styles.subtitle}>
            Empieza a organizar los fiados y cuentas de tu negocio en segundos.
          </Text>

          <Input
            label="Nombre de tu tienda"
            value={storeName}
            onChangeText={setStoreName}
            onBlur={() => handleBlur('storeName')}
            error={touched.storeName ? errors.storeName : undefined}
            placeholder="Ej: Tienda La Esquina"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            blurOnSubmit={false}
          />
          <Input
            ref={phoneRef}
            label="Teléfono de contacto"
            value={phone}
            onChangeText={t => setPhone(t.replace(/[^0-9]/g, ''))}
            onBlur={() => handleBlur('phone')}
            error={touched.phone ? errors.phone : undefined}
            keyboardType="phone-pad"
            placeholder="Ej: 300 123 4567"
            returnKeyType="next"
            onSubmitEditing={() => merchantNameRef.current?.focus()}
            blurOnSubmit={false}
          />
          <Input
            ref={merchantNameRef}
            label="Tu nombre"
            value={merchantName}
            onChangeText={setMerchantName}
            onBlur={() => handleBlur('merchantName')}
            error={touched.merchantName ? errors.merchantName : undefined}
            placeholder="Ej: Doña María"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            blurOnSubmit={false}
          />
          <Input
            ref={emailRef}
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            onBlur={() => handleBlur('email')}
            error={touched.email ? errors.email : undefined}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tutienda@mail.com"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <Input
            ref={passwordRef}
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            onBlur={() => handleBlur('password')}
            error={passwordError}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <Input
            ref={confirmPasswordRef}
            label="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => handleBlur('confirmPassword')}
            error={confirmPasswordError}
            secureTextEntry
            placeholder="Repite tu contraseña"
            returnKeyType="done"
            onSubmitEditing={onRegister}
          />

          <Button
            title={loading ? 'Creando tienda…' : 'Crear mi tienda gratis'}
            onPress={onRegister}
            disabled={loading}
          />

          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>¿Ya tienes una tienda? </Text>
            <Pressable onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Inicia sesión</Text>
            </Pressable>
          </View>
        </Card>

        {/* ── Sellos de confianza ── */}
        <View style={styles.trust}>
          <View style={styles.trustItem}>
            <Ionicons
              name="shield-checkmark-outline"
              size={13}
              color={Colors.textSecondary}
            />
            <Text style={styles.trustText}>Tus datos siempre seguros</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons
              name="cloud-offline-outline"
              size={13}
              color={Colors.textSecondary}
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
  scroll: {
    flex: 1,
  },
  wrap: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  logoImage: {
    width: 220,
    height: 120,
  },
  card: {
    gap: 14,
    padding: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginTop: -4,
    marginBottom: 4,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 4,
  },
  loginPrompt: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  loginLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
  },
  trust: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 8,
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
});
