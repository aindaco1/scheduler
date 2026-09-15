// Return only a boolean so audit diagnostics never contain credential values.
export function hasCredentialSignature(text) {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk_live_[A-Za-z0-9]{20,}|\b(?:ghs_[A-Za-z0-9._-]{36,}|gh[pour]_[A-Za-z0-9]{30,})/.test(text);
}
