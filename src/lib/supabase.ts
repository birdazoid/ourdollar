import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
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
// Thrown in place of a data request that would have gone out without a
// signed-in user. Its message reads as a connection problem on purpose, so a
// write that hits it shows "Check your connection and try again" (nothing
// was sent, so trying again is safe).
export class SignedOutRequestError extends Error {
  constructor() {
    super('Request held back: sign-in was still refreshing (network not ready).');
    this.name = 'SignedOutRequestError';
  }
}

// Every app user is signed in before any data is read or written, so a data
// request carrying only the public key means the sign-in couldn't be renewed
// in time (typically right after the app wakes from the background with no
// network yet). Sent anyway, the database would answer as if this person had
// no data at all ("no households"), which looked like a brand-new account.
// Failing it instead lets React Query keep what's on screen and retry.
const DATA_PATHS = ['/rest/v1/', '/functions/v1/'];
function isSignedOutDataRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!DATA_PATHS.some((path) => url.includes(path))) return false;
  const auth = new Headers(init?.headers).get('Authorization');
  return auth === `Bearer ${supabaseAnonKey}`;
}

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (isSignedOutDataRequest(input, init)) {
    return Promise.reject(new SignedOutRequestError());
  }
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

// Renew the sign-in only while the app is in the foreground, and right away
// when it comes back. Without this, a token that expired in the background is
// still being renewed when the first screens ask for data. This is Supabase's
// recommended setup for phone apps; on the web the browser handles it.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
