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
import { updateCustomerProfile } from '../../services/customerPortal';

export interface EditCustomerSelfModalProps {
  visible: boolean;
  onClose: () => void;
  initialName: string;
  initialPhone?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  onSaved: () => void;
}

export function EditCustomerSelfModal({
  visible,
  onClose,
  initialName,
  initialPhone,
  documentType,
  documentNumber,
  onSaved,
}: EditCustomerSelfModalProps) {
  const [name, setName] = useState(initialName || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName || '');
      setPhone(initialPhone || '');
      setError(null);
      setLoading(false);
    }
  }, [visible, initialName, initialPhone]);

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
    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');

    if (!cleanName) {
      setError('Tu nombre completo es requerido');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 7) {
      setError('Ingresa un número telefónico válido (mínimo 7 dígitos)');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await updateCustomerProfile({
      name: cleanName,
      phone: cleanPhone,
    });

    setLoading(false);

    if (res.success) {
      showAlert({
        title: 'Datos actualizados',
        message: 'Tus datos personales se han actualizado correctamente.',
        type: 'success',
      });
      onSaved();
      onClose();
    } else {
      setError(res.error || 'No se pudieron actualizar los datos');
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
                  <Ionicons name="person-outline" size={20} color="#059669" />
                </View>
                <View style={styles.headerTexts}>
                  <Text style={styles.title}>Mis datos personales</Text>
                  <Text style={styles.subtitle}>Actualiza tu nombre y número</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} disabled={loading} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Body desplazable */}
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
                label="Tu nombre completo *"
                value={name}
                onChangeText={t => {
                  setName(t);
                  if (error) setError(null);
                }}
                placeholder="Ej: Juan Camilo Pérez"
                editable={!loading}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  }, 120);
                }}
              />

              <Input
                label="Tu número telefónico / celular *"
                value={phone}
                onChangeText={t => {
                  setPhone(t.replace(/[^0-9]/g, ''));
                  if (error) setError(null);
                }}
                keyboardType="phone-pad"
                placeholder="Ej: 300 123 4567"
                editable={!loading}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 80, animated: true });
                  }, 120);
                }}
              />

              <View>
                <Input
                  label="Número de documento"
                  value={`${documentType || 'CC'} ${documentNumber || ''}`}
                  editable={false}
                  style={{ backgroundColor: '#F8FAFC', color: Colors.textSecondary }}
                />
                <View style={styles.docHelpRow}>
                  <Ionicons name="shield-checkmark-outline" size={13} color="#059669" />
                  <Text style={styles.docHelpText}>
                    Tu documento es tu identificación única y no puede ser alterado.
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Botones de acción siempre fijos al pie del modal sin necesidad de scroll */}
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
    maxWidth: 440,
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
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    backgroundColor: '#ECFDF5',
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
    marginTop: 1,
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
    gap: 14,
  },
  docHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  docHelpText: {
    fontSize: 11,
    color: Colors.textMuted,
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
