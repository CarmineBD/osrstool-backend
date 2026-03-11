import {
  cleanText,
  getIndexNameIgnoreReason,
  isApiOrCacheOnlyItemPage,
  isObsoleteItemPage,
  normalizeIndexItemName,
  parseBooleanNullable,
  parseFirstListValue,
  parseItemIdInteger,
  parseQuestItemNullable,
  parseIntegerNullable,
  parseItemDetailPage,
  parseItemIndexPage,
  parseNumberFromCoins,
  parseWeightKg,
} from './items-wiki-sync.parsers';

describe('items-wiki-sync.parsers', () => {
  it('parses utility values', () => {
    expect(cleanText('  Dragon   scimitar \n')).toBe('Dragon scimitar');
    expect(parseBooleanNullable('Yes')).toBe(true);
    expect(parseBooleanNullable('No')).toBe(false);
    expect(parseBooleanNullable('-')).toBeNull();
    expect(parseQuestItemNullable('No')).toBe(false);
    expect(parseQuestItemNullable("Cook's Assistant")).toBe(true);
    expect(parseQuestItemNullable('-')).toBeNull();
    expect(parseNumberFromCoins('2,000,000 coins')).toBe(2000000);
    expect(parseNumberFromCoins('-')).toBeNull();
    expect(parseWeightKg('7.257 kg')).toBe(7.257);
    expect(parseWeightKg('-')).toBeNull();
    expect(parseIntegerNullable('1,234')).toBe(1234);
    expect(parseIntegerNullable('-')).toBeNull();
    expect(parseFirstListValue('3038, 3036, 3034')).toBe('3038');
    expect(parseFirstListValue('29990,29992')).toBe('29990');
    expect(parseItemIdInteger('3038, 3036, 3034')).toBe(3038);
    expect(parseItemIdInteger('29990,29992')).toBe(29990);
    expect(parseItemIdInteger('2,000')).toBe(2000);
  });

  it('evaluates index-name ignore rules', () => {
    expect(getIndexNameIgnoreReason('Abyssal whip (historical)')).toContain('(historical)');
    expect(getIndexNameIgnoreReason('Rune pouch (Last Man Standing)')).toContain(
      '(last man standing)',
    );
    expect(getIndexNameIgnoreReason('Clue scroll - hard')).toBe('contains "clue scroll" and "-"');
    expect(getIndexNameIgnoreReason('Dragon scimitar')).toBeNull();
  });

  it('detects obsolete item pages', () => {
    expect(
      isObsoleteItemPage('<table class="messagebox obsolete"><tr><td>x</td></tr></table>'),
    ).toBe(true);
    expect(isObsoleteItemPage('<table class="messagebox"><tr><td>x</td></tr></table>')).toBe(false);
  });

  it('detects api/cache-only item pages', () => {
    expect(
      isApiOrCacheOnlyItemPage(
        '<table class="messagebox info"><tr><td>This article contains information about a subject known only to exist in the game APIs or cache.</td></tr></table>',
      ),
    ).toBe(true);
    expect(
      isApiOrCacheOnlyItemPage(
        '<table class="messagebox info"><tr><td>Unrelated information.</td></tr></table>',
      ),
    ).toBe(false);
  });

  it('normalizes item names from index rows', () => {
    expect(normalizeIndexItemName('Agility potion#(1)')).toBe('Agility potion (1)');
    expect(normalizeIndexItemName('Dragon scimitar')).toBe('Dragon scimitar');
  });

  it('parses item index rows', () => {
    const html = `
      <table class="sortable wikitable">
        <tr><th>Item</th><th>Item IDs</th></tr>
        <tr>
          <td><a href="/w/Dragon_scimitar">Dragon scimitar</a></td>
          <td>4587</td>
        </tr>
        <tr>
          <td><a href="/w/Invalid">Invalid</a></td>
          <td>-</td>
        </tr>
      </table>
    `;

    const rows = parseItemIndexPage(html);

    expect(rows).toEqual([
      {
        name: 'Dragon scimitar',
        itemIdText: '4587',
        detailUrl: 'https://oldschool.runescape.wiki/w/Dragon_scimitar',
      },
    ]);
  });

  it('uses the first id and first id url for multi-id index rows', () => {
    const html = `
      <table class="sortable wikitable">
        <tr><th>Item</th><th>Item IDs</th></tr>
        <tr>
          <td><a href="/w/Agility_potion#(1)">Agility potion#(1)</a></td>
          <td>
            <a href="/Special:Lookup?type=item&id=3038">3038</a>,
            <a href="/Special:Lookup?type=item&id=3036">3036</a>,
            <a href="/Special:Lookup?type=item&id=3034">3034</a>
          </td>
        </tr>
      </table>
    `;

    const rows = parseItemIndexPage(html);

    expect(rows).toEqual([
      {
        name: 'Agility potion (1)',
        itemIdText: '3038',
        detailUrl: 'https://oldschool.runescape.wiki/Special:Lookup?type=item&id=3038',
      },
    ]);
  });

  it('uses first id when index row ids are comma-separated without spaces', () => {
    const html = `
      <table class="sortable wikitable">
        <tr><th>Item</th><th>Item IDs</th></tr>
        <tr>
          <td><a href="/w/Alchemist%27s_amulet#Charged">Alchemist's amulet</a></td>
          <td>
            <a href="/Special:Lookup?type=item&id=29990">29990</a>,<a href="/Special:Lookup?type=item&id=29992">29992</a>
          </td>
        </tr>
      </table>
    `;

    const rows = parseItemIndexPage(html);

    expect(rows).toEqual([
      {
        name: "Alchemist's amulet",
        itemIdText: '29990',
        detailUrl: 'https://oldschool.runescape.wiki/Special:Lookup?type=item&id=29990',
      },
    ]);
  });

  it('parses a single item infobox', () => {
    const html = `
      <table class="infobox infobox-item">
        <tbody>
          <tr><th class="infobox-header" data-attr-param="name">Dragon scimitar</th></tr>
          <tr><td data-attr-param="image"><img src="/images/Dragon_scimitar.png?abc123" /></td></tr>
          <tr><th>Members</th><td data-attr-param="members">Yes</td></tr>
          <tr><th>Quest item</th><td data-attr-param="quest">No</td></tr>
          <tr><th>Tradeable</th><td data-attr-param="tradeable">Yes</td></tr>
          <tr><th>Equipable</th><td data-attr-param="equipable">Yes</td></tr>
          <tr><th>Stackable</th><td data-attr-param="stackable">No</td></tr>
          <tr><th>Noteable</th><td data-attr-param="noteable">Yes</td></tr>
          <tr><th>Examine</th><td data-attr-param="examine">A vicious, curved sword.</td></tr>
          <tr><th>Value</th><td data-attr-param="value">100,000 coins</td></tr>
          <tr><th>High alch</th><td data-attr-param="high">60,000 coins</td></tr>
          <tr><th>Low alch</th><td data-attr-param="low">40,000 coins</td></tr>
          <tr><th>Weight</th><td data-attr-param="weight">1.814 kg</td></tr>
          <tr><th>Buy limit</th><td data-attr-param="buylimit">70</td></tr>
          <tr class="advanced-data"><th>Item ID</th><td data-attr-param="id">4587, 9999</td></tr>
        </tbody>
      </table>
    `;

    const items = parseItemDetailPage(html);

    expect(items).toEqual([
      {
        id: 4587,
        name: 'Dragon scimitar',
        iconPath: 'Dragon_scimitar.png',
        examine: 'A vicious, curved sword.',
        value: 100000,
        highAlch: 60000,
        lowAlch: 40000,
        buyLimit: 70,
        questItem: false,
        equipable: true,
        noteable: true,
        stackable: false,
        weight: 1.814,
        tradeable: true,
        members: true,
      },
    ]);
  });

  it('marks quest item as true when quest field contains a quest name', () => {
    const html = `
      <table class="infobox infobox-item">
        <tbody>
          <tr><th class="infobox-header" data-attr-param="name">Some quest item</th></tr>
          <tr><td data-attr-param="image"><img src="/images/Some_quest_item.png?abc123" /></td></tr>
          <tr><th>Quest item</th><td data-attr-param="quest">Cook's Assistant</td></tr>
          <tr class="advanced-data"><th>Item ID</th><td data-attr-param="id">999999</td></tr>
        </tbody>
      </table>
    `;

    const items = parseItemDetailPage(html);

    expect(items).toEqual([
      expect.objectContaining({
        id: 999999,
        name: 'Some quest item',
        questItem: true,
      }),
    ]);
  });

  it('adds tab suffix when all variant names are identical', () => {
    const html = `
      <table class="infobox infobox-switch infobox-item">
        <caption>
          <div class="infobox-buttons">
            <span class="button" data-switch-index="1">Uncharged</span>
            <span class="button" data-switch-index="2">Charged</span>
          </div>
        </caption>
        <tbody>
          <tr><th class="infobox-header" data-attr-param="name">Dragonfire shield</th></tr>
          <tr><td data-attr-param="image"><img src="/images/Dragonfire_shield.png?abc123" /></td></tr>
          <tr class="advanced-data"><th>Item ID</th><td data-attr-param="id">11284</td></tr>
        </tbody>
      </table>
      <div class="infobox-switch-resources infobox-resources-Infobox_Item hidden">
        <span data-attr-param="name">
          <span data-attr-index="0">Dragonfire shield</span>
        </span>
        <span data-attr-param="id">
          <span data-attr-index="1">11283</span>
          <span data-attr-index="2">11284</span>
        </span>
        <span data-attr-param="image">
          <span data-attr-index="1"><img src="/images/Dragonfire_shield_%28uncharged%29.png?x" /></span>
          <span data-attr-index="2"><img src="/images/Dragonfire_shield.png?x" /></span>
        </span>
        <span data-attr-param="members">
          <span data-attr-index="0">Yes</span>
        </span>
        <span data-attr-param="quest">
          <span data-attr-index="0">No</span>
        </span>
        <span data-attr-param="tradeable">
          <span data-attr-index="0">? (edit)</span>
          <span data-attr-index="1">No</span>
          <span data-attr-index="2">Yes</span>
        </span>
        <span data-attr-param="equipable">
          <span data-attr-index="0">Yes</span>
        </span>
        <span data-attr-param="stackable">
          <span data-attr-index="0">No</span>
        </span>
        <span data-attr-param="noteable">
          <span data-attr-index="1">Yes</span>
          <span data-attr-index="2">No</span>
        </span>
        <span data-attr-param="examine">
          <span data-attr-index="0">A heavy shield with a snarling visage.</span>
        </span>
        <span data-attr-param="value">
          <span data-attr-index="0">2,000,000 coins</span>
        </span>
        <span data-attr-param="high">
          <span data-attr-index="0">1,200,000 coins</span>
        </span>
        <span data-attr-param="low">
          <span data-attr-index="0">800,000 coins</span>
        </span>
        <span data-attr-param="weight">
          <span data-attr-index="0">7.257 kg</span>
        </span>
        <span data-attr-param="buylimit">
          <span data-attr-index="0">-</span>
          <span data-attr-index="1">8</span>
        </span>
      </div>
    `;

    const items = parseItemDetailPage(html);

    expect(items).toEqual([
      {
        id: 11283,
        name: 'Dragonfire shield (uncharged)',
        iconPath: 'Dragonfire_shield_(uncharged).png',
        examine: 'A heavy shield with a snarling visage.',
        value: 2000000,
        highAlch: 1200000,
        lowAlch: 800000,
        buyLimit: null,
        questItem: false,
        equipable: true,
        noteable: true,
        stackable: false,
        weight: 7.257,
        tradeable: false,
        members: true,
      },
      {
        id: 11284,
        name: 'Dragonfire shield (charged)',
        iconPath: 'Dragonfire_shield.png',
        examine: 'A heavy shield with a snarling visage.',
        value: 2000000,
        highAlch: 1200000,
        lowAlch: 800000,
        buyLimit: 8,
        questItem: false,
        equipable: true,
        noteable: false,
        stackable: false,
        weight: 7.257,
        tradeable: true,
        members: true,
      },
    ]);
  });

  it('does not add tab suffix when variant names are already distinct', () => {
    const html = `
      <table class="infobox infobox-switch infobox-item">
        <caption>
          <div class="infobox-buttons">
            <span class="button" data-switch-index="1">1 dose</span>
            <span class="button" data-switch-index="2">2 dose</span>
            <span class="button" data-switch-index="3">3 dose</span>
            <span class="button" data-switch-index="4">4 dose</span>
          </div>
        </caption>
        <tbody>
          <tr><th class="infobox-header" data-attr-param="name">Agility potion(1)</th></tr>
          <tr><td data-attr-param="image"><img src="/images/Agility_potion%284%29.png?a" /></td></tr>
          <tr class="advanced-data"><th>Item ID</th><td data-attr-param="id">3032</td></tr>
        </tbody>
      </table>
      <div class="infobox-switch-resources infobox-resources-Infobox_Item hidden">
        <span data-attr-param="name">
          <span data-attr-index="1">Agility potion(1)</span>
          <span data-attr-index="2">Agility potion(2)</span>
          <span data-attr-index="3">Agility potion(3)</span>
          <span data-attr-index="4">Agility potion(4)</span>
        </span>
        <span data-attr-param="id">
          <span data-attr-index="1">3038</span>
          <span data-attr-index="2">3036</span>
          <span data-attr-index="3">3034</span>
          <span data-attr-index="4">3032</span>
        </span>
        <span data-attr-param="image">
          <span data-attr-index="1"><img src="/images/Agility_potion%281%29.png?a" /></span>
          <span data-attr-index="2"><img src="/images/Agility_potion%282%29.png?a" /></span>
          <span data-attr-index="3"><img src="/images/Agility_potion%283%29.png?a" /></span>
          <span data-attr-index="4"><img src="/images/Agility_potion%284%29.png?a" /></span>
        </span>
        <span data-attr-param="members"><span data-attr-index="0">No</span></span>
        <span data-attr-param="quest"><span data-attr-index="0">No</span></span>
        <span data-attr-param="tradeable"><span data-attr-index="0">Yes</span></span>
        <span data-attr-param="equipable"><span data-attr-index="0">No</span></span>
        <span data-attr-param="stackable"><span data-attr-index="0">No</span></span>
        <span data-attr-param="noteable"><span data-attr-index="0">Yes</span></span>
        <span data-attr-param="examine">
          <span data-attr-index="1">1 dose of Agility potion.</span>
          <span data-attr-index="2">2 doses of Agility potion.</span>
          <span data-attr-index="3">3 doses of Agility potion.</span>
          <span data-attr-index="4">4 doses of Agility potion.</span>
        </span>
        <span data-attr-param="value"><span data-attr-index="0">30 coins</span></span>
        <span data-attr-param="high"><span data-attr-index="0">18 coins</span></span>
        <span data-attr-param="low"><span data-attr-index="0">12 coins</span></span>
        <span data-attr-param="weight"><span data-attr-index="0">0.002 kg</span></span>
        <span data-attr-param="buylimit"><span data-attr-index="0">2,000</span></span>
      </div>
    `;

    const items = parseItemDetailPage(html);

    expect(items).toEqual([
      expect.objectContaining({ id: 3038, name: 'Agility potion(1)' }),
      expect.objectContaining({ id: 3036, name: 'Agility potion(2)' }),
      expect.objectContaining({ id: 3034, name: 'Agility potion(3)' }),
      expect.objectContaining({ id: 3032, name: 'Agility potion(4)' }),
    ]);
  });
});
