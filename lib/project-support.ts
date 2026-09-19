/** Public, verified project contact and Stripe Payment Link. Never put API keys here. */
function stripePaymentLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'buy.stripe.com' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname !== '/'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function contactEmail(value: string | null): string | null {
  return value && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : null;
}

export const projectSupport = Object.freeze({
  operator: 'Viridis LLC',
  stripePaymentLink: stripePaymentLink(null),
  contactEmail: contactEmail(null),
});
