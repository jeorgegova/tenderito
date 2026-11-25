import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../theme';
import { Button } from './ui/Button';
import { StatusDatePickerModal } from './ui/StatusDatePickerModal';
import { getBogotaTodayYMD } from '../utils/format';
import { createStoreStatus, StoreStatus } from '../services/storeStatuses';

interface CreateStoreStatusModalProps {
  visible: boolean;
  onClose: () => void;
  storeId: string;
  storeName?: string;
  currentActiveCount: number;
  onCreated: (status: StoreStatus) => void;
}

export function CreateStoreStatusModal({
  visible,
  onClose,
  storeId,
  storeName,
  currentActiveCount,
  onCreated,
}: CreateStoreStatusModalProps) {
  const todayYMD = useMemo(() => getBogotaTodayYMD(), []);

  const addDaysToYMD = (ymd: string, days: number): string => {
    try {
      const [y, m, d] = ymd.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    } catch (_e) {
      return ymd;
    }
  };

  const [caption, setCaption] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<{
    uri: string;
    type?: string;
    fileName?: string;
    fileSize?: number;
  } | null>(null);
  const [startDateYMD, setStartDateYMD] = useState<string>(todayYMD);
  const [endDateYMD, setEndDateYMD] = useState<string>(addDaysToYMD(todayYMD, 7));
  const [activePreset, setActivePreset] = useState<'1d' | '1w' | '2w' | 'custom'>('1w');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null);

  // Resetear todo al abrir para salir como nuevo
  useEffect(() => {
    if (visible) {
      setCaption('');
      setSelectedPhoto(null);
      setStartDateYMD(todayYMD);
      setEndDateYMD(addDaysToYMD(todayYMD, 7));
      setActivePreset('1w');
      setIsSubmitting(false);
      setErrorMessage(null);
      setPickerMode(null);
    }
  }, [visible, todayYMD]);

  if (!visible) return null;

  const isLimitReached = currentActiveCount >= 3;

  const handlePickImage = async () => {
    try {
      // Compresión nativa en hardware móvil: reescala a máx 1080x1920 y calidad JPEG 70%
      const result = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1080,
        maxHeight: 1920,
        quality: 0.7,
        selectionLimit: 1,
      });

      if (result.didCancel) return;
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        return;
      }

      const asset = result.assets?.[0];
      if (asset?.uri) {
        setErrorMessage(null);
        setSelectedPhoto({
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          fileName: asset.fileName || 'estado.jpg',
          fileSize: asset.fileSize,
        });
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error seleccionando la imagen.');
    }
  };

  const handleApplyPreset = (preset: '1d' | '1w' | '2w') => {
    setActivePreset(preset);
    const start = startDateYMD || todayYMD;
    if (preset === '1d') {
      setEndDateYMD(addDaysToYMD(start, 1));
    } else if (preset === '1w') {
      setEndDateYMD(addDaysToYMD(start, 7));
    } else if (preset === '2w') {
      setEndDateYMD(addDaysToYMD(start, 14));
    }
  };

  const formatDateDisplay = (ymd: string) => {
    try {
      const [y, m, d] = ymd.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
      });
    } catch (_e) {
      return ymd;
    }
  };

  const handleSubmit = async () => {
    if (isLimitReached) {
      setErrorMessage('Tu tienda ya cuenta con 3 estados activos. Debes eliminar uno antes de crear otro.');
      return;
    }

    const trimmedCaption = caption.trim();
    if (!trimmedCaption) {
      setErrorMessage('Ingresa una descripción para la publicidad.');
      return;
    }

    if (trimmedCaption.length > 120) {
      setErrorMessage('La descripción no puede exceder 120 caracteres.');
      return;
    }

    if (!startDateYMD) {
      setErrorMessage('Debes seleccionar la fecha de inicio.');
      return;
    }

    if (!endDateYMD) {
      setErrorMessage('Debes seleccionar la fecha de fin de la publicidad.');
      return;
    }

    if (endDateYMD < startDateYMD) {
      setErrorMessage('La fecha de fin debe ser posterior a la fecha de inicio.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const startsAtIso =
      startDateYMD === todayYMD
        ? new Date().toISOString()
        : new Date(`${startDateYMD}T00:00:00-05:00`).toISOString();

    const expiresAtIso = new Date(`${endDateYMD}T23:59:59-05:00`).toISOString();

    const res = await createStoreStatus({
      storeId,
      file: selectedPhoto,
      caption: trimmedCaption,
      startsAt: startsAtIso,
      expiresAt: expiresAtIso,
    });

    setIsSubmitting(false);

    if (res.success && res.data) {
      onCreated(res.data);
      onClose();
    } else {
      setErrorMessage(res.error || 'No fue posible crear el estado.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="megaphone-outline" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>Nuevo estado publicitario</Text>
                <Text style={styles.subtitle}>
                  {storeName ? `Para ${storeName}` : 'Publicidad en tu tienda'} · {currentActiveCount}/3 activos
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* 1. Imagen (Opcional) */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>IMAGEN O FOTO (OPCIONAL)</Text>

              {selectedPhoto ? (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: selectedPhoto.uri }} style={styles.previewImage} resizeMode="contain" />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => setSelectedPhoto(null)}>
                    <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                    <Text style={styles.removeImageText}>Cambiar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadBox} onPress={handlePickImage}>
                  <Ionicons name="image-outline" size={22} color={Colors.primary} />
                  <Text style={styles.uploadText}>Subir imagen</Text>
                  <Text style={styles.uploadSubtext}>(JPG, PNG hasta 5MB)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 2. Descripción */}
            <View style={styles.fieldSection}>
              <View style={styles.captionHeader}>
                <Text style={styles.fieldLabel}>DESCRIPCIÓN *</Text>
                <Text
                  style={[
                    styles.counterText,
                    caption.length > 120 && styles.counterError,
                  ]}>
                  {caption.length}/120
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textArea,
                  caption.length > 120 && styles.textAreaError,
                ]}
                multiline
                numberOfLines={2}
                maxLength={120}
                value={caption}
                onChangeText={setCaption}
                placeholder="Ej: Huevos en rebaja, cubeta a $15.000"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* 3. Vigencia (Fila única compacta) */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>VIGENCIA DE LA PUBLICIDAD *</Text>

              {/* Presets rápidos */}
              <View style={styles.presetsRow}>
                {[
                  { key: '1d', label: '1 día' },
                  { key: '1w', label: '1 semana' },
                  { key: '2w', label: '2 semanas' },
                ].map(preset => {
                  const isSelected = activePreset === preset.key;
                  return (
                    <TouchableOpacity
                      key={preset.key}
                      onPress={() => handleApplyPreset(preset.key as any)}
                      style={[
                        styles.presetChip,
                        isSelected && styles.presetChipActive,
                      ]}>
                      <Text
                        style={[
                          styles.presetChipText,
                          isSelected && styles.presetChipTextActive,
                        ]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Fila de fechas ajustada */}
              <View style={styles.singleLineDateRow}>
                <TouchableOpacity
                  style={styles.datePill}
                  onPress={() => setPickerMode('start')}>
                  <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
                  <Text style={styles.datePillText}>
                    Desde: {formatDateDisplay(startDateYMD)}
                  </Text>
                </TouchableOpacity>

                <Ionicons name="arrow-forward" size={14} color="#94A3B8" />

                <TouchableOpacity
                  style={styles.datePill}
                  onPress={() => setPickerMode('end')}>
                  <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
                  <Text style={styles.datePillText}>
                    Hasta: {formatDateDisplay(endDateYMD)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              title="Cancelar"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={onClose}
              disabled={isSubmitting}
            />
            <Button
              title={isSubmitting ? 'Publicando…' : 'Publicar publicidad'}
              variant="primary"
              style={{ flex: 2 }}
              onPress={handleSubmit}
              disabled={isSubmitting || isLimitReached || !caption.trim()}
            />
          </View>
        </Pressable>
      </Pressable>

      {/* Selector de fecha limpio y exclusivo */}
      {pickerMode ? (
        <StatusDatePickerModal
          visible={Boolean(pickerMode)}
          onClose={() => setPickerMode(null)}
          title={pickerMode === 'start' ? 'Fecha de inicio' : 'Fecha de finalización'}
          valueYMD={pickerMode === 'start' ? startDateYMD : endDateYMD}
          minYMD={pickerMode === 'end' ? startDateYMD : todayYMD}
          onChangeYMD={val => {
            if (pickerMode === 'start') {
              setStartDateYMD(val);
              setActivePreset('custom');
              if (endDateYMD < val) {
                setEndDateYMD(val);
              }
            } else {
              setEndDateYMD(val);
              setActivePreset('custom');
            }
          }}
        />
      ) : null}
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
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 18,
    gap: 14,
  },
  errorBox: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: Colors.destructive,
    fontSize: 12.5,
    fontWeight: '600',
  },
  fieldSection: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  previewContainer: {
    position: 'relative',
    width: 220,
    height: 280,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  removeImageText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  uploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  uploadSubtext: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  captionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  counterError: {
    color: Colors.destructive,
  },
  textArea: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
    backgroundColor: '#FFFFFF',
    minHeight: 50,
    textAlignVertical: 'top',
  },
  textAreaError: {
    borderColor: Colors.destructive,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  presetChipTextActive: {
    color: Colors.primaryDark,
    fontWeight: '800',
  },
  singleLineDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FAFAFA',
  },
});
