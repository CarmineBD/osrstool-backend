## Summary

- Add an authenticated, rate-limited player information lookup endpoint.
- Accept supplied player context in method search, summary, roadmap, trending, and detail endpoints instead of fetching it for each request.
- Update method endpoint tests for the player-context contract.

## User-facing changelog

- Players can now load their OSRS profile once and use it across personalized method recommendations, summaries, roadmaps, trends, and details.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`
- Call `POST /player/info` with an authenticated account that has accepted the Terms of Service, then send its response as `player` in the body of a personalized method endpoint.

## Notes

- Base branch: `develop`
- Target environment: `TST`
- Personalized method endpoints now use `POST` so player context can be supplied in the request body.
