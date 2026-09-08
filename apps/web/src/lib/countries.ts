/**
 * Country set for the /talk-to-strangers/[country] pages.
 *
 * These exist because "talk to strangers in <country>" and "<country> random
 * video chat" are real, high-volume queries that a single homepage cannot rank
 * for. Each entry carries enough distinct data — language, timezone hint,
 * neighbours — that the generated page has genuinely different content rather
 * than a find-and-replace of the same paragraph, which is what gets a
 * programmatic set filtered out as doorway pages.
 */
export interface Country {
  slug: string;
  name: string;
  /** Demonym, e.g. "Brazilian". */
  people: string;
  code: string;
  lang: string;
  langName: string;
  /** Rough UTC offset, used for the "best time to find people" section. */
  utcOffset: number;
  /** Nearby slugs for internal linking — keeps crawl depth shallow. */
  nearby: string[];
}

export const COUNTRIES: Country[] = [
  { slug: "united-states", name: "the United States", people: "American", code: "US", lang: "en", langName: "English", utcOffset: -5, nearby: ["canada", "mexico", "united-kingdom"] },
  { slug: "united-kingdom", name: "the United Kingdom", people: "British", code: "GB", lang: "en", langName: "English", utcOffset: 0, nearby: ["ireland", "france", "united-states"] },
  { slug: "canada", name: "Canada", people: "Canadian", code: "CA", lang: "en", langName: "English", utcOffset: -5, nearby: ["united-states", "united-kingdom", "france"] },
  { slug: "australia", name: "Australia", people: "Australian", code: "AU", lang: "en", langName: "English", utcOffset: 10, nearby: ["new-zealand", "indonesia", "japan"] },
  { slug: "new-zealand", name: "New Zealand", people: "New Zealander", code: "NZ", lang: "en", langName: "English", utcOffset: 12, nearby: ["australia", "japan", "philippines"] },
  { slug: "ireland", name: "Ireland", people: "Irish", code: "IE", lang: "en", langName: "English", utcOffset: 0, nearby: ["united-kingdom", "france", "netherlands"] },
  { slug: "india", name: "India", people: "Indian", code: "IN", lang: "en", langName: "English", utcOffset: 5.5, nearby: ["pakistan", "bangladesh", "sri-lanka"] },
  { slug: "pakistan", name: "Pakistan", people: "Pakistani", code: "PK", lang: "en", langName: "English", utcOffset: 5, nearby: ["india", "bangladesh", "turkey"] },
  { slug: "bangladesh", name: "Bangladesh", people: "Bangladeshi", code: "BD", lang: "bn", langName: "Bengali", utcOffset: 6, nearby: ["india", "pakistan", "nepal"] },
  { slug: "nepal", name: "Nepal", people: "Nepali", code: "NP", lang: "ne", langName: "Nepali", utcOffset: 5.75, nearby: ["india", "bangladesh", "china"] },
  { slug: "sri-lanka", name: "Sri Lanka", people: "Sri Lankan", code: "LK", lang: "si", langName: "Sinhala", utcOffset: 5.5, nearby: ["india", "bangladesh", "malaysia"] },
  { slug: "philippines", name: "the Philippines", people: "Filipino", code: "PH", lang: "en", langName: "English", utcOffset: 8, nearby: ["indonesia", "vietnam", "australia"] },
  { slug: "indonesia", name: "Indonesia", people: "Indonesian", code: "ID", lang: "id", langName: "Indonesian", utcOffset: 7, nearby: ["malaysia", "philippines", "australia"] },
  { slug: "malaysia", name: "Malaysia", people: "Malaysian", code: "MY", lang: "ms", langName: "Malay", utcOffset: 8, nearby: ["indonesia", "singapore", "thailand"] },
  { slug: "singapore", name: "Singapore", people: "Singaporean", code: "SG", lang: "en", langName: "English", utcOffset: 8, nearby: ["malaysia", "indonesia", "thailand"] },
  { slug: "thailand", name: "Thailand", people: "Thai", code: "TH", lang: "th", langName: "Thai", utcOffset: 7, nearby: ["vietnam", "malaysia", "singapore"] },
  { slug: "vietnam", name: "Vietnam", people: "Vietnamese", code: "VN", lang: "vi", langName: "Vietnamese", utcOffset: 7, nearby: ["thailand", "philippines", "china"] },
  { slug: "japan", name: "Japan", people: "Japanese", code: "JP", lang: "ja", langName: "Japanese", utcOffset: 9, nearby: ["south-korea", "china", "taiwan"] },
  { slug: "south-korea", name: "South Korea", people: "Korean", code: "KR", lang: "ko", langName: "Korean", utcOffset: 9, nearby: ["japan", "china", "taiwan"] },
  { slug: "china", name: "China", people: "Chinese", code: "CN", lang: "zh", langName: "Mandarin", utcOffset: 8, nearby: ["japan", "south-korea", "taiwan"] },
  { slug: "taiwan", name: "Taiwan", people: "Taiwanese", code: "TW", lang: "zh", langName: "Mandarin", utcOffset: 8, nearby: ["japan", "china", "south-korea"] },
  { slug: "germany", name: "Germany", people: "German", code: "DE", lang: "de", langName: "German", utcOffset: 1, nearby: ["austria", "switzerland", "netherlands"] },
  { slug: "austria", name: "Austria", people: "Austrian", code: "AT", lang: "de", langName: "German", utcOffset: 1, nearby: ["germany", "switzerland", "italy"] },
  { slug: "switzerland", name: "Switzerland", people: "Swiss", code: "CH", lang: "de", langName: "German", utcOffset: 1, nearby: ["germany", "france", "italy"] },
  { slug: "france", name: "France", people: "French", code: "FR", lang: "fr", langName: "French", utcOffset: 1, nearby: ["belgium", "spain", "germany"] },
  { slug: "belgium", name: "Belgium", people: "Belgian", code: "BE", lang: "fr", langName: "French", utcOffset: 1, nearby: ["netherlands", "france", "germany"] },
  { slug: "netherlands", name: "the Netherlands", people: "Dutch", code: "NL", lang: "nl", langName: "Dutch", utcOffset: 1, nearby: ["belgium", "germany", "united-kingdom"] },
  { slug: "spain", name: "Spain", people: "Spanish", code: "ES", lang: "es", langName: "Spanish", utcOffset: 1, nearby: ["portugal", "france", "italy"] },
  { slug: "portugal", name: "Portugal", people: "Portuguese", code: "PT", lang: "pt", langName: "Portuguese", utcOffset: 0, nearby: ["spain", "brazil", "france"] },
  { slug: "italy", name: "Italy", people: "Italian", code: "IT", lang: "it", langName: "Italian", utcOffset: 1, nearby: ["spain", "france", "greece"] },
  { slug: "greece", name: "Greece", people: "Greek", code: "GR", lang: "el", langName: "Greek", utcOffset: 2, nearby: ["italy", "turkey", "romania"] },
  { slug: "poland", name: "Poland", people: "Polish", code: "PL", lang: "pl", langName: "Polish", utcOffset: 1, nearby: ["germany", "czechia", "ukraine"] },
  { slug: "czechia", name: "Czechia", people: "Czech", code: "CZ", lang: "cs", langName: "Czech", utcOffset: 1, nearby: ["poland", "germany", "austria"] },
  { slug: "romania", name: "Romania", people: "Romanian", code: "RO", lang: "ro", langName: "Romanian", utcOffset: 2, nearby: ["greece", "poland", "turkey"] },
  { slug: "ukraine", name: "Ukraine", people: "Ukrainian", code: "UA", lang: "uk", langName: "Ukrainian", utcOffset: 2, nearby: ["poland", "romania", "turkey"] },
  { slug: "sweden", name: "Sweden", people: "Swedish", code: "SE", lang: "sv", langName: "Swedish", utcOffset: 1, nearby: ["norway", "denmark", "finland"] },
  { slug: "norway", name: "Norway", people: "Norwegian", code: "NO", lang: "no", langName: "Norwegian", utcOffset: 1, nearby: ["sweden", "denmark", "finland"] },
  { slug: "denmark", name: "Denmark", people: "Danish", code: "DK", lang: "da", langName: "Danish", utcOffset: 1, nearby: ["sweden", "norway", "germany"] },
  { slug: "finland", name: "Finland", people: "Finnish", code: "FI", lang: "fi", langName: "Finnish", utcOffset: 2, nearby: ["sweden", "norway", "estonia"] },
  { slug: "estonia", name: "Estonia", people: "Estonian", code: "EE", lang: "et", langName: "Estonian", utcOffset: 2, nearby: ["finland", "sweden", "poland"] },
  { slug: "turkey", name: "Turkey", people: "Turkish", code: "TR", lang: "tr", langName: "Turkish", utcOffset: 3, nearby: ["greece", "romania", "egypt"] },
  { slug: "brazil", name: "Brazil", people: "Brazilian", code: "BR", lang: "pt", langName: "Portuguese", utcOffset: -3, nearby: ["argentina", "portugal", "colombia"] },
  { slug: "argentina", name: "Argentina", people: "Argentinian", code: "AR", lang: "es", langName: "Spanish", utcOffset: -3, nearby: ["brazil", "chile", "uruguay"] },
  { slug: "chile", name: "Chile", people: "Chilean", code: "CL", lang: "es", langName: "Spanish", utcOffset: -4, nearby: ["argentina", "peru", "brazil"] },
  { slug: "peru", name: "Peru", people: "Peruvian", code: "PE", lang: "es", langName: "Spanish", utcOffset: -5, nearby: ["chile", "colombia", "argentina"] },
  { slug: "colombia", name: "Colombia", people: "Colombian", code: "CO", lang: "es", langName: "Spanish", utcOffset: -5, nearby: ["peru", "mexico", "brazil"] },
  { slug: "uruguay", name: "Uruguay", people: "Uruguayan", code: "UY", lang: "es", langName: "Spanish", utcOffset: -3, nearby: ["argentina", "brazil", "chile"] },
  { slug: "mexico", name: "Mexico", people: "Mexican", code: "MX", lang: "es", langName: "Spanish", utcOffset: -6, nearby: ["united-states", "colombia", "spain"] },
  { slug: "egypt", name: "Egypt", people: "Egyptian", code: "EG", lang: "ar", langName: "Arabic", utcOffset: 2, nearby: ["turkey", "morocco", "saudi-arabia"] },
  { slug: "morocco", name: "Morocco", people: "Moroccan", code: "MA", lang: "ar", langName: "Arabic", utcOffset: 1, nearby: ["spain", "egypt", "france"] },
  { slug: "saudi-arabia", name: "Saudi Arabia", people: "Saudi", code: "SA", lang: "ar", langName: "Arabic", utcOffset: 3, nearby: ["egypt", "uae", "turkey"] },
  { slug: "uae", name: "the UAE", people: "Emirati", code: "AE", lang: "ar", langName: "Arabic", utcOffset: 4, nearby: ["saudi-arabia", "india", "egypt"] },
  { slug: "south-africa", name: "South Africa", people: "South African", code: "ZA", lang: "en", langName: "English", utcOffset: 2, nearby: ["nigeria", "kenya", "united-kingdom"] },
  { slug: "nigeria", name: "Nigeria", people: "Nigerian", code: "NG", lang: "en", langName: "English", utcOffset: 1, nearby: ["ghana", "kenya", "south-africa"] },
  { slug: "ghana", name: "Ghana", people: "Ghanaian", code: "GH", lang: "en", langName: "English", utcOffset: 0, nearby: ["nigeria", "kenya", "south-africa"] },
  { slug: "kenya", name: "Kenya", people: "Kenyan", code: "KE", lang: "en", langName: "English", utcOffset: 3, nearby: ["nigeria", "south-africa", "egypt"] },
];

const bySlug = new Map(COUNTRIES.map((c) => [c.slug, c]));
export const getCountry = (slug: string) => bySlug.get(slug);

/**
 * Rough local-time window where a country's users are most likely online.
 * Concrete and genuinely useful, which is what separates a page worth ranking
 * from a templated stub.
 */
export function peakHours(country: Country): string {
  const local = (h: number) => {
    const v = (((h + country.utcOffset) % 24) + 24) % 24;
    const hour = Math.floor(v);
    const suffix = hour >= 12 ? "pm" : "am";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}${suffix}`;
  };
  return `${local(19 - country.utcOffset)}–${local(24 - country.utcOffset)} local time`;
}
