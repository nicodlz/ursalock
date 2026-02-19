/**
 * React hooks for auth state
 * @module
 */

import { useSyncExternalStore, useCallback } from "react";
import type { VaultClient } from "./client.js";
import type { AuthState, ZKAuthResult, ZKCredential } from "./types.js";

/**
 * Hook to subscribe to auth state from VaultClient
 * 
 * @example
 * ```tsx
 * const client = new VaultClient({ serverUrl: '...' })
 * 
 * function App() {
 *   const { isAuthenticated, user, isLoading, credential } = useAuth(client)
 *   
 *   if (isLoading) return <Loading />
 *   if (!isAuthenticated) return <Login />
 *   return <Dashboard user={user} credential={credential} />
 * }
 * ```
 */
export function useAuth(client: VaultClient): AuthState {
  const subscribe = useCallback(
    (callback: () => void) => {
      return client.subscribe(() => callback());
    },
    [client]
  );

  const getSnapshot = useCallback(() => client.getState(), [client]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook for sign up action
 * Returns ZKAuthResult with credential containing encryption keys
 * 
 * @example
 * ```tsx
 * const { signUp, isLoading, error } = useSignUp(client)
 * 
 * const handleSubmit = async () => {
 *   const result = await signUp({ usePasskey: true })
 *   if (result.success && result.credential) {
 *     // Use credential.cipherJwk for encryption
 *     initializeVault(result.credential.cipherJwk)
 *   }
 * }
 * ```
 */
export function useSignUp(client: VaultClient): {
  signUp: (options?: {
    email?: string;
    password?: string;
    usePasskey?: boolean;
    displayName?: string;
  }) => Promise<ZKAuthResult>;
  isLoading: boolean;
  error: Error | null;
} {
  const state = useAuth(client);

  const signUp = useCallback(
    async (options?: {
      email?: string;
      password?: string;
      usePasskey?: boolean;
      displayName?: string;
    }) => {
      return client.signUp(options ?? {});
    },
    [client]
  );

  return {
    signUp,
    isLoading: state.isLoading,
    error: state.error,
  };
}

/**
 * Hook for sign in action
 * Returns ZKAuthResult with credential containing encryption keys
 * 
 * @example
 * ```tsx
 * const { signIn, isLoading, error } = useSignIn(client)
 * 
 * const handleLogin = async () => {
 *   const result = await signIn({ usePasskey: true })
 *   if (result.success && result.credential) {
 *     // Use credential.cipherJwk for encryption
 *     initializeVault(result.credential.cipherJwk)
 *   }
 * }
 * ```
 */
export function useSignIn(client: VaultClient): {
  signIn: (options?: {
    email?: string;
    password?: string;
    usePasskey?: boolean;
  }) => Promise<ZKAuthResult>;
  isLoading: boolean;
  error: Error | null;
} {
  const state = useAuth(client);

  const signIn = useCallback(
    async (options?: {
      email?: string;
      password?: string;
      usePasskey?: boolean;
    }) => {
      return client.signIn(options ?? {});
    },
    [client]
  );

  return {
    signIn,
    isLoading: state.isLoading,
    error: state.error,
  };
}

/**
 * Hook for sign out action
 * 
 * @example
 * ```tsx
 * const signOut = useSignOut(client)
 * 
 * <button onClick={signOut}>Sign Out</button>
 * ```
 */
export function useSignOut(client: VaultClient): () => Promise<void> {
  return useCallback(() => client.signOut(), [client]);
}

/**
 * Hook for current user
 * Returns null if not authenticated
 * 
 * @example
 * ```tsx
 * const user = useUser(client)
 * 
 * if (user) {
 *   return <span>Hello, {user.email}</span>
 * }
 * ```
 */
export function useUser(client: VaultClient) {
  const state = useAuth(client);
  return state.user;
}

/**
 * Hook for current ZK credential (encryption keys)
 * Returns null if not authenticated or no credential available
 * 
 * @example
 * ```tsx
 * const credential = useCredential(client)
 * 
 * if (credential) {
 *   // credential.cipherJwk - AES-GCM key for encryption
 *   // credential.hmacJwk - HMAC key for signing
 * }
 * ```
 */
export function useCredential(client: VaultClient): ZKCredential | null {
  const state = useAuth(client);
  return state.credential;
}

/**
 * Hook to check passkey support
 * 
 * @example
 * ```tsx
 * const supportsPasskey = usePasskeySupport(client)
 * 
 * {supportsPasskey ? (
 *   <PasskeyButton />
 * ) : (
 *   <EmailPasswordForm />
 * )}
 * ```
 */
export function usePasskeySupport(client: VaultClient): boolean {
  return client.supportsPasskey();
}
