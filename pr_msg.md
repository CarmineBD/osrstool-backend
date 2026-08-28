## Summary

- Add `officialVariantCount` to each skill summary response and document it in the API example.
- Calculate counts from enabled official variants with positive experience for each skill.
- Add coverage for official-variant filtering and skill-key normalization.

## User-facing changelog

- Skill summaries now include the number of enabled official variants available for each skill.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`

## Notes

- Base branch: `develop`
- Target environment: `TST`
