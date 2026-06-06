/**
 * FitLife Validation Utilities
 * Preserved from original project.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STRENGTH_LEVELS = [
  { label: 'Too short', color: '#ba1a1a', pct: 20 },
  { label: 'Weak', color: '#e67e22', pct: 40 },
  { label: 'Fair', color: '#f1c40f', pct: 60 },
  { label: 'Strong', color: '#22c55e', pct: 80 },
  { label: 'Very strong', color: '#006e2f', pct: 100 },
];

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(String(email || '').trim());
}

export function getPasswordStrength(password) {
  const v = String(password || '');
  if (!v) return { label: '', color: '#ba1a1a', pct: 0 };
  let score = 0;
  if (v.length >= 6) score++;
  if (v.length >= 10) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  return STRENGTH_LEVELS[Math.max(score - 1, 0)];
}

export function validateSignupField(field, values) {
  const { fullName, email, password, confirmPassword } = values;
  switch (field) {
    case 'fullName': return fullName?.trim() ? '' : 'Full name is required.';
    case 'email': return !email?.trim() ? 'Email is required.' : !isValidEmail(email) ? 'Invalid email format.' : '';
    case 'password': return !password ? 'Password is required.' : password.length < 6 ? 'Minimum 6 characters.' : '';
    case 'confirmPassword': return !confirmPassword ? 'Confirm your password.' : confirmPassword !== password ? 'Passwords do not match.' : '';
    default: return '';
  }
}

export function validateLoginField(field, values) {
  const { email, password } = values;
  switch (field) {
    case 'email': return !email?.trim() ? 'Email is required.' : !isValidEmail(email) ? 'Invalid email format.' : '';
    case 'password': return !password ? 'Password is required.' : '';
    default: return '';
  }
}

export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
