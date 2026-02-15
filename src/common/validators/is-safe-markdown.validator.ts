import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const UNSAFE_MARKDOWN_PATTERNS = [
  /<script\b/i,
  /\bon\w+\s*=/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /vbscript\s*:/i,
];

const hasUnsafeMarkdownPattern = (value: string): boolean =>
  UNSAFE_MARKDOWN_PATTERNS.some((pattern) => pattern.test(value));

export function IsSafeMarkdown(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isSafeMarkdown',
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value == null) {
            return true;
          }
          if (typeof value !== 'string') {
            return false;
          }
          return !hasUnsafeMarkdownPattern(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not contain unsafe markdown/html content`;
        },
      },
    });
  };
}
