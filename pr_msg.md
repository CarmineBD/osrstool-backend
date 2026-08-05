feat: add completed account username onboarding and enforce it across methods/admin routes

This branch introduces support for completing and storing an authenticated user's account username via the Supabase auth flow. It also enforces profile completion for protected methods and admin routes that require a completed account username.

Highlights:
- Add `POST /me/account-username` endpoint for username completion
- Persist normalized, lowercase `account_username` on the user record
- Add database migration and unique case-insensitive username index
- Add `CompleteProfileGuard` and enforce it for admin and methods endpoints
- Refine methods service auth handling to return structured account username errors
- Refactor presence service tests for stable timers and mocks
