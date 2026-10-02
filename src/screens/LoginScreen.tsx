import {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Input} from '../components/ui/Input';
import {supabase} from '../lib/supabase';
import {Colors} from '../theme';

export function LoginScreen({navigation}: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!email || !password) {
      return Alert.alert('Faltan datos', 'Ingresa correo y contraseña');
    }
    setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({email, password});
    setLoading(false);
    if (error) {
      return Alert.alert('Error', error.message);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.logo}>Alfiao</Text>
      <Text style={styles.sub}>Control de fiados para tu negocio</Text>
      <Card style={{marginTop: 24, gap: 12}}>
        <Input
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tutienda@mail.com"
        />
        <Input
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />
        <Button
          title={loading ? 'Ingresando...' : 'Ingresar'}
          onPress={onLogin}
          disabled={loading}
        />
      </Card>
      <Text style={styles.link} onPress={() => navigation.navigate('Register')}>
        ¿Sin cuenta? Crear negocio
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
  },
  sub: {textAlign: 'center', color: Colors.textSecondary, marginTop: 4},
  link: {
    textAlign: 'center',
    color: Colors.primary,
    marginTop: 16,
    fontWeight: '600',
  },
});
