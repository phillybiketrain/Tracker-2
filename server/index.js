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
import { query, queryOne, queryAll, getPoolStats } from './db/client.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Allowed origins for CORS
const allowedOrigins = [
  process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  'https://authentic-spontaneity-production-f486.up.railway.app',
  /\.railway\.app$/,  // Allow all Railway subdomains
  /phillybiketrain\.org$/  // Allow custom domain (with or without www)
];

// Initialize Socket.io with optimized settings for concurrent broadcasts
const io = new SocketIO(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Connection settings for mobile reliability
  pingTimeout: 60000,     // How long to wait for pong (60s for mobile)
  pingInterval: 25000,    // How often to ping (25s)
  connectTimeout: 45000,  // Connection timeout (45s)
  maxHttpBufferSize: 1e6, // 1MB max message size
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
});

// Track leader socket IDs for graceful disconnect handling
// Map: accessCode -> { socketId, startedAt }
const activeLeaders = new Map();

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));  // Increased for large GPX imports
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

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

// Health check with detailed stats
app.get('/api/health', (req, res) => {
  const poolStats = getPoolStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      pool: poolStats,
      healthy: poolStats.waitingCount < 10 // Warning if many waiting
    },
    sockets: {
      connected: io.engine.clientsCount,
      activeLeaders: activeLeaders ? activeLeaders.size : 0
    }
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
    const startTime = Date.now();

    console.log(`🚴 Ride start requested: ${accessCode} from socket ${socket.id}`);

    // Join room for this access code
    socket.join(accessCode);

    try {
      // OPTIMIZED: Single query to get route + best ride instance candidate
      // Uses CTE to find the best instance in priority order
      const result = await queryOne(`
        WITH route AS (
          SELECT id, region_id, name
          FROM routes
          WHERE access_code = $1
        ),
        best_instance AS (
          SELECT ri.id, ri.status,
            CASE
              WHEN ri.status = 'live' THEN 1
              WHEN ri.status = 'scheduled' THEN 2
              WHEN ri.status = 'completed' AND ri.date = CURRENT_DATE THEN 3
              ELSE 4
            END as priority
          FROM ride_instances ri
          WHERE ri.route_id = (SELECT id FROM route)
            AND ri.status IN ('live', 'scheduled', 'completed')
          ORDER BY
            priority,
            ABS(ri.date - CURRENT_DATE)
          LIMIT 1
        )
        SELECT
          r.id as route_id,
          r.region_id,
          r.name,
          bi.id as instance_id,
          bi.status as instance_status
        FROM route r
        LEFT JOIN best_instance bi ON true
      `, [accessCode]);

      if (!result || !result.route_id) {
        console.error(`❌ Route not found for access code: ${accessCode}`);
        socket.emit('ride:error', { message: 'Route not found' });
        return;
      }

      const { route_id, region_id, name, instance_id, instance_status } = result;

      // Handle based on what we found
      if (instance_status === 'live') {
        // Already live - just rejoin
        console.log(`✅ Rejoining already live ride: ${accessCode} (${Date.now() - startTime}ms)`);
        activeLeaders.set(accessCode, { socketId: socket.id, startedAt: Date.now() });
        socket.emit('ride:started', { accessCode });
        return;
      }

      if (instance_id && (instance_status === 'scheduled' || instance_status === 'completed')) {
        // Update existing instance to live
        await query(`
          UPDATE ride_instances
          SET status = 'live', started_at = NOW(), current_location = NULL, location_trail = '[]'::jsonb
          WHERE id = $1
        `, [instance_id]);
        console.log(`✅ Started ${instance_status} ride: ${accessCode} (${Date.now() - startTime}ms)`);
        activeLeaders.set(accessCode, { socketId: socket.id, startedAt: Date.now() });
        socket.emit('ride:started', { accessCode });
        return;
      }

      // No existing instance - create new one for today
      // Use ON CONFLICT to handle race condition if two clients try simultaneously
      const newInstance = await queryOne(`
        INSERT INTO ride_instances (route_id, date, status, region_id, started_at)
        VALUES ($1, CURRENT_DATE, 'live', $2, NOW())
        ON CONFLICT (route_id, date)
        DO UPDATE SET
          status = 'live',
          started_at = NOW(),
          current_location = NULL,
          location_trail = '[]'::jsonb
        RETURNING id
      `, [route_id, region_id]);

      console.log(`✅ Created/updated ride instance for: ${accessCode} (${Date.now() - startTime}ms)`);
      activeLeaders.set(accessCode, { socketId: socket.id, startedAt: Date.now() });
      socket.emit('ride:started', { accessCode });

    } catch (error) {
      console.error(`❌ Failed to start ride ${accessCode}:`, error);
      socket.emit('ride:error', { message: 'Failed to start ride. Please try again.' });
    }
  });

  // Leader ends broadcasting
  socket.on('ride:end', async (data) => {
    const { accessCode } = data;

    console.log(`🏁 Ride end requested: ${accessCode} from socket ${socket.id}`);

    // Remove from leader tracking
    activeLeaders.delete(accessCode);

    // Leave room
    socket.leave(accessCode);

    // Mark ride instance as 'completed' and clear location data
    // Update any live ride with this access code, regardless of date
    try {
      const result = await query(`
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

      const rowsUpdated = result.rowCount || 0;
      if (rowsUpdated > 0) {
        console.log(`✅ Ride ${accessCode} marked as completed (${rowsUpdated} instance(s) updated)`);
      } else {
        console.log(`⚠️ No live ride found for ${accessCode} to mark as completed`);
      }
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
  socket.on('disconnect', async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    // Check if this socket was a ride leader
    for (const [accessCode, leader] of activeLeaders.entries()) {
      if (leader.socketId === socket.id) {
        console.log(`⚠️ Leader for ${accessCode} disconnected - will end ride in 60s if not reconnected`);

        // Set a timeout to end the ride after 60 seconds
        // This gives the leader a chance to reconnect
        setTimeout(async () => {
          // Check if the same socket is still the leader (no reconnect happened)
          const currentLeader = activeLeaders.get(accessCode);
          if (currentLeader && currentLeader.socketId === socket.id) {
            console.log(`⏱️ Leader for ${accessCode} didn't reconnect - ending ride`);

            // Remove from tracking
            activeLeaders.delete(accessCode);

            // End the ride in database
            try {
              const result = await query(`
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

              const rowsUpdated = result.rowCount || 0;
              if (rowsUpdated > 0) {
                console.log(`✅ Ride ${accessCode} auto-ended after leader disconnect`);
              }
            } catch (error) {
              console.error(`❌ Failed to auto-end ride ${accessCode}:`, error);
            }

            // Notify followers
            io.to(accessCode).emit('ride:ended', { accessCode });
          }
        }, 60000); // 60 seconds grace period

        break; // Each socket can only lead one ride
      }
    }
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
