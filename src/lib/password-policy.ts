export const MIN_NEW_PASSWORD_CHARACTERS = 15;
export const MAX_BCRYPT_PASSWORD_BYTES = 72;

export function getPasswordByteLength(password: string) {
  return new TextEncoder().encode(password).byteLength;
}

export function getNewPasswordPolicyError(password: string) {
  if (Array.from(password).length < MIN_NEW_PASSWORD_CHARACTERS) {
    return `Use at least ${MIN_NEW_PASSWORD_CHARACTERS} characters. A passphrase is fine.`;
  }

  if (getPasswordByteLength(password) > MAX_BCRYPT_PASSWORD_BYTES) {
    return `Keep the password within ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes.`;
  }

  return null;
}
