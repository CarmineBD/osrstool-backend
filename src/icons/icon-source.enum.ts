export enum IconSource {
  ITEM = 'item',
  GAME_ICON = 'game_icon',
}

export const ICON_SOURCE_VALUES = [IconSource.ITEM, IconSource.GAME_ICON] as const;

export const GAME_ICON_TYPE_VALUES = ['interface', 'spell', 'prayer', 'skill', 'other'] as const;

export type GameIconType = (typeof GAME_ICON_TYPE_VALUES)[number];

export const ICON_SEARCH_TYPE_VALUES = ['all', 'items', 'item', ...GAME_ICON_TYPE_VALUES] as const;

export type IconSearchType = (typeof ICON_SEARCH_TYPE_VALUES)[number];

export type IconSearchFilterType = GameIconType | 'item';
