import React, { useState, useEffect, useRef } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Pressable,
  View,
  Platform,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors, Radius } from '../../theme';
import { Input } from './Input';
import { Button } from './Button';
import { showAlert } from './AlertModal';
import { updateStoreProfile } from '../../services/profile';

export interface EditStoreModalProps {
  visible: boolean;
  onClose: () => void;
  initialStoreName: string;
  initialPhone?: string | null;
  initialMerchantName?: string | null;
  initialAddress?: string | null;
  onSaved: () => void;
}

export function EditStoreModal({
  visible,
  onClose,
  initialStoreName,
  initialPhone,
  initialMerchantName,
  initialAddress,
  onSaved,
}: EditStoreModalProps) {
  const [storeName, setStoreName] = useState(initialStoreName || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [merchantName, setMerchantName] = useState(initialMerchantName || '');
  const [address, setAddress] = useState(initialAddress || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setStoreName(initialStoreName || '');
      setPhone(initialPhone || '');
      setMerchantName(initialMerchantName || '');
      setAddress(initialAddress || '');
      setError(null);
      setLoading(false);
    }
  }, [visible, initialStoreName, initialPhone, initialMerchantName, initialAddress]);

  // Listener para elevar y adaptar la vista cuando el teclado se abre en móvil
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        setKeyboardHeight(e.endCoordinates.height);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSave = async () => {
    const cleanStoreName = storeName.trim();
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');

    if (!cleanStoreName) {
      setError('El nombre de la tienda es requerido');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 7) {
      setError('Ingresa un teléfono válido (mínimo 7 dígitos)');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await updateStoreProfile({
      store_name: cleanStoreName,
      phone: cleanPhone,
      merchant_name: merchantName.trim() || null,
      address: address.trim() || null,
    });

    setLoading(false);

    if (res.success) {
      showAlert({
        title: 'Tienda actualizada',
        message: 'Los datos de tu tienda se guardaron correctamente.',
        type: 'success',
      });
      onSaved();
      onClose();
    } else {
      setError(res.error || 'No se pudieron guardar los cambios');
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          keyboardHeight > 0 && {
            justifyContent: 'flex-start',
            paddingTop: Platform.OS === 'ios' ? 44 : 20,
            paddingBottom: keyboardHeight + 12,
          },
        ]}>
        {/* Backdrop para cerrar al tocar afuera */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.cardContainer}>
          <View style={styles.card}>
            {/* Header (Fijo) */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="storefront-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.headerTexts}>
                  <Text style={styles.title}>Datos de tu tienda</Text>
                  <Text style={styles.subtitle}>Actualiza el nombre y contacto</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} disabled={loading} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Body desplazable que ajusta su contenido sin tapar campos */}
            <ScrollView
              ref={scrollViewRef}
              bounces={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              style={styles.scrollArea}
              contentContainerStyle={styles.body}>
              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Input
                label="Nombre de la tienda *"
                value={storeName}
                onChangeText={t => {
                  setStoreName(t);
                  if (error) setError(null);
                }}
                placeholder="Ej: Tienda Villa Mercedes"
                editable={!loading}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  }, 120);
                }}
              />

              <Input
                label="Teléfono de contacto *"
                value={phone}
                onChangeText={t => {
                  setPhone(t.replace(/[^0-9]/g, ''));
                  if (error) setError(null);
                }}
                keyboardType="phone-pad"
                placeholder="Ej: 310 123 4567"
                editable={!loading}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 60, animated: true });
                  }, 120);
                }}
              />

              <Input
                label="Tu nombre (Tendero)"
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="Ej: Jorge González"
                editable={!loading}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 140, animated: true });
                  }, 120);
                }}
              />

              <Input
                label="Dirección del local (opcional)"
                value={address}
                onChangeText={setAddress}
                placeholder="Ej: Carrera 15 # 45-20"
                editable={!loading}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
              />
            </ScrollView>

            {/* Botones de acción siempre visibles al pie del modal */}
            <View style={styles.footer}>
              <View style={styles.btnCol}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  disabled={loading}
                  onPress={onClose}
                />
              </View>
              <View style={styles.btnCol}>
                <Button
                  title={loading ? 'Guardando…' : 'Guardar'}
                  disabled={loading}
                  onPress={handleSave}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '100%',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxHeight: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 9,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scrollArea: {
    flexShrink: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 13,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: Radius.md,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  btnCol: {
    flex: 1,
  },
});
