/**
 * Philly Bike Train - Express Server
 * Handles REST API and WebSocket connections for GPS tracking
 * v2.1
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import routesRouter from './routes/routes.js';
import ridesRouter from './routes/rides.js';
import adminRouter from './routes/admin.js';
import subscriptionsRouter from './routes/subscriptions.js';

// Import scheduler
import { startWeeklyDigestScheduler } from './services/scheduler.js';

// Import database client
import { query } from './db/client.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketIO(httpServer, {
  cors: {
    origin: [
      process.env.PUBLIC_APP_URL || 'http://localhost:5173',
      'https://authentic-spontaneity-production-f486.up.railway.app',
      /\.railway\.app$/  // Allow all Railway subdomains
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: [
    process.env.PUBLIC_APP_URL || 'http://localhost:5173',
    'https://authentic-spontaneity-production-f486.up.railway.app',
    /\.railway\.app$/  // Allow all Railway subdomains
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/routes', routesRouter);
app.use('/api/rides', ridesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/subscriptions', subscriptionsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Philly Bike Train API',
    version: '2.0.0',
    endpoints: {
      routes: '/api/routes',
      rides: '/api/rides',
      admin: '/api/admin',
      health: '/api/health'
    }
  });
});

// WebSocket connection handler
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Handle GPS location updates from leader
  socket.on('location:update', async (data) => {
    const { accessCode, lat, lng, accuracy } = data;

    console.log(`📍 Location update from ${accessCode}: ${lat}, ${lng}`);

    const timestamp = Date.now();

    // Broadcast to all followers in this ride's room
    socket.to(accessCode).emit('location:updated', {
      accessCode,
      lat,
      lng,
      accuracy,
      timestamp
    });

    // Save location to database (current_location and append to location_trail)
    try {
      await query(`
        UPDATE ride_instances
        SET
          current_location = $2::jsonb,
          location_trail = COALESCE(location_trail, '[]'::jsonb) || $3::jsonb
        WHERE id IN (
          SELECT ri.id
          FROM ride_instances ri
          JOIN routes r ON ri.route_id = r.id
          WHERE r.access_code = $1
            AND ri.status = 'live'
        )
      `, [
        accessCode,
        JSON.stringify({ lat, lng, timestamp }),
        JSON.stringify([{ lat, lng, timestamp }])
      ]);
    } catch (error) {
      console.error(`❌ Failed to save location for ${accessCode}:`, error);
    }
  });

  // Leader starts broadcasting
  socket.on('ride:start', async (data) => {
    const { accessCode } = data;

    console.log(`🚴 Ride started: ${accessCode}`);

    // Join room for this access code
    socket.join(accessCode);

    // Mark ride instance as 'live' in database
    // Allow broadcasting any scheduled ride, regardless of date
    try {
      await query(`
        UPDATE ride_instances
        SET status = 'live', started_at = NOW()
        WHERE id = (
          SELECT ri.id
          FROM ride_instances ri
          JOIN routes r ON ri.route_id = r.id
          WHERE r.access_code = $1
            AND ri.status = 'scheduled'
          ORDER BY ri.date DESC
          LIMIT 1
        )
      `, [accessCode]);

      console.log(`✅ Ride ${accessCode} marked as live in database`);
    } catch (error) {
      console.error(`❌ Failed to mark ride ${accessCode} as live:`, error);
    }

    socket.emit('ride:started', { accessCode });
  });

  // Leader ends broadcasting
  socket.on('ride:end', async (data) => {
    const { accessCode } = data;

    console.log(`🏁 Ride ended: ${accessCode}`);

    // Leave room
    socket.leave(accessCode);

    // Mark ride instance as 'completed' and clear location data
    // Update any live ride with this access code, regardless of date
    try {
      await query(`
        UPDATE ride_instances
        SET status = 'completed',
            ended_at = NOW(),
            current_location = NULL,
            location_trail = '[]'::jsonb
        WHERE id IN (
          SELECT ri.id
          FROM ride_instances ri
          JOIN routes r ON ri.route_id = r.id
          WHERE r.access_code = $1
            AND ri.status = 'live'
        )
      `, [accessCode]);

      console.log(`✅ Ride ${accessCode} marked as completed in database`);
    } catch (error) {
      console.error(`❌ Failed to mark ride ${accessCode} as completed:`, error);
    }

    // Notify all followers
    socket.to(accessCode).emit('ride:ended', { accessCode });
  });

  // Follower joins ride
  socket.on('follow:start', async (data) => {
    const { accessCode } = data;

    console.log(`👁️  Follower joined: ${accessCode}`);

    // Join room to receive updates
    socket.join(accessCode);

    // Get current follower count
    const room = io.sockets.adapter.rooms.get(accessCode);
    const followerCount = room ? room.size - 1 : 0; // -1 for leader

    // Notify leader of new follower
    socket.to(accessCode).emit('follower:joined', {
      followerCount,
      followerId: socket.id
    });

    socket.emit('follow:started', { accessCode, followerCount });
  });

  // Follower stops tracking
  socket.on('follow:stop', async (data) => {
    const { accessCode } = data;

    console.log(`👋 Follower left: ${accessCode}`);

    socket.leave(accessCode);

    // Get updated follower count
    const room = io.sockets.adapter.rooms.get(accessCode);
    const followerCount = room ? room.size - 1 : 0;

    // Notify leader
    socket.to(accessCode).emit('follower:left', {
      followerCount,
      followerId: socket.id
    });
  });

  // Watch all live rides (for the live page "Watch All" feature)
  socket.on('watch:all', async () => {
    console.log(`👀 Client watching all live rides: ${socket.id}`);

    try {
      // Get all currently live rides
      const liveRides = await queryAll(`
        SELECT r.access_code
        FROM ride_instances ri
        JOIN routes r ON ri.route_id = r.id
        WHERE ri.status = 'live'
      `);

      // Join all live ride rooms
      liveRides.forEach(ride => {
        socket.join(ride.access_code);
      });

      console.log(`✅ Client joined ${liveRides.length} live ride rooms`);

      socket.emit('watch:all:joined', {
        rides: liveRides.map(r => r.access_code)
      });
    } catch (error) {
      console.error('❌ Failed to join live ride rooms:', error);
      socket.emit('watch:all:error', { message: 'Failed to watch live rides' });
    }
  });

  // Stop watching all rides
  socket.on('watch:all:stop', async () => {
    console.log(`🛑 Client stopped watching all: ${socket.id}`);

    try {
      const liveRides = await queryAll(`
        SELECT r.access_code
        FROM ride_instances ri
        JOIN routes r ON ri.route_id = r.id
        WHERE ri.status = 'live'
      `);

      liveRides.forEach(ride => {
        socket.leave(ride.access_code);
      });
    } catch (error) {
      console.error('❌ Failed to leave live ride rooms:', error);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    // Clean up any rooms this socket was in
    // Socket.io handles this automatically
  });

  // Error handler
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log('\n🚴 Philly Bike Train Server');
  console.log(`📡 HTTP API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log('\n✅ Server ready!\n');

  // Start weekly digest scheduler
  startWeeklyDigestScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
