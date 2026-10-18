import {createNavigationContainerRef} from '@react-navigation/native';

/**
 * Referencia global al contenedor de navegación.
 * Permite navegar (por ejemplo, desde el botón físico "Atrás") sin
 * depender del hook `useNavigation`, que solo funciona dentro de una pantalla.
 */
export const navigationRef = createNavigationContainerRef<any>();

/** Pestañas principales del negocio (dentro del Stack.Screen "Main"). */
export const TAB_ROUTES = ['Inicio', 'Clientes', 'Estadísticas', 'Perfil'];

/** Indica si el nombre de ruta corresponde a una pestaña principal. */
export function isTabRoute(name?: string): boolean {
  return !!name && TAB_ROUTES.includes(name);
}

/** Lleva al usuario a la pestaña de Inicio. */
export function goToHome(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', {screen: 'Inicio'});
  }
}
