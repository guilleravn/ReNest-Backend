import {
  HttpStatus,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { AppException, type FieldError } from './app.exception.js';
import { ErrorCode } from './error-code.js';

// Turns class-validator's nested tree into flat paths like
// `pickupOptions[0].weekdays`, the shape the contract puts in `details`.
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const path = !parentPath
      ? error.property
      : /^\d+$/.test(error.property)
        ? `${parentPath}[${error.property}]`
        : `${parentPath}.${error.property}`;

    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field: path,
      message,
    }));
    return [...own, ...flattenValidationErrors(error.children ?? [], path)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed.',
        flattenValidationErrors(errors),
      ),
  });
}
