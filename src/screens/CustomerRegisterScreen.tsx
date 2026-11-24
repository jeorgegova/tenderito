import React, { useState, useRef, useMemo } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { Input } from '../components/ui/Input';
import { showAlert } from '../components/ui/AlertModal';
import { showToast } from '../components/ui/Toast';
import { useResponsive } from '../hooks/useResponsive';
import { customerAuthEmail } from '../lib/customerAuth';
import { supabase } from '../lib/supabase';
import { findCustomerForActivation } from '../services/customerPortal';
import { Colors } from '../theme';

export function CustomerRegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isSmall, isCompact, isTablet } = useResponsive();
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Validación estilo Formik (touched + errors en tiempo real)
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const logoW = isSmall ? 175 : isCompact ? 200 : 220;
  const logoH = Math.round(logoW * (120 / 220));

  const errors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!document.trim()) {
      errs.document = 'Ingresa tu cédula';
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!phone.trim()) {
      errs.phone = 'Ingresa tu número celular';
    } else if (cleanPhone.length < 10) {
      errs.phone = 'El celular debe tener al menos 10 dígitos';
    }
    if (!password) {
      errs.password = 'La contraseña es requerida';
    } else if (password.length < 6) {
      errs.password = 'Mínimo 6 caracteres';
    }
    if (!confirmPassword) {
      errs.confirmPassword = 'Debes confirmar tu contraseña';
    } else if (confirmPassword !== password) {
      errs.confirmPassword = 'Las contraseñas no coinciden';
    }
    return errs;
  }, [document, phone, password, confirmPassword]);

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

  async function checkDocument() {
    Keyboard.dismiss();
    if (!document.trim()) {
      setTouched(prev => ({ ...prev, document: true }));
      return showAlert({
        title: 'Faltan datos',
        message: 'Ingresa tu cédula',
        type: 'warning',
      });
    }
    setLoading(true);
    try {
      const cleanDoc = document.trim();
      const result = await findCustomerForActivation(cleanDoc);
      if (!result) {
        return showAlert({
          title: 'No te encontramos',
          message: 'Pídele al tendero que te registre primero.',
          type: 'warning',
        });
      }

      // Si la cuenta ya fue activada previamente
      if (result.is_activated) {
        return showAlert({
          title: 'Cuenta ya registrada',
          message: 'Esta cuenta ya existe y se encuentra activa. Puedes iniciar sesión o restablecer tu contraseña.',
          type: 'info',
          buttons: [
            {
              text: 'Restablecer contraseña',
              onPress: () =>
                navigation.navigate('ForgotPassword', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
            {
              text: 'Iniciar sesión',
              onPress: () =>
                navigation.navigate('Login', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
          ],
        });
      }

      // Validación complementaria contra auth.users
      const { data: emailExists } = await supabase.rpc('check_user_email_exists', {
        p_email: customerAuthEmail(cleanDoc),
      });
      if (emailExists) {
        return showAlert({
          title: 'Cuenta ya registrada',
          message: 'Esta cuenta ya existe y se encuentra activa. Puedes iniciar sesión o restablecer tu contraseña.',
          type: 'info',
          buttons: [
            {
              text: 'Restablecer contraseña',
              onPress: () =>
                navigation.navigate('ForgotPassword', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
            {
              text: 'Iniciar sesión',
              onPress: () =>
                navigation.navigate('Login', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
          ],
        });
      }

      setCustomer(result);
    } catch (error: any) {
      showAlert({
        title: 'No se pudo consultar',
        message: error?.message ?? 'Intenta de nuevo',
        type: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function activate() {
    Keyboard.dismiss();
    setTouched(prev => ({
      ...prev,
      phone: true,
      password: true,
      confirmPassword: true,
    }));

    if (errors.phone || errors.password || errors.confirmPassword) {
      const firstError = errors.phone || errors.password || errors.confirmPassword;
      return showAlert({
        title: 'Verifica los campos',
        message: firstError,
        type: 'warning',
      });
    }

    setLoading(true);
    const cleanDoc = document.trim();
    const { data, error } = await supabase.auth.signUp({
      email: customerAuthEmail(cleanDoc),
      password,
      options: {
        data: { user_type: 'customer', customer_id: customer.customer_id, phone },
      },
    });

    if (error || !data.user) {
      setLoading(false);
      const errMsg = (error?.message || '').toLowerCase();
      if (
        errMsg.includes('already registered') ||
        errMsg.includes('ya está registrado') ||
        errMsg.includes('already exists')
      ) {
        return showAlert({
          title: 'Cuenta ya registrada',
          message: 'Tu cuenta ya fue activada anteriormente. Si no recuerdas tu contraseña, puedes restablecerla.',
          type: 'info',
          buttons: [
            {
              text: 'Restablecer contraseña',
              onPress: () =>
                navigation.navigate('ForgotPassword', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
            {
              text: 'Iniciar sesión',
              onPress: () =>
                navigation.navigate('Login', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
          ],
        });
      }
      return showAlert({
        title: 'No se pudo activar',
        message: error?.message ?? 'Intenta de nuevo',
        type: 'destructive',
      });
    }

    // Si signUp no devolvió sesión directa, autenticar con las credenciales ingresadas
    if (!data.session) {
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: customerAuthEmail(cleanDoc),
          password,
        });

      setLoading(false);

      if (signInError || !signInData.session) {
        return showAlert({
          title: 'Cuenta activada',
          message:
            'Tu cuenta ha sido activada correctamente. Por favor ingresa tu contraseña para acceder a tu perfil.',
          type: 'info',
          buttons: [
            {
              text: 'Iniciar sesión',
              onPress: () =>
                navigation.replace('Login', {
                  role: 'customer',
                  document: cleanDoc,
                }),
            },
          ],
        });
      }
    } else {
      setLoading(false);
    }

    // Sesión establecida exitosamente: mostrar toast de bienvenida no bloqueante
    showToast(
      '¡Bienvenido a Tenderito!',
      'Tu cuenta ha sido activada correctamente',
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Curvas abstractas dinámicas de la app ── */}
      <DynamicBrandCurves position="bottom-left" />

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: 16, paddingBottom: insets.bottom + 32, flexGrow: 1 },
          isTablet ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : null,
        ]}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 48}
        extraHeight={Platform.OS === 'ios' ? 24 : 48}
        keyboardOpeningTime={0}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}>
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
          <Text style={styles.title}>Activar cuenta de cliente</Text>
          <Text style={styles.subtitle}>
            Usa la cédula con la que te registró el tendero para consultar tus fiados y abonos.
          </Text>

          <Input
            label="Número de identificación"
            value={document}
            onChangeText={setDocument}
            onBlur={() => handleBlur('document')}
            error={touched.document ? errors.document : undefined}
            keyboardType="number-pad"
            placeholder="Tu cédula"
          />

          <Button
            title={loading && !customer ? 'Consultando…' : 'Buscar mis datos'}
            onPress={checkDocument}
            disabled={loading}
          />

          {customer && (
            <View style={styles.foundSection}>
              <View style={styles.customerBox}>
                <View style={styles.customerBoxHeader}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={Colors.success}
                  />
                  <Text style={styles.customerBoxTitle}>Cliente identificado</Text>
                </View>
                <Text style={styles.customerName}>{customer.name_masked}</Text>
                <Text style={styles.customerPhone}>
                  Teléfono registrado: {customer.phone_masked}
                </Text>
              </View>

              <Input
                ref={phoneRef}
                label="Confirma tu teléfono"
                value={phone}
                onChangeText={setPhone}
                onBlur={() => handleBlur('phone')}
                error={touched.phone ? errors.phone : undefined}
                keyboardType="phone-pad"
                placeholder="Ingresa tu celular"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />

              <Input
                ref={passwordRef}
                label="Crea tu contraseña"
                value={password}
                onChangeText={setPassword}
                onBlur={() => handleBlur('password')}
                error={passwordError}
                secureTextEntry
                editable={!!phone.trim()}
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
                editable={!!phone.trim()}
                placeholder="Repite tu contraseña"
                returnKeyType="done"
                onSubmitEditing={activate}
              />

              <Button
                title={loading ? 'Activando cuenta…' : 'Activar mi cuenta'}
                onPress={activate}
                disabled={loading}
              />
            </View>
          )}

          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>¿Ya tienes cuenta activa? </Text>
            <Pressable
              onPress={() =>
                navigation.replace('Login', {
                  role: 'customer',
                  document: document.trim() || undefined,
                })
              }>
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
      </KeyboardAwareScrollView>
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
  foundSection: {
    gap: 14,
    marginTop: 6,
  },
  customerBox: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#E3F8EC',
    borderWidth: 1,
    borderColor: '#B6E8CA',
    gap: 4,
  },
  customerBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  customerBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.success,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  customerPhone: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
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
