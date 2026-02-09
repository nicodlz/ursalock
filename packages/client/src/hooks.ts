/**
 * React hooks for auth state
 * @module
 */

import { useSyncExternalStore, useCallback } from 'react'
import type { VaultClient } from './client.js'
import type { AuthState, AuthResult } from './types.js'

/**
 * Hook to subscribe to auth state from VaultClient
 * 
 * @example
 * ```tsx
 * const client = new VaultClient({ serverUrl: '...' })
 * 
 * function App() {
 *   const { isAuthenticated, user, isLoading } = useAuth(client)
 *   
 *   if (isLoading) return <Loading />
 *   if (!isAuthenticated) return <Login />
 *   return <Dashboard user={user} />
 * }
 * ```
 */
export function useAuth(client: VaultClient): AuthState {
  const subscribe = useCallback(
    (callback: () => void) => {
      return client.subscribe(callback)
    },
    [client]
  )

  const getSnapshot = useCallback(() => client.getState(), [client])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook for sign up action
 * 
 * @example
 * ```tsx
 * const { signUp, isLoading, error } = useSignUp(client)
 * 
 * const handleSubmit = async (email: string, password: string) => {
 *   const result = await signUp({ email, password })
 *   if (result.success) {
 *     // Show recovery key to user
 *     showRecoveryKey(result.recoveryKey)
 *   }
 * }
 * ```
 */
export function useSignUp(client: VaultClient): {
  signUp: (options?: {
    email?: string
    password?: string
    usePasskey?: boolean
  }) => Promise<AuthResult>
  isLoading: boolean
  error: Error | null
} {
  const state = useAuth(client)

  const signUp = useCallback(
    async (options?: {
      email?: string
      password?: string
      usePasskey?: boolean
    }) => {
      return client.signUp(options ?? {})
    },
    [client]
  )

  return {
    signUp,
    isLoading: state.isLoading,
    error: state.error,
  }
}

/**
 * Hook for sign in action
 * 
 * @example
 * ```tsx
 * const { signIn, isLoading, error } = useSignIn(client)
 * 
 * const handleLogin = async () => {
 *   const result = await signIn({ usePasskey: true })
 *   if (!result.success) {
 *     setError(result.error)
 *   }
 * }
 * ```
 */
export function useSignIn(client: VaultClient): {
  signIn: (options?: {
    email?: string
    password?: string
    usePasskey?: boolean
  }) => Promise<AuthResult>
  isLoading: boolean
  error: Error | null
} {
  const state = useAuth(client)

  const signIn = useCallback(
    async (options?: {
      email?: string
      password?: string
      usePasskey?: boolean
    }) => {
      return client.signIn(options ?? {})
    },
    [client]
  )

  return {
    signIn,
    isLoading: state.isLoading,
    error: state.error,
  }
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
  return useCallback(() => client.signOut(), [client])
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
  const state = useAuth(client)
  return state.user
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
  return client.supportsPasskey()
}
