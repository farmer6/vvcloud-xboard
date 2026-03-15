# SES API Migration TODO

This note records the minimum-viable migration plan for switching email delivery from SES SMTP to SES API in Xboard.

Current goal:

- do not implement now
- preserve a clear execution plan for later
- keep the scope as small as possible

## Current Situation

The system is currently sending mail through SMTP-style settings:

- `email_host`
- `email_port`
- `email_encryption`
- `email_username`
- `email_password`

The runtime mail override happens in:

- `app/Services/MailService.php`

This means AWS SES is currently used only as an SMTP endpoint, not through the AWS SES API.

## Why Migrate

The main reason is to reduce SMTP-session-level failures such as:

- `451 4.4.2 Timeout waiting for data from client`

Using SES API avoids most SMTP handshake / SMTP session timeout issues and usually behaves more predictably in cloud environments.

## Target Scope: Plan A

Plan A is the smallest practical migration:

- add AWS SDK support
- switch the mail transport to SES API
- keep the change mostly environment-driven
- avoid adding a full admin-side driver switch for now

This is intentionally not the "full backend-configurable" solution.

## Plan A Deliverables

### 1. Add Dependency

Install:

- `aws/aws-sdk-php`

Reason:

- Laravel SES mail transport requires AWS SDK support.

## 2. Normalize Mail Config

Refactor `config/mail.php` toward Laravel 12 mailer-style structure so SES can be configured cleanly.

Minimum target:

- keep `default`
- define `mailers.smtp`
- define `mailers.ses`
- keep existing `from`

Reason:

- current config is still closer to the old single-driver layout
- SES API integration is cleaner with explicit mailers

## 3. Use AWS Credentials from Environment

Use these variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION` or keep project-compatible region mapping

Current project already has partial SES service config in:

- `config/services.php`

Need to standardize region naming because the project currently uses:

- `AWS_V2BOARD_REGION`

Decision to make during implementation:

- either keep `AWS_V2BOARD_REGION`
- or align to `AWS_DEFAULT_REGION`

## 4. Keep Current Admin SMTP Settings Untouched for Now

Plan A should not attempt to redesign the admin settings page yet.

Implication:

- if admin SMTP host fields are present and still used blindly, they may override SES setup and break the migration

So the migration must add a safe condition in `MailService`:

- only apply SMTP runtime overrides when SMTP mode is explicitly intended
- do not force SMTP config on every send when running SES API mode

## 5. Minimal Runtime Switch Strategy

Plan A should use a simple switch such as:

- env-based mailer selection
- or a temporary code-level toggle

Recommended minimal approach:

- choose mailer by env, not by admin UI
- for example:
  - `MAIL_MAILER=ses`

This keeps rollout simple and reversible.

## 6. Update MailService Runtime Behavior

Current issue:

- `MailService::sendEmail()` dynamically sets SMTP fields before sending

Plan A change:

- if mailer is `smtp`, keep current override logic
- if mailer is `ses`, skip SMTP override logic

This is the key application-level code change required for the migration.

## 7. Validate Queue Compatibility

The queue side should remain mostly unchanged.

Still verify:

- `SendEmailJob` retry behavior remains reasonable
- SES API errors are still classified as retryable or non-retryable appropriately

Files to review:

- `app/Jobs/SendEmailJob.php`
- `config/horizon.php`

## 8. Rollout Checklist

When implementation starts, follow this order:

1. remove `composer.lock` from `.gitignore` and `.dockerignore`
2. import the current production `composer.lock` into the repo as the dependency baseline
3. add AWS SDK dependency on top of that baseline instead of resolving from scratch
4. refactor `config/mail.php` to Laravel 12-style mailers
5. wire SES mailer config into `config/services.php` / env
6. adjust `MailService` so SES mode does not get SMTP runtime overrides
7. deploy to staging or a low-risk environment
8. send test mail:
   - verification code
   - reminder mail
   - mail login link
9. monitor `mail_log.error` and Horizon failed jobs
10. only then enable in production

Important rollout constraint:

- do not commit a freshly generated `composer.lock` from a no-lock local environment directly to production
- production already has its own locked dependency tree, so that file must become the baseline first
- otherwise this migration becomes a hidden framework-wide dependency refresh instead of a targeted SES API change

## 9. Suggested Test Cases

Before production rollout, test:

- send verification email from register flow
- send forgot-password email code
- send login-by-mail-link
- send bulk/reminder emails from queue
- invalid recipient handling still logs cleanly
- temporary AWS/API failures still retry correctly

## 10. Files Expected to Change Later

Likely implementation files:

- `.gitignore`
- `.dockerignore`
- `composer.json`
- `config/mail.php`
- `config/services.php`
- `app/Services/MailService.php`
- `.env.example`
- `composer.lock`

Maybe touched during verification:

- `app/Jobs/SendEmailJob.php`
- `config/horizon.php`

## 11. Explicit Non-Goals for Plan A

Not included in this phase:

- full admin UI support for switching between SMTP and SES API
- migrating all email settings management in admin panel
- introducing multiple mail providers at runtime

Those belong to a larger Plan B.

## 12. Recommended Later Follow-Up

If Plan A works well in production, the next optional step is:

- add admin-configurable mail driver selection
- support `smtp` and `ses` as first-class options
- cleanly separate SMTP-only fields from SES-only fields
