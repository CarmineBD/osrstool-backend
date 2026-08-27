## Summary

- Add authenticated feedback submission with validation, rate limiting, and email notifications.
- Add super-admin feedback listing, detail retrieval, and status updates.
- Add the feedback database schema and document the required SMTP configuration.

## User-facing changelog

- Signed-in users can now submit feature requests, bug reports, and other feedback directly from RS Methods.

## How to test

- `npm run lint`
- `npm test`
- `npm run build`
- Apply `sql/2026-08-25-create-feedback.sql` to the TST database.
- Configure the SMTP variables from `.env.example`, then submit `POST /feedback` as a signed-in user with accepted terms and an account username.
- As a `super_admin`, verify `GET /feedback`, `GET /feedback/:id`, and `PATCH /feedback/:id` return and update submitted feedback.

## Notes

- Base branch: `develop`
- Target environment: `TST`
