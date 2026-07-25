import en from '@/locales/en.json';

const locales: Record<string, Record<string, string>> = { en };

export function t(key: string, locale = 'en'): string {
  const localeData = locales[locale] ?? locales['en'];
  return localeData[key] ?? key;
}
