import { randomUUID } from 'crypto';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  let slug = value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  slug = slug.toLowerCase();
  slug = slug.replace(/\(/g, '-').replace(/\)/g, '-').replace(/'/g, '');
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/--+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  return slug;
}

export function fallbackSlug(prefix: string): string {
  const id = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}-${id}`;
}
