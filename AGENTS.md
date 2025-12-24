# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains Laravel application code (controllers, services, models, jobs).
- `routes/` holds HTTP route definitions; `config/` keeps framework configuration.
- `database/` stores migrations, seeders, and factories.
- `resources/` includes Blade views and mail templates; `public/` is the web root.
- `plugins/` is for plugin implementations; `theme/` provides UI themes.
- `docs/` contains installation, migration, and plugin development guides.

## Build, Test, and Development Commands
- `docker compose run -it --rm web php artisan xboard:install` initializes the app inside Docker.
- `docker compose up -d` starts the full Docker stack.
- `docker compose run -it --rm web php artisan xboard:update` applies app updates/migrations in Docker.

## Coding Style & Naming Conventions
- Indentation: 4 spaces for most files, 2 spaces for `*.yml`/`*.yaml`; LF line endings (`.editorconfig`).
- Keep Laravel conventions: class names in StudlyCase, methods/variables in camelCase.
- Migration filenames follow timestamp prefixes (see `database/migrations/`).

## Testing Guidelines
- No `tests/` directory is currently present; PHPUnit is available in `composer.json`.
- If you add tests, place them under `tests/` and run `vendor/bin/phpunit`.

## Commit & Pull Request Guidelines
- Use Conventional Commits seen in history, e.g. `feat: ...`, `fix: ...`, `feat(admin): ...`.
- PRs should include a short summary, testing notes, and screenshots for UI changes.
- Link related issues and call out any migrations or config changes explicitly.

## Configuration & Security Tips
- Local settings live in `.env` (copied from `.env.example` by Composer scripts).
- Docker defaults are in `compose.sample.yaml`; avoid committing secrets or credentials.
