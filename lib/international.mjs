export const currencies = Intl.supportedValuesOf('currency');
export function currencyDigits(currency = 'USD') {
  if (!currencies.includes(currency))
    throw new Error('Choose a supported currency.');
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits;
}
export function toMinor(amount, currency = 'USD') {
  const digits = currencyDigits(currency),
    text = String(amount);
  if (!/^\d+(\.\d+)?$/.test(text))
    throw new Error('Enter a nonnegative amount.');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > digits)
    throw new Error(`${currency} accepts ${digits} decimal places.`);
  const result = Number(
    BigInt(whole) * 10n ** BigInt(digits) +
      BigInt(fraction.padEnd(digits, '0') || '0'),
  );
  if (!Number.isSafeInteger(result) || result > 1e12)
    throw new Error('Amount exceeds the supported limit.');
  return result;
}
export function formatMoney(minor, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(minor / 10 ** currencyDigits(currency));
}
export function areaToSquareMetres(value, unit) {
  const factor = { square_metres: 1, hectares: 10000, acres: 4046.8564224 }[
    unit
  ];
  const result = Math.round(Number(value) * factor);
  if (
    !factor ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0 ||
    !Number.isSafeInteger(result) ||
    result < 1 ||
    result > 1e12
  )
    throw new Error('Enter a positive area within the supported range.');
  return result;
}
