import { load, type Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

const WIKI_BASE_URL = 'https://oldschool.runescape.wiki';
const EDIT_PLACEHOLDER_TOKEN = '(edit)';
const API_OR_CACHE_ONLY_NOTICE =
  'This article contains information about a subject known only to exist in the game APIs or cache.';
const INDEX_NAME_IGNORE_MARKERS = [
  '(historical)',
  '(last man standing)',
  '(barbarian assault)',
  '(discontinued)',
  '(unobtainable item)',
  '(beta)',
];

interface SwitchResourceValue {
  text: string;
  html: string;
}

interface VariantButton {
  position: number;
  switchIndex: number;
  tabName: string;
}

interface VariantItemDraft {
  id: number;
  baseName: string;
  tabName: string;
  iconPath: string;
  examine: string | null;
  value: number | null;
  highAlch: number | null;
  lowAlch: number | null;
  buyLimit: number | null;
  questItem: boolean | null;
  equipable: boolean | null;
  noteable: boolean | null;
  stackable: boolean | null;
  weight: number | null;
  tradeable: boolean | null;
  members: boolean | null;
}

export interface WikiIndexRow {
  name: string;
  itemIdText: string;
  detailUrl: string;
}

export interface ScrapedWikiItemRecord {
  id: number;
  name: string;
  iconPath: string;
  examine: string | null;
  value: number | null;
  highAlch: number | null;
  lowAlch: number | null;
  buyLimit: number | null;
  questItem: boolean | null;
  equipable: boolean | null;
  noteable: boolean | null;
  stackable: boolean | null;
  weight: number | null;
  tradeable: boolean | null;
  members: boolean | null;
}

type SwitchResourceMap = Map<string, Map<number, SwitchResourceValue>>;

export function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseBooleanNullable(value: string | null | undefined): boolean | null {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'yes') return true;
  if (normalized === 'no') return false;
  return null;
}

export function parseQuestItemNullable(value: string | null | undefined): boolean | null {
  const normalized = cleanText(value);
  if (!normalized || normalized === '-') return null;

  if (normalized.toLowerCase() === 'no') return false;
  return true;
}

export function parseNumberFromCoins(value: string | null | undefined): number | null {
  const normalized = cleanText(value);
  if (!normalized || normalized === '-') return null;

  const match = normalized.replace(/,/g, '').match(/-?\d+/);
  if (!match) return null;

  const parsed = Number.parseInt(match[0], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseWeightKg(value: string | null | undefined): number | null {
  const normalized = cleanText(value);
  if (!normalized || normalized === '-') return null;

  const match = normalized.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseIntegerNullable(value: string | null | undefined): number | null {
  const normalized = cleanText(value);
  if (!normalized || normalized === '-') return null;

  const compact = normalized.replace(/,/g, '');
  if (!/^-?\d+$/.test(compact)) return null;

  const parsed = Number.parseInt(compact, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseFirstListValue(value: string | null | undefined): string | null {
  const normalized = cleanText(value);
  if (!normalized || normalized === '-') return null;

  const isThousandsFormattedNumber = /^-?\d{1,3}(,\d{3})+$/.test(normalized);
  if (isThousandsFormattedNumber) {
    return normalized;
  }

  const [first] = normalized.split(/,\s*/);
  const firstNormalized = cleanText(first);
  return firstNormalized || null;
}

export function parseItemIdInteger(value: string | null | undefined): number | null {
  const firstValue = parseFirstListValue(value);
  return parseIntegerNullable(firstValue);
}

export function getIndexNameIgnoreReason(name: string): string | null {
  const normalizedName = cleanText(name).toLowerCase();
  if (!normalizedName) return null;

  for (const marker of INDEX_NAME_IGNORE_MARKERS) {
    if (normalizedName.includes(marker)) {
      return `contains "${marker}"`;
    }
  }

  if (normalizedName.includes('clue scroll') && normalizedName.includes('-')) {
    return 'contains "clue scroll" and "-"';
  }

  return null;
}

export function isObsoleteItemPage(html: string): boolean {
  const $ = load(html);
  return $('table.messagebox.obsolete').length > 0;
}

export function isApiOrCacheOnlyItemPage(html: string): boolean {
  const $ = load(html);
  const normalizedNotice = cleanText(API_OR_CACHE_ONLY_NOTICE);

  return $('table.messagebox.info')
    .toArray()
    .some((box) => cleanText($(box).text()).includes(normalizedNotice));
}

export function normalizeIndexItemName(name: string): string {
  return cleanText(cleanText(name).replace(/#\s*\(/g, ' ('));
}

export function parseItemIndexPage(html: string): WikiIndexRow[] {
  const $ = load(html);
  const table = findMainIndexTable($);
  if (!table || table.length === 0) {
    return [];
  }

  const rows: WikiIndexRow[] = [];
  table.find('tr').each((_, tr) => {
    const cells = $(tr).children('td');
    if (cells.length < 2) return;

    const nameCell = cells.eq(0);
    const idCell = cells.eq(1);

    const name = normalizeIndexItemName(nameCell.text());
    const itemIdText = parseFirstListValue(idCell.text());

    const normalizedIdText = cleanText(idCell.text());
    const hasMultipleIds =
      normalizedIdText.includes(',') && !/^-?\d{1,3}(,\d{3})+$/.test(normalizedIdText);
    const href = hasMultipleIds
      ? (idCell.find('a[href]').first().attr('href') ??
        nameCell.find('a[href]').first().attr('href'))
      : nameCell.find('a[href]').first().attr('href');
    const detailUrl = resolveWikiUrl(href);

    if (!name || !itemIdText || !detailUrl) return;

    rows.push({ name, itemIdText, detailUrl });
  });

  return rows;
}

export function parseItemDetailPage(html: string): ScrapedWikiItemRecord[] {
  const $ = load(html);
  const itemInfobox = $('table.infobox-item').first();
  if (!itemInfobox || itemInfobox.length === 0) {
    throw new Error('Item infobox was not found.');
  }

  const baseName =
    cleanText(itemInfobox.find('.infobox-header[data-attr-param="name"]').first().text()) ||
    cleanText(itemInfobox.find('.infobox-header').first().text());

  if (!baseName) {
    throw new Error('Item name was not found in infobox header.');
  }

  const variantButtons = parseVariantButtons($, itemInfobox);
  if (variantButtons.length === 0) {
    return [parseSingleItemInfobox($, itemInfobox, baseName)];
  }

  const resources = parseItemSwitchResources($, itemInfobox);
  const variantDrafts = variantButtons.map((variantButton) =>
    parseVariantInfoboxItemDraft(
      $,
      itemInfobox,
      resources,
      baseName,
      variantButton,
      variantButtons,
    ),
  );

  const normalizedNames = new Set(
    variantDrafts.map((variantDraft) => cleanText(variantDraft.baseName).toLowerCase()),
  );
  const shouldAppendTabSuffix = normalizedNames.size === 1;

  return variantDrafts.map((variantDraft) => ({
    id: variantDraft.id,
    name: shouldAppendTabSuffix
      ? buildVariantName(variantDraft.baseName, variantDraft.tabName)
      : variantDraft.baseName,
    iconPath: variantDraft.iconPath,
    examine: variantDraft.examine,
    value: variantDraft.value,
    highAlch: variantDraft.highAlch,
    lowAlch: variantDraft.lowAlch,
    buyLimit: variantDraft.buyLimit,
    questItem: variantDraft.questItem,
    equipable: variantDraft.equipable,
    noteable: variantDraft.noteable,
    stackable: variantDraft.stackable,
    weight: variantDraft.weight,
    tradeable: variantDraft.tradeable,
    members: variantDraft.members,
  }));
}

function findMainIndexTable($: ReturnType<typeof load>): Cheerio<AnyNode> | null {
  const tables = $('table.wikitable').toArray();
  for (const table of tables) {
    const headerTexts = $(table)
      .find('tr')
      .first()
      .find('th')
      .toArray()
      .map((th) => cleanText($(th).text()).toLowerCase());

    const hasItemHeader = headerTexts.some((header) => header === 'item' || header === 'name');
    const hasItemIdHeader = headerTexts.some((header) => header.includes('item id'));
    if (hasItemHeader && hasItemIdHeader) {
      return $(table);
    }
  }

  // Fallback: the page currently has a single wikitable for item ids.
  if (tables.length === 1) {
    return $(tables[0]);
  }

  return null;
}

function resolveWikiUrl(href: string | undefined): string | null {
  const cleaned = cleanText(href);
  if (!cleaned) return null;

  try {
    return new URL(cleaned, WIKI_BASE_URL).toString();
  } catch {
    return null;
  }
}

function parseSingleItemInfobox(
  $: ReturnType<typeof load>,
  itemInfobox: Cheerio<AnyNode>,
  baseName: string,
): ScrapedWikiItemRecord {
  const id = parseItemIdInteger(
    extractByParam(itemInfobox, 'id') ?? extractByHeader($, itemInfobox, 'Item ID'),
  );
  if (id === null) {
    throw new Error('Item ID was not found in advanced data.');
  }

  const iconPath = extractIconPathFromInfobox($, itemInfobox);
  if (!iconPath) {
    throw new Error('Item image src under infobox was not found.');
  }

  return {
    id,
    name: baseName,
    iconPath,
    examine: normalizeNullableText(
      extractByParam(itemInfobox, 'examine') ?? extractByHeader($, itemInfobox, 'Examine'),
    ),
    value: parseNumberFromCoins(
      extractByParam(itemInfobox, 'value') ?? extractByHeader($, itemInfobox, 'Value'),
    ),
    highAlch: parseNumberFromCoins(
      extractByParam(itemInfobox, 'high') ?? extractByHeader($, itemInfobox, 'High alch'),
    ),
    lowAlch: parseNumberFromCoins(
      extractByParam(itemInfobox, 'low') ?? extractByHeader($, itemInfobox, 'Low alch'),
    ),
    buyLimit: parseIntegerNullable(
      extractByParam(itemInfobox, 'buylimit') ?? extractByHeader($, itemInfobox, 'Buy limit'),
    ),
    questItem: parseQuestItemNullable(
      extractByParam(itemInfobox, 'quest') ?? extractByHeader($, itemInfobox, 'Quest item'),
    ),
    equipable: parseBooleanNullable(
      extractByParam(itemInfobox, 'equipable') ?? extractByHeader($, itemInfobox, 'Equipable'),
    ),
    noteable: parseBooleanNullable(
      extractByParam(itemInfobox, 'noteable') ?? extractByHeader($, itemInfobox, 'Noteable'),
    ),
    stackable: parseBooleanNullable(
      extractByParam(itemInfobox, 'stackable') ?? extractByHeader($, itemInfobox, 'Stackable'),
    ),
    weight: parseWeightKg(
      extractByParam(itemInfobox, 'weight') ?? extractByHeader($, itemInfobox, 'Weight'),
    ),
    tradeable: parseBooleanNullable(
      extractByParam(itemInfobox, 'tradeable') ?? extractByHeader($, itemInfobox, 'Tradeable'),
    ),
    members: parseBooleanNullable(
      extractByParam(itemInfobox, 'members') ?? extractByHeader($, itemInfobox, 'Members'),
    ),
  };
}

function parseVariantInfoboxItemDraft(
  $: ReturnType<typeof load>,
  itemInfobox: Cheerio<AnyNode>,
  resources: SwitchResourceMap,
  baseName: string,
  variantButton: VariantButton,
  allButtons: VariantButton[],
): VariantItemDraft {
  const buttonIndices = allButtons.map((button) => button.switchIndex);

  const readVariantText = (paramName: string): string | null => {
    const resolved = resolveVariantValue(resources, paramName, variantButton, buttonIndices);
    if (resolved) return resolved.text;

    return extractByParam(itemInfobox, paramName);
  };

  const id = parseItemIdInteger(readVariantText('id'));
  if (id === null) {
    throw new Error(`Variant "${variantButton.tabName}" does not expose a valid Item ID.`);
  }

  const variantBaseName = normalizeNullableText(readVariantText('name')) ?? baseName;

  const variantImageValue = resolveVariantValue(resources, 'image', variantButton, buttonIndices);
  const iconPath =
    extractIconPathFromSwitchValue(variantImageValue) ?? extractIconPathFromInfobox($, itemInfobox);
  if (!iconPath) {
    throw new Error(`Variant "${variantBaseName}" does not expose a valid image.`);
  }

  return {
    id,
    baseName: variantBaseName,
    tabName: variantButton.tabName,
    iconPath,
    examine: normalizeNullableText(readVariantText('examine')),
    value: parseNumberFromCoins(readVariantText('value')),
    highAlch: parseNumberFromCoins(readVariantText('high')),
    lowAlch: parseNumberFromCoins(readVariantText('low')),
    buyLimit: parseIntegerNullable(readVariantText('buylimit')),
    questItem: parseQuestItemNullable(readVariantText('quest')),
    equipable: parseBooleanNullable(readVariantText('equipable')),
    noteable: parseBooleanNullable(readVariantText('noteable')),
    stackable: parseBooleanNullable(readVariantText('stackable')),
    weight: parseWeightKg(readVariantText('weight')),
    tradeable: parseBooleanNullable(readVariantText('tradeable')),
    members: parseBooleanNullable(readVariantText('members')),
  };
}

function parseVariantButtons(
  $: ReturnType<typeof load>,
  itemInfobox: Cheerio<AnyNode>,
): VariantButton[] {
  return itemInfobox
    .find('.infobox-buttons .button[data-switch-index]')
    .toArray()
    .map((button, position) => {
      const switchIndexRaw = cleanText($(button).attr('data-switch-index'));
      const switchIndex = Number.parseInt(switchIndexRaw, 10);
      if (!Number.isInteger(switchIndex)) {
        return null;
      }

      const tabName = cleanText($(button).text());
      return { position, switchIndex, tabName };
    })
    .filter((button): button is VariantButton => button !== null);
}

function parseItemSwitchResources(
  $: ReturnType<typeof load>,
  itemInfobox: Cheerio<AnyNode>,
): SwitchResourceMap {
  const resourcesRoot = itemInfobox
    .nextAll('div.infobox-switch-resources')
    .filter((_, node) => {
      const classes = cleanText($(node).attr('class'));
      return classes.includes('Infobox_Item');
    })
    .first();

  if (!resourcesRoot || resourcesRoot.length === 0) {
    throw new Error('Variant infobox resources were not found.');
  }

  const resources: SwitchResourceMap = new Map();
  resourcesRoot.find('> span[data-attr-param]').each((_, attrNode) => {
    const attrParam = cleanText($(attrNode).attr('data-attr-param'));
    if (!attrParam) return;

    const byIndex = new Map<number, SwitchResourceValue>();
    $(attrNode)
      .children('span[data-attr-index]')
      .each((__, indexedNode) => {
        const indexRaw = cleanText($(indexedNode).attr('data-attr-index'));
        const index = Number.parseInt(indexRaw, 10);
        if (!Number.isInteger(index)) return;

        const text = cleanText($(indexedNode).text());
        const html = $(indexedNode).html() ?? '';
        byIndex.set(index, { text, html });
      });

    if (byIndex.size > 0) {
      resources.set(attrParam, byIndex);
    }
  });

  return resources;
}

function resolveVariantValue(
  resources: SwitchResourceMap,
  paramName: string,
  variantButton: VariantButton,
  buttonIndices: number[],
): SwitchResourceValue | null {
  const byIndex = resources.get(paramName);
  if (!byIndex || byIndex.size === 0) return null;

  const availableIndexes = [...byIndex.keys()].sort((a, b) => a - b);
  const hasAllButtonIndices = buttonIndices.every((buttonIndex) => byIndex.has(buttonIndex));

  const candidateIndexes: number[] = [];
  if (availableIndexes.length === 1) {
    candidateIndexes.push(availableIndexes[0]);
  }
  if (hasAllButtonIndices) {
    candidateIndexes.push(variantButton.switchIndex);
  }
  if (!hasAllButtonIndices && availableIndexes.length === buttonIndices.length) {
    const positionalIndex = availableIndexes[variantButton.position];
    if (positionalIndex !== undefined) {
      candidateIndexes.push(positionalIndex);
    }
  }
  candidateIndexes.push(variantButton.switchIndex);
  candidateIndexes.push(variantButton.position);
  candidateIndexes.push(0);
  candidateIndexes.push(availableIndexes[0]);

  let firstCandidate: SwitchResourceValue | null = null;
  for (const candidateIndex of candidateIndexes) {
    if (candidateIndex === undefined) continue;
    const value = byIndex.get(candidateIndex);
    if (!value) continue;
    if (!firstCandidate) {
      firstCandidate = value;
    }
    if (!isEditPlaceholder(value.text)) {
      return value;
    }
  }

  return firstCandidate;
}

function buildVariantName(baseName: string, tabName: string): string {
  const normalizedBase = cleanText(baseName);
  const normalizedTab = cleanText(tabName).toLowerCase();

  if (!normalizedTab) {
    return normalizedBase;
  }

  return `${normalizedBase} (${normalizedTab})`;
}

function extractByParam(itemInfobox: Cheerio<AnyNode>, paramName: string): string | null {
  const element = itemInfobox.find(`[data-attr-param="${paramName}"]`).last();
  if (!element || element.length === 0) return null;

  return normalizeNullableText(element.text());
}

function extractByHeader(
  $: ReturnType<typeof load>,
  itemInfobox: Cheerio<AnyNode>,
  headerName: string,
): string | null {
  const normalizedHeaderName = cleanText(headerName).toLowerCase();
  const rows = itemInfobox.find('tr').toArray();

  for (const row of rows) {
    const header = cleanText($(row).find('th').first().text()).toLowerCase();
    if (!header || header !== normalizedHeaderName) continue;

    const valueCell = $(row).find('td').last();
    if (!valueCell || valueCell.length === 0) continue;
    return normalizeNullableText(valueCell.text());
  }

  return null;
}

function extractIconPathFromInfobox(
  $: ReturnType<typeof load>,
  itemInfobox: Cheerio<AnyNode>,
): string | null {
  const imageSources = [
    ...itemInfobox.find('[data-attr-param="image"] img[src*="/images/"]').toArray(),
    ...itemInfobox.find('td.infobox-image img[src*="/images/"]').toArray(),
    ...itemInfobox.find('td[class*="infobox-image"] img[src*="/images/"]').toArray(),
  ]
    .map((image) => cleanText($(image).attr('src')))
    .filter((src) => src.length > 0);

  const lastImageSource = imageSources.at(-1);
  if (!lastImageSource) return null;

  return extractFileNameFromImageSrc(lastImageSource);
}

function extractIconPathFromSwitchValue(value: SwitchResourceValue | null): string | null {
  if (!value) return null;

  const html = cleanText(value.html);
  if (html) {
    const $ = load(html);
    const imageSources = $('img[src*="/images/"]')
      .toArray()
      .map((image) => cleanText($(image).attr('src')))
      .filter((src) => src.length > 0);

    const lastImageSource = imageSources.at(-1);
    if (lastImageSource) {
      return extractFileNameFromImageSrc(lastImageSource);
    }
  }

  const text = cleanText(value.text);
  if (text.toLowerCase().startsWith('file:')) {
    return text.slice('file:'.length).replace(/ /g, '_');
  }

  return null;
}

function extractFileNameFromImageSrc(src: string): string | null {
  const normalizedSrc = cleanText(src);
  if (!normalizedSrc) return null;

  const withoutQuery = normalizedSrc.split('?')[0] ?? normalizedSrc;
  const path = withoutQuery.split('#')[0] ?? withoutQuery;
  const pathSegments = path.split('/').filter((segment) => segment.length > 0);
  if (pathSegments.length === 0) return null;

  const lastSegment = pathSegments.at(-1);
  if (!lastSegment) return null;

  if (path.includes('/thumb/')) {
    const thumbMatch = lastSegment.match(/^\d+px-(.+)$/);
    if (thumbMatch?.[1]) {
      return decodeURIComponent(thumbMatch[1]);
    }
  }

  return decodeURIComponent(lastSegment);
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = cleanText(value);
  if (!normalized || normalized === '-') return null;
  return normalized;
}

function isEditPlaceholder(value: string): boolean {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return true;
  return normalized.includes(EDIT_PLACEHOLDER_TOKEN);
}
