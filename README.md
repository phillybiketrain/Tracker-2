# Philly Bike Train Tracker

Fixed-route bike transit for Philadelphia. Clean, fast, mobile-first.

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
npm install
```

This will install:
- Express (REST API server)
- Socket.io (Real-time GPS broadcasting)
- PostgreSQL client (Database connection)
- And other dependencies...

### Step 2: Set Up Database

```bash
npm run db:setup
```

This creates the `bike_train` database and enables PostGIS.

### Step 3: Run Migrations

```bash
npm run db:migrate
```

This creates all the tables (routes, ride_instances, followers, etc).

### Step 4: Start Development Server

```bash
npm run dev
```

This starts:
- Backend API on http://localhost:3001
- Frontend app on http://localhost:5173 (when we build it)

---

## 📁 Project Structure

```
PBT/
├── server/              # Backend (Express + Socket.io)
│   ├── db/             # Database setup and queries
│   ├── routes/         # API endpoints (will create)
│   └── websocket/      # Real-time GPS (will create)
│
├── app/                # Frontend (SvelteKit) (will create)
│   └── src/
│       ├── routes/     # Pages
│       └── lib/        # Components & utilities
│
├── .env                # Environment variables (local)
├── .env.example        # Template for .env
└── package.json        # Dependencies and scripts
```

---

## 🗺️ What We're Building

### Core Flow:
1. **Create Route**: Draw path on map → Get 4-letter access code (e.g., "XMKP")
2. **Lead Ride**: Broadcast GPS on scheduled date
3. **Follow Ride**: Enter code → Track leader in real-time

### Pages:
- `/` - Home
- `/browse` - List upcoming rides
- `/lead/new` - Create route
- `/lead/:code` - Broadcast GPS
- `/follow/:code` - Track leader

---

## 🔧 Environment Variables

Edit `.env` file:

```bash
# Database (already configured for local)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bike_train

# Server
PORT=3001

# Email (add when ready for Mailgun)
MAILGUN_API_KEY=your_key_here
MAILGUN_DOMAIN=your_domain_here

# Mapbox (add when ready for maps)
PUBLIC_MAPBOX_TOKEN=your_token_here
```

---

## 📊 Database Tables

- **routes** - Fixed paths with departure times
- **ride_instances** - Specific dates for routes
- **ride_followers** - Who's tracking live rides
- **ride_interest** - Who's interested in scheduled rides
- **email_subscribers** - Weekly digest subscribers
- **route_suggestions** - Demand heatmap data
- **admin_users** - Admin authentication

---

## 🎯 Next Steps

After running the setup commands above, I'll build:

1. ✅ Express API endpoints for routes
2. ✅ Socket.io WebSocket for GPS
3. ✅ SvelteKit frontend pages
4. ✅ Mapbox integration for maps

---

## 🐛 Troubleshooting

**npm install fails:**
- Make sure you're in `C:\dev2\PBT` directory
- Run `npm cache clean --force` then try again

**Database connection fails:**
- Check PostgreSQL is running
- Verify password in `.env` matches your postgres password
- Default password is `postgres`

**Port already in use:**
- Change `PORT=3001` in `.env` to another number (e.g., 3002)
