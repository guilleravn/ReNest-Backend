// Prisma's `contains` sends the text to ILIKE as is, so `%` and `_` would act
// as wildcards. Backslash is Postgres' default LIKE escape character.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
