## Summary

- Add a searchable catalog of OSRS game icons, including items, interface icons, spells, prayers, and skills.
- Allow methods and variants to select, validate, store, and return either item icons or game icons through `iconSource`.

## User-facing changelog

- Method and variant icons can now use a wider selection of OSRS game icons, including spell, prayer, skill, and interface icons.
- Icon selection now supports searching both tradeable items and game-specific icons.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`
- Run the supplied SQL migration, then call `GET /icons?q=magic` to search selectable icons.
- Create or update a method or variant with a valid `icon_id` and `iconSource: "game_icon"`, then confirm the returned response preserves both fields.

## Notes

- Base branch: `develop`
- Target environment: `TST`
