import type { AuthError, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthResult = { error: AuthError | null };

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  // True once a password-recovery deep link has set a (temporary) session —
  // the app should show the reset-password screen instead of normal content
  // until the new password is saved and clearRecovery() is called.
  isRecovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult & { needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  reauthenticate: (password: string) => Promise<AuthResult>;
  clearRecovery: () => void;
};

// The recovery link opens the app at ourdollar://reset-password with the
// session tokens in the URL fragment (not a query param) — Supabase's web
// convention for its implicit/PKCE recovery redirect.
function extractRecoveryTokens(url: string) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useSession() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useSession must be used within a <SessionProvider />');
  }
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url) return;
      const tokens = extractRecoveryTokens(url);
      if (!tokens) return;
      const { error } = await supabase.auth.setSession(tokens);
      if (!error) setIsRecovery(true);
    }
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const value: AuthContextValue = {
    session,
    isLoading,
    isRecovery,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      // With email confirmation enabled, signUp returns a user but no session
      // until the email link is clicked.
      const needsConfirmation = !error && !data.session;
      return { error, needsConfirmation };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('reset-password'),
      });
      return { error };
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      return { error };
    },
    updateEmail: async (email) => {
      const { error } = await supabase.auth.updateUser({ email });
      return { error };
    },
    reauthenticate: async (password) => {
      const email = session?.user.email;
      if (!email) return { error: new Error('No signed-in email to reauthenticate with.') as AuthError };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    clearRecovery: () => setIsRecovery(false),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
