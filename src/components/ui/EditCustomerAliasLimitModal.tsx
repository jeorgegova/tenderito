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
import { updateCustomerAliasAndLimit } from '../../services/customers';

export interface EditCustomerAliasLimitModalProps {
  visible: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  initialAlias?: string | null;
  initialCreditLimit: number;
  onSaved: () => void;
}

export function EditCustomerAliasLimitModal({
  visible,
  onClose,
  customerId,
  customerName,
  initialAlias,
  initialCreditLimit,
  onSaved,
}: EditCustomerAliasLimitModalProps) {
  const [alias, setAlias] = useState(initialAlias || '');
  const [creditLimit, setCreditLimit] = useState(
    initialCreditLimit > 0 ? String(initialCreditLimit) : '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setAlias(initialAlias || '');
      setCreditLimit(initialCreditLimit > 0 ? String(initialCreditLimit) : '');
      setError(null);
      setLoading(false);
    }
  }, [visible, initialAlias, initialCreditLimit]);

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
    setLoading(true);
    setError(null);

    const cleanLimit = creditLimit
      ? Number(creditLimit.replace(/[^0-9]/g, ''))
      : 0;
    const cleanAlias = alias.trim() ? alias.trim() : null;

    const res = await updateCustomerAliasAndLimit(customerId, cleanAlias, cleanLimit);
    setLoading(false);

    if (res.success) {
      showAlert({
        title: 'Datos actualizados',
        message: 'El alias y el tope de crédito se han guardado exitosamente.',
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
                  <Ionicons name="pencil" size={18} color={Colors.primary} />
                </View>
                <View style={styles.headerTexts}>
                  <Text style={styles.title}>Editar cliente en tu tienda</Text>
                  <Text style={styles.subtitle}>{customerName}</Text>
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

              <View>
                <Input
                  label="Alias / Apodo en tu tienda"
                  value={alias}
                  onChangeText={setAlias}
                  placeholder="Ej: Don Pedro, Vecina Clara"
                  editable={!loading}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                    }, 120);
                  }}
                />
                <Text style={styles.fieldHelp}>
                  Nombre personalizado con el que identificas a este cliente en tu tienda.
                </Text>
              </View>

              <View>
                <Input
                  label="Tope de crédito permitido ($ COP)"
                  value={
                    creditLimit
                      ? `$ ${Number(creditLimit.replace(/[^0-9]/g, '')).toLocaleString('es-CO')}`
                      : ''
                  }
                  onChangeText={t => {
                    const raw = t.replace(/[^0-9]/g, '');
                    setCreditLimit(raw);
                  }}
                  keyboardType="numeric"
                  placeholder="$ 0 (sin tope máximo)"
                  editable={!loading}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 150);
                  }}
                />
                <Text style={styles.fieldHelp}>
                  Monto máximo permitido en compras fiadas simultáneas (deja en 0 para ilimitado).
                </Text>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.infoText}>
                  El nombre legal y número telefónico son datos personales administrados exclusivamente por el cliente desde su propia cuenta.
                </Text>
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
  fieldHelp: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
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
