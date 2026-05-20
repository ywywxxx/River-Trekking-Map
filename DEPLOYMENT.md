# Deployment Notes

## Server

Host:

```text
weather.meapikachu.top
```

User:

```text
nps
```

Existing server observations:

- Ubuntu 24.04 LTS
- MySQL listens on localhost ports `3306` and `33060`
- Existing project in `/home/nps/NP_weather_backcast`
- Nginx and Apache are currently inactive
- Ports `80` and `443` are currently unused

## Project Isolation

River Trekking Map should use its own server directories and should not write into existing project folders.

Created directories:

```text
/home/nps/river-trekking-map/
  releases/
  shared/
  data/
  logs/
  www/
```

Ownership:

```text
nps:nps
```

Intended use:

- `/home/nps/river-trekking-map/releases/`: timestamped deployed builds
- `/home/nps/river-trekking-map/shared/`: files shared across releases
- `/home/nps/river-trekking-map/data/`: generated map data or pipeline artifacts, when needed
- `/home/nps/river-trekking-map/logs/`: app/deploy logs, when needed
- `/home/nps/river-trekking-map/www/`: active static web root served by Nginx

## Current Deployment Shape

The web app is currently a static Vite app.

Build locally:

```bash
cd apps/web
npm ci
npm run build
```

Deploy artifact:

```text
apps/web/dist/
```

Initial deployment should copy `dist/` into:

```text
/home/nps/river-trekking-map/www/
```

Nginx can later serve that directory for:

```text
weather.meapikachu.top
```

## Boundaries

Do not modify:

```text
/home/nps/NP_weather_backcast
```

Do not modify MySQL unless the project explicitly needs database storage later.

For now, this project does not need MySQL.
