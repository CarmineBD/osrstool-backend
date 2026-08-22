import { BadRequestException } from '@nestjs/common';
import { IconSource } from './icon-source.enum';
import { IconsController } from './icons.controller';
import type { IconsService } from './icons.service';

describe('IconsController', () => {
  it('searches every category when type is omitted', async () => {
    const iconsService = { search: jest.fn().mockResolvedValue([]) };
    const controller = new IconsController(iconsService as unknown as IconsService);

    await expect(controller.search('magic', undefined)).resolves.toEqual({ data: [] });
    expect(iconsService.search).toHaveBeenCalledWith('magic', undefined, false);
  });

  it('accepts items and enables untradeables for item searches', async () => {
    const iconsService = {
      search: jest.fn().mockResolvedValue([{ iconSource: IconSource.ITEM }]),
    };
    const controller = new IconsController(iconsService as unknown as IconsService);

    await expect(controller.search('whip', undefined, 'items', 'true')).resolves.toEqual({
      data: [{ iconSource: IconSource.ITEM }],
    });
    expect(iconsService.search).toHaveBeenCalledWith('whip', 'item', true);
  });

  it('rejects multiple or invalid types', async () => {
    const controller = new IconsController({ search: jest.fn() } as unknown as IconsService);

    await expect(controller.search('magic', undefined, ['spell', 'skill'])).rejects.toEqual(
      new BadRequestException('type must contain exactly one option'),
    );
    await expect(controller.search('magic', undefined, 'spells')).rejects.toEqual(
      new BadRequestException(
        'type must be one of: all, items, item, interface, spell, prayer, skill, other',
      ),
    );
  });

  it('rejects showUntradeables outside all and items searches', async () => {
    const controller = new IconsController({ search: jest.fn() } as unknown as IconsService);

    await expect(controller.search('wind', undefined, 'spell', 'true')).rejects.toEqual(
      new BadRequestException('showUntradeables is only available when type is all or items'),
    );
  });

  it('resolves game icons by ids without using the search contract', async () => {
    const iconsService = { findByIds: jest.fn().mockResolvedValue([]) };
    const controller = new IconsController(iconsService as unknown as IconsService);

    await expect(controller.search(undefined, '4,7')).resolves.toEqual({ data: [] });
    expect(iconsService.findByIds).toHaveBeenCalledWith([4, 7]);
  });
});
