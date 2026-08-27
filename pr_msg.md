## Summary

- Send the configured OSRS Wiki user agent when refreshing the latest item prices, with a descriptive fallback.
- Replace verbose Axios error-object logging with compact HTTP error details.
- Add coverage for configured and fallback request headers plus HTTP error logging.

## User-facing changelog

- Fixed an issue that could prevent item prices and method profits from refreshing.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`

## Notes

- Base branch: `develop`
- Target environment: `TST`
- No cache, profit calculation, or scheduled job logic changes.
