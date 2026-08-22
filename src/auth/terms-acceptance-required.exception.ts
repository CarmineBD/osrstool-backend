import { ForbiddenException } from '@nestjs/common';

export const TERMS_ACCEPTANCE_REQUIRED_ERROR_CODE = 'TERMS_ACCEPTANCE_REQUIRED';
export const TERMS_ACCEPTANCE_REQUIRED_MESSAGE =
  'You must accept the current Terms of Service before using this service.';

export function createTermsAcceptanceRequiredException(currentVersion: string): ForbiddenException {
  return new ForbiddenException({
    code: TERMS_ACCEPTANCE_REQUIRED_ERROR_CODE,
    message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
    currentVersion,
  });
}
