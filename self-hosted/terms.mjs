// Terms of Use acceptance.
//
// Invariant (BL-09): every account created through the hosted service has a
// recorded acceptance of the current Terms of Use version, made by an explicit
// action (checkbox or native confirmation) before the account exists.
export const TERMS_VERSION = '2026-09-28';
export const TERMS_PATH = '/terms/';

export function termsAccepted(value) {
  return value === true || value === 'yes' || value === 'true';
}

export function termsCheckbox() {
  return `<label class="terms-consent"><input type="checkbox" name="acceptTerms" value="yes" required><span>I agree to the <a href="${TERMS_PATH}" target="_blank" rel="noopener">Terms of Use</a> and have read the <a href="/privacy/" target="_blank" rel="noopener">Privacy policy</a>.</span></label>`;
}

export const TERMS_REQUIRED_MESSAGE =
  'Agree to the Terms of Use to create an account.';
