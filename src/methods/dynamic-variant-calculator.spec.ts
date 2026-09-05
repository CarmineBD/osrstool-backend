import { calculateDynamicVariant } from './dynamic-variant-calculator';
import { ActionCondition } from './action-condition.enum';

describe('calculateDynamicVariant', () => {
  it('derives the hourly fields and dynamic detail from action and cycle data', () => {
    const result = calculateDynamicVariant(
      {
        id: 'action-1',
        name: 'Cook karambwan',
        rollIntervalTicks: 4,
        inputs: [{ itemId: 100, quantity: 0.5 }],
        outputs: [{ itemId: 200, quantity: 1.25 }],
        skillXp: [{ skillId: 1, skill: { key: 'cooking' }, experience: 10 }],
      },
      [
        {
          name: 'Wait for bank',
          stepOrderPosition: 1,
          durationTicks: 2,
          clicksMade: 1,
          isAfk: true,
          actionsMade: null,
        },
        {
          name: 'Cook karambwan',
          stepOrderPosition: 2,
          durationTicks: null,
          clicksMade: 2,
          isAfk: false,
          actionsMade: 3,
        },
      ],
    );

    expect(result).toMatchObject({
      actionsPerHour: 1285,
      xpHour: [{ skill: 'cooking', experience: 12857 }],
      inputs: [{ id: 100, quantity: 642.86 }],
      outputs: [{ id: 200, quantity: 1607.14 }],
      clickIntensity: 1285,
      afkiness: 14,
      cycleTotalDurationTicks: 14,
      cyclesPerHour: 428.6,
      action: {
        id: 'action-1',
        name: 'Cook karambwan',
        rollIntervalTicks: 4,
      },
    });
    expect(result.cycleSteps).toEqual([
      {
        name: 'Wait for bank',
        stepOrderPosition: 1,
        durationTicks: 2,
        clicksMade: 1,
        isAfk: true,
        actionsMade: null,
      },
      {
        name: 'Cook karambwan',
        stepOrderPosition: 2,
        durationTicks: 12,
        clicksMade: 2,
        isAfk: false,
        actionsMade: 3,
      },
    ]);
  });

  it('includes an action step in the AFK calculation when the step is marked AFK', () => {
    const result = calculateDynamicVariant(
      {
        id: 'action-1',
        name: 'Cook karambwan',
        rollIntervalTicks: 5,
      },
      [
        {
          name: 'Cook karambwan',
          stepOrderPosition: 1,
          durationTicks: null,
          clicksMade: 2,
          isAfk: true,
          actionsMade: 1,
        },
      ],
    );

    expect(result).toMatchObject({
      clickIntensity: 2400,
      afkiness: 100,
      cycleTotalDurationTicks: 5,
      cyclesPerHour: 1200,
    });
  });

  it('uses the success chance to return expected conditional inputs, outputs and experience', () => {
    const result = calculateDynamicVariant(
      {
        id: 'action-1',
        name: 'Open a chest',
        rollIntervalTicks: 6,
        baseSuccessChance: 0.75,
        inputs: [{ itemId: 100, quantity: 2, condition: ActionCondition.ALWAYS }],
        outputs: [
          { itemId: 200, quantity: 4, condition: ActionCondition.SUCCESS },
          { itemId: 200, quantity: 1, condition: ActionCondition.FAILURE },
        ],
        skillXp: [
          {
            skillId: 1,
            skill: { key: 'thieving' },
            experience: 10,
            condition: ActionCondition.SUCCESS,
          },
          {
            skillId: 1,
            skill: { key: 'thieving' },
            experience: 2,
            condition: ActionCondition.FAILURE,
          },
        ],
      },
      [
        {
          name: 'Open a chest',
          stepOrderPosition: 1,
          durationTicks: null,
          clicksMade: 1,
          isAfk: false,
          actionsMade: 1,
        },
      ],
    );

    expect(result).toMatchObject({
      actionsPerHour: 1000,
      inputs: [{ id: 100, quantity: 2000 }],
      outputs: [{ id: 200, quantity: 3250 }],
      xpHour: [{ skill: 'thieving', experience: 8000 }],
      action: {
        baseSuccessChance: 0.75,
        inputs: [{ id: 100, quantity: 2, condition: ActionCondition.ALWAYS }],
        outputs: [
          { id: 200, quantity: 4, condition: ActionCondition.SUCCESS },
          { id: 200, quantity: 1, condition: ActionCondition.FAILURE },
        ],
        xpGained: [
          {
            skillId: 1,
            skill: 'thieving',
            experience: 10,
            condition: ActionCondition.SUCCESS,
          },
          {
            skillId: 1,
            skill: 'thieving',
            experience: 2,
            condition: ActionCondition.FAILURE,
          },
        ],
      },
    });
  });

  it('omits zero quantities and experience from the resolved dynamic response', () => {
    const result = calculateDynamicVariant(
      {
        id: 'action-1',
        name: 'Cook karambwan',
        rollIntervalTicks: 6,
        inputs: [
          { itemId: 100, quantity: 2 },
          { itemId: 101, quantity: 0 },
        ],
        outputs: [
          { itemId: 200, quantity: 2 },
          { itemId: 201, quantity: 0 },
        ],
        skillXp: [{ skillId: 1, skill: { key: 'cooking' }, experience: 0 }],
      },
      [
        {
          name: 'Cook karambwan',
          stepOrderPosition: 1,
          durationTicks: null,
          clicksMade: 1,
          isAfk: false,
          actionsMade: 1,
        },
      ],
    );

    expect(result.inputs).toEqual([{ id: 100, quantity: 2000 }]);
    expect(result.outputs).toEqual([{ id: 200, quantity: 2000 }]);
    expect(result.xpHour).toEqual([]);
    expect(result.action).toMatchObject({
      inputs: [{ id: 100, quantity: 2, condition: ActionCondition.ALWAYS }],
      outputs: [{ id: 200, quantity: 2, condition: ActionCondition.ALWAYS }],
      xpGained: [],
    });
  });
});
