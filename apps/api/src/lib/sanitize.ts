/**
 * Strip HTML tags from a string to prevent XSS in stored content.
 * This is a defense-in-depth measure — output encoding should also be applied.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}
