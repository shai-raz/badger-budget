# crypto

Single-purpose module: encrypt/decrypt bank-sync scraper credentials at rest.

- `CredentialCryptoService` derives an AES-256-GCM key from the user's sync PIN + a server-side pepper (`CREDENTIAL_ENCRYPTION_PEPPER`) via scrypt — the PIN itself is never stored.
- Only a **verifier** blob (encrypted known plaintext) is persisted, so the server can check "is this the right PIN?" (`verifyPin`) without ever knowing or storing the PIN. A GCM auth-tag mismatch on decrypt is treated as "wrong PIN" (`UnauthorizedException`), not a generic crypto error.
- Passkey unlock uses a PRF-wrapped PIN: the browser wraps the PIN (WebAuthn PRF -> HKDF-SHA256 -> AES-GCM, AAD = credentialId) and the server stores only the ciphertext. The server cannot unwrap it, so a leaked DB + pepper still cannot decrypt credentials. A PIN change clears all passkeys.
- This is the only thing standing between plaintext bank credentials and the database — don't weaken the KDF params (`SCRYPT_PARAMS`) or drop the pepper without a deliberate security conversation.
- Consumed by `bank-sync/AGENTS.md`; not used anywhere else.
