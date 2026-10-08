// Tipos mínimos para el import interno de @rneui/base.
// react-native-vector-icons v9 no expone tipos en la ruta '.../Icon'.
declare module 'react-native-vector-icons/Icon' {
  import type {Component} from 'react';
  import type {StyleProp, TextStyle} from 'react-native';

  export interface IconProps {
    name?: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
  }

  export interface IconButtonProps extends IconProps {
    backgroundColor?: string;
    onPress?: (...args: any[]) => void;
    [key: string]: any;
  }

  const Icon: typeof Component;
  export default Icon;
}
