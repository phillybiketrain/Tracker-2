# Philly Bike Train - Architecture Documentation

## Overview

Philly Bike Train is a real-time bike route tracking and scheduling platform that enables users to create, manage, and follow organized group bike rides. The system supports multi-city deployment with regional administration and features live GPS tracking for active rides.

---

## Tech Stack

### Frontend
- **SvelteKit** - SSR + client-side rendering framework
- **TailwindCSS** - Utility-first CSS framework
- **Mapbox GL JS** - Interactive map rendering and route visualization

### Backend
- **Node.js** - Runtime environment
- **Express** - Web application framework
- **Socket.IO** - WebSocket library for real-time communication
- **PostgreSQL** - Relational database

### Infrastructure
- **Railway** - Deployment platform (monorepo: app + server)
- **Cloudinary** - Image hosting and optimization
- **Mapbox** - Map tiles and geocoding services

---

## System Architecture

### Deployment Model

```
┌─────────────────────────────────────────┐
│         Railway Deployment              │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │  SvelteKit   │  │  Express API    │ │
│  │    App       │  │    Server       │ │
│  │  (SSR/CSR)   │  │  + Socket.IO    │ │
│  └──────────────┘  └─────────────────┘ │
│         │                   │           │
│         └───────┬───────────┘           │
│                 │                       │
└─────────────────┼───────────────────────┘
                  │
         ┌────────┴────────┐
         │   PostgreSQL    │
         │    Database     │
         └─────────────────┘
```

### Directory Structure

```
PBT/
├── app/                          # SvelteKit frontend
│   ├── src/
│   │   ├── routes/               # File-based routing
│   │   │   ├── +page.svelte                 # Homepage
│   │   │   ├── +layout.svelte               # Global layout
│   │   │   ├── browse/                      # Browse rides
│   │   │   ├── ride/[id]/                   # Ride viewer + tracking
│   │   │   ├── create/                      # Route creation
│   │   │   ├── manage/                      # Route management
│   │   │   ├── admin/                       # Admin panel
│   │   │   ├── live/                        # Live ride list
│   │   │   └── subscribe/                   # Email subscriptions
│   │   └── lib/
│   │       ├── components/
│   │       │   ├── Map.svelte               # Mapbox integration
│   │       │   └── RoutePreview.svelte      # Static map previews
│   │       └── config.js                    # API URL + tokens
│   ├── static/                   # Static assets
│   └── package.json
│
├── server/                       # Express backend
│   ├── routes/
│   │   ├── rides.js              # Browse, detail, interest
│   │   ├── routes.js             # Route CRUD, icons
│   │   ├── admin.js              # Admin operations
│   │   ├── live.js               # Live tracking
│   │   └── subscribe.js          # Email subscriptions
│   ├── db/
│   │   ├── client.js             # PostgreSQL wrapper
│   │   ├── schema.sql            # Database schema
│   │   └── migrations/           # Schema changes
│   ├── utils/
│   │   ├── upload.js             # Cloudinary integration
│   │   └── email.js              # Email notifications
│   ├── websocket.js              # Socket.IO server
│   ├── index.js                  # Entry point
│   └── package.json
│
├── ARCHITECTURE.md               # This file
└── README.md                     # Project documentation
```

---

## Data Model

### Core Entities

#### Regions
Multi-city support with regional isolation.

```sql
regions (
  id UUID PRIMARY KEY,
  name VARCHAR,
  slug VARCHAR UNIQUE
)
```

#### Routes
Reusable ride templates created by users.

```sql
routes (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  waypoints JSONB NOT NULL,              -- [{lat, lng}, ...]
  departure_time TIME,
  estimated_duration VARCHAR,
  access_code VARCHAR(6) UNIQUE,         -- Route ownership key
  creator_session_id VARCHAR,            -- Anonymous session
  region_id UUID REFERENCES regions,
  status VARCHAR DEFAULT 'pending',      -- pending | approved
  preview_image_url TEXT,                -- Cloudinary URL
  start_location_icon_url TEXT,          -- Custom route icon
  tag VARCHAR,
  created_at TIMESTAMP
)
```

#### Ride Instances
Specific occurrences of routes on particular dates.

```sql
ride_instances (
  id UUID PRIMARY KEY,
  route_id UUID REFERENCES routes,
  region_id UUID REFERENCES regions,
  date DATE NOT NULL,
  status VARCHAR DEFAULT 'scheduled',    -- scheduled | live | completed
  started_at TIMESTAMP,
  ended_at TIMESTAMP
)
```

#### Ride Interest
Users expressing interest in upcoming rides.

```sql
ride_interest (
  session_id VARCHAR,
  ride_instance_id UUID REFERENCES ride_instances,
  created_at TIMESTAMP,
  PRIMARY KEY (session_id, ride_instance_id)
)
```

#### Ride Followers
Active live tracking participants.

```sql
ride_followers (
  session_id VARCHAR,
  ride_instance_id UUID REFERENCES ride_instances,
  joined_at TIMESTAMP,
  PRIMARY KEY (session_id, ride_instance_id)
)
```

#### Admins
Regional moderators and super admins.

```sql
admins (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  password_hash VARCHAR,
  region_id UUID REFERENCES regions,
  role VARCHAR DEFAULT 'admin',          -- admin | super
  created_at TIMESTAMP
)
```

#### Subscriptions
Email notification preferences.

```sql
subscriptions (
  email VARCHAR,
  region_id UUID REFERENCES regions,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  PRIMARY KEY (email, region_id)
)
```

---

## Key Features & Workflows

### 1. Route Creation Flow

```
User Journey:
1. Navigate to /create
2. Click map to add waypoints
3. Enter route metadata (name, description, times)
4. Select future dates for ride instances
5. Submit → receives access_code
6. Route status = 'pending'
7. Admin reviews and approves
8. Route becomes publicly visible
```

**Technical Flow:**
```javascript
POST /api/routes
├─→ Generate 6-character access_code
├─→ Store waypoints as JSONB
├─→ Create route record
├─→ Create ride_instance records for each date
└─→ Return access_code to user
```

### 2. Live Tracking Flow

```
Leader (Route Creator):
1. Navigate to /manage
2. Click "Start" on today's ride
3. Browser requests GPS permission
4. Location sent via WebSocket every 3 seconds

Follower (Rider):
1. Navigate to /ride/{id}
2. Click "Track Live"
3. Join WebSocket room by access_code
4. Receive real-time location updates
5. Map auto-centers on leader (pausable)
```

**WebSocket Event Flow:**
```
Leader:
  emit: live:start { accessCode }
  emit: location:update { lat, lng, accuracy, timestamp }
  emit: live:end { accessCode }

Follower:
  emit: follow:start { accessCode }
  receive: location:updated { lat, lng, accuracy, timestamp }
  receive: follower:joined { followerCount }
  receive: ride:ended
  emit: follow:stop { accessCode }

Server:
  - Creates room per access_code
  - Broadcasts to all room members
  - Tracks follower counts
  - Cleans up on disconnect
```

### 3. Browse & Discovery

**Homepage (`/`):**
- Hero sections with project info
- Featured routes (next 5 upcoming)
- Photo gallery placeholders
- Call-to-action buttons

**Browse Page (`/browse`):**
- Filter tabs: Today | Tomorrow | This Week | All Rides
- Paginated route cards (12 per page)
- Each card shows:
  - Map preview with route path
  - Custom icon overlay (top-left)
  - Next ride date
  - Interest count
  - Live status badge

**Individual Ride (`/ride/{id}`):**
- Full map with route visualization
- Ride metadata and schedule
- "I'm Interested" button (increments counter)
- "Track Live" button (when status = 'live')
- List of other scheduled rides for same route

### 4. Admin Management

**Route Approval (`/admin/routes`):**
- View pending routes
- Approve/reject with feedback
- Regional filtering (admins see their region only)
- Super admins see all regions

**Route Editing:**
- Modify metadata
- Upload/delete custom icons
- Create/delete ride instances
- Bulk schedule future dates

**Region Management (`/admin/regions`):**
- Create new regions (super admin only)
- Manage region admins
- View regional statistics

---

## API Architecture

### RESTful Endpoints

```
Public API:
  GET  /api/rides                    # Browse rides (filtered)
  GET  /api/rides/live               # Get currently live rides
  GET  /api/rides/:id                # Get ride details
  POST /api/rides/:id/interest       # Express interest
  POST /api/routes                   # Create route
  GET  /api/routes/:accessCode       # Get route by access code

Authenticated API (Route Creators):
  POST /api/routes/:accessCode/upload-icon
  DELETE /api/routes/:accessCode/delete-icon
  POST /api/routes/:accessCode/rides     # Add ride instances
  DELETE /api/routes/:accessCode/rides/:id

Admin API (Bearer token):
  GET    /api/admin/routes               # Get routes for approval
  POST   /api/admin/routes/:id/approve
  POST   /api/admin/routes/:id/reject
  PUT    /api/admin/routes/:id
  DELETE /api/admin/routes/:id
  POST   /api/admin/routes/:id/upload-icon
  DELETE /api/admin/routes/:id/delete-icon
  POST   /api/admin/routes/:id/rides
  DELETE /api/admin/routes/:id/rides/:rideId
  GET    /api/admin/regions              # Super admin only
  POST   /api/admin/regions

Live Tracking API:
  POST /api/live/start                   # Start live ride
  POST /api/live/end                     # End live ride
  POST /api/live/location                # Update location
```

### WebSocket Events

```javascript
// Client → Server
{
  'live:start': { accessCode },
  'live:end': { accessCode },
  'location:update': { lat, lng, accuracy, timestamp },
  'follow:start': { accessCode },
  'follow:stop': { accessCode }
}

// Server → Client
{
  'live:started': { rideId },
  'location:updated': { lat, lng, accuracy, timestamp },
  'follower:joined': { followerCount },
  'follower:left': { followerCount },
  'ride:ended': {}
}
```

---

## Security Model

### Authentication Strategies

1. **Anonymous Sessions (Route Creators)**
   - localStorage session IDs
   - No signup required
   - Access via route `access_code`

2. **Admin Authentication**
   - Email/password login
   - JWT Bearer tokens
   - Regional scoping (admins) or global (super)

3. **Regional Isolation**
   - Admins can only manage routes in their region
   - Super admins bypass regional restrictions
   - Enforced at API level

### Authorization Flow

```javascript
// Route Creator
if (route.access_code === providedCode) {
  allow();
}

// Admin
if (admin.role === 'super') {
  allow();
} else if (admin.region_id === route.region_id) {
  allow();
} else {
  deny();
}
```

---

## Real-Time Architecture

### Socket.IO Room Strategy

Each live ride gets its own room identified by `access_code`:

```javascript
// Leader joins room
socket.join(accessCode);

// Broadcast location to room
io.to(accessCode).emit('location:updated', locationData);

// Track room size
const sockets = await io.in(accessCode).fetchSockets();
const followerCount = sockets.length;
```

### Auto-Centering Logic

```javascript
// Map component tracks user interaction
let userInteracting = false;

map.on('dragstart', () => {
  userInteracting = true;
  clearTimeout(autoCenterTimeout);
});

map.on('dragend', () => {
  // Resume auto-center after 3 seconds
  autoCenterTimeout = setTimeout(() => {
    userInteracting = false;
  }, 3000);
});

// Only auto-center if not interacting
if (autoCenter && !userInteracting) {
  map.flyTo({ center: leaderLocation });
}
```

---

## Image Management

### Cloudinary Integration

**Upload Flow:**
```javascript
// Frontend
const formData = new FormData();
formData.append('icon', file);
await fetch(`/api/routes/${accessCode}/upload-icon`, {
  method: 'POST',
  body: formData
});

// Backend (multer → Cloudinary)
const buffer = req.file.buffer;
const url = await uploadToCloudinary(buffer, 'route-icons');
// Auto-transforms: 128x128, quality:auto, format:auto (WebP)
```

**Image Types:**
- `preview_image_url` - Static map preview (future feature)
- `start_location_icon_url` - Custom route marker icon

**Display Locations:**
- Overlaid on route card maps (top-left, ~30% size)
- Inline with route title on ride pages
- (Planned) Start markers on regional overview maps

---

## Scalability Considerations

### Current Limitations

1. **Single Server**
   - All WebSocket connections on one instance
   - No horizontal scaling for real-time features

2. **Database**
   - Single PostgreSQL instance
   - No read replicas

3. **Location Broadcasting**
   - All location updates through single server
   - Potential bottleneck with many concurrent rides

### Growth Path

**Phase 1: Caching**
```
Add Redis for:
- Session storage
- Live ride cache
- Follower count aggregation
```

**Phase 2: Horizontal Scaling**
```
Separate concerns:
- API servers (stateless, scale easily)
- WebSocket servers (sticky sessions)
- Worker processes (background jobs)

Use Redis Pub/Sub for WebSocket coordination
```

**Phase 3: Database Optimization**
```
- Read replicas for browse/search
- Partitioning ride_instances by date
- Materialized views for statistics
```

**Phase 4: CDN & Edge**
```
- CloudFront for static assets
- Edge caching for map tiles
- Rate limiting on location updates
```

---

## Notable Design Decisions

### 1. File-Based Routing (SvelteKit)
**Why:** Automatic code-splitting, clean URLs, SSR + CSR out of the box

### 2. Direct SQL Queries (No ORM)
**Why:** Full control, performance optimization, PostgreSQL-specific features (JSONB)

### 3. Anonymous Sessions
**Why:** Lower barrier to entry, viral sharing of routes, no signup friction

### 4. Access Codes Not Passwords
**Why:** Easy to share verbally/print, less security friction, unique per route

### 5. Route-First Model
**Why:** Routes are reusable templates, ride instances are occurrences
- Enables recurring schedules
- Separates route design from specific dates

### 6. Regional Isolation
**Why:** Multi-city expansion built-in, delegated moderation, localized content

### 7. Cloudinary for Images
**Why:** Offload storage, automatic optimization, WebP conversion, CDN delivery

### 8. Mapbox GL (Not Google Maps)
**Why:** Vector tiles, offline support, customizable styling, better performance

---

## Development Workflow

### Local Setup

```bash
# Clone repository
git clone https://github.com/phillybiketrain/Tracker-2.git
cd Tracker-2

# Install dependencies
cd app && npm install
cd ../server && npm install

# Set environment variables
cp app/.env.example app/.env
cp server/.env.example server/.env

# Start development servers
cd app && npm run dev      # Port 5173
cd server && npm run dev   # Port 3000
```

### Environment Variables

**App (`.env`):**
```
PUBLIC_MAPBOX_TOKEN=pk.xxx
PUBLIC_API_URL=http://localhost:3000/api
```

**Server (`.env`):**
```
DATABASE_URL=postgresql://user:pass@localhost:5432/biketrain
SESSION_SECRET=your-secret-key
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
PORT=3000
```

### Deployment

Railway auto-deploys from `main` branch:

1. Detects Node.js monorepo
2. Builds SvelteKit app
3. Starts Express server
4. Server serves both API and app

**Build Commands:**
```json
{
  "scripts": {
    "build": "cd app && npm install && npm run build",
    "start": "node server/index.js"
  }
}
```

---

## Testing Strategy

### Current State
- Manual testing
- No automated test suite

### Recommended Additions

**Unit Tests:**
- Database query functions
- WebSocket event handlers
- Date/time utilities

**Integration Tests:**
- API endpoints
- Route creation flow
- Live tracking session

**E2E Tests:**
- Full user journeys (Playwright/Cypress)
- Cross-browser compatibility
- Mobile responsive testing

---

## Future Enhancements

### Short Term
- [ ] Email notifications for ride reminders
- [ ] Photo uploads to homepage placeholders
- [ ] Regional overview map with route start icons
- [ ] Route search and filtering

### Medium Term
- [ ] Mobile app (React Native or PWA)
- [ ] SMS notifications via Twilio
- [ ] Route statistics and analytics
- [ ] User accounts (optional, for history)

### Long Term
- [ ] Multi-language support
- [ ] Calendar integration (iCal export)
- [ ] Ride rating and reviews
- [ ] Social features (comments, photos)
- [ ] Integration with bike-share systems

---

## Contributing

See [README.md](./README.md) for contribution guidelines.

## License

See [LICENSE](./LICENSE) file.
