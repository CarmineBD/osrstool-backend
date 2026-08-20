## Summary

- Add method ownership and official metadata to method persistence and detail responses.
- Record the authenticated creator when creating methods and derive official status from the creator role.
- Require authentication, a completed profile, and accepted terms before listing unofficial methods with `is_official=false`.
- Cover the new method metadata and unofficial-listing rules with controller, service, and e2e tests.

## User-facing changelog

- Method detail responses now include official status, creator information, and creation/update timestamps.
- Unofficial methods can now be requested explicitly, but only for authenticated users with a completed profile and accepted terms.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`
- Create a method as a super admin and confirm the response marks it as official and includes creator metadata in the method detail payload.
- Call `GET /methods?is_official=false` without authentication and confirm it is rejected.
- Call `GET /methods?is_official=false` as an authenticated user with accepted terms and a completed profile and confirm unofficial methods are returned.

## Notes

- Base branch: `develop`
- Target environment: `TST`
