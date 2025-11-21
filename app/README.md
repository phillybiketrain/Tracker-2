# Frontend Setup

## Install Dependencies

```bash
cd C:\dev2\PBT\app
npm install
```

This will install:
- SvelteKit
- Tailwind CSS
- Mapbox GL
- Socket.io Client

## Run Development Server

```bash
npm run dev
```

Frontend will run on: http://localhost:5173

## Environment Variables

Create `.env` file in the `app` directory:

```
PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

Get a free Mapbox token at: https://www.mapbox.com/

## Next Steps

After running `npm install`, I'll create the remaining pages:
- `/lead` - Create and broadcast routes
- `/follow` - Track leaders in real-time
- `/browse` - Browse upcoming rides
