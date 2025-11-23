# Bike Train Tracker - Complete Implementation Guide

## How to Use This Document

This is an **exhaustive, step-by-step implementation guide** designed to rebuild the Bike Train Tracker app from scratch in a single Claude Code session.

### For Claude Code: Prompt Sequence

Use these prompts in order. Each prompt builds on the previous one.

```
PROMPT 1: "Read REBUILD_PLAN_IMPLEMENTATION.md and set up the project structure according to Part 2. Create all directories and configuration files exactly as specified."

PROMPT 2: "Implement the database layer from Part 3. Create the schema, migrations, and all repository classes."

PROMPT 3: "Implement the backend API from Part 4. Create all routes, services, and middleware."

PROMPT 4: "Implement the WebSocket layer from Part 5. Set up Socket.io with all event handlers."

PROMPT 5: "Implement the frontend from Part 6. Create all pages, components, and stores."

PROMPT 6: "Implement background jobs and email service from Part 7."

PROMPT 7: "Run all validation checks from Part 8. Fix any issues found."

PROMPT 8: "Create deployment configuration from Part 9 and prepare for production."
```

### Build Validation Checkpoints

After each part, verify:
- ✅ All files created
- ✅ No TypeScript/lint errors
- ✅ Tests pass (if applicable)
- ✅ Server starts without errors
- ✅ Database migrations run successfully

---

# Part 1: Project Overview

## What We're Building

A privacy-first bike ride tracking platform with:
- Real-time GPS tracking via WebSockets
- Route creation and scheduling
- Email notification system
- Demand heatmap
- Admin moderation
- Mobile-first responsive design
- API-first architecture

## Technology Stack

**Backend:**
- Node.js 20+
- Express.js 4
- Socket.io 4
- PostgreSQL 15
- Redis (Upstash)
- Zod validation
- Bull queues

**Frontend:**
- SvelteKit 2
- Tailwind CSS 3
- DaisyUI
- Mapbox GL JS
- Svelte stores

**Infrastructure:**
- Vercel (frontend + serverless functions)
- Neon (PostgreSQL)
- Upstash (Redis)
- Resend (email)

## Project Structure

```
bike-train-tracker/
├── src/
│   ├── lib/                    # Shared code
│   │   ├── server/            # Backend code
│   │   │   ├── db/            # Database
│   │   │   ├── repositories/  # Data access
│   │   │   ├── services/      # Business logic
│   │   │   ├── routes/        # API routes
│   │   │   ├── websocket/     # Socket.io
│   │   │   ├── jobs/          # Background jobs
│   │   │   ├── middleware/    # Express middleware
│   │   │   └── utils/         # Utilities
│   │   └── shared/            # Client/server shared
│   │       ├── types/         # TypeScript types
│   │       └── validation/    # Zod schemas
│   │
│   ├── routes/                # SvelteKit routes (pages)
│   │   ├── +layout.svelte
│   │   ├── +page.svelte
│   │   ├── browse/
│   │   ├── ride/
│   │   ├── follow/
│   │   ├── lead/
│   │   ├── demand/
│   │   ├── subscribe/
│   │   └── admin/
│   │
│   ├── components/            # Svelte components
│   ├── stores/                # Svelte stores
│   └── app.html               # HTML template
│
├── static/                    # Static assets
├── tests/                     # Tests
├── scripts/                   # Utility scripts
├── .env.example
├── package.json
├── svelte.config.js
├── vite.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

# Part 2: Project Setup

## Step 1: Initialize Project

```bash
# Create new directory
mkdir bike-train-tracker-v2
cd bike-train-tracker-v2

# Initialize npm
npm init -y

# Install SvelteKit
npm create svelte@latest .
# Select:
# - Skeleton project
# - TypeScript syntax
# - ESLint
# - Prettier
# - Playwright
# - Vitest

# Install dependencies
npm install
```

## Step 2: Install All Dependencies

```bash
# Backend dependencies
npm install express socket.io pg redis ioredis
npm install zod bcrypt jsonwebtoken nanoid
npm install nodemailer date-fns
npm install bullmq
npm install @upstash/redis
npm install @neondatabase/serverless

# Frontend dependencies
npm install mapbox-gl daisyui
npm install @mapbox/mapbox-gl-geocoder
npm install chart.js svelte-chartjs

# Dev dependencies
npm install -D @types/express @types/node
npm install -D @types/pg @types/bcrypt
npm install -D @types/jsonwebtoken
npm install -D @types/mapbox-gl
npm install -D tsx nodemon
npm install -D tailwindcss postcss autoprefixer
npm install -D vite-plugin-node
```

## Step 3: Configuration Files

### `package.json` (update scripts)

```json
{
  "name": "bike-train-tracker-v2",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm:dev:*\"",
    "dev:vite": "vite dev",
    "dev:server": "tsx watch src/lib/server/index.ts",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "tsx src/lib/server/db/migrate.ts",
    "db:seed": "tsx src/lib/server/db/seed.ts"
  }
}
```

### `tsconfig.json`

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022", "DOM"],
    "paths": {
      "$lib": ["./src/lib"],
      "$lib/*": ["./src/lib/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.js", "src/**/*.svelte"],
  "exclude": ["node_modules"]
}
```

### `svelte.config.js`

```javascript
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      runtime: 'nodejs20.x'
    }),
    alias: {
      '$lib': './src/lib'
    }
  }
};

export default config;
```

### `vite.config.ts`

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['@mapbox/mapbox-gl-geocoder']
  }
});
```

### `tailwind.config.js`

```javascript
import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        secondary: '#10b981',
        accent: '#f59e0b',
        danger: '#ef4444'
      }
    }
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        light: {
          primary: '#2563eb',
          secondary: '#10b981',
          accent: '#f59e0b',
          neutral: '#6b7280',
          'base-100': '#ffffff',
          info: '#3abff8',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444'
        },
        dark: {
          primary: '#3b82f6',
          secondary: '#34d399',
          accent: '#fbbf24',
          neutral: '#9ca3af',
          'base-100': '#1f2937',
          info: '#3abff8',
          success: '#34d399',
          warning: '#fbbf24',
          error: '#f87171'
        }
      }
    ]
  }
};
```

### `postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

### `.env.example`

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# Redis
REDIS_URL="redis://user:password@host:6379"

# Email (Resend)
RESEND_API_KEY="re_..."
FROM_EMAIL="noreply@biketraintacker.com"

# Mapbox
PUBLIC_MAPBOX_TOKEN="pk...."

# JWT
JWT_SECRET="generate-a-random-secret-here"

# Admin
ADMIN_PASSWORD_HASH="$2b$12$..."

# App
PUBLIC_APP_URL="http://localhost:5173"
NODE_ENV="development"
```

### `src/app.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Mapbox CSS */
@import 'mapbox-gl/dist/mapbox-gl.css';

/* Custom styles */
@layer base {
  html {
    @apply h-full;
  }

  body {
    @apply h-full bg-base-100 text-base-content;
  }
}

@layer components {
  .btn-primary {
    @apply bg-primary text-white hover:bg-primary/90;
  }

  .card-compact {
    @apply bg-base-200 rounded-lg shadow-md p-4;
  }
}
```

### `src/app.html`

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Privacy-first bike train tracking" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

## Step 4: Create Directory Structure

```bash
# Backend directories
mkdir -p src/lib/server/{db,repositories,services,routes,websocket,jobs,middleware,utils}
mkdir -p src/lib/server/routes/{api,admin}
mkdir -p src/lib/server/db/migrations

# Shared directories
mkdir -p src/lib/shared/{types,validation}

# Frontend directories
mkdir -p src/routes/{browse,ride,follow,lead,demand,subscribe,admin}
mkdir -p src/lib/components/{ui,maps,forms}
mkdir -p src/lib/stores
mkdir -p src/lib/utils

# Test directories
mkdir -p tests/{unit,integration,e2e}

# Scripts
mkdir -p scripts
```

---

# Part 3: Database Layer

## Database Schema

### `src/lib/server/db/schema.sql`

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Core Tables
-- ============================================

-- Regions
CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  default_zoom INTEGER DEFAULT 12,
  bounds JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags (ride categories)
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  icon TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  show_in_filters BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (organizers only)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (temporary tracking for privacy)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fingerprint_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_fingerprint ON sessions(fingerprint_hash);

-- ============================================
-- Routes & Rides
-- ============================================

-- Routes (reusable route definitions)
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  access_code TEXT UNIQUE NOT NULL,

  name TEXT NOT NULL,
  description TEXT,
  region_id TEXT REFERENCES regions(id),
  neighborhood TEXT,

  waypoints JSONB NOT NULL,
  departure_time TIME NOT NULL,
  estimated_duration INTERVAL,

  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  recurrence_end_date DATE,

  status TEXT DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routes_region ON routes(region_id);
CREATE INDEX idx_routes_status ON routes(status);
CREATE INDEX idx_routes_access_code ON routes(access_code);
CREATE INDEX idx_routes_creator ON routes(creator_id);

-- Route instances (specific scheduled rides)
CREATE TABLE ride_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,

  status TEXT DEFAULT 'scheduled',
  cancellation_reason TEXT,

  notification_type TEXT,
  notification_message TEXT,
  notification_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(route_id, date)
);

CREATE INDEX idx_instances_date ON ride_instances(date);
CREATE INDEX idx_instances_status ON ride_instances(status);
CREATE INDEX idx_instances_start_time ON ride_instances(start_time);
CREATE INDEX idx_instances_route ON ride_instances(route_id);

-- Route tags (many-to-many)
CREATE TABLE route_tags (
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (route_id, tag_id)
);

CREATE INDEX idx_route_tags_route ON route_tags(route_id);
CREATE INDEX idx_route_tags_tag ON route_tags(tag_id);

-- ============================================
-- Engagement
-- ============================================

-- Ride interests
CREATE TABLE ride_interests (
  ride_instance_id UUID REFERENCES ride_instances(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ride_instance_id, session_id)
);

-- Ride demand (community suggestions)
CREATE TABLE ride_demands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

  start_lat REAL NOT NULL,
  start_lng REAL NOT NULL,
  start_address TEXT,
  end_lat REAL NOT NULL,
  end_lng REAL NOT NULL,
  end_address TEXT,

  preferred_days INTEGER[],
  preferred_time_ranges TEXT[],

  region_id TEXT REFERENCES regions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
);

CREATE INDEX idx_demands_region ON ride_demands(region_id);
CREATE INDEX idx_demands_expires ON ride_demands(expires_at);

-- ============================================
-- Notifications
-- ============================================

-- Email subscribers
CREATE TABLE email_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,

  frequency TEXT DEFAULT 'weekly',
  regions TEXT[] DEFAULT '{}',
  tag_ids UUID[] DEFAULT '{}',

  status TEXT DEFAULT 'active',
  unsubscribe_token TEXT UNIQUE,

  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  last_email_sent_at TIMESTAMPTZ,
  email_count INTEGER DEFAULT 0
);

CREATE INDEX idx_subscribers_status ON email_subscribers(status);
CREATE INDEX idx_subscribers_frequency ON email_subscribers(frequency);
CREATE INDEX idx_subscribers_email ON email_subscribers(email);

-- ============================================
-- Real-time Tracking
-- ============================================

-- Broadcast logs (for analytics)
CREATE TABLE broadcast_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_instance_id UUID REFERENCES ride_instances(id),
  leader_session_id UUID REFERENCES sessions(id),

  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  follower_count_max INTEGER DEFAULT 0
);

CREATE INDEX idx_broadcast_logs_instance ON broadcast_logs(ride_instance_id);
CREATE INDEX idx_broadcast_logs_started ON broadcast_logs(started_at);

-- ============================================
-- Administration
-- ============================================

-- Admins
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,

  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret TEXT,

  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin sessions
CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,

  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash);

-- Audit log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,

  action_type TEXT NOT NULL,
  action_details JSONB,
  resource_type TEXT,
  resource_id UUID,

  ip_address_hash TEXT,
  user_agent_hash TEXT,

  success BOOLEAN DEFAULT true,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action_type);

-- ============================================
-- Analytics
-- ============================================

-- Usage metrics (hourly aggregation)
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hour TIMESTAMPTZ NOT NULL UNIQUE,

  active_rides INTEGER DEFAULT 0,
  active_sessions INTEGER DEFAULT 0,
  rides_created INTEGER DEFAULT 0,
  rides_joined INTEGER DEFAULT 0,
  api_requests INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_hour ON usage_metrics(hour DESC);

-- ============================================
-- Functions & Triggers
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ride_instances_updated_at
  BEFORE UPDATE ON ride_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Clean up expired sessions automatically
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### `src/lib/server/db/seed.sql`

```sql
-- Seed regions
INSERT INTO regions (id, name, center_lat, center_lng, default_zoom, is_active) VALUES
  ('philadelphia', 'Philadelphia', 39.9526, -75.1652, 12, true),
  ('portland', 'Portland, OR', 45.5152, -122.6784, 12, true)
ON CONFLICT (id) DO NOTHING;

-- Seed tags
INSERT INTO tags (name, slug, color, icon, description, sort_order) VALUES
  ('Regular Service', 'regular-service', '#2563eb', '🚴', 'Recurring scheduled rides', 1),
  ('Community Ride', 'community-ride', '#10b981', '👥', 'Open community gathering rides', 2),
  ('Special Event', 'special-event', '#f59e0b', '⭐', 'One-time special events', 3),
  ('Social Ride', 'social-ride', '#ec4899', '🎉', 'Fun group rides', 4),
  ('Commuter Train', 'commuter-train', '#6366f1', '💼', 'Work and commuting focused', 5)
ON CONFLICT (slug) DO NOTHING;
```

## Database Client

### `src/lib/server/db/client.ts`

```typescript
import { neon, neonConfig } from '@neondatabase/serverless';
import { DATABASE_URL } from '../config/env';

neonConfig.fetchConnectionCache = true;

export const sql = neon(DATABASE_URL);

export class DatabaseClient {
  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    try {
      const result = await sql(text, params);
      return result as T[];
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(text, params);
    return results[0] || null;
  }

  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    // Note: Neon serverless doesn't support traditional transactions
    // Use BEGIN/COMMIT manually if needed
    return callback(this);
  }
}

export const db = new DatabaseClient();
```

### `src/lib/server/db/migrate.ts`

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './client';

async function migrate() {
  console.log('Running database migrations...');

  // Read schema file
  const schemaPath = join(process.cwd(), 'src/lib/server/db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  try {
    // Execute schema
    await db.query(schema);
    console.log('✅ Schema created successfully');

    // Run seed data
    const seedPath = join(process.cwd(), 'src/lib/server/db/seed.sql');
    const seed = readFileSync(seedPath, 'utf-8');
    await db.query(seed);
    console.log('✅ Seed data inserted successfully');

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
```

## Environment Configuration

### `src/lib/server/config/env.ts`

```typescript
import { config } from 'dotenv';

config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const DATABASE_URL = getEnv('DATABASE_URL');
export const REDIS_URL = getEnv('REDIS_URL');
export const RESEND_API_KEY = getEnv('RESEND_API_KEY');
export const FROM_EMAIL = getEnv('FROM_EMAIL');
export const JWT_SECRET = getEnv('JWT_SECRET');
export const ADMIN_PASSWORD_HASH = getEnv('ADMIN_PASSWORD_HASH');
export const APP_URL = getEnv('PUBLIC_APP_URL', 'http://localhost:5173');
export const NODE_ENV = getEnv('NODE_ENV', 'development');
export const PORT = parseInt(getEnv('PORT', '3001'));
```

---

# Part 4: Shared Types & Validation

## Type Definitions

### `src/lib/shared/types/index.ts`

```typescript
export type Region = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
  bounds?: [[number, number], [number, number]];
  is_active: boolean;
  created_at: Date;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon?: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  show_in_filters: boolean;
  created_at: Date;
};

export type Waypoint = {
  lat: number;
  lng: number;
  address?: string;
};

export type Route = {
  id: string;
  creator_id?: string;
  access_code: string;
  name: string;
  description?: string;
  region_id: string;
  neighborhood?: string;
  waypoints: Waypoint[];
  departure_time: string;
  estimated_duration?: string;
  is_recurring: boolean;
  recurrence_rule?: string;
  recurrence_end_date?: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at?: Date;
  approved_by?: string;
  created_at: Date;
  updated_at: Date;
  tags?: Tag[];
};

export type RideInstance = {
  id: string;
  route_id: string;
  date: string;
  start_time: Date;
  end_time?: Date;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  cancellation_reason?: string;
  notification_type?: string;
  notification_message?: string;
  notification_sent_at?: Date;
  created_at: Date;
  updated_at: Date;
  route?: Route;
  interest_count?: number;
};

export type RideDemand = {
  id: string;
  session_id?: string;
  start_lat: number;
  start_lng: number;
  start_address?: string;
  end_lat: number;
  end_lng: number;
  end_address?: string;
  preferred_days: number[];
  preferred_time_ranges: string[];
  region_id: string;
  created_at: Date;
  expires_at: Date;
};

export type EmailSubscriber = {
  id: string;
  email: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  regions: string[];
  tag_ids: string[];
  status: 'active' | 'paused' | 'unsubscribed';
  unsubscribe_token: string;
  subscribed_at: Date;
  last_email_sent_at?: Date;
  email_count: number;
};

export type Session = {
  id: string;
  fingerprint_hash: string;
  created_at: Date;
  expires_at: Date;
};

export type User = {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Admin = {
  id: string;
  user_id: string;
  password_hash: string;
  mfa_enabled: boolean;
  mfa_secret?: string;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
};

export type AdminSession = {
  id: string;
  admin_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
};

export type AuditLog = {
  id: string;
  admin_id?: string;
  action_type: string;
  action_details?: any;
  resource_type?: string;
  resource_id?: string;
  ip_address_hash?: string;
  user_agent_hash?: string;
  success: boolean;
  error_message?: string;
  created_at: Date;
};
```

## Validation Schemas (Zod)

### `src/lib/shared/validation/route.ts`

```typescript
import { z } from 'zod';

export const WaypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional()
});

export const CreateRouteSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  region_id: z.string(),
  neighborhood: z.string().max(100).optional(),
  waypoints: z.array(WaypointSchema).min(2),
  departure_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  estimated_duration: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.string().optional(),
  recurrence_end_date: z.string().optional(),
  tag_ids: z.array(z.string()).optional()
});

export const CreateRideInstanceSchema = z.object({
  route_id: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1)
});

export const UpdateRouteSchema = CreateRouteSchema.partial().omit({ waypoints: true });
```

### `src/lib/shared/validation/demand.ts`

```typescript
import { z } from 'zod';

export const CreateRideDemandSchema = z.object({
  start_lat: z.number().min(-90).max(90),
  start_lng: z.number().min(-180).max(180),
  start_address: z.string().optional(),
  end_lat: z.number().min(-90).max(90),
  end_lng: z.number().min(-180).max(180),
  end_address: z.string().optional(),
  preferred_days: z.array(z.number().min(0).max(6)).min(1),
  preferred_time_ranges: z.array(z.enum(['morning', 'afternoon', 'evening'])).min(1),
  region_id: z.string()
});
```

### `src/lib/shared/validation/subscription.ts`

```typescript
import { z } from 'zod';

export const CreateSubscriptionSchema = z.object({
  email: z.string().email(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
  regions: z.array(z.string()).default([]),
  tag_ids: z.array(z.string()).default([])
});

export const UpdateSubscriptionSchema = CreateSubscriptionSchema.partial().omit({ email: true });
```

### `src/lib/shared/validation/auth.ts`

```typescript
import { z } from 'zod';

export const AdminLoginSchema = z.object({
  password: z.string().min(1)
});

export const AccessCodeSchema = z.object({
  access_code: z.string().length(8)
});
```

---

# Part 5: Backend - Repositories

Repositories handle all database queries. Each repository corresponds to a table.

### `src/lib/server/repositories/RouteRepository.ts`

```typescript
import { db } from '../db/client';
import type { Route, Waypoint } from '$lib/shared/types';
import { nanoid } from 'nanoid';

export class RouteRepository {
  async create(data: {
    creator_id?: string;
    name: string;
    description?: string;
    region_id: string;
    neighborhood?: string;
    waypoints: Waypoint[];
    departure_time: string;
    estimated_duration?: string;
    is_recurring?: boolean;
    recurrence_rule?: string;
    recurrence_end_date?: string;
  }): Promise<Route> {
    const access_code = nanoid(8);

    const result = await db.queryOne<Route>(
      `INSERT INTO routes (
        creator_id, access_code, name, description, region_id, neighborhood,
        waypoints, departure_time, estimated_duration, is_recurring,
        recurrence_rule, recurrence_end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        data.creator_id || null,
        access_code,
        data.name,
        data.description || null,
        data.region_id,
        data.neighborhood || null,
        JSON.stringify(data.waypoints),
        data.departure_time,
        data.estimated_duration || null,
        data.is_recurring || false,
        data.recurrence_rule || null,
        data.recurrence_end_date || null
      ]
    );

    return this.parseRoute(result!);
  }

  async findById(id: string): Promise<Route | null> {
    const result = await db.queryOne<any>(
      `SELECT r.*,
        json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color, 'icon', t.icon)) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM routes r
      LEFT JOIN route_tags rt ON r.id = rt.route_id
      LEFT JOIN tags t ON rt.tag_id = t.id
      WHERE r.id = $1
      GROUP BY r.id`,
      [id]
    );

    return result ? this.parseRoute(result) : null;
  }

  async findByAccessCode(accessCode: string): Promise<Route | null> {
    const result = await db.queryOne<any>(
      `SELECT r.*,
        json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color, 'icon', t.icon)) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM routes r
      LEFT JOIN route_tags rt ON r.id = rt.route_id
      LEFT JOIN tags t ON rt.tag_id = t.id
      WHERE r.access_code = $1
      GROUP BY r.id`,
      [accessCode]
    );

    return result ? this.parseRoute(result) : null;
  }

  async findAll(filters?: {
    region_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Route[]> {
    let query = `
      SELECT r.*,
        json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color, 'icon', t.icon)) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM routes r
      LEFT JOIN route_tags rt ON r.id = rt.route_id
      LEFT JOIN tags t ON rt.tag_id = t.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.region_id) {
      query += ` AND r.region_id = $${paramIndex++}`;
      params.push(filters.region_id);
    }

    if (filters?.status) {
      query += ` AND r.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    query += ` GROUP BY r.id ORDER BY r.created_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(filters.offset);
    }

    const results = await db.query<any>(query, params);
    return results.map(r => this.parseRoute(r));
  }

  async update(id: string, data: Partial<Route>): Promise<Route | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (updates.length === 0) return null;

    params.push(id);
    const result = await db.queryOne<Route>(
      `UPDATE routes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result ? this.parseRoute(result) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM routes WHERE id = $1', [id]);
    return result.length > 0;
  }

  async setTags(routeId: string, tagIds: string[]): Promise<void> {
    // Delete existing tags
    await db.query('DELETE FROM route_tags WHERE route_id = $1', [routeId]);

    // Insert new tags
    if (tagIds.length > 0) {
      const values = tagIds.map((tagId, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO route_tags (route_id, tag_id) VALUES ${values}`,
        [routeId, ...tagIds]
      );
    }
  }

  private parseRoute(raw: any): Route {
    return {
      ...raw,
      waypoints: typeof raw.waypoints === 'string' ? JSON.parse(raw.waypoints) : raw.waypoints,
      tags: raw.tags || []
    };
  }
}

export const routeRepository = new RouteRepository();
```

### `src/lib/server/repositories/RideInstanceRepository.ts`

```typescript
import { db } from '../db/client';
import type { RideInstance } from '$lib/shared/types';

export class RideInstanceRepository {
  async create(data: {
    route_id: string;
    date: string;
    start_time: Date;
    end_time?: Date;
  }): Promise<RideInstance> {
    const result = await db.queryOne<RideInstance>(
      `INSERT INTO ride_instances (route_id, date, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [data.route_id, data.date, data.start_time, data.end_time || null]
    );

    return result!;
  }

  async findById(id: string): Promise<RideInstance | null> {
    const result = await db.queryOne<any>(
      `SELECT ri.*, r.*,
        (SELECT COUNT(*) FROM ride_interests WHERE ride_instance_id = ri.id) as interest_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      WHERE ri.id = $1`,
      [id]
    );

    return result;
  }

  async findUpcoming(filters?: {
    region_id?: string;
    tag_ids?: string[];
    from_date?: Date;
    to_date?: Date;
    status?: string;
    limit?: number;
  }): Promise<RideInstance[]> {
    let query = `
      SELECT ri.*,
        json_build_object(
          'id', r.id,
          'name', r.name,
          'description', r.description,
          'region_id', r.region_id,
          'neighborhood', r.neighborhood,
          'waypoints', r.waypoints,
          'access_code', r.access_code,
          'tags', (
            SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color))
            FROM route_tags rt
            JOIN tags t ON rt.tag_id = t.id
            WHERE rt.route_id = r.id
          )
        ) as route,
        (SELECT COUNT(*) FROM ride_interests WHERE ride_instance_id = ri.id) as interest_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      WHERE ri.status = $1
    `;

    const params: any[] = [filters?.status || 'scheduled'];
    let paramIndex = 2;

    if (filters?.from_date) {
      query += ` AND ri.start_time >= $${paramIndex++}`;
      params.push(filters.from_date);
    }

    if (filters?.to_date) {
      query += ` AND ri.start_time <= $${paramIndex++}`;
      params.push(filters.to_date);
    }

    if (filters?.region_id) {
      query += ` AND r.region_id = $${paramIndex++}`;
      params.push(filters.region_id);
    }

    if (filters?.tag_ids && filters.tag_ids.length > 0) {
      query += ` AND EXISTS (
        SELECT 1 FROM route_tags rt
        WHERE rt.route_id = r.id AND rt.tag_id = ANY($${paramIndex++})
      )`;
      params.push(filters.tag_ids);
    }

    query += ` ORDER BY ri.start_time ASC`;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    const results = await db.query<any>(query, params);
    return results.map(r => this.parseInstance(r));
  }

  async updateStatus(id: string, status: string): Promise<RideInstance | null> {
    const result = await db.queryOne<RideInstance>(
      'UPDATE ride_instances SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    return result;
  }

  async addInterest(instanceId: string, sessionId: string): Promise<void> {
    await db.query(
      `INSERT INTO ride_interests (ride_instance_id, session_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING`,
      [instanceId, sessionId]
    );
  }

  async removeInterest(instanceId: string, sessionId: string): Promise<void> {
    await db.query(
      'DELETE FROM ride_interests WHERE ride_instance_id = $1 AND session_id = $2',
      [instanceId, sessionId]
    );
  }

  async getInterestCount(instanceId: string): Promise<number> {
    const result = await db.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM ride_interests WHERE ride_instance_id = $1',
      [instanceId]
    );

    return parseInt(result?.count || '0');
  }

  private parseInstance(raw: any): RideInstance {
    return {
      ...raw,
      route: raw.route ? {
        ...raw.route,
        waypoints: typeof raw.route.waypoints === 'string'
          ? JSON.parse(raw.route.waypoints)
          : raw.route.waypoints
      } : undefined
    };
  }
}

export const rideInstanceRepository = new RideInstanceRepository();
```

### `src/lib/server/repositories/SessionRepository.ts`

```typescript
import { db } from '../db/client';
import type { Session } from '$lib/shared/types';
import { createHash } from 'crypto';

export class SessionRepository {
  async create(fingerprint: string): Promise<Session> {
    const fingerprintHash = this.hashFingerprint(fingerprint);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const result = await db.queryOne<Session>(
      `INSERT INTO sessions (fingerprint_hash, expires_at)
      VALUES ($1, $2)
      RETURNING *`,
      [fingerprintHash, expiresAt]
    );

    return result!;
  }

  async findById(id: string): Promise<Session | null> {
    return db.queryOne<Session>(
      'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()',
      [id]
    );
  }

  async findByFingerprint(fingerprint: string): Promise<Session | null> {
    const fingerprintHash = this.hashFingerprint(fingerprint);

    return db.queryOne<Session>(
      'SELECT * FROM sessions WHERE fingerprint_hash = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [fingerprintHash]
    );
  }

  async deleteExpired(): Promise<number> {
    const result = await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
    return result.length;
  }

  private hashFingerprint(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }
}

export const sessionRepository = new SessionRepository();
```

### `src/lib/server/repositories/DemandRepository.ts`

```typescript
import { db } from '../db/client';
import type { RideDemand } from '$lib/shared/types';

export class DemandRepository {
  async create(data: {
    session_id?: string;
    start_lat: number;
    start_lng: number;
    start_address?: string;
    end_lat: number;
    end_lng: number;
    end_address?: string;
    preferred_days: number[];
    preferred_time_ranges: string[];
    region_id: string;
  }): Promise<RideDemand> {
    const result = await db.queryOne<RideDemand>(
      `INSERT INTO ride_demands (
        session_id, start_lat, start_lng, start_address,
        end_lat, end_lng, end_address, preferred_days,
        preferred_time_ranges, region_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.session_id || null,
        data.start_lat,
        data.start_lng,
        data.start_address || null,
        data.end_lat,
        data.end_lng,
        data.end_address || null,
        data.preferred_days,
        data.preferred_time_ranges,
        data.region_id
      ]
    );

    return result!;
  }

  async findAll(filters?: {
    region_id?: string;
    from_date?: Date;
  }): Promise<RideDemand[]> {
    let query = 'SELECT * FROM ride_demands WHERE expires_at > NOW()';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.region_id) {
      query += ` AND region_id = $${paramIndex++}`;
      params.push(filters.region_id);
    }

    if (filters?.from_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.from_date);
    }

    query += ' ORDER BY created_at DESC';

    return db.query<RideDemand>(query, params);
  }
}

export const demandRepository = new DemandRepository();
```

### `src/lib/server/repositories/SubscriberRepository.ts`

```typescript
import { db } from '../db/client';
import type { EmailSubscriber } from '$lib/shared/types';
import { nanoid } from 'nanoid';

export class SubscriberRepository {
  async create(data: {
    email: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    regions: string[];
    tag_ids: string[];
  }): Promise<EmailSubscriber> {
    const unsubscribe_token = nanoid(32);

    const result = await db.queryOne<EmailSubscriber>(
      `INSERT INTO email_subscribers (email, frequency, regions, tag_ids, unsubscribe_token)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        frequency = EXCLUDED.frequency,
        regions = EXCLUDED.regions,
        tag_ids = EXCLUDED.tag_ids,
        status = 'active'
      RETURNING *`,
      [data.email, data.frequency, data.regions, data.tag_ids, unsubscribe_token]
    );

    return result!;
  }

  async findByEmail(email: string): Promise<EmailSubscriber | null> {
    return db.queryOne<EmailSubscriber>(
      'SELECT * FROM email_subscribers WHERE email = $1',
      [email]
    );
  }

  async findByToken(token: string): Promise<EmailSubscriber | null> {
    return db.queryOne<EmailSubscriber>(
      'SELECT * FROM email_subscribers WHERE unsubscribe_token = $1',
      [token]
    );
  }

  async findByFrequency(frequency: string): Promise<EmailSubscriber[]> {
    return db.query<EmailSubscriber>(
      'SELECT * FROM email_subscribers WHERE frequency = $1 AND status = $2',
      [frequency, 'active']
    );
  }

  async update(id: string, data: Partial<EmailSubscriber>): Promise<EmailSubscriber | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.frequency) {
      updates.push(`frequency = $${paramIndex++}`);
      params.push(data.frequency);
    }

    if (data.regions) {
      updates.push(`regions = $${paramIndex++}`);
      params.push(data.regions);
    }

    if (data.tag_ids) {
      updates.push(`tag_ids = $${paramIndex++}`);
      params.push(data.tag_ids);
    }

    if (data.status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (updates.length === 0) return null;

    params.push(id);
    return db.queryOne<EmailSubscriber>(
      `UPDATE email_subscribers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
  }

  async unsubscribe(token: string): Promise<boolean> {
    const result = await db.query(
      'UPDATE email_subscribers SET status = $1 WHERE unsubscribe_token = $2',
      ['unsubscribed', token]
    );

    return result.length > 0;
  }
}

export const subscriberRepository = new SubscriberRepository();
```

### `src/lib/server/repositories/TagRepository.ts`

```typescript
import { db } from '../db/client';
import type { Tag } from '$lib/shared/types';

export class TagRepository {
  async findAll(filters?: { is_active?: boolean }): Promise<Tag[]> {
    let query = 'SELECT * FROM tags WHERE 1=1';
    const params: any[] = [];

    if (filters?.is_active !== undefined) {
      query += ' AND is_active = $1';
      params.push(filters.is_active);
    }

    query += ' ORDER BY sort_order ASC, name ASC';

    return db.query<Tag>(query, params);
  }

  async findById(id: string): Promise<Tag | null> {
    return db.queryOne<Tag>('SELECT * FROM tags WHERE id = $1', [id]);
  }

  async findBySlug(slug: string): Promise<Tag | null> {
    return db.queryOne<Tag>('SELECT * FROM tags WHERE slug = $1', [slug]);
  }
}

export const tagRepository = new TagRepository();
```

---

**This is Part 1 of the implementation guide. Due to length constraints, I'll need to continue with:**

- Part 6: Backend Services
- Part 7: Backend Routes (API)
- Part 8: WebSocket Layer
- Part 9: Frontend Components
- Part 10: Frontend Pages
- Part 11: Background Jobs
- Part 12: Testing & Validation
- Part 13: Deployment

Would you like me to continue with the next sections? I'll create multiple files to keep it organized, or continue appending to this one document.