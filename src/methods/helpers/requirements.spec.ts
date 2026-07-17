import { MethodDto } from '../dto/method.dto';
import { computeMissingRequirements, filterMethodsByUserStats } from './requirements';

describe('requirements helpers', () => {
  const userInfo = {
    levels: {
      Attack: 75,
      Strength: 75,
      Defence: 75,
      Magic: 80,
    },
    quests: {},
    achievement_diaries: {},
  };

  it('matches lowercase level requirements against user stats', () => {
    const methods = [
      new MethodDto('m1', 'Magic method', 'magic-method', null, '', 'skilling', true, [
        {
          id: 'v1',
          slug: 'v1',
          label: 'Lowercase requirement',
          inputs: [],
          outputs: [],
          requirements: {
            levels: [{ skill: 'magic', level: 77 }],
          },
        },
      ]),
    ];

    const filtered = filterMethodsByUserStats(methods, userInfo);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].variants).toHaveLength(1);
  });

  it('expands lowercase combat requirements into missing melee stats', () => {
    const missing = computeMissingRequirements(
      {
        levels: [{ skill: 'combat', level: 90 }],
      },
      userInfo,
    );

    expect(missing).toEqual({
      levels: [
        { skill: 'strength', level: 90 },
        { skill: 'defence', level: 90 },
        { skill: 'attack', level: 90 },
      ],
    });
  });
});
