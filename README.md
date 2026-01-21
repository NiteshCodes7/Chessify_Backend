```md
# ♟️ Chess Multiplayer Backend (Server-Authoritative)

A real-time, scalable, server-authoritative chess backend powering matchmaking, gameplay, spectators, reconnection, persistence, and rating updates.

---

## 🚀 Features (Completed)

### 🎮 Chess Engine (Server-Side)
- Full chess rules
- Legal move validation
- Check & Checkmate detection
- Stalemate detection
- Castling legality
- Enforces server authority (anti-cheat)
- No client trust required

### 🌐 Realtime Multiplayer (Socket.IO)
- Room-based real-time games
- Player vs Player via matchmaking
- Spectator joins (read-only)
- Reconnection restores full state
- Disconnect cleanup
- WebSocket auth via JWT

### 🔍 Matchmaking System
- Rating-based matchmaking (±100)
- Single timeout exit
- Queue cleanup on cancel or disconnect
- Player-color assignment (white/black)

### ⏱ Chess Clocks
- Server owns time state
- Time decrements on turn
- Increment per move supported
- Timeout → win for opponent
- Refresh-safe clock sync
- Spectators view correct time

### 💾 Persistence (Prisma + PostgreSQL)
- Stores each game:
  - PGN-like move list
  - White/Black player IDs
  - Result
  - End time
- Supports replay & analysis

### 👤 Users & Accounts
- Email + Password auth (optional)
- OAuth Social login (Google/GitHub)
- JWT access tokens
- Refresh tokens ready
- Profiles + Avatars + Rating

### 🎯 Ratings (ELO System)
- Rating stored on `User`
- Leaderboard-ready
- Matchmaking uses rating

---

## 🧱 Tech Stack

- **NestJS** — Application framework
- **Socket.IO** — Real-time layer
- **Prisma ORM** — DB access
- **PostgreSQL** — Database
- **JWT** — Authentication
- **TypeScript**

---

## 🗂 Architecture
src/
auth/ # login, JWT, OAuth strategies
game/ # gateway + state logic
matchmaking/ # rating queue system
chess/ # full ruleset (shared logic)
rating/ # ELO update logic
persistence/ # DB write/read


---

## 🧩 Core System Architecture

### **Authoritative Game Loop**
Client sends: move intent
Server validates move
Server updates board
Server updates clocks
Server updates rating (only at end)
Server broadcasts new authoritative state
Clients render


### **Spectators**
Client sends: spectate(gameId)
Server sends: full game state
Client subscribes to move/clock broadcasts


### **Reconnection**
Client sends: reconnect
Server checks playerGameMap
Server sends full authoritative state
Client resumes seamlessly


---

## 🔌 WebSocket Events

### **Client → Server**
| Event | Description |
|---|---|
| `find_match` | start matchmaking |
| `cancel_matchmaking` | exit queue |
| `move` | move intent |
| `spectate` | watch game |
| `reconnect` | try restore session |

### **Server → Client**
| Event | Description |
|---|---|
| `match_found` | game assigned |
| `match_cancelled` | user cancelled |
| `match_timeout` | no match found |
| `authoritative_move` | validated move |
| `state_update` | clocks + board |
| `timeout` | time loss |
| `reconnected` | restore full state |

---

## 🗃 Database Schema (Prisma)

### `User`
id, email, name, avatar, googleId, githubId, rating, passwordHash, createdAt

### `Game`
id, whitePlayerId, blackPlayerId, moves (array), result, endedAt

---

## ▶️ Running Locally

### Install Dependencies
```bash
npm install

docker run --name chess-postgres -e POSTGRES_PASSWORD=admin -p 5432:5432 -d postgres
npx prisma migrate dev
npm run start:dev
```

### Environment Variables
Create a `.env` file with:
```
DATABASE_URL=postgresql://postgres:admin@localhost:5432/postgres
JWT_SECRET=supersecret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```


