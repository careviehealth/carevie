/**
 * Country list for phone number country-code selection.
 * Format: name, ISO 3166-1 alpha-2 code, E.164 dial code.
 * Sorted alphabetically by country name.
 */
export type CountryOption = {
  name: string;
  code: string;
  dialCode: string;
};

const COUNTRIES_RAW: CountryOption[] = [
  { name: "Afghanistan", code: "AF", dialCode: "+93" },
  { name: "Albania", code: "AL", dialCode: "+355" },
  { name: "Algeria", code: "DZ", dialCode: "+213" },
  { name: "Argentina", code: "AR", dialCode: "+54" },
  { name: "Australia", code: "AU", dialCode: "+61" },
  { name: "Austria", code: "AT", dialCode: "+43" },
  { name: "Bahrain", code: "BH", dialCode: "+973" },
  { name: "Bangladesh", code: "BD", dialCode: "+880" },
  { name: "Belgium", code: "BE", dialCode: "+32" },
  { name: "Brazil", code: "BR", dialCode: "+55" },
  { name: "Bulgaria", code: "BG", dialCode: "+359" },
  { name: "Canada", code: "CA", dialCode: "+1" },
  { name: "Chile", code: "CL", dialCode: "+56" },
  { name: "China", code: "CN", dialCode: "+86" },
  { name: "Colombia", code: "CO", dialCode: "+57" },
  { name: "Croatia", code: "HR", dialCode: "+385" },
  { name: "Czech Republic", code: "CZ", dialCode: "+420" },
  { name: "Denmark", code: "DK", dialCode: "+45" },
  { name: "Egypt", code: "EG", dialCode: "+20" },
  { name: "Ethiopia", code: "ET", dialCode: "+251" },
  { name: "Finland", code: "FI", dialCode: "+358" },
  { name: "France", code: "FR", dialCode: "+33" },
  { name: "Germany", code: "DE", dialCode: "+49" },
  { name: "Ghana", code: "GH", dialCode: "+233" },
  { name: "Greece", code: "GR", dialCode: "+30" },
  { name: "Hong Kong", code: "HK", dialCode: "+852" },
  { name: "Hungary", code: "HU", dialCode: "+36" },
  { name: "India", code: "IN", dialCode: "+91" },
  { name: "Indonesia", code: "ID", dialCode: "+62" },
  { name: "Iran", code: "IR", dialCode: "+98" },
  { name: "Iraq", code: "IQ", dialCode: "+964" },
  { name: "Ireland", code: "IE", dialCode: "+353" },
  { name: "Israel", code: "IL", dialCode: "+972" },
  { name: "Italy", code: "IT", dialCode: "+39" },
  { name: "Japan", code: "JP", dialCode: "+81" },
  { name: "Jordan", code: "JO", dialCode: "+962" },
  { name: "Kenya", code: "KE", dialCode: "+254" },
  { name: "Kuwait", code: "KW", dialCode: "+965" },
  { name: "Lebanon", code: "LB", dialCode: "+961" },
  { name: "Malaysia", code: "MY", dialCode: "+60" },
  { name: "Mexico", code: "MX", dialCode: "+52" },
  { name: "Morocco", code: "MA", dialCode: "+212" },
  { name: "Nepal", code: "NP", dialCode: "+977" },
  { name: "Netherlands", code: "NL", dialCode: "+31" },
  { name: "New Zealand", code: "NZ", dialCode: "+64" },
  { name: "Nigeria", code: "NG", dialCode: "+234" },
  { name: "Norway", code: "NO", dialCode: "+47" },
  { name: "Oman", code: "OM", dialCode: "+968" },
  { name: "Pakistan", code: "PK", dialCode: "+92" },
  { name: "Philippines", code: "PH", dialCode: "+63" },
  { name: "Poland", code: "PL", dialCode: "+48" },
  { name: "Portugal", code: "PT", dialCode: "+351" },
  { name: "Qatar", code: "QA", dialCode: "+974" },
  { name: "Romania", code: "RO", dialCode: "+40" },
  { name: "Russia", code: "RU", dialCode: "+7" },
  { name: "Saudi Arabia", code: "SA", dialCode: "+966" },
  { name: "Singapore", code: "SG", dialCode: "+65" },
  { name: "Slovakia", code: "SK", dialCode: "+421" },
  { name: "South Africa", code: "ZA", dialCode: "+27" },
  { name: "South Korea", code: "KR", dialCode: "+82" },
  { name: "Spain", code: "ES", dialCode: "+34" },
  { name: "Sri Lanka", code: "LK", dialCode: "+94" },
  { name: "Sweden", code: "SE", dialCode: "+46" },
  { name: "Switzerland", code: "CH", dialCode: "+41" },
  { name: "Taiwan", code: "TW", dialCode: "+886" },
  { name: "Thailand", code: "TH", dialCode: "+66" },
  { name: "Turkey", code: "TR", dialCode: "+90" },
  { name: "Ukraine", code: "UA", dialCode: "+380" },
  { name: "United Arab Emirates", code: "AE", dialCode: "+971" },
  { name: "United Kingdom", code: "GB", dialCode: "+44" },
  { name: "United States", code: "US", dialCode: "+1" },
  { name: "Venezuela", code: "VE", dialCode: "+58" },
  { name: "Vietnam", code: "VN", dialCode: "+84" },
  { name: "Zimbabwe", code: "ZW", dialCode: "+263" },
];

export const COUNTRIES = [...COUNTRIES_RAW].sort((a, b) =>
  a.name.localeCompare(b.name)
);

/** Default country (India) for auth flows */
export const DEFAULT_COUNTRY =
  COUNTRIES.find((c) => c.code === "IN") ?? COUNTRIES[0];

/** Max national number length (digits only) for validation; backend allows 10–15 total after + */
export const PHONE_MAX_DIGITS = 15;

/** India national number length for optional stricter validation */
export const INDIA_PHONE_DIGITS = 10;

export function getCountryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function getCountryByDialCode(dialCode: string): CountryOption | undefined {
  return COUNTRIES.find((c) => c.dialCode === dialCode);
}
