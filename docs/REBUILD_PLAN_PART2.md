# Bike Train Tracker - Implementation Guide (Part 2)

**This continues from REBUILD_PLAN_IMPLEMENTATION.md**

---

# Part 6: Backend Services (Business Logic)

Services contain all business logic and orchestrate between repositories.

### `src/lib/server/services/RouteService.ts`

```typescript
import { routeRepository } from '../repositories/RouteRepository';
import { rideInstanceRepository } from '../repositories/RideInstanceRepository';
import type { Route, RideInstance, Waypoint } from '$lib/shared/types';
import { CreateRouteSchema, CreateRideInstanceSchema } from '$lib/shared/validation/route';

export class RouteService {
  async createRoute(data: {
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
    tag_ids?: string[];
  }): Promise<Route> {
    // Validate input
    const validated = CreateRouteSchema.parse(data);

    // Create route
    const route = await routeRepository.create(validated);

    // Set tags if provided
    if (data.tag_ids && data.tag_ids.length > 0) {
      await routeRepository.setTags(route.id, data.tag_ids);
    }

    return route;
  }

  async getRoute(id: string): Promise<Route | null> {
    return routeRepository.findById(id);
  }

  async getRouteByAccessCode(accessCode: string): Promise<Route | null> {
    return routeRepository.findByAccessCode(accessCode);
  }

  async listRoutes(filters?: {
    region_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Route[]> {
    return routeRepository.findAll(filters);
  }

  async updateRoute(id: string, data: Partial<Route>): Promise<Route | null> {
    return routeRepository.update(id, data);
  }

  async deleteRoute(id: string): Promise<boolean> {
    return routeRepository.delete(id);
  }

  async scheduleInstances(data: {
    route_id: string;
    dates: string[];
  }): Promise<RideInstance[]> {
    // Validate input
    const validated = CreateRideInstanceSchema.parse(data);

    // Get route to calculate start times
    const route = await routeRepository.findById(validated.route_id);
    if (!route) {
      throw new Error('Route not found');
    }

    // Create instances for each date
    const instances: RideInstance[] = [];

    for (const date of validated.dates) {
      // Combine date + departure_time to create full timestamp
      const [hours, minutes] = route.departure_time.split(':');
      const startTime = new Date(date);
      startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Calculate end time if estimated duration provided
      let endTime: Date | undefined;
      if (route.estimated_duration) {
        endTime = new Date(startTime);
        const [durationHours, durationMinutes] = route.estimated_duration.split(':');
        endTime.setHours(
          endTime.getHours() + parseInt(durationHours),
          endTime.getMinutes() + parseInt(durationMinutes)
        );
      }

      const instance = await rideInstanceRepository.create({
        route_id: route.id,
        date,
        start_time: startTime,
        end_time: endTime
      });

      instances.push(instance);
    }

    return instances;
  }
}

export const routeService = new RouteService();
```

### `src/lib/server/services/RideService.ts`

```typescript
import { rideInstanceRepository } from '../repositories/RideInstanceRepository';
import type { RideInstance } from '$lib/shared/types';
import { addDays, startOfDay, endOfDay } from 'date-fns';

export class RideService {
  async getRide(id: string): Promise<RideInstance | null> {
    return rideInstanceRepository.findById(id);
  }

  async listUpcomingRides(filters?: {
    region_id?: string;
    tag_ids?: string[];
    days_ahead?: number;
    status?: string;
    limit?: number;
  }): Promise<RideInstance[]> {
    const fromDate = startOfDay(new Date());
    const toDate = filters?.days_ahead
      ? endOfDay(addDays(new Date(), filters.days_ahead))
      : undefined;

    return rideInstanceRepository.findUpcoming({
      region_id: filters?.region_id,
      tag_ids: filters?.tag_ids,
      from_date: fromDate,
      to_date: toDate,
      status: filters?.status || 'scheduled',
      limit: filters?.limit
    });
  }

  async expressInterest(rideId: string, sessionId: string): Promise<void> {
    await rideInstanceRepository.addInterest(rideId, sessionId);
  }

  async removeInterest(rideId: string, sessionId: string): Promise<void> {
    await rideInstanceRepository.removeInterest(rideId, sessionId);
  }

  async getInterestCount(rideId: string): Promise<number> {
    return rideInstanceRepository.getInterestCount(rideId);
  }

  async cancelRide(id: string, reason?: string): Promise<RideInstance | null> {
    const ride = await rideInstanceRepository.findById(id);
    if (!ride) return null;

    return rideInstanceRepository.updateStatus(id, 'cancelled');
  }
}

export const rideService = new RideService();
```

### `src/lib/server/services/DemandService.ts`

```typescript
import { demandRepository } from '../repositories/DemandRepository';
import type { RideDemand } from '$lib/shared/types';
import { CreateRideDemandSchema } from '$lib/shared/validation/demand';

export class DemandService {
  async submitDemand(data: {
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
    const validated = CreateRideDemandSchema.parse(data);

    return demandRepository.create({
      ...validated,
      session_id: data.session_id
    });
  }

  async getDemandHeatmap(filters?: {
    region_id?: string;
    from_date?: Date;
  }): Promise<RideDemand[]> {
    return demandRepository.findAll(filters);
  }
}

export const demandService = new DemandService();
```

### `src/lib/server/services/SubscriptionService.ts`

```typescript
import { subscriberRepository } from '../repositories/SubscriberRepository';
import type { EmailSubscriber } from '$lib/shared/types';
import { CreateSubscriptionSchema, UpdateSubscriptionSchema } from '$lib/shared/validation/subscription';

export class SubscriptionService {
  async subscribe(data: {
    email: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    regions: string[];
    tag_ids: string[];
  }): Promise<EmailSubscriber> {
    const validated = CreateSubscriptionSchema.parse(data);

    return subscriberRepository.create(validated);
  }

  async getSubscription(email: string): Promise<EmailSubscriber | null> {
    return subscriberRepository.findByEmail(email);
  }

  async getSubscriptionByToken(token: string): Promise<EmailSubscriber | null> {
    return subscriberRepository.findByToken(token);
  }

  async updateSubscription(
    token: string,
    data: Partial<EmailSubscriber>
  ): Promise<EmailSubscriber | null> {
    const subscriber = await subscriberRepository.findByToken(token);
    if (!subscriber) return null;

    const validated = UpdateSubscriptionSchema.parse(data);

    return subscriberRepository.update(subscriber.id, validated);
  }

  async unsubscribe(token: string): Promise<boolean> {
    return subscriberRepository.unsubscribe(token);
  }

  async getSubscribersByFrequency(frequency: string): Promise<EmailSubscriber[]> {
    return subscriberRepository.findByFrequency(frequency);
  }
}

export const subscriptionService = new SubscriptionService();
```

### `src/lib/server/services/SessionService.ts`

```typescript
import { sessionRepository } from '../repositories/SessionRepository';
import type { Session } from '$lib/shared/types';

export class SessionService {
  async getOrCreateSession(fingerprint: string): Promise<Session> {
    // Try to find existing valid session
    const existing = await sessionRepository.findByFingerprint(fingerprint);
    if (existing) {
      return existing;
    }

    // Create new session
    return sessionRepository.create(fingerprint);
  }

  async getSession(id: string): Promise<Session | null> {
    return sessionRepository.findById(id);
  }

  async cleanupExpiredSessions(): Promise<number> {
    return sessionRepository.deleteExpired();
  }
}

export const sessionService = new SessionService();
```

---

# Part 7: Backend API Routes

### `src/lib/server/routes/api/rides.ts`

```typescript
import { Router } from 'express';
import { rideService } from '../../services/RideService';
import { sessionService } from '../../services/SessionService';

const router = Router();

// GET /api/v1/rides - List upcoming rides
router.get('/', async (req, res) => {
  try {
    const { region_id, tag_ids, days_ahead = 30, limit = 100 } = req.query;

    const rides = await rideService.listUpcomingRides({
      region_id: region_id as string,
      tag_ids: tag_ids ? (tag_ids as string).split(',') : undefined,
      days_ahead: parseInt(days_ahead as string),
      limit: parseInt(limit as string)
    });

    res.json({ data: rides });
  } catch (error) {
    console.error('Error listing rides:', error);
    res.status(500).json({ error: { message: 'Failed to fetch rides' } });
  }
});

// GET /api/v1/rides/:id - Get ride details
router.get('/:id', async (req, res) => {
  try {
    const ride = await rideService.getRide(req.params.id);

    if (!ride) {
      return res.status(404).json({ error: { message: 'Ride not found' } });
    }

    res.json({ data: ride });
  } catch (error) {
    console.error('Error fetching ride:', error);
    res.status(500).json({ error: { message: 'Failed to fetch ride' } });
  }
});

// POST /api/v1/rides/:id/interest - Express interest
router.post('/:id/interest', async (req, res) => {
  try {
    const { session_id, fingerprint } = req.body;

    // Get or create session
    let sessionId = session_id;
    if (!sessionId && fingerprint) {
      const session = await sessionService.getOrCreateSession(fingerprint);
      sessionId = session.id;
    }

    if (!sessionId) {
      return res.status(400).json({ error: { message: 'Session required' } });
    }

    await rideService.expressInterest(req.params.id, sessionId);
    const count = await rideService.getInterestCount(req.params.id);

    res.json({ data: { interest_count: count, session_id: sessionId } });
  } catch (error) {
    console.error('Error expressing interest:', error);
    res.status(500).json({ error: { message: 'Failed to express interest' } });
  }
});

// DELETE /api/v1/rides/:id/interest - Remove interest
router.delete('/:id/interest', async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: { message: 'Session ID required' } });
    }

    await rideService.removeInterest(req.params.id, session_id);
    const count = await rideService.getInterestCount(req.params.id);

    res.json({ data: { interest_count: count } });
  } catch (error) {
    console.error('Error removing interest:', error);
    res.status(500).json({ error: { message: 'Failed to remove interest' } });
  }
});

export default router;
```

### `src/lib/server/routes/api/routes.ts`

```typescript
import { Router } from 'express';
import { routeService } from '../../services/RouteService';

const router = Router();

// POST /api/v1/routes - Create new route
router.post('/', async (req, res) => {
  try {
    const route = await routeService.createRoute(req.body);

    res.status(201).json({ data: route });
  } catch (error: any) {
    console.error('Error creating route:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors
        }
      });
    }

    res.status(500).json({ error: { message: 'Failed to create route' } });
  }
});

// GET /api/v1/routes - List routes
router.get('/', async (req, res) => {
  try {
    const { region_id, status = 'approved', limit = 100, offset = 0 } = req.query;

    const routes = await routeService.listRoutes({
      region_id: region_id as string,
      status: status as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({ data: routes });
  } catch (error) {
    console.error('Error listing routes:', error);
    res.status(500).json({ error: { message: 'Failed to fetch routes' } });
  }
});

// GET /api/v1/routes/:id - Get route details
router.get('/:id', async (req, res) => {
  try {
    const route = await routeService.getRoute(req.params.id);

    if (!route) {
      return res.status(404).json({ error: { message: 'Route not found' } });
    }

    res.json({ data: route });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({ error: { message: 'Failed to fetch route' } });
  }
});

// GET /api/v1/routes/by-code/:code - Get route by access code
router.get('/by-code/:code', async (req, res) => {
  try {
    const route = await routeService.getRouteByAccessCode(req.params.code);

    if (!route) {
      return res.status(404).json({ error: { message: 'Route not found' } });
    }

    res.json({ data: route });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({ error: { message: 'Failed to fetch route' } });
  }
});

// POST /api/v1/routes/:id/instances - Schedule ride instances
router.post('/:id/instances', async (req, res) => {
  try {
    const { dates } = req.body;

    if (!dates || !Array.isArray(dates)) {
      return res.status(400).json({ error: { message: 'Dates array required' } });
    }

    const instances = await routeService.scheduleInstances({
      route_id: req.params.id,
      dates
    });

    res.status(201).json({ data: instances });
  } catch (error: any) {
    console.error('Error scheduling instances:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors
        }
      });
    }

    res.status(500).json({ error: { message: 'Failed to schedule instances' } });
  }
});

export default router;
```

### `src/lib/server/routes/api/demand.ts`

```typescript
import { Router } from 'express';
import { demandService } from '../../services/DemandService';
import { sessionService } from '../../services/SessionService';

const router = Router();

// POST /api/v1/demand - Submit ride demand
router.post('/', async (req, res) => {
  try {
    const { session_id, fingerprint, ...demandData } = req.body;

    // Get or create session
    let sessionId = session_id;
    if (!sessionId && fingerprint) {
      const session = await sessionService.getOrCreateSession(fingerprint);
      sessionId = session.id;
    }

    const demand = await demandService.submitDemand({
      ...demandData,
      session_id: sessionId
    });

    res.status(201).json({ data: demand });
  } catch (error: any) {
    console.error('Error submitting demand:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors
        }
      });
    }

    res.status(500).json({ error: { message: 'Failed to submit demand' } });
  }
});

// GET /api/v1/demand/heatmap - Get demand heatmap data
router.get('/heatmap', async (req, res) => {
  try {
    const { region_id } = req.query;

    const demands = await demandService.getDemandHeatmap({
      region_id: region_id as string
    });

    res.json({ data: demands });
  } catch (error) {
    console.error('Error fetching demand heatmap:', error);
    res.status(500).json({ error: { message: 'Failed to fetch demand data' } });
  }
});

export default router;
```

### `src/lib/server/routes/api/subscribe.ts`

```typescript
import { Router } from 'express';
import { subscriptionService } from '../../services/SubscriptionService';

const router = Router();

// POST /api/v1/subscribe - Subscribe to email notifications
router.post('/', async (req, res) => {
  try {
    const subscriber = await subscriptionService.subscribe(req.body);

    res.status(201).json({ data: subscriber });
  } catch (error: any) {
    console.error('Error creating subscription:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors
        }
      });
    }

    res.status(500).json({ error: { message: 'Failed to create subscription' } });
  }
});

// GET /api/v1/subscribe/:token - Get subscription details
router.get('/:token', async (req, res) => {
  try {
    const subscriber = await subscriptionService.getSubscriptionByToken(req.params.token);

    if (!subscriber) {
      return res.status(404).json({ error: { message: 'Subscription not found' } });
    }

    res.json({ data: subscriber });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: { message: 'Failed to fetch subscription' } });
  }
});

// PUT /api/v1/subscribe/:token - Update subscription
router.put('/:token', async (req, res) => {
  try {
    const subscriber = await subscriptionService.updateSubscription(
      req.params.token,
      req.body
    );

    if (!subscriber) {
      return res.status(404).json({ error: { message: 'Subscription not found' } });
    }

    res.json({ data: subscriber });
  } catch (error: any) {
    console.error('Error updating subscription:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors
        }
      });
    }

    res.status(500).json({ error: { message: 'Failed to update subscription' } });
  }
});

// DELETE /api/v1/subscribe/:token - Unsubscribe
router.delete('/:token', async (req, res) => {
  try {
    const success = await subscriptionService.unsubscribe(req.params.token);

    if (!success) {
      return res.status(404).json({ error: { message: 'Subscription not found' } });
    }

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: { message: 'Failed to unsubscribe' } });
  }
});

export default router;
```

### `src/lib/server/routes/api/index.ts`

```typescript
import { Router } from 'express';
import ridesRouter from './rides';
import routesRouter from './routes';
import demandRouter from './demand';
import subscribeRouter from './subscribe';
import { tagRepository } from '../../repositories/TagRepository';

const router = Router();

// Mount route modules
router.use('/rides', ridesRouter);
router.use('/routes', routesRouter);
router.use('/demand', demandRouter);
router.use('/subscribe', subscribeRouter);

// GET /api/v1/tags - List tags
router.get('/tags', async (req, res) => {
  try {
    const tags = await tagRepository.findAll({ is_active: true });
    res.json({ data: tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: { message: 'Failed to fetch tags' } });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
```

---

# Part 8: WebSocket Implementation (Socket.io)

### `src/lib/server/websocket/index.ts`

```typescript
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { handleConnection } from './handlers/connection';
import { handleLocation } from './handlers/location';
import { handleRide } from './handlers/ride';

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    },
    path: '/socket.io'
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Register all event handlers
    handleConnection(io, socket);
    handleRide(io, socket);
    handleLocation(io, socket);

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Clean up any active rides
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          io.to(room).emit('follower:left', { followerId: socket.id });
        }
      });
    });

    // Error handler
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  return io;
}
```

### `src/lib/server/websocket/handlers/connection.ts`

```typescript
import type { Server, Socket } from 'socket.io';

export function handleConnection(io: Server, socket: Socket) {
  // Ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Client info
  socket.on('client:info', (data) => {
    console.log(`Client info from ${socket.id}:`, data);
  });
}
```

### `src/lib/server/websocket/handlers/ride.ts`

```typescript
import type { Server, Socket } from 'socket.io';
import { routeService } from '../../services/RouteService';

// In-memory store for active rides
const activeRides = new Map<string, {
  leaderId: string;
  leaderSocket: string;
  followers: Set<string>;
  routeInfo: any;
  lastLocation?: { lat: number; lng: number; timestamp: number };
}>();

export function handleRide(io: Server, socket: Socket) {
  // Join ride
  socket.on('ride:join', async (data: { accessCode: string; role: 'leader' | 'follower' }) => {
    try {
      const { accessCode, role } = data;

      // Get route info
      const route = await routeService.getRouteByAccessCode(accessCode);
      if (!route) {
        socket.emit('error', { code: 'ROUTE_NOT_FOUND', message: 'Route not found' });
        return;
      }

      // Join the room for this ride
      socket.join(accessCode);

      if (role === 'leader') {
        // Initialize active ride
        activeRides.set(accessCode, {
          leaderId: socket.id,
          leaderSocket: socket.id,
          followers: new Set(),
          routeInfo: route
        });

        socket.emit('ride:joined', {
          rideId: accessCode,
          role: 'leader',
          routeInfo: route,
          followerCount: 0
        });
      } else {
        // Follower joining
        const ride = activeRides.get(accessCode);

        if (!ride) {
          socket.emit('error', {
            code: 'RIDE_NOT_ACTIVE',
            message: 'This ride is not currently broadcasting'
          });
          return;
        }

        ride.followers.add(socket.id);

        // Notify follower
        socket.emit('ride:joined', {
          rideId: accessCode,
          role: 'follower',
          routeInfo: route,
          lastLocation: ride.lastLocation
        });

        // Notify leader of new follower
        io.to(ride.leaderSocket).emit('follower:joined', {
          followerId: socket.id,
          followerCount: ride.followers.size
        });

        // Notify other followers
        socket.to(accessCode).emit('followers:count', { count: ride.followers.size });
      }
    } catch (error) {
      console.error('Error joining ride:', error);
      socket.emit('error', { code: 'JOIN_ERROR', message: 'Failed to join ride' });
    }
  });

  // Leave ride
  socket.on('ride:leave', (data: { accessCode: string }) => {
    const { accessCode } = data;

    const ride = activeRides.get(accessCode);
    if (!ride) return;

    // Remove from followers
    ride.followers.delete(socket.id);

    // Leave room
    socket.leave(accessCode);

    // Notify leader
    io.to(ride.leaderSocket).emit('follower:left', {
      followerId: socket.id,
      followerCount: ride.followers.size
    });

    // Notify others
    socket.to(accessCode).emit('followers:count', { count: ride.followers.size });

    socket.emit('ride:left', { rideId: accessCode });
  });

  // End ride (leader only)
  socket.on('ride:end', (data: { accessCode: string }) => {
    const { accessCode } = data;

    const ride = activeRides.get(accessCode);
    if (!ride || ride.leaderSocket !== socket.id) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authorized to end ride' });
      return;
    }

    // Notify all followers
    io.to(accessCode).emit('ride:ended', { reason: 'Leader ended ride' });

    // Clean up
    activeRides.delete(accessCode);
  });
}
```

### `src/lib/server/websocket/handlers/location.ts`

```typescript
import type { Server, Socket } from 'socket.io';

// Access to activeRides from ride.ts
import { activeRides } from './ride';

export function handleLocation(io: Server, socket: Socket) {
  // Location update from leader
  socket.on('location:update', (data: {
    accessCode: string;
    lat: number;
    lng: number;
    accuracy?: number;
    heading?: number;
  }) => {
    const { accessCode, lat, lng, accuracy, heading } = data;

    const ride = activeRides.get(accessCode);
    if (!ride || ride.leaderSocket !== socket.id) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authorized to update location' });
      return;
    }

    // Store last location
    ride.lastLocation = {
      lat,
      lng,
      timestamp: Date.now()
    };

    // Broadcast to all followers
    socket.to(accessCode).emit('location:updated', {
      lat,
      lng,
      accuracy,
      heading,
      timestamp: Date.now()
    });
  });

  // Request current location (follower)
  socket.on('location:request', (data: { accessCode: string }) => {
    const { accessCode } = data;

    const ride = activeRides.get(accessCode);
    if (!ride) {
      socket.emit('error', { code: 'RIDE_NOT_FOUND', message: 'Ride not found' });
      return;
    }

    if (ride.lastLocation) {
      socket.emit('location:updated', ride.lastLocation);
    }
  });
}
```

---

# Part 9: Express Server Setup

### `src/lib/server/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import apiRoutes from './routes/api';
import { setupWebSocket } from './websocket';
import { PORT, APP_URL } from './config/env';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: APP_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Mount API routes
app.use('/api/v1', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      message: err.message || 'Internal server error'
    }
  });
});

// Setup WebSocket
setupWebSocket(httpServer);

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
});
```

---

This is Part 2 of the implementation guide. I still need to add:

- Part 10: Frontend Components (Svelte)
- Part 11: Frontend Pages
- Part 12: Frontend Stores
- Part 13: Background Jobs
- Part 14: Email Service
- Part 15: Testing
- Part 16: Deployment

Would you like me to continue with the frontend implementation and remaining sections?
