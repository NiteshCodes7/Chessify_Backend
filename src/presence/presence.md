START

│
├── User connects
│     │
│     ├── Verify JWT token
│     │       └── ❌ Invalid → Disconnect
│     │
│     ├── Join room: user:{userId}
│     │
│     ├── Cancel disconnect timer (if exists)
│     │
│     ├── Set status = ONLINE
│     │
│     └── Notify friends
│             └── emit "presence_update" (online)
│
│
├── Client requests friends list
│     │
│     ├── Fetch friends from DB
│     │
│     ├── For each friend:
│     │       ├── Check if connected
│     │       ├── Get status from DB
│     │       └── Decide:
│     │             online / playing / offline
│     │
│     └── Send "friends_with_presence"
│
│
├── Real-time updates
│     │
│     └── When user status changes:
│             └── emit "presence_update" to friends
│
│
├── User disconnects
│     │
│     ├── Start 5 sec timer
│     │
│     └── After 5 sec:
│             │
│             ├── Check active sockets
│             │       └── If still connected → DO NOTHING
│             │
│             └── If no sockets:
│                     │
│                     ├── If NOT playing:
│                     │       ├── Set status = OFFLINE
│                     │       └── Notify friends
│                     │             └── "presence_update" (offline)
│                     │
│                     └── If playing:
│                             └── Keep status as playing
│
END