/**
 * Quick API Test
 * Tests the core route creation endpoint
 */

async function testAPI() {
  console.log('🧪 Testing Bike Train API...\n');

  const baseUrl = 'http://localhost:3001';

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const health = await healthRes.json();
    console.log('✅ Health:', health.status);

    // Test 2: Create a route
    console.log('\n2. Creating test route...');
    const routeData = {
      name: 'Market St Commuter',
      description: 'Morning commute along Market Street',
      waypoints: [
        { lat: 39.9526, lng: -75.1652, address: '30th Street Station' },
        { lat: 39.9500, lng: -75.1456, address: 'City Hall' }
      ],
      departure_time: '08:00',
      estimated_duration: '30 minutes',
      creator_email: 'test@example.com'
    };

    const createRes = await fetch(`${baseUrl}/api/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routeData)
    });

    const route = await createRes.json();

    if (route.success) {
      console.log('✅ Route created!');
      console.log(`   Name: ${route.data.name}`);
      console.log(`   Access Code: ${route.data.access_code}`);
      console.log(`   Waypoints: ${route.data.waypoints.length}`);

      // Test 3: Schedule ride
      console.log('\n3. Scheduling ride for tomorrow...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const scheduleRes = await fetch(
        `${baseUrl}/api/routes/${route.data.access_code}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dates: [dateStr] })
        }
      );

      const scheduled = await scheduleRes.json();

      if (scheduled.success) {
        console.log('✅ Ride scheduled!');
        console.log(`   Date: ${dateStr}`);
        console.log(`   Instances: ${scheduled.data.instances.length}`);
      }

      // Test 4: Browse rides
      console.log('\n4. Browsing upcoming rides...');
      const ridesRes = await fetch(`${baseUrl}/api/rides`);
      const rides = await ridesRes.json();

      if (rides.success) {
        console.log(`✅ Found ${rides.count} upcoming rides`);
        rides.data.forEach(ride => {
          console.log(`   - ${ride.route_name} on ${ride.date}`);
        });
      }

    } else {
      console.error('❌ Failed to create route:', route);
    }

    console.log('\n🎉 API tests complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\nMake sure the server is running: npm run dev:server\n');
  }
}

testAPI();
