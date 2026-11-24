import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import {
  createNavigatorFactory,
  DefaultNavigatorOptions,
  ParamListBase,
  TabActionHelpers,
  TabNavigationState,
  TabRouter,
  TabRouterOptions,
  useNavigationBuilder,
} from '@react-navigation/native';
import { Screen } from '@react-navigation/elements';
import { MagnetTabBar } from '../components/ui/MagnetTabBar';
import { useSwipeNavigation } from '../context/SwipeNavigationContext';
import { Colors } from '../theme';

interface SwipeableTabViewProps {
  state: TabNavigationState<ParamListBase>;
  navigation: any;
  descriptors: Record<string, any>;
  tabBar?: (props: any) => React.ReactNode;
}

export function SwipeableTabView({
  state,
  navigation,
  descriptors,
  tabBar = props => <MagnetTabBar {...props} />,
}: SwipeableTabViewProps) {
  const { width } = useWindowDimensions();
  const { isSwipeEnabled, registerPagerRef } = useSwipeNavigation();
  const scrollViewRef = useRef<ScrollView>(null);
  const isSwiping = useRef(false);
  const lastEmittedIndex = useRef(state.index);

  useEffect(() => {
    registerPagerRef(scrollViewRef.current);
    return () => registerPagerRef(null);
  }, [registerPagerRef]);

  // Sincronizar posición del ScrollView cuando cambia el índice por botón de tab o navegación programática
  useEffect(() => {
    if (width > 0 && !isSwiping.current) {
      scrollViewRef.current?.scrollTo({
        x: state.index * width,
        animated: true,
      });
      lastEmittedIndex.current = state.index;
    }
  }, [state.index, width]);

  // Manejador directo al pulsar un botón de la barra inferior MagnetTabBar
  const handleTabPress = useCallback(
    (index: number) => {
      isSwiping.current = false;
      const targetRoute = state.routes[index];
      if (width > 0 && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          x: index * width,
          animated: true,
        });
        lastEmittedIndex.current = index;
      }
      if (targetRoute) {
        navigation.emit({
          type: 'tabPress',
          target: targetRoute.key,
          canPreventDefault: true,
        });
        navigation.navigate(targetRoute.name);
      }
    },
    [width, state.routes, navigation],
  );

  // Al redimensionar la pantalla o rotar, mantener en la pestaña activa sin saltos
  const handleLayout = useCallback(() => {
    registerPagerRef(scrollViewRef.current);
    if (width > 0 && !isSwiping.current) {
      scrollViewRef.current?.scrollTo({
        x: state.index * width,
        animated: false,
      });
    }
  }, [state.index, width, registerPagerRef]);

  const handleScrollBeginDrag = useCallback(() => {
    isSwiping.current = true;
  }, []);

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / width);
      const clampedIndex = Math.max(0, Math.min(pageIndex, state.routes.length - 1));
      const vx = Math.abs(e.nativeEvent.velocity?.x ?? 0);

      // Si la velocidad es mínima o nula, no habrá evento de inercia posterior
      if (vx < 0.1) {
        isSwiping.current = false;
        if (clampedIndex !== state.index) {
          lastEmittedIndex.current = clampedIndex;
          const targetRoute = state.routes[clampedIndex];
          navigation.emit({
            type: 'tabPress',
            target: targetRoute.key,
            canPreventDefault: true,
          });
          navigation.navigate(targetRoute.name);
        }
      }
    },
    [state.routes, state.index, width, navigation],
  );

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isSwiping.current = false;
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / width);
      const clampedIndex = Math.max(0, Math.min(pageIndex, state.routes.length - 1));

      if (clampedIndex !== state.index) {
        lastEmittedIndex.current = clampedIndex;
        const targetRoute = state.routes[clampedIndex];
        // Emite el evento tabPress correspondiente para permitir useScrollToTop y listeners
        navigation.emit({
          type: 'tabPress',
          target: targetRoute.key,
          canPreventDefault: true,
        });
        navigation.navigate(targetRoute.name);
      }
    },
    [state.routes, state.index, width, navigation],
  );

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={isSwipeEnabled}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { width: width * state.routes.length }]}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const isFocused = state.index === index;
          return (
            <View
              key={route.key}
              style={[
                styles.page,
                {
                  width,
                },
              ]}>
              <Screen
                focused={isFocused}
                route={descriptor.route}
                navigation={descriptor.navigation}
                headerShown={false}
                header={null}
                style={styles.screenContainer}>
                {descriptor.render()}
              </Screen>
            </View>
          );
        })}
      </ScrollView>

      {/* Renderizado de la barra inferior MagnetTabBar */}
      {tabBar({ state, descriptors, navigation, onTabPress: handleTabPress })}
    </View>
  );
}

type Props = DefaultNavigatorOptions<
  ParamListBase,
  TabNavigationState<ParamListBase>,
  any,
  any
> &
  TabRouterOptions & {
    tabBar?: (props: any) => React.ReactNode;
  };

function SwipeableTabNavigator({
  initialRouteName,
  backBehavior = 'none',
  children,
  screenListeners,
  screenOptions,
  tabBar,
}: Props) {
  const { state, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      TabNavigationState<ParamListBase>,
      TabRouterOptions,
      TabActionHelpers<ParamListBase>,
      any,
      any
    >(TabRouter, {
      initialRouteName,
      backBehavior,
      children,
      screenListeners,
      screenOptions,
    });

  return (
    <NavigationContent>
      <SwipeableTabView
        state={state}
        navigation={navigation}
        descriptors={descriptors}
        tabBar={tabBar}
      />
    </NavigationContent>
  );
}

export const createSwipeableTabNavigator = createNavigatorFactory<
  TabNavigationState<ParamListBase>,
  any,
  any,
  typeof SwipeableTabNavigator
>(SwipeableTabNavigator);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    height: '100%',
  },
  page: {
    height: '100%',
    overflow: 'hidden',
  },
  screenContainer: {
    flex: 1,
  },
});
