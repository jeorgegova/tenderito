import React from 'react';
import {MagnetTabBar} from './MagnetTabBar';

export function FooterMenu({
  active,
  onPressItem,
}: {
  active?: string;
  onPressItem?: () => void;
}) {
  return <MagnetTabBar active={active} onPressItem={onPressItem} />;
}
