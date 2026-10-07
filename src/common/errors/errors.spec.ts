import {
  ConflictException,
  HttpStatus,
  NotFoundException,
  type ValidationError,
} from '@nestjs/common';
import { AppException } from './app.exception.js';
import { ErrorCode } from './error-code.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { flattenValidationErrors } from './validation.js';

describe('flattenValidationErrors', () => {
  it('builds dotted paths with array indexes', () => {
    const errors: ValidationError[] = [
      { property: 'title', constraints: { minLength: 'title is too short' } },
      {
        property: 'pickupOptions',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'weekdays',
                constraints: { arrayMinSize: 'weekdays must not be empty' },
              },
            ],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'title', message: 'title is too short' },
      {
        field: 'pickupOptions[0].weekdays',
        message: 'weekdays must not be empty',
      },
    ]);
  });
});

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('keeps the code and details of an AppException', () => {
    const exception = new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.LISTING_NOT_AVAILABLE,
      'This listing was already reserved.',
    );

    expect(filter.toBody(exception)).toEqual({
      statusCode: 409,
      code: 'LISTING_NOT_AVAILABLE',
      message: 'This listing was already reserved.',
      details: null,
    });
  });

  it('maps plain Nest exceptions to a generic code by status', () => {
    expect(filter.toBody(new NotFoundException('Nope')).code).toBe('NOT_FOUND');
    expect(filter.toBody(new ConflictException()).code).toBe('CONFLICT');
  });

  it('hides unknown errors behind a 500', () => {
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

    expect(filter.toBody(new Error('db password is hunter2'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      details: null,
    });
  });
});
