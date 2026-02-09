/**
 * Common types for auth
 */

/** User object returned by auth */
export interface User {
  id: string
  email?: string
  createdAt: number
}

/** Current authentication state */
export interface AuthState {
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Current user (if authenticated) */
  user: User | null
  /** Whether auth is still loading */
  isLoading: boolean
  /** Auth error (if any) */
  error: Error | null
}

/** Auth provider interface */
export interface AuthProvider {
  /** Sign up a new user */
  signUp(options: SignUpOptions): Promise<AuthResult>
  /** Sign in an existing user */
  signIn(options: SignInOptions): Promise<AuthResult>
  /** Sign out the current user */
  signOut(): Promise<void>
  /** Get current auth state */
  getState(): AuthState
  /** Subscribe to auth state changes */
  subscribe(callback: (state: AuthState) => void): () => void
}

/** Sign up options */
export interface SignUpOptions {
  email?: string
  password?: string
  /** Use passkey instead of email/password */
  usePasskey?: boolean
}

/** Sign in options */
export interface SignInOptions {
  email?: string
  password?: string
  /** Use passkey instead of email/password */
  usePasskey?: boolean
}

/** Result of auth operations */
export interface AuthResult {
  success: boolean
  user?: User
  token?: string
  recoveryKey?: string
  error?: string
}

/** API error response */
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}
