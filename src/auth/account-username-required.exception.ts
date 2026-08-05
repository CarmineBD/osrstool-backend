import { ForbiddenException } from '@nestjs/common';

export const ACCOUNT_USERNAME_REQUIRED_ERROR_CODE = 'ACCOUNT_USERNAME_REQUIRED';
export const ACCOUNT_USERNAME_REQUIRED_MESSAGE =
  'You must set an account username before using this service.';

export function createAccountUsernameRequiredException(): ForbiddenException {
  return new ForbiddenException({
    code: ACCOUNT_USERNAME_REQUIRED_ERROR_CODE,
    message: ACCOUNT_USERNAME_REQUIRED_MESSAGE,
  });
}
