## Summary

- Add versioned Terms of Service acceptance storage, the authenticated acceptance endpoint, and current terms status in the profile response.
- Enforce current Terms of Service acceptance on protected authenticated, admin, and write endpoints that should require it.
- Document the new terms acceptance endpoint and manual SQL setup in the backend README.

## User-facing changelog

- Signed-in users can now register acceptance of the current Terms of Service through the account API.
- Protected account and admin actions now require the current Terms of Service to be accepted before they can be used.

## How to test

- `npm run lint`
- `$env:CI='true'; npm test`
- `npm run build`
- Call `GET /me` with a valid bearer token and confirm the response includes `terms.currentVersion` and `terms.accepted`.
- Call `POST /me/terms/acceptance` with the same token and confirm it returns `accepted: true` and remains idempotent on repeat requests.
- Call a terms-protected endpoint without a current acceptance record and confirm it returns a `403` response with code `TERMS_ACCEPTANCE_REQUIRED`.

## Notes

- Run `sql/2026-08-17-add-user-terms-acceptances.sql` once in each environment before using the new flow.
- The backend currently enforces `CURRENT_TERMS_VERSION = v1`.
