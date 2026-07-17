import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const ENTRY_BUCKET_KEYS = [
  'items',
  'levels',
  'quests',
  'achievement_diaries',
  'miniquests',
  'minigames',
  'events',
  'meta',
] as const;

function countBucketEntries(value: unknown): number {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 1;
}

export function HasMaxRequirementEntries(
  maxEntries: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'hasMaxRequirementEntries',
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [maxEntries],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value == null || typeof value !== 'object') return true;
          const [max] = args.constraints as [number];
          const entryTotal = ENTRY_BUCKET_KEYS.reduce((total, bucketKey) => {
            const bucketValue = (value as Record<string, unknown>)[bucketKey];
            return total + countBucketEntries(bucketValue);
          }, 0);

          return entryTotal <= max;
        },
        defaultMessage(args: ValidationArguments): string {
          const [max] = args.constraints as [number];
          return `${args.property} must contain at most ${max} total entries`;
        },
      },
    });
  };
}
