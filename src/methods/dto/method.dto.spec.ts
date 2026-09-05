import { IconSource } from '../../icons/icon-source.enum';
import { ActionType } from '../action-type.enum';
import { CalculationMode } from '../calculation-mode.enum';
import { MethodDto } from './method.dto';

describe('MethodDto', () => {
  it('omits zero-valued fixed inputs, outputs and hourly experience', () => {
    const dto = MethodDto.fromEntity({
      id: 'method-1',
      name: 'Test method',
      slug: 'test-method',
      iconSource: IconSource.ITEM,
      enabled: true,
      variants: [
        {
          id: 'variant-1',
          slug: 'test-variant',
          iconSource: IconSource.ITEM,
          label: 'Test variant',
          description: null,
          actionsPerHour: 100,
          actionType: ActionType.ITEMS,
          clickIntensity: 10,
          afkiness: 0,
          riskLevel: 'none',
          requirements: null,
          xpHour: [
            { skill: 'cooking', experience: 100 },
            { skill: 'fishing', experience: 0 },
          ],
          ioItems: [
            { itemId: 100, quantity: 1, type: 'input' },
            { itemId: 101, quantity: 0, type: 'input' },
            { itemId: 200, quantity: 2, type: 'output' },
            { itemId: 201, quantity: 0, type: 'output' },
          ],
          recommendations: null,
          wilderness: false,
          calculationMode: CalculationMode.FIXED,
        },
      ],
    });

    expect(dto.variants[0]).toMatchObject({
      xpHour: [{ skill: 'cooking', experience: 100 }],
      inputs: [{ id: 100, quantity: 1 }],
      outputs: [{ id: 200, quantity: 2 }],
    });
  });
});
