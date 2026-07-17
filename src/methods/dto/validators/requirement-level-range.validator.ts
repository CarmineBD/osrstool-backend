import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { MAX_COMBAT_LEVEL, MAX_SKILL_LEVEL, MIN_COMBAT_LEVEL } from '../validation.constants';

export function IsValidRequirementLevel(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isValidRequirementLevel',
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (!Number.isInteger(value)) return false;
          const numericValue = value as number;

          const skill = (args.object as { skill?: unknown }).skill;
          if (skill === 'combat') {
            return numericValue >= MIN_COMBAT_LEVEL && numericValue <= MAX_COMBAT_LEVEL;
          }

          return numericValue >= 1 && numericValue <= MAX_SKILL_LEVEL;
        },
        defaultMessage(args: ValidationArguments): string {
          const skill = (args.object as { skill?: unknown }).skill;
          if (skill === 'combat') {
            return `${args.property} must be between ${MIN_COMBAT_LEVEL} and ${MAX_COMBAT_LEVEL} for combat requirements`;
          }

          return `${args.property} must be between 1 and ${MAX_SKILL_LEVEL}`;
        },
      },
    });
  };
}
