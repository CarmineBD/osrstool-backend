## Summary

- Add an authenticated account deletion endpoint that removes the user from Postgres, clears linked references, and deletes the Supabase Auth user.
- Reject already-issued tokens for deleted accounts by recording a Redis tombstone and checking it in guarded and optional-auth flows.

## User-facing changelog

- Signed-in users can now delete their account through the account API in a single step.
- Fixed an issue where a deleted account could still access authenticated endpoints until its existing token expired.

## How to test

- `npm test -- auth/auth.controller.spec.ts auth/auth.service.spec.ts`
- `npm test -- auth/supabase-auth.guard.spec.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- Call `DELETE /me` with a valid bearer token and confirm it returns `{ "data": { "deleted": true } }`.
- Retry an authenticated request with the same token and confirm it now returns `401` with `User account has been deleted`.

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` must be configured together with `SUPABASE_PROJECT_URL` for the self-deletion flow to work.
