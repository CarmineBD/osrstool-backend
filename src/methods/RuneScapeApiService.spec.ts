import { RuneScapeApiService } from './RuneScapeApiService';
import { SKILL_KEY_VALUES } from './dto/skill.constants';

describe('RuneScapeApiService', () => {
  const fetchMock = jest.spyOn(global, 'fetch');

  afterEach(() => {
    fetchMock.mockReset();
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  it('returns exact Hiscores experience together with Wiki player information', async () => {
    const hiscores = [
      '0,2277,200000000',
      ...SKILL_KEY_VALUES.map((_, index) => `0,${index + 1},${(index + 1) * 1000}`),
    ].join('\n');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            levels: { Cooking: 8 },
            quests: { "Cook's Assistant": 2 },
            achievement_diaries: {},
          }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(hiscores) } as Response);

    const service = new RuneScapeApiService();

    const player = await service.fetchUserInfo('zezima');

    expect(player.levels).toEqual({ Cooking: 8 });
    expect(player.experience.attack).toBe(1000);
    expect(player.experience.cooking).toBe(8000);
    expect(player.quests).toEqual({ "Cook's Assistant": 2 });
    expect(player.achievement_diaries).toEqual({});
  });
});
