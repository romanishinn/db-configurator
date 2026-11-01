// Shared password policy: at least 8 characters, with letters, digits and a special character.
// Used by the accept-invite function (server-side enforcement). The join page mirrors it in the
// browser with the same rules so the person sees the requirements as they type.
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "too_short";
  if (!/[A-Za-z]/.test(pw)) return "need_letter";
  if (!/\d/.test(pw)) return "need_digit";
  if (!/[^A-Za-z0-9]/.test(pw)) return "need_special";
  return null;
}
