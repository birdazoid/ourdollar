import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// A request whose socket gets suspended mid-flight (app backgrounded, screen
// locked, a cell-network handoff) can otherwise hang forever — its promise
// never resolves OR rejects, which leaves React Query's isLoading stuck true
// and the UI stuck on a spinner indefinitely. Give every request a hard
// timeout so it always settles.
const REQUEST_TIMEOUT_MS = 15_000;
function timeoutFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ?? controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: timeoutFetch,
  },
});
