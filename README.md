# Accommodation Manager Portal

Property management platform. **Phase 1:** import Booking.com reservations for
Carnot House, map them to the right unit, store them in PostgreSQL, and show
what needs attention.

- `apps/api` – NestJS API, PostgreSQL (Prisma), Booking synchronization, tests.
- `apps/web` – React web app (Vite, Tailwind CSS v4, shadcn/ui, atomic design).

## Quick start

Requirements: Node.js 22, pnpm 10, Docker Desktop (running).

```bash
pnpm setup:env                                # creates apps/api/.env and .env.test (local only)
pnpm install                                  # installs everything, generates the Prisma client
pnpm db:up                                    # starts PostgreSQL in Docker (port 5433)
pnpm db:migrate                               # creates the tables
pnpm db:seed                                  # Carnot House + 5 units (+ demo Booking mappings)
pnpm test                                     # unit + integration tests
pnpm dev                                      # API on :3000 and web app on http://localhost:5173
```

The `.env` files in `apps/api` hold local-only settings and are ignored by
Git; `.env.example` documents every variable.

Open **http://localhost:5173**, go to Integrations and press **Sync Booking**.

### Try the API directly

```bash
curl -s localhost:3000/api/health
curl -s localhost:3000/api/properties
curl -s -X POST localhost:3000/api/integrations/booking/sync   # "Sync Booking"
curl -s localhost:3000/api/dashboard
curl -s "localhost:3000/api/reservations?unassigned=true"
curl -s localhost:3000/api/conflicts
```

Run the sync twice: the second run reports `created: 0`, and the database still
holds the same reservations.

## Booking.com: how the connection works

Booking.com has no public reservations API; only approved Connectivity Partners
(channel managers) get one. Phase 1 therefore supports two modes, chosen with
`BOOKING_INTEGRATION_MODE` in `apps/api/.env`:

| Mode   | What it reads | Notes |
|--------|---------------|-------|
| `mock` | Fictional demo reservations (dates relative to today) | Default. Shows every case: check-ins today, a conflict, a cancellation, a room with no mapping. |
| `ical` | The per-room calendar export links from the Booking.com extranet | Free. Gives dates and usually a short guest name. No e-mail, phone or guest count. Cancellations are detected when a booking disappears from the feed. |

A channel-manager adapter (full guest details, explicit cancellations) can be
added later as another adapter without changing the reservation domain.

To use your real calendars: set `BOOKING_INTEGRATION_MODE=ical`, restart the
API, then add one feed per room with
`POST /api/integrations/booking/feeds` (`name`, `url`, `propertyId`, `unitId`).
Feed links contain a private token: they are stored in the database only and
never returned by the API.

## Architecture

```
Booking.com ──► Adapter (mock / iCal) ──► NormalizedReservation ──► SyncService ──► PostgreSQL
                 src/integrations/          src/domain/               src/modules/sync
```

- `src/domain/` – pure business rules, no framework or database: stay dates
  (check-in inclusive, check-out exclusive), conflict detection, mapping
  resolution, the create/update/unchanged decision, cancellation-by-absence.
- `src/integrations/` – one adapter per reservation source. Nothing outside an
  adapter knows the provider's data format. New sources implement
  `ReservationSourceAdapter`.
- `src/modules/` – NestJS controllers (HTTP only) and application services
  (use cases, transactions, audit).
- `prisma/` – schema, versioned SQL migrations, idempotent seed.

Key guarantees:

- **No duplicates.** A reservation is identified by `(source, externalId)`, and
  PostgreSQL enforces it with a unique index.
- **Nothing is deleted.** Cancellations change the status; units and properties
  are deactivated, not removed.
- **No guessing.** An unknown room produces a reservation with `unitId = NULL`
  (pending assignment) and a mapping row that needs a unit. Linking the room
  (`PATCH /api/mappings/:id`) resolves the waiting reservations; assigning by hand
  (`POST /api/reservations/:id/assign-unit`) sticks across future syncs.
- **Everything important is audited** in `audit_logs`.

## API

All routes are under `/api`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness + database check |
| GET/POST | `/properties` | List / create properties (`?includeInactive=true`) |
| GET/PATCH | `/properties/:id` | Detail with units and reservation summary / edit |
| POST | `/properties/:id/deactivate`, `/activate` | |
| GET/POST | `/properties/:id/units` | List / create units |
| PATCH | `/units/:id` | Edit unit |
| POST | `/units/:id/deactivate`, `/activate` | |
| GET | `/reservations` | Filters: `propertyId unitId source status from to q unassigned conflicts page pageSize` |
| GET | `/reservations/:id` | Detail, conflicts, history |
| POST | `/reservations/:id/assign-unit` | `{ unitId }` |
| GET | `/conflicts` | Current and future conflicts |
| GET | `/calendar?from=&to=` | Units, reservations and conflicts in `[from, to)` |
| GET | `/dashboard` | Today, occupancy, upcoming, attention required |
| GET | `/integrations`, `/integrations/booking` | Connection status and last sync |
| POST | `/integrations/booking/sync` | Run a synchronization |
| GET/POST/PATCH | `/integrations/booking/feeds[/:id]` | iCal feed configuration |
| GET/POST/PATCH | `/mappings[/:id]` | External room ↔ local unit (`?source=BOOKING`) |
| GET | `/syncs`, `/syncs/:id` | Synchronization history |

## Scripts

| Command | What it does |
|---------|--------------|
| `pnpm db:up` / `pnpm db:down` | Start / stop PostgreSQL |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed (safe to repeat) |
| `pnpm db:reset` | **Wipe** the dev database, re-migrate and re-seed |
| `pnpm test:unit` | Domain tests (no database needed) |
| `pnpm test` | Unit + integration tests (uses the separate `amp_test` database) |
| `pnpm --filter @accommodation-manager-portal/api db:check-drift` | Confirm migrations match `schema.prisma` |

Schema changes: edit `schema.prisma`, then run
`pnpm --filter @accommodation-manager-portal/api db:migrate:dev --name <change>`.

## Web app structure (atomic design)

```
apps/web/src/
  components/
    atoms/       shadcn/ui primitives: Button, Badge, Card, Input, Table, Dialog, Sheet…
    molecules/   small combinations: StatCard, FormField, status badges, EmptyState…
    organisms/   feature blocks: BookingCalendar, ReservationTable, SyncPanel, MappingTable…
    templates/   page skeletons: AppShell (navigation), PageLayout
  pages/         one per route, wiring data hooks to organisms
  hooks/         TanStack Query hooks (all server state)
  lib/           API client, types, date helpers
```

`components.json` points shadcn's `ui` alias at `atoms`, so
`pnpm dlx shadcn@latest add <component>` (run in `apps/web`) drops new
primitives in the right place.
