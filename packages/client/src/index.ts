/**
 * @zod-vault/client
 * Auth and API client for zod-vault
 */

export { VaultClient, type VaultClientOptions } from './client.js'
export {
  PasskeyAuth,
  type PasskeyAuthOptions,
  type PasskeyCredential,
} from './passkey.js'
export {
  EmailAuth,
  type EmailAuthOptions,
  type EmailCredentials,
} from './email.js'
export {
  TokenManager,
  type Token,
  type TokenManagerOptions,
} from './token.js'
export {
  type AuthProvider,
  type AuthState,
  type AuthResult,
  type User,
} from './types.js'

// React hooks (tree-shakeable)
export {
  useAuth,
  useSignUp,
  useSignIn,
  useSignOut,
  useUser,
  usePasskeySupport,
} from './hooks.js'
