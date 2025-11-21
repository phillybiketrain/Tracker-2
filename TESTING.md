# 🧪 Testing the Bike Train Tracker

## 🚀 Start Both Servers

You need **TWO terminal windows** running:

### Terminal 1: Backend API
```bash
cd C:\dev2\PBT
npm run dev:server
```

Should see:
```
🚴 Philly Bike Train Server
📡 HTTP API: http://localhost:3001
🔌 WebSocket: ws://localhost:3001
✅ Server ready!
```

### Terminal 2: Frontend App
```bash
cd C:\dev2\PBT\app
npm run dev
```

Should see:
```
VITE v5.x.x ready in xxx ms
➜ Local: http://localhost:5173/
```

---

## 📍 IMPORTANT: Mapbox Token

The app won't show maps without a Mapbox token. Two options:

### Option 1: Get Free Mapbox Token (Recommended)
1. Go to: https://www.mapbox.com/
2. Sign up (free tier: 50,000 map loads/month)
3. Copy your token
4. Edit: `C:\dev2\PBT\app\src\lib\components\Map.svelte`
5. Replace the placeholder token on line 14:
   ```javascript
   const MAPBOX_TOKEN = 'YOUR_ACTUAL_TOKEN_HERE';
   ```

### Option 2: Test Without Maps (Limited)
- You can still test the API and flow
- Maps will show errors but functionality works

---

## 🎬 FULL FLOW TEST

### Test 1: Create a Route

1. **Open browser:** http://localhost:5173
2. **Click:** "Lead a Ride"
3. **Click on map** to add 2+ waypoints (or click "Use My Location")
4. **Click:** "Next: Route Details"
5. **Fill in:**
   - Name: "Test Market St"
   - Departure Time: Keep default or set to current time
6. **Click:** "Next: Schedule"
7. **Select today's date** (click on it)
8. **Click:** "Create Route"
9. **You should see:** Access code (e.g., "XMKP")
10. **COPY THIS CODE** - you'll need it!

---

### Test 2: Broadcast GPS (Leader)

**IMPORTANT:** This requires location permissions in your browser.

1. **After creating route, click:** "Start Broadcasting Now"
2. **Browser will ask:** "Allow location access?" → Click **Allow**
3. **You should see:**
   - "🔴 Broadcasting" screen
   - Your access code
   - Follower count (starts at 0)
   - Map showing your route

**Keep this window open and running!**

---

### Test 3: Track Leader (Follower)

**Open a NEW browser window** (or incognito mode):

1. **Go to:** http://localhost:5173/follow
2. **Enter the access code** from Test 1
3. **Click:** "Start Tracking"
4. **You should see:**
   - The route path on map
   - Leader's location (green dot)
   - "GPS Active" status
   - Follower count increases to 1

**Go back to leader window** - you should see follower count = 1!

---

### Test 4: Browse Rides

1. **Go to:** http://localhost:5173/browse
2. **You should see:** Your test ride listed
3. **Click:** "👋 Interested" button
4. **Refresh page** - interest count should increase

---

## ✅ SUCCESS CHECKLIST

- [ ] Backend API runs on port 3001
- [ ] Frontend runs on port 5173
- [ ] Can create a route with waypoints
- [ ] Get a 4-letter access code
- [ ] Leader can start broadcasting
- [ ] Follower can track leader in real-time
- [ ] Follower count updates in real-time
- [ ] Browse page shows upcoming rides
- [ ] Can express interest in rides

---

## 🐛 Common Issues

### "Cannot connect to server"
- Check backend is running on port 3001
- Run: `npm run dev:server` in root directory

### "Maps not showing"
- Need Mapbox token (see above)
- Or test without maps (flow still works)

### "Access code not found"
- Make sure you created a ride for TODAY
- Try creating a new route

### "Location not updating"
- Check browser allowed location access
- Try moving your device/laptop
- GPS works better near windows

### "Follower count stuck at 0"
- Open follower page in different browser/incognito
- Check WebSocket connection in console (F12)

---

## 🎯 What's Working

✅ **Backend:**
- PostgreSQL database with PostGIS
- REST API for routes and rides
- WebSocket server for GPS broadcasting
- Real-time follower tracking

✅ **Frontend:**
- Route creation with map
- GPS broadcasting (leader view)
- Real-time tracking (follower view)
- Browse upcoming rides
- Express interest in rides

✅ **Core Flow:**
- Create route → Get code → Broadcast GPS → Others follow

---

## 🚧 Known Limitations (MVP)

- **No real Mapbox token** - Need to add your own
- **No ETA calculation** - Shows distance but not "X minutes away"
- **No email notifications** - Backend ready, need Mailgun setup
- **No admin approval** - All routes auto-approved
- **No route history** - Location trail stored but not displayed
- **No mobile optimization** - Works but not perfect on phones yet

---

## 📊 Database Check

To see what's in the database:

```bash
psql -U postgres -d bike_train

# List all routes
SELECT id, name, access_code, status FROM routes;

# List today's rides
SELECT * FROM ride_instances WHERE date = CURRENT_DATE;

# Exit
\q
```

---

## 🎉 Next Steps

If everything works:
1. **Add your Mapbox token** for real maps
2. **Test on mobile** - Open on your phone
3. **Get Mailgun account** for email notifications
4. **Deploy to Railway** when ready

---

**Ready to test? Start both servers and follow the flow!** 🚴
