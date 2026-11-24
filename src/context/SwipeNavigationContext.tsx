import React, { createContext, useContext, useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { ScrollView } from 'react-native';

interface SwipeNavigationContextType {
  isSwipeEnabled: boolean;
  setSwipeEnabled: (enabled: boolean) => void;
  registerPagerRef: (ref: ScrollView | null) => void;
  /** Propiedades para asignar a ScrollViews o contenedores horizontales internos */
  innerScrollProps: {
    onTouchStart: () => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onScrollBeginDrag: () => void;
    onScrollEndDrag: () => void;
    onMomentumScrollEnd: () => void;
  };
}

const SwipeNavigationContext = createContext<SwipeNavigationContextType>({
  isSwipeEnabled: true,
  setSwipeEnabled: () => {},
  registerPagerRef: () => {},
  innerScrollProps: {
    onTouchStart: () => {},
    onTouchEnd: () => {},
    onTouchCancel: () => {},
    onScrollBeginDrag: () => {},
    onScrollEndDrag: () => {},
    onMomentumScrollEnd: () => {},
  },
});

export function SwipeNavigationProvider({ children }: { children: React.ReactNode }) {
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(true);
  const pagerRef = useRef<ScrollView | null>(null);
  const unlockTimerRef = useRef<NodeJS.Timeout | null>(null);

  const registerPagerRef = useCallback((ref: ScrollView | null) => {
    pagerRef.current = ref;
  }, []);

  const setSwipeEnabled = useCallback((enabled: boolean) => {
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }

    if (!enabled) {
      // 1. Bloqueo nativo instantáneo y síncrono (sin esperar el ciclo de render de React)
      pagerRef.current?.setNativeProps({ scrollEnabled: false });
      setIsSwipeEnabled(false);
    } else {
      // 2. Reactivación con un breve margen de seguridad (120ms) para proteger
      // la inercia del scrollview interno y evitar falsos toques o deslices cruzados
      unlockTimerRef.current = setTimeout(() => {
        pagerRef.current?.setNativeProps({ scrollEnabled: true });
        setIsSwipeEnabled(true);
        unlockTimerRef.current = null;
      }, 120);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  const innerScrollProps = useMemo(
    () => ({
      onTouchStart: () => setSwipeEnabled(false),
      onTouchEnd: () => setSwipeEnabled(true),
      onTouchCancel: () => setSwipeEnabled(true),
      onScrollBeginDrag: () => setSwipeEnabled(false),
      onScrollEndDrag: () => setSwipeEnabled(true),
      onMomentumScrollEnd: () => setSwipeEnabled(true),
    }),
    [setSwipeEnabled],
  );

  return (
    <SwipeNavigationContext.Provider
      value={{
        isSwipeEnabled,
        setSwipeEnabled,
        registerPagerRef,
        innerScrollProps,
      }}>
      {children}
    </SwipeNavigationContext.Provider>
  );
}

export function useSwipeNavigation() {
  return useContext(SwipeNavigationContext);
}
