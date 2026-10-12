import { createPasswordRules, PasswordStrength } from "@/components/arc/password-strength/password-strength"

/** Shortest password the server accepts (see validateAccountPassword in server.js). */
export const PASSWORD_MIN_LENGTH = 8

// The server only checks length, so the meter shows that single rule and fills as soon as it is met.
const rules = createPasswordRules({ minLength: PASSWORD_MIN_LENGTH }).filter(rule => rule.id === "length")

/** The field for choosing a new password: registration, password reset and password change. */
export function NewPasswordField({ label, value, onValueChange, error, name = "password" }: { label: string; value: string; onValueChange: (value: string) => void; error?: string; name?: string }) {
  return <PasswordStrength label={label} name={name} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required value={value} onValueChange={next => onValueChange(next)} rules={rules} shortLength={PASSWORD_MIN_LENGTH} error={error} />
}
