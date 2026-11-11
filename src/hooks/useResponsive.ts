import { useWindowDimensions, ViewStyle } from 'react-native';

export interface ResponsiveInfo {
  /** Ancho de la ventana en dp */
  width: number;
  /** Alto de la ventana en dp */
  height: number;
  /** Dispositivo pequeño (iPhone SE 1ra gen, Android compactos: ancho < 360dp) */
  isSmall: boolean;
  /** Dispositivo compacto (iPhone SE 2da/3ra gen, Android estándar angostos: ancho < 380dp) */
  isCompact: boolean;
  /** Dispositivo mediano (iPhone 12/13/14/15, Pixel estándar: 380dp - 419dp) */
  isMedium: boolean;
  /** Dispositivo grande (iPhone Plus / Pro Max, Galaxy Ultra: 420dp - 767dp) */
  isLarge: boolean;
  /** Tablet o iPad (ancho >= 768dp) */
  isTablet: boolean;
  /** Ancho máximo recomendado para contenedores de tarjetas, listas y formularios (evita estiramiento excesivo en tablets) */
  maxContentWidth: number;
  /** Escala suave de tamaño para fuentes y espaciados según el dispositivo */
  scale: (size: number, factor?: number) => number;
  /** Factor de padding horizontal recomendado para el dispositivo */
  horizontalPadding: number;
  /** Estilo para centrar y limitar ancho de tarjetas, formularios o listas en tablets */
  tabletContainerStyle: (customMaxWidth?: number) => ViewStyle | null;
}

/**
 * Hook centralizado de diseño responsive para Tenderito.
 * Permite adaptar la interfaz inteligentemente a pantallas pequeñas (320-360dp),
 * estándar (375-390dp), grandes (430dp) y tablets (768dp+).
 */
export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const isSmall = width < 360;
  const isCompact = width < 380;
  const isMedium = width >= 380 && width < 420;
  const isLarge = width >= 420 && width < 768;
  const isTablet = width >= 768;

  // En tablets, limitamos el ancho de contenido principal a 680dp para no deformar la interfaz
  const maxContentWidth = isTablet ? 680 : width;

  // Escala suave: en pantallas chicas reduce máx un 10-15%, en tablets aumenta un 8-10%
  const scale = (size: number, factor: number = 0.5): number => {
    if (isSmall) {
      return Math.round(size - (size * 0.12 * factor));
    }
    if (isTablet) {
      return Math.round(size + (size * 0.1 * factor));
    }
    return size;
  };

  const horizontalPadding = isSmall ? 12 : isCompact ? 16 : isTablet ? 28 : 20;

  const tabletContainerStyleFn = (customMaxWidth?: number): ViewStyle | null => {
    if (!isTablet) {
      return null;
    }
    return {
      maxWidth: customMaxWidth ?? 680,
      width: '100%',
      alignSelf: 'center',
    };
  };

  return {
    width,
    height,
    isSmall,
    isCompact,
    isMedium,
    isLarge,
    isTablet,
    maxContentWidth,
    scale,
    horizontalPadding,
    tabletContainerStyle: tabletContainerStyleFn,
  };
}

/**
 * Estilo reutilizable para centrar y limitar ancho en tablets
 */
export const tabletContainerStyle = (width: number, customMaxWidth?: number): ViewStyle | null => {
  if (width >= 768) {
    return {
      maxWidth: customMaxWidth ?? 680,
      width: '100%',
      alignSelf: 'center',
    };
  }
  return null;
};
