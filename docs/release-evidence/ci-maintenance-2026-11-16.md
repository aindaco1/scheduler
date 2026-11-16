# CI maintenance — November 16, 2026

Reviewed Scheduler PRs 32 and 33 together. The Ruby setup action remains pinned
to its immutable 1.338.0 revision; Playwright 1.65.0, Sass 1.108.1 and Wrangler
4.158.0 pass the existing deterministic build, Worker and browser checks.

A fresh CI run of PR 33 found six Addressable advisories against 2.9.0.
`bundle update addressable --conservative` changes only Addressable to 2.9.2.
The npm and 34-package Ruby audits then report zero findings.

Local validation uses combined source commit `2ce1fbc5fec473d0b6da3b6f3b60100a9c22167b` plus the
Gemfile.lock SHA-256 `5269bc0687da5edea6eb496456ad2420769d219543af1afdd9d05ac34c4a6f05` on macOS,
Node 26.12.1 and Ruby 3.0.0. `npm ci`, `npm run audit:dependencies`, and
`npm run check:offline` pass after installing the matching Chromium runtime.
The latter includes type checks, Worker tests, Jekyll build, both locales,
accessibility/keyboard checks, 40 admin and 84 public viewport checks, and a
Worker dry-run bundle. These are synthetic local checks; no real invitations,
bookings, email, provider mutations or production deployment occurred.

PR CI separately uses Node 24.22.1 and Ruby 3.3. Main's workflow also runs the
required live Jev check with its existing repository credentials; its result
must be read from the resulting run. These dependency updates are not a new
production release or renewed provider acceptance.
