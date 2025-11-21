# 🗺️ Mapbox Setup Instructions

The Philly Bike Train uses Mapbox GL JS for interactive maps. You need a free Mapbox access token to display maps.

## Step 1: Get Your Free Mapbox Token

1. Go to: **https://account.mapbox.com/access-tokens/**
2. Sign up for a free account (if you don't have one)
3. Click **"Create a token"** or use your default public token
4. Copy the token (starts with `pk.`)

**Free Tier Includes:**
- 50,000 map loads per month
- No credit card required
- Perfect for development and small-scale deployment

## Step 2: Add Token to Your App

1. Open the file: `app/.env`
2. Replace the placeholder with your real token:

```bash
PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijoiam9obmRvZS... # Your actual token
```

3. Save the file

## Step 3: Restart Your Dev Server

```bash
# Stop the frontend server (Ctrl+C)
# Then restart it:
cd app
npm run dev
```

## Verification

Maps should now load! If you still see errors:
1. Check the browser console (F12)
2. Make sure your token starts with `pk.`
3. Verify the `.env` file is in the `app/` directory
4. Restart the dev server

## Security Notes

- ✅ The `.env` file is ignored by git (won't be committed)
- ✅ Public tokens (starting with `pk.`) are safe to use in frontend code
- ✅ Never use secret tokens (starting with `sk.`) in frontend code
- ✅ Free tier is sufficient for development and testing

## Alternative: OpenStreetMap

If you don't want to use Mapbox, you can switch to OpenStreetMap (no token needed). This would require modifying `Map.svelte` to use a different mapping library like Leaflet.

---

**Need Help?** See Mapbox documentation: https://docs.mapbox.com/help/getting-started/access-tokens/
