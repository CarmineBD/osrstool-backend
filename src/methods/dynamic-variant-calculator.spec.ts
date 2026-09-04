import { calculateDynamicVariant } from './dynamic-variant-calculator';

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
});
