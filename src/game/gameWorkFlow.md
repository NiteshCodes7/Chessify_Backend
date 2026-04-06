# 🧠 GameGateway Workflow (Chess Server)

This document explains the full lifecycle of a game inside `GameGateway` so you can quickly recall how everything works.

---

# 🔌 1. Connection Flow

### When client connects:

* JWT token is verified
* `userId` is extracted
* Socket joins:

  ```
  user:{userId}
  ```
* If invalid → disconnect

---

# 🔎 2. Matchmaking

### Event: `find_match`

* Player added to matchmaking queue
* When match found:

  * Game is created
  * Both players receive `gameId`
  * Stored in:

    ```
    games (in-memory)
    playerGameMap
    ```

---

# 🏠 3. Join Game

### Event: `join_game`

* Socket joins room:

  ```
  room = gameId
  ```
* Player status → `"playing"`
* Friends notified via presence system

---

# 🔁 4. Reconnection

### Event: `reconnect`

* Lookup:

  ```
  playerGameMap[userId]
  ```

* If game exists:

  * Rejoin room
  * Send:

    * board
    * turn
    * timers
    * promotion state

* If not:

  ```
  no_active_game
  ```

---

# 👀 5. Spectators

### Event: `spectate`

* Only allowed if user is NOT playing another game
* Joins game room
* Receives current state immediately

---

# ♟️ 6. Move Flow (CORE LOGIC)

### Event: `move`

### Steps:

#### 1. Validate game + user

* Game exists?
* User belongs to game?
* Correct turn?

#### 2. Validate move

* Piece exists
* Correct color
* `isMoveLegal(...)`

#### 3. Special cases

* Promotion → trigger `promotion_needed`
* Castling → move rook

#### 4. Apply move

* Update board
* Switch turn
* Update timers

#### 5. Time handling

* Deduct elapsed time
* Add increment
* If time ≤ 0 → timeout

#### 6. Calculate status

```
getGameStatus(board, nextTurn)
```

#### 7. Broadcast

```
authoritative_move
state_update
```

#### 8. Persist move

```
saveMove()
```

#### 9. Check game end

* Checkmate → finalizeGame
* Stalemate → finalizeGame

---

# ♟️ 7. Promotion Flow

### Event: `promote`

Steps:

1. Replace pawn with selected piece
2. Update timer
3. Switch turn
4. Recalculate status
5. Broadcast updated board

⚠️ IMPORTANT:

* Must also check for:

  * checkmate
  * stalemate

---

# ⏰ 8. Timeout Flow

Triggered when:

```
player time <= 0
```

### Action:

* Emit:

  ```
  game_over { state: "timeout", winner }
  ```
* Persist result
* Update ratings

---

# 🏁 9. Game Finalization (Unified)

### Function: `finalizeGame`

Handles ALL endings:

* checkmate
* stalemate
* timeout

### Steps:

1. Emit:

   ```
   game_over
   ```
2. Save result in DB
3. Update ratings
4. Remove players from:

   ```
   playerGameMap
   ```
5. Set presence → `"online"`
6. Notify friends
7. Delete game:

   ```
   games.delete(gameId)
   ```

---

# 🧹 10. Disconnect

### On socket disconnect:

* Remove from matchmaking queue
* Does NOT delete game immediately

---

# 📦 Key Data Structures

### `games`

* In-memory active games

### `playerGameMap`

* Maps:

  ```
  userId → { gameId, color }
  ```

---

# 🔁 Event Summary

## Client → Server

* `find_match`
* `join_game`
* `move`
* `promote`
* `reconnect`
* `spectate`

## Server → Client

* `authoritative_move`
* `state_update`
* `promotion_needed`
* `game_over`
* `reconnected`
* `no_active_game`

---

# 🎯 Mental Model

```
CONNECT → MATCH → JOIN → PLAY → (MOVE LOOP)
                                ↓
                        STATUS CHECK
                                ↓
                        GAME OVER → CLEANUP
```

---

# ⚠️ Common Pitfalls

* ❌ Not deep cloning board → invalid move validation
* ❌ Missing status updates → UI doesn’t react
* ❌ Not clearing store → old game persists
* ❌ Multiple end-game flows → inconsistent behavior

---

# ✅ Golden Rule

> Always end the game through ONE function (`finalizeGame`)

---

# 🧠 One-line Summary

> GameGateway is a real-time state machine that validates moves, syncs board state, and guarantees a single authoritative game flow.

---
