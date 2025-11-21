# Philly Bike Train Tracker

Fixed-route bike transit for Philadelphia. Clean, fast, mobile-first.

Professional civic transit app with Headspace-inspired design: warm colors, straightforward navigation, information-dense control panel interface.

## Quick Start

### 1. Install Dependencies

```bash
npm install
cd app && npm install && cd ..
```

### 2. Configure Environment Variables

**Backend** - Edit `C:\dev2\PBT\.env`:
```bash
DATABASE_URL=postgresql://postgres:Frankie0620!@localhost:5432/bike_train
PORT=3001
NODE_ENV=development
PUBLIC_APP_URL=http://localhost:5173
```

**Frontend** - Edit `C:\dev2\PBT\app\.env`:
```bash
PUBLIC_MAPBOX_TOKEN=pk.YOUR_MAPBOX_TOKEN_HERE
```

Get your free Mapbox token: https://account.mapbox.com/access-tokens/ (see [MAPBOX_SETUP.md](MAPBOX_SETUP.md))

### 3. Set Up Database

```bash
npm run db:setup    # Creates bike_train database + PostGIS
npm run db:migrate  # Creates tables
```

### 4. Start Development

```bash
npm run dev
```

Opens:
- Backend API: http://localhost:3001
- Frontend app: http://localhost:5173

---

## Project Structure

```
PBT/
├── server/                    # Backend (Express + Socket.io)
│   ├── db/
│   │   ├── schema.sql        # Database schema
│   │   ├── setup.js          # Database creation
│   │   └── migrate.js        # Table creation
│   ├── routes/
│   │   ├── routes.js         # Route creation API
│   │   ├── rides.js          # Ride instance API
│   │   └── admin.js          # Admin endpoints
│   └── index.js              # Server + WebSocket
│
├── app/                       # Frontend (SvelteKit)
│   └── src/
│       ├── routes/
│       │   ├── +page.svelte           # Home
│       │   ├── +layout.svelte         # Global layout + navbar
│       │   ├── browse/+page.svelte    # Browse rides
│       │   ├── lead/+page.svelte      # Create route + broadcast
│       │   ├── follow/+page.svelte    # Leader access code entry
│       │   └── ride/[id]/+page.svelte # Follower tracking
│       ├── lib/
│       │   └── components/
│       │       └── Map.svelte         # Mapbox GL map
│       ├── app.css                    # Global styles
│       └── app.html
│   └── tailwind.config.js             # Design system
│
├── .env                       # Backend environment variables
├── DEPLOYMENT.md              # GitHub + Railway deployment guide
├── MAPBOX_SETUP.md            # Mapbox token setup
└── package.json
```

---

## Core Flow

### For Leaders (Route Creators):
1. Visit `/lead` → Draw route on map
2. Add route details (name, departure time, duration)
3. Schedule dates for the ride
4. Get 4-letter access code (e.g., "XMKP")
5. On ride day: Enter access code at `/follow` → Start broadcasting GPS
6. Watch follower count grow in real-time

### For Followers (Ride Trackers):
1. Visit `/browse` → See all upcoming rides
2. Click a ride → View details at `/ride/[id]`
3. When ride goes live → Track leader in real-time on map
4. No access code needed - just browse and click

**Key Design Decision**: Access codes are for leaders only. Followers browse and track rides directly without codes.

---

## Design System

Inspired by Tidal (straightforwardness) × Headspace (warm colors, rounded shapes):

**Typography:**
- Headlines: Space Grotesk with tight tracking (-0.02em)
- Body: System fonts (-apple-system, BlinkMacSystemFont)

**Colors:**
- Primary: #FF9F66 (soft orange/peach)
- Secondary: #6FB3B8 (muted blue-green)
- Accent: #E8B4BC (soft pink)
- Background: #FAF9F7 (warm cream)
- Text: Warm grays (50-900)

**Style:**
- Information-dense "control panel" interface
- Large glanceable stats for mobile
- Minimal scrolling
- No emojis - professional civic service aesthetic
- Rounded corners (1.5rem border radius)

---

## API Endpoints

**Routes:**
- `POST /api/routes` - Create route
- `POST /api/routes/:accessCode/schedule` - Schedule ride dates
- `GET /api/routes/:accessCode` - Get route by access code

**Rides:**
- `GET /api/rides` - List all rides (query: ?date, ?status)
- `GET /api/rides/:id` - Get ride details
- `POST /api/rides/:id/interest` - Express interest (followers)

**Health:**
- `GET /api/health` - Server status

---

## WebSocket Events

**Leader (broadcaster):**
- `ride:start` → `ride:started` - Start broadcasting
- `location:update` - Send GPS coordinates
- `ride:end` - Stop broadcasting
- Listen: `follower:joined`, `follower:left`

**Follower (tracker):**
- `follow:start` → `follow:started` - Start tracking
- Listen: `location:updated` - Receive leader GPS
- `follow:stop` - Stop tracking

---

## Database Schema

**routes** - Fixed paths with waypoints
- `id`, `name`, `description`, `waypoints` (JSONB), `departure_time`, `estimated_duration`, `access_code` (4-letter), `region_id`

**ride_instances** - Scheduled rides
- `id`, `route_id`, `date`, `status` (scheduled/live/completed), `leader_location` (Point), `location_trail` (JSONB), `follower_count`

**ride_followers** - Who's tracking live
- `id`, `ride_instance_id`, `session_id`, `joined_at`

**ride_interest** - Who's interested in scheduled rides
- `id`, `ride_instance_id`, `session_id`, `created_at`

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete GitHub + Railway deployment guide.

**Quick Summary:**
1. Push to GitHub
2. Deploy backend to Railway (with PostgreSQL)
3. Deploy frontend to Vercel (or Railway)
4. Configure environment variables
5. Run database migrations on production

---

## Troubleshooting

**Maps not loading:**
- Get Mapbox token: https://account.mapbox.com/access-tokens/
- Add to `app/.env`: `PUBLIC_MAPBOX_TOKEN=pk.your_token`
- Restart frontend: `cd app && npm run dev`

**Database connection fails:**
- Check PostgreSQL is running
- Verify password in `.env`: `Frankie0620!`
- Run `npm run db:setup` to create database

**Port already in use:**
- Change `PORT=3001` in `.env` to another number

**CORS errors:**
- Ensure `PUBLIC_APP_URL` in backend `.env` matches frontend URL
- Default: `http://localhost:5173` (no trailing slash)
