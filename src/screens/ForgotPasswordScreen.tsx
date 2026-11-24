import React, { useState } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { Input } from '../components/ui/Input';
import { MagnetRoleSwitch } from '../components/ui/MagnetRoleSwitch';
import { showAlert } from '../components/ui/AlertModal';
import { useResponsive } from '../hooks/useResponsive';
import { supabase } from '../lib/supabase';
import { Colors } from '../theme';

export function ForgotPasswordScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isSmall, isCompact, isTablet } = useResponsive();

  const initialRole = route?.params?.role || 'store';
  const initialEmail = route?.params?.email || '';
  const initialDocument = route?.params?.document || '';

  const [role, setRole] = useState<'store' | 'customer'>(initialRole);

  // Estado Tendero
  const [email, setEmail] = useState(initialEmail);
  const [otpCode, setOtpCode] = useState('');
  const [stepStore, setStepStore] = useState<'request' | 'verify'>('request');
  const [newPasswordStore, setNewPasswordStore] = useState('');
  const [confirmPasswordStore, setConfirmPasswordStore] = useState('');

  // Estado Cliente
  const [document, setDocument] = useState(initialDocument);
  const [phone, setPhone] = useState('');
  const [newPasswordCust, setNewPasswordCust] = useState('');
  const [confirmPasswordCust, setConfirmPasswordCust] = useState('');

  const [loading, setLoading] = useState(false);

  const logoW = isSmall ? 160 : isCompact ? 180 : 200;
  const logoH = Math.round(logoW * (110 / 200));

  // ─── 1. Flujo Tendero: Solicitar OTP por correo ──────────────────────────────
  async function handleSendStoreOtp() {
    Keyboard.dismiss();
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return showAlert({
        title: 'Correo inválido',
        message: 'Por favor ingresa un correo electrónico válido.',
        type: 'warning',
      });
    }

    setLoading(true);
    try {
      // 1. Verificar si el correo realmente existe en la plataforma
      const { data: exists, error: checkError } = await supabase.rpc('check_user_email_exists', {
        p_email: cleanEmail,
      });

      if (checkError) {
        console.warn('[ForgotPassword] Error consultando correo registrado:', checkError);
      } else if (exists === false) {
        return showAlert({
          title: 'Correo no registrado',
          message: 'No existe ninguna cuenta registrada con este correo electrónico. Verifica que lo hayas escrito bien.',
          type: 'destructive',
        });
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;

      setStepStore('verify');
      showAlert({
        title: 'Código enviado',
        message: `Hemos enviado el código de verificación a ${cleanEmail}. Revisa tu bandeja de entrada o spam.`,
        type: 'success',
      });
    } catch (err: any) {
      showAlert({
        title: 'No se pudo enviar',
        message: err?.message || 'Verifica que el correo esté registrado.',
        type: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ─── 2. Flujo Tendero: Verificar código y actualizar contraseña ───────────────
  async function handleVerifyStoreOtp() {
    Keyboard.dismiss();
    const cleanEmail = email.trim();
    const cleanCode = otpCode.trim();

    if (!cleanCode || cleanCode.length < 6) {
      return showAlert({
        title: 'Código incompleto',
        message: 'Ingresa el código numérico recibido en tu correo.',
        type: 'warning',
      });
    }

    if (newPasswordStore.length < 6) {
      return showAlert({
        title: 'Contraseña corta',
        message: 'La nueva contraseña debe tener al menos 6 caracteres.',
        type: 'warning',
      });
    }

    if (newPasswordStore !== confirmPasswordStore) {
      return showAlert({
        title: 'No coinciden',
        message: 'Las contraseñas no coinciden.',
        type: 'warning',
      });
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'recovery',
      });

      if (error || !data.session) {
        throw new Error(error?.message || 'El código es inválido o ha expirado.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPasswordStore,
      });

      if (updateError) throw updateError;

      await supabase.auth.signOut();

      showAlert({
        title: '¡Contraseña restablecida!',
        message: 'Tu contraseña ha sido actualizada exitosamente. Ya puedes iniciar sesión.',
        type: 'success',
        buttons: [
          {
            text: 'Ir a Iniciar Sesión',
            onPress: () => navigation.navigate('Login', { role: 'store', email: cleanEmail }),
          },
        ],
      });
    } catch (err: any) {
      showAlert({
        title: 'Error al restablecer',
        message: err?.message || 'Código incorrecto o vencido.',
        type: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ─── 3. Flujo Cliente: Validar Cédula + Celular y actualizar contraseña ──────
  async function handleResetCustomerPassword() {
    Keyboard.dismiss();
    const cleanDoc = document.trim();
    const cleanPhone = phone.trim();

    if (!cleanDoc) {
      return showAlert({
        title: 'Faltan datos',
        message: 'Ingresa tu número de identificación.',
        type: 'warning',
      });
    }

    if (!cleanPhone || cleanPhone.length < 7) {
      return showAlert({
        title: 'Faltan datos',
        message: 'Confirma el celular registrado en tu cuenta.',
        type: 'warning',
      });
    }

    if (newPasswordCust.length < 6) {
      return showAlert({
        title: 'Contraseña corta',
        message: 'La nueva contraseña debe tener mínimo 6 caracteres.',
        type: 'warning',
      });
    }

    if (newPasswordCust !== confirmPasswordCust) {
      return showAlert({
        title: 'No coinciden',
        message: 'La confirmación de la contraseña no coincide.',
        type: 'warning',
      });
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('reset_customer_password', {
        p_document_number: cleanDoc,
        p_phone: cleanPhone,
        p_new_password: newPasswordCust,
      });

      if (error) throw error;

      if (data && !data.success) {
        throw new Error(data.error || 'No fue posible restablecer la contraseña.');
      }

      showAlert({
        title: '¡Contraseña actualizada!',
        message: 'Ya puedes ingresar con tu documento y tu nueva contraseña.',
        type: 'success',
        buttons: [
          {
            text: 'Iniciar sesión',
            onPress: () => navigation.navigate('Login', { role: 'customer', document: cleanDoc }),
          },
        ],
      });
    } catch (err: any) {
      showAlert({
        title: 'No se pudo restablecer',
        message: err?.message || 'Verifica tus datos con tu tendero.',
        type: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <DynamicBrandCurves position="bottom-left" />

      {/* Botón Atrás flotante */}
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.backBtn, { top: Math.max(insets.top, 14) + 8 }]}>
        <Ionicons name="arrow-back" size={20} color={Colors.primary} />
      </Pressable>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: Math.max(insets.top, 14) + 28, paddingBottom: insets.bottom + 32, flexGrow: 1 },
        ]}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 48}
        extraHeight={Platform.OS === 'ios' ? 24 : 48}
        keyboardOpeningTime={0}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/NuevoLogo.png')}
            style={{ width: logoW, height: logoH }}
            resizeMode="contain"
          />
        </View>

        <View style={[styles.innerContent, isTablet && styles.innerContentTablet]}>
          {/* Selector de Rol con efecto Magnet */}
          <MagnetRoleSwitch
            role={role}
            onChange={newRole => {
              setRole(newRole);
              setStepStore('request');
            }}
          />

          {/* Tarjeta */}
          <Card style={styles.form}>
            <Text style={styles.formTitle}>¿Olvidaste tu contraseña?</Text>
            <Text style={styles.formSubtitle}>
              {role === 'store'
                ? stepStore === 'request'
                  ? 'Ingresa tu correo registrado y te enviaremos un código de seguridad.'
                  : `Ingresa el código enviado a ${email} y tu nueva contraseña.`
                : 'Ingresa tu documento y confirma tu celular para crear una nueva contraseña.'}
            </Text>

            {/* ─── TENDERO ─── */}
            {role === 'store' && (
              <>
                {stepStore === 'request' ? (
                  <>
                    <Input
                      label="Correo electrónico"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="tutienda@mail.com"
                    />
                    <Button
                      title={loading ? 'Enviando código…' : 'Enviar código de recuperación'}
                      onPress={handleSendStoreOtp}
                      disabled={loading}
                    />
                  </>
                ) : (
                  <>
                    <View style={styles.bannerInfo}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                      <Text style={styles.bannerInfoText}>Código enviado a {email}</Text>
                    </View>

                    <Input
                      label="Código de 6 dígitos"
                      value={otpCode}
                      onChangeText={text => setOtpCode(text.replace(/[^0-9]/g, '').slice(0, 8))}
                      keyboardType="number-pad"
                      placeholder="Ej: 123456"
                      maxLength={8}
                    />

                    <Input
                      label="Nueva contraseña"
                      value={newPasswordStore}
                      onChangeText={setNewPasswordStore}
                      secureTextEntry
                      placeholder="Mínimo 6 caracteres"
                    />

                    <Input
                      label="Confirmar nueva contraseña"
                      value={confirmPasswordStore}
                      onChangeText={setConfirmPasswordStore}
                      error={
                        confirmPasswordStore.length > 0 && confirmPasswordStore !== newPasswordStore
                          ? 'Las contraseñas no coinciden'
                          : undefined
                      }
                      secureTextEntry
                      placeholder="Repite la contraseña"
                    />

                    <Button
                      title={loading ? 'Restableciendo…' : 'Restablecer contraseña'}
                      onPress={handleVerifyStoreOtp}
                      disabled={loading}
                    />

                    <View style={styles.resendRow}>
                      <Pressable onPress={() => setStepStore('request')}>
                        <Text style={styles.subtleLink}>Cambiar correo</Text>
                      </Pressable>
                      <Pressable onPress={handleSendStoreOtp} disabled={loading}>
                        <Text style={styles.actionLink}>Reenviar código</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}

            {/* ─── CLIENTE ─── */}
            {role === 'customer' && (
              <>
                <Input
                  label="Número de documento"
                  value={document}
                  onChangeText={setDocument}
                  keyboardType="number-pad"
                  placeholder="Tu cédula"
                />

                <Input
                  label="Celular registrado"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="Ej: 3001234567"
                />

                <Input
                  label="Nueva contraseña"
                  value={newPasswordCust}
                  onChangeText={setNewPasswordCust}
                  secureTextEntry
                  placeholder="Mínimo 6 caracteres"
                />

                <Input
                  label="Confirmar nueva contraseña"
                  value={confirmPasswordCust}
                  onChangeText={setConfirmPasswordCust}
                  error={
                    confirmPasswordCust.length > 0 && confirmPasswordCust !== newPasswordCust
                      ? 'Las contraseñas no coinciden'
                      : undefined
                  }
                  secureTextEntry
                  placeholder="Repite la contraseña"
                />

                <Button
                  title={loading ? 'Restableciendo…' : 'Restablecer contraseña'}
                  onPress={handleResetCustomerPassword}
                  disabled={loading}
                />
              </>
            )}

            <View style={styles.loginRow}>
              <Text style={styles.loginHint}>¿Te acordaste de tu contraseña? </Text>
              <Pressable onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Inicia sesión</Text>
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Confianza */}
        <View style={styles.trustWrap}>
          <View style={styles.trust}>
            <View style={styles.trustItem}>
              <Ionicons name="shield-checkmark-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.trustText}>Tus datos siempre seguros</Text>
            </View>
            <View style={styles.trustItem}>
              <Ionicons name="cloud-offline-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.trustText}>Protección Tenderito</Text>
            </View>
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
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 3,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  innerContent: {
    width: '100%',
    maxWidth: 420,
    gap: 16,
  },
  innerContentTablet: {
    maxWidth: 480,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  form: {
    gap: 14,
    padding: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.border,
    elevation: 3,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: -4,
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#C3E0FF',
  },
  bannerInfoText: {
    fontSize: 12.5,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  subtleLink: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  actionLink: {
    fontSize: 12.5,
    color: Colors.primary,
    fontWeight: '700',
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 4,
  },
  loginHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  loginLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
  },
  trustWrap: {
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
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