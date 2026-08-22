## Summary

- Cache method listing responses and 24-hour safety aggregates to reduce repeated data-loading work.
- Add optional performance timing logs for method-list loading and enrichment steps.

## User-facing changelog

- Method listings now load more quickly when the same filters and sorting options are requested repeatedly.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`
- Call the method listing endpoint twice with identical query parameters and confirm the second response returns the same data.

## Notes

- Base branch: `develop`
- Target environment: `TST`
- Cache failures fall back to the existing data-loading behavior.
