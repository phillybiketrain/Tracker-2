# Deployment Guide

Complete guide for deploying Philly Bike Train to Railway.

**Prerequisites:**
- ✅ GitHub repository: [phillybiketrain/Tracker-2](https://github.com/phillybiketrain/Tracker-2)
- Railway account: [railway.app](https://railway.app)

---

## Deploy to Railway (3 Services in 1 Project)

Railway project will contain:
1. **Backend API** (Node.js + Socket.io)
2. **Frontend App** (SvelteKit)
3. **PostgreSQL Database**

---

## Step 1: Create Railway Project & Deploy Backend

### 1.1 Create Project from GitHub

1. Go to [railway.app/new](https://railway.app/new)
2. Click **Deploy from GitHub repo**
3. Select **phillybiketrain/Tracker-2**
4. Railway detects it as Node.js and deploys the backend automatically

### 1.2 Add PostgreSQL Database

1. In your Railway project dashboard, click **+ New**
2. Select **Database** → **Add PostgreSQL**
3. PostgreSQL provisions automatically

### 1.3 Configure Backend Service

Click on your backend service, then go to **Variables**:

1. Click **+ New Variable** and add:
   ```
   NODE_ENV=production
   ```

2. Click **+ Reference** → Select **PostgreSQL** → Add `DATABASE_URL`
   - This links the database automatically

3. Add frontend URL (we'll update this after deploying frontend):
   ```
   PUBLIC_APP_URL=https://your-frontend-service.up.railway.app
   ```
   (Placeholder for now - update after Step 2)

4. Click **Settings** → Under **Networking**, click **Generate Domain**
   - Copy this URL (e.g., `https://backend-abc123.up.railway.app`)
   - You'll need it for the frontend

### 1.4 Initialize Database Schema

Install Railway CLI and run migrations:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your backend service
railway link

# Select your project and backend service when prompted

# Run migrations
railway run npm run db:migrate
```

**Verification:** Visit `https://your-backend-url.up.railway.app/api/health` - should return `{"status":"ok"}`

---

## Step 2: Deploy Frontend Service

### 2.1 Add Frontend Service

1. In Railway project dashboard, click **+ New**
2. Select **GitHub Repo** → Choose **phillybiketrain/Tracker-2** again
3. Railway will ask what to deploy - click **Add Service**

### 2.2 Configure Frontend Root Directory

1. Click on the new service → **Settings**
2. Under **Build**, set **Root Directory**: `app`
3. Under **Deploy**, Railway will use `app/railway.json` config automatically

### 2.3 Add Frontend Environment Variables

Click **Variables** tab and add:

1. **PUBLIC_MAPBOX_TOKEN**
   ```
   pk.YOUR_MAPBOX_TOKEN_HERE
   ```
   Get token from: https://account.mapbox.com/access-tokens/

2. **PUBLIC_API_URL** (backend URL from Step 1.4)
   ```
   https://backend-abc123.up.railway.app
   ```

3. Click **Settings** → **Networking** → **Generate Domain**
   - This is your frontend URL (e.g., `https://frontend-xyz789.up.railway.app`)

### 2.4 Update Backend CORS

Go back to **backend service** → **Variables**:

Update `PUBLIC_APP_URL` to match your frontend URL:
```
PUBLIC_APP_URL=https://frontend-xyz789.up.railway.app
```

Click **Redeploy** on the backend service after updating.

---

## Step 3: Update Frontend API Calls

Your frontend needs to know where the backend is. Update the API URL:

### Option A: Environment Variable (Recommended)

The `PUBLIC_API_URL` variable you set in Step 2.3 will be used automatically if your frontend code reads from `import.meta.env.PUBLIC_API_URL`.

### Option B: Hardcode (Quick Fix)

If fetch calls use `http://localhost:3001`, update them to use the Railway backend URL:

```javascript
const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
```

Update in:
- [app/src/routes/lead/+page.svelte](app/src/routes/lead/+page.svelte) (lines 76, 98)
- [app/src/routes/browse/+page.svelte](app/src/routes/browse/+page.svelte)
- [app/src/routes/ride/[id]/+page.svelte](app/src/routes/ride/[id]/+page.svelte)
- [app/src/routes/follow/+page.svelte](app/src/routes/follow/+page.svelte)

---

## Step 4: Verify Deployment

### Backend Health Check
Visit: `https://your-backend.up.railway.app/api/health`

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 123.456
}
```

### Frontend Home Page
Visit: `https://your-frontend.up.railway.app`

Should see:
- Home page with "Browse Rides" and "Lead a Ride" cards
- Warm cream background
- Space Grotesk font

### Database Connection
Check Railway dashboard:
- PostgreSQL service shows **Active**
- Backend logs show no database errors

### Create Test Route
1. Go to `/lead` on your frontend
2. Click map to add waypoints
3. Fill in route details
4. Should receive 4-letter access code

If this works, your entire stack is deployed successfully!

---

## Railway Project Structure

```
Railway Project: Philly Bike Train
│
├── Service 1: Backend (phillybiketrain/Tracker-2)
│   ├── Root Directory: / (project root)
│   ├── Start Command: npm run start
│   └── Environment:
│       ├── DATABASE_URL (linked from PostgreSQL)
│       ├── NODE_ENV=production
│       └── PUBLIC_APP_URL=https://frontend-xyz.up.railway.app
│
├── Service 2: Frontend (phillybiketrain/Tracker-2)
│   ├── Root Directory: app
│   ├── Start Command: PORT=$PORT npm run preview -- --host 0.0.0.0
│   └── Environment:
│       ├── PUBLIC_MAPBOX_TOKEN=pk.your_token
│       └── PUBLIC_API_URL=https://backend-abc.up.railway.app
│
└── Service 3: PostgreSQL
    └── Automatically configured by Railway
```

### Step 5: Deploy Frontend (SvelteKit App)

**Two Deployment Options:**

#### Option A: Deploy Frontend Separately on Vercel (Recommended for SvelteKit)

1. Go to [vercel.com](https://vercel.com)
2. Click **Import Project** → select your GitHub repo
3. Set **Root Directory**: `app`
4. Vercel auto-detects SvelteKit
5. Add environment variables:
   - `PUBLIC_MAPBOX_TOKEN`: Your Mapbox token
6. Click **Deploy**

**Update Backend**: Change `PUBLIC_APP_URL` in Railway backend to your Vercel URL

#### Option B: Deploy Both on Railway (Monorepo)

Create a second Railway service in the same project:

1. Click **New Service** → **GitHub Repo** → select same repo
2. Set **Root Directory**: `app`
3. Add environment variables:
   - `PUBLIC_MAPBOX_TOKEN`: Your Mapbox token
4. Deploy

**Note**: You'll need to update CORS settings in `server/index.js` to allow the frontend URL.

### Step 6: Configure CORS

Update `server/index.js` to allow your frontend URL:

```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
    credentials: true
  }
});
```

Push this change to GitHub, and Railway will auto-deploy.

### Step 7: Update Frontend API URLs

In your SvelteKit app, update API URLs to use environment variables:

Create `app/.env.production`:
```
PUBLIC_API_URL=https://your-backend.up.railway.app
```

Update fetch calls in all pages to use:
```javascript
const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

fetch(`${API_URL}/api/routes`, {
  // ...
});
```

---

## Verification Checklist

After deployment, verify:

- [ ] Backend health check: `https://your-backend.up.railway.app/health`
- [ ] Database has all tables (use Railway's PostgreSQL plugin UI)
- [ ] Frontend loads and shows homepage
- [ ] Can create a route (tests database writes)
- [ ] Can browse rides (tests database reads)
- [ ] WebSocket connection works (check browser console)
- [ ] Maps display correctly (Mapbox token working)

---

## Troubleshooting

### Database Connection Issues

Check Railway logs:
```bash
railway logs
```

Ensure `DATABASE_URL` is set and PostgreSQL service is linked.

### Build Failures

Railway uses Nixpacks. Check `railway.json` is present. View build logs in Railway dashboard.

### CORS Errors

Ensure `PUBLIC_APP_URL` matches your frontend URL exactly (no trailing slash).

### WebSocket Connection Failed

Check that Railway exposes the correct port. WebSocket should work on the same port as HTTP (3001).

---

## Cost Estimate

**Railway Free Tier:**
- $5 credit/month
- Enough for small projects
- Database + backend should fit in free tier during development

**Vercel Free Tier:**
- Unlimited personal projects
- 100GB bandwidth/month
- Perfect for SvelteKit frontend

**Mapbox Free Tier:**
- 50,000 map loads/month
- No credit card required

**Total for MVP**: $0/month (using free tiers)

---

## Next Steps After Deployment

1. Set up custom domain (optional)
2. Configure monitoring/alerts
3. Set up automated backups for PostgreSQL
4. Add analytics (Plausible, etc.)
5. Set up error tracking (Sentry, etc.)

---

For questions, see Railway docs: https://docs.railway.app
