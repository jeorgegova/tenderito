import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useQuery} from '@tanstack/react-query';
import Ionicons from '@react-native-vector-icons/ionicons';
import {useStore} from '../../store/useStore';
import {fetchProfile} from '../../services/profile';
import {Colors} from '../../theme';
import {useResponsive} from '../../hooks/useResponsive';
import {useSync} from '../../hooks/useSync';
import {confirmLogout} from '../../lib/session';

export function Header({
  title,
  subtitle,
  showCurve = false,
  curveVariant = 'default',
  rightElement,
  sessionName,
  sessionRole,
  showSyncButton = true,
}: {
  title: string;
  subtitle?: string;
  showCurve?: boolean;
  curveVariant?: 'default' | 'profile';
  rightElement?: React.ReactNode;
  sessionName?: string;
  sessionRole?: string;
  showSyncButton?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const {isSmall, isTablet, maxContentWidth} = useResponsive();
  const [menuVisible, setMenuVisible] = useState(false);
  const storeProfile = useStore(s => s.profile);
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });
  const profile = profileQuery.data ?? storeProfile;
  const activeName = sessionName || profile?.merchant_name || 'Tendero';
  const activeRole = sessionRole || (profile ? 'Tendero' : '');
  const {sync, isSyncing, isOnline} = useSync();

  const handleGoToProfile = () => {
    setMenuVisible(false);
    try {
      navigation.navigate('Perfil');
    } catch {
      navigation.navigate('Main', { screen: 'Perfil' });
    }
  };

  const handleLogout = () => {
    setMenuVisible(false);
    confirmLogout();
  };

  const spinAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isSyncing) {
      spinAnim.setValue(0);
      anim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      anim.start();
    } else {
      spinAnim.setValue(0);
    }
    return () => {
      anim?.stop();
    };
  }, [isSyncing, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleManualSync = () => {
    if (isSyncing) return;
    sync({force: true}).catch(err =>
      console.warn('[Header] Error en sincronización manual:', err),
    );
  };

  return (
    <>
      <View
        style={[
          styles.wrap,
          {
            paddingTop: Math.max(insets.top, 14) + (isSmall ? 4 : 8),
            paddingHorizontal: isSmall ? 16 : isTablet ? 28 : 20,
            maxWidth: maxContentWidth,
            width: '100%',
            alignSelf: 'center',
          },
        ]}>
        {/* Formas curvas decorativas de la marca en la esquina superior derecha */}
        {showCurve && (
          curveVariant === 'profile' ? (
            <View pointerEvents="none" style={styles.waveProfileContainer}>
              <View style={styles.waveProfileOuterSec} />
              <View style={styles.waveProfileOuterMain} />
              <View style={styles.waveProfileInnerSec} />
              <View style={styles.waveProfileInnerMain} />
              <View style={styles.waveProfileDropPeach} />
              <View style={styles.waveProfileDropOrange} />
            </View>
          ) : (
            <View pointerEvents="none" style={styles.curveContainer}>
              <View style={styles.curveOuter} />
              <View style={styles.curveInner} />
            </View>
          )
        )}

        <View style={styles.contentRow}>
          <View style={styles.textCol}>
            {/* Marca Tenderito */}
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.eyebrow}>TENDERITO</Text>
            </View>
            <Text
              style={[
                styles.title,
                isTablet && styles.titleTablet,
                isSmall && styles.titleSmall,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail">
              {title}
            </Text>
          </View>
          <View style={styles.rightGroup}>
            {showSyncButton && (
              <TouchableOpacity
                onPress={handleManualSync}
                disabled={isSyncing}
                activeOpacity={0.7}
                style={[
                  styles.syncBtn,
                  isSyncing && styles.syncBtnActive,
                ]}>
                <Animated.View style={{transform: [{rotate: spin}]}}>
                  <Ionicons
                    name="sync-outline"
                    size={16}
                    color={
                      isSyncing
                        ? Colors.primary
                        : isOnline
                        ? Colors.textSecondary
                        : Colors.textMuted
                    }
                  />
                </Animated.View>
              </TouchableOpacity>
            )}

            {rightElement ? (
              <View style={styles.rightWrap}>{rightElement}</View>
            ) : activeName ? (
              <TouchableOpacity
                style={[
                  styles.sessionBadge,
                  isSmall && styles.sessionBadgeSmall,
                  isTablet && styles.sessionBadgeTablet,
                  menuVisible && styles.sessionBadgeActive,
                ]}
                onPress={() => setMenuVisible(prev => !prev)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`Usuario ${activeName}. Tocar para abrir menú de perfil`}>
                <View style={styles.sessionAvatar}>
                  <Ionicons name="person-outline" size={13} color={Colors.primary} />
                </View>
                <View style={styles.sessionCol}>
                  {activeRole ? (
                    <Text style={styles.sessionRole}>{activeRole}</Text>
                  ) : null}
                  <Text style={styles.sessionName} numberOfLines={1}>
                    {activeName}
                  </Text>
                </View>
                <Ionicons
                  name={menuVisible ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  color={Colors.textMuted}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {subtitle ? (
          <Text
            style={[styles.subtitle, isSmall && styles.subtitleSmall]}
            numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Menú flotante al dar clic en el nombre de usuario (desacoplado del contenedor elevado para garantizar apertura fluida) */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMenuVisible(false)}>
          <Pressable
            style={[
              styles.menuPopover,
              {
                top: Math.max(insets.top, 14) + (isSmall ? 48 : 56),
                right: isSmall ? 16 : isTablet ? 28 : 20,
              },
            ]}
            onPress={e => e.stopPropagation()}>
            {/* Encabezado del menú */}
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatarLarge}>
                <Ionicons name="person" size={15} color={Colors.primary} />
              </View>
              <View style={styles.menuHeaderCol}>
                <Text
                  style={styles.menuNameText}
                  numberOfLines={2}
                  ellipsizeMode="tail">
                  {activeName}
                </Text>
                <Text
                  style={styles.menuRoleText}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {activeRole || 'Sesión activa'}
                </Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Opción 1: Perfil */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleGoToProfile}
              activeOpacity={0.7}>
              <View style={[styles.menuItemIcon, { backgroundColor: Colors.primaryLight }]}>
                <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.menuItemText}>Perfil</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Opción 2: Cerrar sesión */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
              activeOpacity={0.7}>
              <View style={[styles.menuItemIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={18} color={Colors.destructive} />
              </View>
              <Text style={[styles.menuItemText, { color: Colors.destructive }]}>
                Cerrar sesión
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    position: 'relative',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  curveContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 220,
    height: 140,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  waveProfileContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 250,
    height: 155,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  waveProfileOuterSec: {
    position: 'absolute',
    top: -20,
    right: 90,
    width: 95,
    height: 95,
    borderRadius: 48,
    backgroundColor: '#FFE4D0',
    transform: [{rotate: '8deg'}],
  },
  waveProfileOuterMain: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 220,
    height: 145,
    borderBottomLeftRadius: 135,
    borderBottomRightRadius: 60,
    borderTopLeftRadius: 50,
    backgroundColor: '#FFE4D0',
    transform: [{rotate: '-12deg'}],
  },
  waveProfileInnerSec: {
    position: 'absolute',
    top: -28,
    right: 95,
    width: 75,
    height: 75,
    borderRadius: 38,
    backgroundColor: Colors.primary,
    transform: [{rotate: '6deg'}],
  },
  waveProfileInnerMain: {
    position: 'absolute',
    top: -50,
    right: -25,
    width: 185,
    height: 125,
    borderBottomLeftRadius: 115,
    borderBottomRightRadius: 50,
    borderTopLeftRadius: 40,
    backgroundColor: Colors.primary,
    transform: [{rotate: '-10deg'}],
  },
  waveProfileDropPeach: {
    position: 'absolute',
    top: 108,
    right: 155,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFE4D0',
    opacity: 0.9,
  },
  waveProfileDropOrange: {
    position: 'absolute',
    top: 124,
    right: 130,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    opacity: 0.85,
  },
  curveOuter: {
    position: 'absolute',
    top: -45,
    right: -25,
    width: 210,
    height: 155,
    borderBottomLeftRadius: 110,
    borderTopLeftRadius: 40,
    backgroundColor: '#FFE4D0',
    transform: [{rotate: '-8deg'}],
  },
  curveInner: {
    position: 'absolute',
    top: -55,
    right: -30,
    width: 175,
    height: 130,
    borderBottomLeftRadius: 95,
    borderTopLeftRadius: 30,
    backgroundColor: Colors.primary,
    transform: [{rotate: '-6deg'}],
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  rightWrap: {
    marginLeft: 12,
    alignSelf: 'center',
    flexShrink: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: Colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.6,
    lineHeight: 29,
  },
  titleTablet: {
    fontSize: 30,
    lineHeight: 36,
  },
  titleSmall: {
    fontSize: 20,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: -0.1,
    zIndex: 1,
  },
  subtitleSmall: {
    fontSize: 12,
    marginTop: 3,
  },
  rightGroup: {
    marginLeft: 8,
    alignSelf: 'flex-start',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  syncBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  sessionBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 20,
    maxWidth: 135,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sessionBadgeSmall: {
    maxWidth: 110,
    paddingHorizontal: 6,
  },
  sessionBadgeTablet: {
    maxWidth: 180,
    paddingHorizontal: 10,
  },
  sessionBadgeActive: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFBF8',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  menuPopover: {
    position: 'absolute',
    width: 235,
    maxWidth: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  menuAvatarLarge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuHeaderCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  menuNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 16,
    flexShrink: 1,
  },
  menuRoleText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: 13,
    marginTop: 2,
    flexShrink: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  sessionAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  sessionCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  sessionRole: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.primary,
    lineHeight: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionName: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 13,
    marginTop: 1,
  },
});

