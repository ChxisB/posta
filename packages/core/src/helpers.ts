/**
 * Strip display name from an email address.
 * "John Doe <john@example.com>" → "john@example.com"
 * Port of Posta::Helpers.strip_name_from_address
 */
export function stripNameFromAddress(address: string | null): string | null {
  if (!address) return null;
  return address
    .replace(/.*</, '')
    .replace(/>.*/, '')
    .replace(/\(.+?\)/g, '')
    .trim();
}
