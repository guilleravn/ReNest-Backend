import type { City } from '../generated/prisma/enums.js';

/**
 * Supported phone countries (AUTH-4). `national` matches the digits after the
 * calling code. Keep in sync with the frontend table in
 * `ReNest-Frontend/src/lib/phone-countries.ts`.
 */
export const PHONE_COUNTRIES = [
  { country: 'BO', callingCode: '591', national: /^[67]\d{7}$/ },
  { country: 'PE', callingCode: '51', national: /^9\d{8}$/ },
  { country: 'SV', callingCode: '503', national: /^[67]\d{7}$/ },
  { country: 'US', callingCode: '1', national: /^[2-9]\d{2}[2-9]\d{6}$/ },
] as const;

const CITY_CALLING_CODE: Record<City, string> = {
  COCHABAMBA_BO: '591',
  AREQUIPA_PE: '51',
  SAN_SALVADOR_SV: '503',
  UTAH_US: '1',
};

export const PHONE_FORMAT_MESSAGE =
  'phoneE164 must be a mobile number with the country code: +591 (BO), +51 (PE), +503 (SV) or +1 (US)';

export function isSupportedPhone(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\+\d+$/.test(value)) return false;
  const digits = value.slice(1);
  return PHONE_COUNTRIES.some(
    ({ callingCode, national }) =>
      digits.startsWith(callingCode) &&
      national.test(digits.slice(callingCode.length)),
  );
}

export function phoneMatchesCity(phone: string, city: unknown): boolean {
  const callingCode = CITY_CALLING_CODE[city as City];
  // An unknown city is reported on its own field.
  return callingCode === undefined || phone.startsWith(`+${callingCode}`);
}
