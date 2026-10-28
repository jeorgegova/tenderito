import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { Colors } from '../theme';

export function RegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [storeName, setStoreName] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    if (!storeName || !merchantName || !email || !password) {
      return Alert.alert('Faltan datos', 'Completa todos los campos');
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          store_name: storeName,
          merchant_name: merchantName,
          subscription_plan: 'free',
        },
      },
    });
    if (error || !data.user) {
      setLoading(false);
      return Alert.alert('Error', error?.message ?? 'No se pudo registrar');
    }
    setLoading(false);

    if (!data.session) {
      return Alert.alert(
        'Revisa tu correo',
        'Te enviamos un correo de comprobación. Valida tu cuenta para poder iniciar sesión.',
        [
          {
            text: 'Ir al inicio de sesión',
            onPress: () => navigation.replace('Login'),
          },
        ],
      );
    }

    Alert.alert('Cuenta creada', 'Tu cuenta ya está lista para usar.');
  }

  return (
    <View style={styles.container}>
      {/* ── Curvas abstractas dinámicas de la app ── */}
      <DynamicBrandCurves />

      {/* ── Botón superior de retroceso ── */}
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.backBtn, { top: insets.top + 8 }]}
        hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* ── Logo nuevo ── */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/NuevoLogo.png')}
            style={styles.logoImage}
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
            placeholder="Ej: Tienda La Esquina"
          />
          <Input
            label="Tu nombre"
            value={merchantName}
            onChangeText={setMerchantName}
            placeholder="Ej: Doña María"
          />
          <Input
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tutienda@mail.com"
          />
          <Input
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
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
  backBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
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
    justifyContent: 'center',
    gap: 14,
    marginTop: 8,
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
