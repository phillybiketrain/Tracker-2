# Railway Deployment Guide

Complete guide for deploying Philly Bike Train to Railway (all services in one project).

**Prerequisites:**
- ✅ GitHub repository: [phillybiketrain/Tracker-2](https://github.com/phillybiketrain/Tracker-2)
- Railway account: [railway.app](https://railway.app)

---

## Overview: Railway Project Structure

Your Railway project will contain 3 services:

1. **Backend API** (Node.js + Socket.io) - Root directory: `/`
2. **Frontend App** (SvelteKit) - Root directory: `/app`
3. **PostgreSQL Database** - Managed by Railway

---

## Step 1: Deploy Backend & Database

### 1.1 Create Project from GitHub

1. Go to [railway.app/new](https://railway.app/new)
2. Click **Deploy from GitHub repo**
3. Select **phillybiketrain/Tracker-2**
4. Railway detects Node.js and deploys the backend automatically

### 1.2 Add PostgreSQL Database

1. In your Railway project dashboard, click **+ New**
2. Select **Database** → **Add PostgreSQL**
3. PostgreSQL provisions automatically (takes ~30 seconds)

### 1.3 Configure Backend Environment Variables

Click on your backend service → **Variables** tab:

1. **Add NODE_ENV:**
   - Click **+ New Variable**
   - Name: `NODE_ENV`
   - Value: `production`

2. **Link PostgreSQL:**
   - Click **+ New Variable** → **Add Reference**
   - Select **PostgreSQL** service
   - Select **DATABASE_URL**
   - Railway auto-populates the connection string

3. **Add PUBLIC_APP_URL (placeholder for now):**
   - Click **+ New Variable**
   - Name: `PUBLIC_APP_URL`
   - Value: `https://placeholder.railway.app` (we'll update after deploying frontend)

### 1.4 Generate Backend Domain

1. Click **Settings** tab
2. Under **Networking**, click **Generate Domain**
3. Copy the URL (e.g., `https://tracker-backend-production.up.railway.app`)
4. **Save this URL** - you'll need it for the frontend

### 1.5 Initialize Database Schema

Use Railway CLI to run migrations:

```bash
# Install Railway CLI globally
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your backend service
railway link

# When prompted:
# - Select your project (e.g., "Philly Bike Train")
# - Select the backend service (the one with root directory "/")

# Run database migrations
railway run npm run db:migrate
```

**Verify:** Visit `https://your-backend-url.up.railway.app/api/health`

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 12.345
}
```

---

## Step 2: Deploy Frontend

### 2.1 Add Frontend Service

1. In Railway project dashboard, click **+ New**
2. Select **GitHub Repo**
3. Choose **phillybiketrain/Tracker-2** (same repo)
4. Railway will ask what to deploy - click **Add variables and deploy**

### 2.2 Configure Frontend Root Directory

1. Click on the new service → **Settings** tab
2. Under **Build**, find **Root Directory**
3. Set to: `app`
4. Under **Build Command**, it should auto-detect from `package.json`
5. Start command will use `app/railway.json` config

### 2.3 Add Frontend Environment Variables

Click **Variables** tab and add:

1. **PUBLIC_MAPBOX_TOKEN:**
   - Click **+ New Variable**
   - Name: `PUBLIC_MAPBOX_TOKEN`
   - Value: `pk.YOUR_MAPBOX_TOKEN_HERE`
   - Get from: https://account.mapbox.com/access-tokens/

2. **PUBLIC_API_URL** (backend URL from Step 1.4):
   - Click **+ New Variable**
   - Name: `PUBLIC_API_URL`
   - Value: `https://tracker-backend-production.up.railway.app` (use your backend URL)

### 2.4 Generate Frontend Domain

1. Still in frontend service, click **Settings** tab
2. Under **Networking**, click **Generate Domain**
3. Copy the URL (e.g., `https://tracker-frontend-production.up.railway.app`)

### 2.5 Update Backend CORS

Now that you have the frontend URL:

1. Go to **backend service** → **Variables** tab
2. Find `PUBLIC_APP_URL` variable
3. Click to edit, update value to your frontend URL:
   ```
   https://tracker-frontend-production.up.railway.app
   ```
4. Railway will automatically redeploy the backend

---

## Step 3: Verify Deployment

### 3.1 Backend Health Check

Visit: `https://your-backend.up.railway.app/api/health`

✅ Should return JSON with status "ok"

### 3.2 Frontend Home Page

Visit: `https://your-frontend.up.railway.app`

✅ Should see:
- "Browse Rides" and "Lead a Ride" cards
- Warm cream background (#FAF9F7)
- Space Grotesk headlines

### 3.3 Database Connection

In Railway dashboard:
- PostgreSQL service should show **Active** status
- Check backend **Logs** tab - no database connection errors

### 3.4 Create Test Route

1. Visit `https://your-frontend.up.railway.app/lead`
2. Click on map to add 2+ waypoints
3. Fill in:
   - Route name
   - Departure time
4. Select at least one date
5. Click "Create Route"

✅ Should receive a 4-letter access code

If all 4 checks pass, deployment is successful!

---

## Railway Services Summary

```
Railway Project: Philly Bike Train
│
├── Backend Service
│   ├── GitHub: phillybiketrain/Tracker-2
│   ├── Root Directory: / (project root)
│   ├── Start Command: npm run start
│   ├── Domain: https://tracker-backend-production.up.railway.app
│   └── Variables:
│       ├── DATABASE_URL → linked from PostgreSQL
│       ├── NODE_ENV=production
│       └── PUBLIC_APP_URL=https://tracker-frontend-production.up.railway.app
│
├── Frontend Service
│   ├── GitHub: phillybiketrain/Tracker-2
│   ├── Root Directory: app
│   ├── Start Command: PORT=$PORT npm run preview -- --host 0.0.0.0
│   ├── Domain: https://tracker-frontend-production.up.railway.app
│   └── Variables:
│       ├── PUBLIC_MAPBOX_TOKEN=pk.your_token
│       └── PUBLIC_API_URL=https://tracker-backend-production.up.railway.app
│
└── PostgreSQL Database
    ├── Type: PostgreSQL 16
    ├── Status: Active
    └── Linked to: Backend Service (DATABASE_URL)
```

---

## Troubleshooting

### Backend won't start

**Check logs:**
```bash
railway logs --service backend
```

**Common issues:**
- Missing `DATABASE_URL` - ensure PostgreSQL is linked
- Port binding error - Railway sets `PORT` automatically, ensure code uses `process.env.PORT`

### Frontend shows 404

**Check:**
- Root directory is set to `app` in Settings
- `app/railway.json` exists
- Build logs show successful Vite build

### Maps not loading

**Check:**
- `PUBLIC_MAPBOX_TOKEN` variable is set
- Token starts with `pk.`
- Token is valid at https://account.mapbox.com/access-tokens/

### API calls fail (CORS errors)

**Check:**
- `PUBLIC_APP_URL` in backend matches frontend domain exactly
- No trailing slash on URLs
- Both services are deployed and active

### Database connection fails

**Check:**
- PostgreSQL service is active
- `DATABASE_URL` is linked (not manually entered)
- Run `railway run psql` to test connection

---

## Cost Estimate

**Railway Pricing (as of 2024):**

**Hobby Plan (Free):**
- $5 execution credit/month
- Good for development and low-traffic testing
- 3 services (backend + frontend + database) should fit

**Pro Plan ($20/month):**
- $20 execution credit/month
- Recommended for production
- Custom domains included
- Better uptime guarantees

**Estimated Usage (low traffic):**
- Backend: ~$3-5/month
- Frontend: ~$2-3/month
- PostgreSQL: ~$5-7/month
- **Total:** ~$10-15/month (fits in Pro plan)

**Mapbox (Free Tier):**
- 50,000 map loads/month
- No credit card required

---

## Next Steps

1. **Custom Domains** (optional):
   - Go to service **Settings** → **Domains**
   - Add custom domain (e.g., `tracker.phillybiketrain.org`)

2. **Monitoring:**
   - Railway provides built-in metrics
   - Consider adding Sentry for error tracking

3. **Backups:**
   - Railway auto-backs up PostgreSQL
   - Configure backup retention in database settings

4. **CI/CD:**
   - Railway auto-deploys on git push to `main`
   - Configure branch deploys in **Settings** → **Source**

5. **Environment Separation:**
   - Create separate Railway projects for staging/production
   - Use git branches to trigger different deploys

---

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Philly Bike Train: Open issue on GitHub
