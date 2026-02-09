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
export { type AuthProvider, type AuthState, type User } from './types.js'
