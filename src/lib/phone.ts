/**
 * Dialling codes, and how many digits follow them.
 *
 * Not every country on earth: the ones Tesoro's collectors are actually in,
 * plus the places a parcel comes from. A full list is 250 rows of data to keep
 * current for a field that is optional, and the one thing it has to get right
 * — India, ten digits — is the first row.
 *
 * `min` and `max` are the national number, after the dialling code. They are
 * the length a number is, not a validation anybody is stopped by: a field that
 * refuses a legitimate number is worse than one that accepts a wrong one.
 */
export type Country = {
  /** ISO 3166-1 alpha-2, which is also where the flag comes from. */
  iso2: string;
  name: string;
  /** Without the plus. */
  dial: string;
  min: number;
  max: number;
};

export const COUNTRIES: Country[] = [
  { iso2: "IN", name: "India", dial: "91", min: 10, max: 10 },
  { iso2: "AE", name: "United Arab Emirates", dial: "971", min: 9, max: 9 },
  { iso2: "AU", name: "Australia", dial: "61", min: 9, max: 9 },
  { iso2: "BD", name: "Bangladesh", dial: "880", min: 10, max: 10 },
  { iso2: "BR", name: "Brazil", dial: "55", min: 10, max: 11 },
  { iso2: "CA", name: "Canada", dial: "1", min: 10, max: 10 },
  { iso2: "CN", name: "China", dial: "86", min: 11, max: 11 },
  { iso2: "DE", name: "Germany", dial: "49", min: 10, max: 11 },
  { iso2: "EG", name: "Egypt", dial: "20", min: 10, max: 10 },
  { iso2: "ES", name: "Spain", dial: "34", min: 9, max: 9 },
  { iso2: "FR", name: "France", dial: "33", min: 9, max: 9 },
  { iso2: "GB", name: "United Kingdom", dial: "44", min: 10, max: 10 },
  { iso2: "HK", name: "Hong Kong", dial: "852", min: 8, max: 8 },
  { iso2: "ID", name: "Indonesia", dial: "62", min: 9, max: 12 },
  { iso2: "IE", name: "Ireland", dial: "353", min: 9, max: 9 },
  { iso2: "IT", name: "Italy", dial: "39", min: 9, max: 11 },
  { iso2: "JP", name: "Japan", dial: "81", min: 10, max: 10 },
  { iso2: "KE", name: "Kenya", dial: "254", min: 9, max: 9 },
  { iso2: "KR", name: "South Korea", dial: "82", min: 9, max: 10 },
  { iso2: "KW", name: "Kuwait", dial: "965", min: 8, max: 8 },
  { iso2: "LK", name: "Sri Lanka", dial: "94", min: 9, max: 9 },
  { iso2: "MX", name: "Mexico", dial: "52", min: 10, max: 10 },
  { iso2: "MY", name: "Malaysia", dial: "60", min: 9, max: 10 },
  { iso2: "NG", name: "Nigeria", dial: "234", min: 10, max: 10 },
  { iso2: "NL", name: "Netherlands", dial: "31", min: 9, max: 9 },
  { iso2: "NP", name: "Nepal", dial: "977", min: 10, max: 10 },
  { iso2: "NZ", name: "New Zealand", dial: "64", min: 8, max: 10 },
  { iso2: "PH", name: "Philippines", dial: "63", min: 10, max: 10 },
  { iso2: "PK", name: "Pakistan", dial: "92", min: 10, max: 10 },
  { iso2: "PL", name: "Poland", dial: "48", min: 9, max: 9 },
  { iso2: "PT", name: "Portugal", dial: "351", min: 9, max: 9 },
  { iso2: "QA", name: "Qatar", dial: "974", min: 8, max: 8 },
  { iso2: "RU", name: "Russia", dial: "7", min: 10, max: 10 },
  { iso2: "SA", name: "Saudi Arabia", dial: "966", min: 9, max: 9 },
  { iso2: "SE", name: "Sweden", dial: "46", min: 7, max: 9 },
  { iso2: "SG", name: "Singapore", dial: "65", min: 8, max: 8 },
  { iso2: "TH", name: "Thailand", dial: "66", min: 9, max: 9 },
  { iso2: "TR", name: "Turkey", dial: "90", min: 10, max: 10 },
  { iso2: "TW", name: "Taiwan", dial: "886", min: 9, max: 9 },
  { iso2: "US", name: "United States", dial: "1", min: 10, max: 10 },
  { iso2: "VN", name: "Vietnam", dial: "84", min: 9, max: 10 },
  { iso2: "ZA", name: "South Africa", dial: "27", min: 9, max: 9 },
];

/** Where a number is assumed to be from when nothing says otherwise. */
export const DEFAULT_ISO2 = "IN";

export function countryOf(iso2: string): Country {
  return COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0]!;
}

/**
 * The flag, from the two letters.
 *
 * Regional indicator symbols rather than an image: the pair renders as a flag
 * where the system has one and as the country's own two letters where it does
 * not, which is the right thing to fall back to and costs no request.
 */
export function flagOf(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export type ParsedPhone = { iso2: string; national: string };

/**
 * Splitting a stored number into a country and the rest.
 *
 * Longest dialling code first, so +1 does not claim a number that belongs to a
 * three-digit code. A number whose remainder is the wrong length for the code
 * it appears to carry is not that country's — the commonest case being a ten
 * digit Indian number stored with no code at all, where "91" is the first two
 * digits of somebody's mobile rather than a country.
 */
export function parsePhone(stored: string | null | undefined): ParsedPhone {
  const digits = (stored ?? "").replace(/\D/g, "");
  if (!digits) return { iso2: DEFAULT_ISO2, national: "" };

  const byLength = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of byLength) {
    if (!digits.startsWith(c.dial)) continue;
    const rest = digits.slice(c.dial.length);
    if (rest.length >= c.min && rest.length <= c.max) return { iso2: c.iso2, national: rest };
  }

  // No code it could be. Whatever is there is the number, in the default
  // country: a stored value is somebody's phone, not something to throw away
  // because it predates this field.
  return { iso2: DEFAULT_ISO2, national: digits };
}

/** Back to what is stored: E.164 with the plus. Empty when there is no number. */
export function formatPhone(iso2: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "";
  return `+${countryOf(iso2).dial}${digits}`;
}
