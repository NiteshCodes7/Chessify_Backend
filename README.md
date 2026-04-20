# Chessify — Backend

A real-time multiplayer chess backend built with NestJS, featuring WebSocket game engine, Elo matchmaking, friend presence tracking, and JWT authentication with token rotation.

---

## API Overview

Chessify backend exposes REST APIs for authentication, friends, users, and game history, plus WebSocket events for real-time gameplay.

### Main REST Modules

| Module | Base Route | Purpose |
|---|---|---|
| Auth | `/auth/*` | Login, register, OTP, refresh, logout |
| Friends | `/friends/*` | Friend requests, accept/reject, list |
| Game | `/game/*` | Fetch games and replays |
| Users | `/users/*` | Profile data and updates |

### Real-Time WebSocket Namespaces

| Namespace | Purpose |
|---|---|
| `/` | Matchmaking, moves, rematch, invites, Direct messages and game chat |
| `/presence` | Online/offline friend status |

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [WebSocket Gateways](#websocket-gateways)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Deployment](#deployment)

---

## Features

- **Chess game engine** — Legal move validation, castling, en passant, promotion, check/checkmate/stalemate detection
- **Elo matchmaking** — Rating-based queue with configurable tolerance, FIFO ordering
- **Live presence** — Redis-backed online/offline/playing status with socket room source of truth
- **Friend system** — Send/accept/reject friend requests, unfriend, list friends with presence
- **JWT authentication** — 4-token system with rotation, bcrypt hashing, token reuse detection
- **Google OAuth** — Full profile import with auto-generated username
- **OTP verification** — Email OTP for registration and password reset
- **Game persistence** — All moves stored, full replay support
- **Elo rating updates** — Automatic rating adjustment after each game
- **Abandonment detection** — 30-second reconnect window with auto-forfeit
- **Temporary bans** — Redis TTL-based matchmaking bans for abandoners
- **Spectator mode** — Join any active game as observer

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS |
| Language | TypeScript |
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Cache | Redis (Upstash) |
| Real-time | Socket.io |
| Auth | JWT (jsonwebtoken), bcrypt |
| Email | Nodemailer |
| Validation | class-validator |

---

## Architecture

<!-- ARCHITECTURE DIAGRAM: Full system architecture from Eraser.io -->
> > ![System Architecture](./assets/architecture.png)
[View Full Architecture on Eraser.io](https://app.eraser.io/workspace/YLQYjAGwqekeW8xuezXB)

---

## Authentication

### 4-Token System

| Token | Format | Storage | Expiry | Purpose |
|---|---|---|---|---|
| `accessToken` | JWT | Client memory | 10 min | API authorization |
| `refreshToken` | `tokenId.rawToken` | DB (hashed) | 7 days | Token rotation |
| `sessionToken` | JWT | httpOnly cookie | 7 days | Middleware verification |
| `wsToken` | JWT | localStorage | 1 hours | WebSocket handshake |

### Token Rotation

```
POST /auth/refresh
  → validate refreshToken against DB hash (bcrypt)
  → delete old refreshToken record
  → issue new accessToken + refreshToken + wsToken
  → detect reuse: if tokenId found but hash mismatch → invalidate all user tokens
```

### BFF Proxy

The frontend proxies all auth through Next.js API routes to solve cross-domain cookie restrictions. The backend sets cookies with `sameSite: none` + `secure: true` in production.

<!-- ARCHITECTURE DIAGRAM: Auth token flow -->
> ![Authentication Architecture](./assets/auth.png)

---

## WebSocket Gateways

Three gateways on a single port, separated by namespace:

### `/presence` — PresenceGateway
- Handles `handleConnection` / `handleDisconnect` only
- Sets user status in Redis on connect/disconnect
- 5-second disconnect debounce with `Map<userId, NodeJS.Timeout>`
- Fetches socket room membership (`fetchSockets`) as source of truth — not Redis counters
- Events: `get_friends_with_presence`, `presence_update`, `friends_with_presence`

### `/` (default) — GameGateway
- Matchmaking queue (FIFO, Elo-rated)
- Game move validation and broadcast
- Promotion, castling, timeout handling
- Rematch flow, friend invites
- Abandonment timers with ban system

### `/chat` — ChatGateway  
- DM persistence to PostgreSQL
- Game chat persistence
- Real-time delivery to both participants

<!-- ARCHITECTURE DIAGRAM: Socket namespace diagram -->
> ![Socket Connection](./assets/socket.png)

### In-Memory Maps

```typescript
games          Map<gameId, GameState>        // Active games
playerGameMap  Map<userId, { gameId, color }> // Player → game lookup
rematchRequests Map<gameId, RematchRequest>   // Pending rematch state
invites        Map<inviteId, InviteState>     // Pending friend invites
abandonTimers  Map<userId, NodeJS.Timeout>    // Disconnect grace timers
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis

### Installation

```bash
git clone https://github.com/yourusername/chessify-backend
cd chessify-backend
npm install
```

### Database Setup

```bash
# Apply migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### Development

```bash
npm run start:dev
```

Server runs on [http://localhost:3001](http://localhost:3001)

---

## Environment Variables

Create a `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chessify

# Redis
REDIS_URL=redis://localhost:6379 or Run via Docker

# JWT
JWT_ACCESS_SECRET=your-access-secret
JWT_WS_SECRET=your-ws-secret

# App
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
PORT=3001

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

# Mail
MAIL_HOST=smtp.gmail.com
MAIL_USER=your@email.com
MAIL_PASS=your-app-password
MAIL_FROM=noreply@chessify.com
```

---

## Project Structure

```
src/
├── auth/
│   ├── auth.controller.ts      # Login, register, refresh, logout, Google OAuth
│   ├── auth.service.ts         # Token issuance, rotation, OTP, bcrypt
│   └── guards/
│       ├── access.guard.ts     # JWT access token guard
│       └── ws.guard.ts         # WebSocket token guard
├── game/
│   ├── game.gateway.ts         # WebSocket: moves, matchmaking, rematch, invites
│   ├── game.controller.ts      # REST: get games, get game by id
│   ├── game.store.ts           # In-memory game state Map
│   └── player-map.ts           # userId → gameId Map
├── presence/
│   ├── presence.gateway.ts     # WebSocket /presence namespace
│   └── presence.service.ts     # Redis status get/set
├── chat/
│   ├── chat.gateway.ts         # WebSocket /chat namespace
│   └── chat.service.ts         # DM + game message persistence
├── matchmaking/
│   └── matchmaking.service.ts  # Elo queue, createDirectMatch
├── friends/
│   ├── friends.controller.ts   # REST: requests, accept, reject, list, unfriend
│   └── friends.service.ts      # Friendship CRUD with presence enrichment
├── chess/
│   ├── isMoveLegal.ts          # Full legal move validation (pins, checks)
│   └── getGameStatus.ts        # Checkmate, stalemate, check detection
├── game-persistence/
│   └── game-persistence.service.ts  # Save moves, end game, get history
├── rating/
│   └── rating.service.ts       # Elo calculation and update
├── users/
│   └── users.controller.ts     # GET /users/:id
├── mail/
│   └── mail.service.ts         # OTP email sending
├── prisma/
│   └── prisma.service.ts       # Prisma client wrapper
└── main.ts                     # Bootstrap, CORS, cookie parser, validation pipe
```

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register with email/password |
| POST | `/auth/login` | — | Login, returns tokens |
| POST | `/auth/verify-otp` | — | Verify email OTP |
| POST | `/auth/resend-otp` | — | Resend OTP |
| POST | `/auth/refresh` | Cookie | Rotate refresh token |
| POST | `/auth/logout` | Cookie | Invalidate session |
| POST | `/auth/forgot-password` | — | Send reset OTP |
| POST | `/auth/reset-password` | — | Reset password with OTP |
| GET | `/auth/me` | Bearer | Get current user |
| GET | `/auth/google` | — | Google OAuth redirect |
| GET | `/auth/google/callback` | — | Google OAuth callback |
| POST | `/auth/set-username` | Bearer | Set username (first time) |
| GET | `/auth/check-username` | — | Check username availability |

### Friends

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/friends/request` | Bearer | Send friend request by email |
| GET | `/friends/requests` | Bearer | Get pending requests |
| POST | `/friends/accept/:id` | Bearer | Accept friend request |
| POST | `/friends/reject/:id` | Bearer | Reject friend request |
| GET | `/friends` | Bearer | List friends with presence |
| DELETE | `/friends/:id` | Bearer | Unfriend |

### Games

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/game` | Bearer | Get all user games |
| GET | `/game/:id` | Bearer | Get game with moves |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users/:id` | Bearer | Get user by ID |
| PATCH | `/users/me` | Bearer | Update profile |

### WebSocket Events

**Game namespace (`/`)**

| Event | Direction | Payload | Description |
|---|---|---|---|
| `find_match` | Client → Server | — | Join matchmaking queue |
| `cancel_match` | Client → Server | — | Leave queue |
| `match_found` | Server → Client | `{ gameId, color, timeMs }` | Match created |
| `join_game` | Client → Server | `gameId` | Join game room |
| `move` | Client → Server | `{ gameId, from, to }` | Make a move |
| `authoritative_move` | Server → Client | `{ board, turn, time, status }` | Validated move broadcast |
| `game_over` | Server → Client | `{ state, winner }` | Game ended |
| `reconnect` | Client → Server | — | Reconnect to active game |
| `reconnected` | Server → Client | `{ board, turn, color, time }` | Game state restored |
| `promote` | Client → Server | `{ gameId, position, pieceType }` | Pawn promotion |
| `invite_friend` | Client → Server | `{ friendId }` | Send game invite |
| `invite_response` | Client → Server | `{ inviteId, accept }` | Accept/decline invite |
| `game_invite` | Server → Client | `{ inviteId, from, fromName }` | Incoming invite |

**Presence namespace (`/presence`)**

| Event | Direction | Payload | Description |
|---|---|---|---|
| `get_friends_with_presence` | Client → Server | — | Fetch friends + statuses |
| `friends_with_presence` | Server → Client | `Friend[]` | Friends list with status |
| `presence_update` | Server → Client | `{ userId, status }` | Status change |

---

## Prisma Schema Overview

```
User
  ├── FriendRequest (from/to)
  ├── Friendship (userId/friendId — bidirectional)
  ├── RefreshToken
  ├── Otp
  └── Game (white/black)
       └── Move (fromRow, fromCol, toRow, toCol, moveIndex)
```

---

## Deployment

Deployed on **Render** (free tier) with automatic GitHub deployments.

```bash
# Build command
npm install --include=dev && npx prisma generate && npm run build

# Start command  
npx prisma migrate deploy && node dist/src/main
```

### Required on Render

```
DATABASE_URL     → Neon PostgreSQL connection string
REDIS_URL        → Upstash Redis URL (rediss://...)
JWT_ACCESS_SECRET
JWT_WS_SECRET
FRONTEND_URL     → Vercel deployment URL
NODE_ENV         → production
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL
MAIL_HOST / MAIL_USER / MAIL_PASS
```

### Prisma Binary Targets (Required for Render Linux)

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x", "debian-openssl-3.0.x"]
}
```

> **Note:** Render free tier spins down after 15 minutes of inactivity. A keep-alive ping from the frontend or an external cron job to `/health` every 10 minutes prevents cold starts.

---

## Related

- [Chessify Frontend](https://github.com/NiteshCodes7/Chessify_Frontend)
