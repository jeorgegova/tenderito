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
import { customerAuthEmail } from '../lib/customerAuth';
import { supabase } from '../lib/supabase';
import { findCustomerForActivation } from '../services/customerPortal';
import { Colors } from '../theme';

export function CustomerRegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function checkDocument() {
    if (!document.trim()) {
      return Alert.alert('Faltan datos', 'Ingresa tu cédula');
    }
    setLoading(true);
    try {
      const result = await findCustomerForActivation(document);
      if (!result) {
        return Alert.alert(
          'No te encontramos',
          'Pídele al tendero que te registre primero.',
        );
      }
      setCustomer(result);
    } catch (error: any) {
      Alert.alert('No se pudo consultar', error?.message ?? 'Intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }

  async function activate() {
    if (!customer || !phone.trim() || password.length < 6) {
      return Alert.alert(
        'Faltan datos',
        'Confirma tu teléfono y crea una contraseña de mínimo 6 caracteres.',
      );
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: customerAuthEmail(document),
      password,
      options: {
        data: { user_type: 'customer', customer_id: customer.customer_id, phone },
      },
    });
    setLoading(false);
    if (error || !data.user) {
      return Alert.alert(
        'No se pudo activar',
        error?.message ?? 'Intenta de nuevo',
      );
    }
    if (!data.session) {
      return Alert.alert(
        'Cuenta pendiente',
        'Desactiva la confirmación de correo en Supabase para activar inmediatamente.',
      );
    }
    await supabase.auth.signOut();
    Alert.alert('Cuenta activada', 'Ya puedes ingresar como cliente.', [
      { text: 'Ir al inicio', onPress: () => navigation.replace('Login') },
    ]);
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
          <Text style={styles.title}>Activar cuenta de cliente</Text>
          <Text style={styles.subtitle}>
            Usa la cédula con la que te registró el tendero para consultar tus fiados y abonos.
          </Text>

          <Input
            label="Número de identificación"
            value={document}
            onChangeText={setDocument}
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
                label="Confirma tu teléfono"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Ingresa tu celular"
              />

              <Input
                label="Crea tu contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!!phone.trim()}
                placeholder="Mínimo 6 caracteres"
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
            <Pressable onPress={() => navigation.replace('Login')}>
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
