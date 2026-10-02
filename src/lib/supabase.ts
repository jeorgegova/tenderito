import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
import {SUPABASE_ANON_KEY, SUPABASE_URL} from '@env';

if (!SUPABASE_URL || SUPABASE_ANON_KEY === 'tu-anon-key-aqui') {
  console.warn('Configura SUPABASE_URL y SUPABASE_ANON_KEY en el archivo .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
