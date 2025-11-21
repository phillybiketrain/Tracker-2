# Deployment Guide

Complete guide for deploying Philly Bike Train to GitHub and Railway.

---

## Part 1: Push to GitHub

### Step 1: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `philly-bike-train` (or your preferred name)
3. Description: `Real-time bike train tracking app for Philadelphia`
4. Keep it **Public** or **Private** (your choice)
5. **Do NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **Create repository**

### Step 2: Push Your Code

After creating the repository, GitHub will show you the commands. Use these:

```bash
cd C:\dev2\PBT

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/philly-bike-train.git

# Push your code
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Part 2: Deploy to Railway

### Prerequisites

- GitHub repository created and pushed (Part 1 above)
- Railway account: [railway.app](https://railway.app)

### Step 1: Create New Railway Project

1. Log in to [railway.app](https://railway.app)
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose your `philly-bike-train` repository
5. Railway will detect it as a Node.js project

### Step 2: Add PostgreSQL Database

1. In your Railway project, click **New Service**
2. Select **Database** → **PostgreSQL**
3. Railway will provision a PostgreSQL database automatically
4. Copy the `DATABASE_URL` from the PostgreSQL service variables

### Step 3: Configure Backend Environment Variables

In your Railway project, go to your main app service and add these variables:

```
DATABASE_URL=[automatically set by Railway when you link PostgreSQL]
NODE_ENV=production
PORT=3001
PUBLIC_APP_URL=https://your-app-name.up.railway.app
```

**Important**: After adding PostgreSQL service, click on your main app service → **Variables** → **Link** PostgreSQL database. Railway will auto-populate `DATABASE_URL`.

### Step 4: Set Up Database Schema

Railway doesn't run setup scripts automatically, so you'll need to initialize the database:

**Option A: Using Railway CLI** (Recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run database setup
railway run npm run db:setup
railway run npm run db:migrate
```

**Option B: Using psql directly**

1. Copy the `DATABASE_URL` from Railway PostgreSQL service
2. Install PostgreSQL locally if you haven't
3. Run:
```bash
psql "YOUR_DATABASE_URL" -f server/db/schema.sql
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
