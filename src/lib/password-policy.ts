export const MIN_NEW_PASSWORD_CHARACTERS = 8;
export const MAX_BCRYPT_PASSWORD_BYTES = 72;

export function getPasswordByteLength(password: string) {
  return new TextEncoder().encode(password).byteLength;
}

export function getNewPasswordPolicyChecks(password: string) {
  return {
    hasMinLength: Array.from(password).length >= MIN_NEW_PASSWORD_CHARACTERS,
    hasLowercase: /\p{Ll}/u.test(password),
    hasUppercase: /\p{Lu}/u.test(password),
    hasNumber: /\p{N}/u.test(password),
    hasSymbol: /[\p{P}\p{S}]/u.test(password),
    withinByteLimit: getPasswordByteLength(password) <= MAX_BCRYPT_PASSWORD_BYTES,
  };
}

export function getNewPasswordPolicyError(password: string) {
  const checks = getNewPasswordPolicyChecks(password);

  if (!checks.hasMinLength) {
    return `Use at least ${MIN_NEW_PASSWORD_CHARACTERS} characters.`;
  }
  if (!checks.hasLowercase) {
    return "Add at least one lowercase letter.";
  }
  if (!checks.hasUppercase) {
    return "Add at least one uppercase letter.";
  }
  if (!checks.hasNumber) {
    return "Add at least one number.";
  }
  if (!checks.hasSymbol) {
    return "Add at least one symbol, such as ! or #.";
  }
  if (!checks.withinByteLimit) {
    return `Keep the password within ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes.`;
  }

  return null;
}
