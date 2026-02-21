# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x | ✅ Current |
| < 0.2.0 | ❌ |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report security issues via email:

📧 **ndlz@pm.me**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

You will receive an acknowledgment within **48 hours** and a detailed response within **7 days**.

## Responsible Disclosure

We ask that you:
1. Give us reasonable time to fix the issue before public disclosure
2. Do not exploit the vulnerability beyond what's needed to demonstrate it
3. Do not access other users' data

We commit to:
1. Acknowledging your report promptly
2. Keeping you informed of progress
3. Crediting you (if desired) when the fix is released

## Security Best Practices for Contributors

### Cryptography

- **Never** use custom/static IVs — always generate random IVs per encryption
- **Never** reduce Argon2id parameters (memory, iterations, parallelism)
- **Never** use `Math.random()` for anything security-related — use `crypto.getRandomValues()`
- All symmetric encryption must use AES-256-GCM (authenticated encryption)
- Key derivation must use Argon2id with the parameters defined in `@ursalock/crypto`

### Secrets & Logging

- **Never** log keys, tokens, passwords, or encrypted data — not even at debug level
- **Never** commit `.env` files, API keys, or JWTs
- Use `hashToken()` when storing tokens in the database (SHA-256)
- Session tokens must have expiration times

### Server

- All vault endpoints require authentication (`requireAuthMiddleware`)
- Rate limiting is mandatory on auth endpoints
- CORS origins must be explicitly configured (no wildcards in production)
- Use `secureHeaders()` middleware for all responses
- Input validation via Zod schemas — never trust client data
