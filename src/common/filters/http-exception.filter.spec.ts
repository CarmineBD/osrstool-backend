import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common/interfaces';
import { QueryFailedError } from 'typeorm';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const createHost = () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = { status, json };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    return { host, response };
  };

  it('returns validation details for HttpException responses', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new BadRequestException(['name must be a string', 'variants should not be empty']),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      error: {
        code: HttpStatus.BAD_REQUEST,
        message: 'name must be a string; variants should not be empty',
        details: ['name must be a string', 'variants should not be empty'],
      },
    });
  });

  it('preserves custom error codes and details from structured HttpException responses', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new BadRequestException({
        code: 'F2P_VARIANT_CONTAINS_MEMBERS_ITEMS',
        message: 'Free-to-play variants cannot include members-only items.',
        details: {
          variants: [
            {
              variantTitle: 'Variant A',
              membersOnlyItems: [{ id: 100, name: 'Members item' }],
            },
          ],
        },
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      error: {
        code: 'F2P_VARIANT_CONTAINS_MEMBERS_ITEMS',
        message: 'Free-to-play variants cannot include members-only items.',
        details: {
          variants: [
            {
              variantTitle: 'Variant A',
              membersOnlyItems: [{ id: 100, name: 'Members item' }],
            },
          ],
        },
      },
    });
  });

  it('translates oversized body parser errors into 413 responses', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      {
        type: 'entity.too.large',
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        length: 114866,
        limit: 102400,
      },
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large. Received 114866 bytes, limit is 102400 bytes.',
        details: {
          receivedBytes: 114866,
          limitBytes: 102400,
        },
      },
    });
  });

  it('translates query failures into user-facing database errors', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = createHost();
    const driverError = Object.assign(new Error('insert failed'), {
      code: '23503',
      detail: 'Key (item_id)=(999999) is not present in table "items".',
      constraint: 'variant_io_items_item_id_fkey',
    });
    const error = new QueryFailedError('insert into variant_io_items ...', [], driverError);

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      error: {
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Key (item_id)=(999999) is not present in table "items".',
        details: undefined,
      },
    });
  });
});
