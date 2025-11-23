/**
 * Cron Job Scheduler
 * Handles weekly digest emails sent every Sunday at 8 AM in each region's timezone
 */

import cron from 'node-cron';
import { queryAll } from '../db/client.js';
import { sendWeeklyDigestsForRegion } from './email.js';

/**
 * Start weekly digest scheduler
 * Checks every hour and sends digests when appropriate for each timezone
 */
export function startWeeklyDigestScheduler() {
  console.log('📅 Starting weekly digest scheduler...');

  // Run every hour to check if we need to send digests
  // Format: minute hour day-of-month month day-of-week
  // 0 * * * * = Every hour at :00
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay(); // 0 = Sunday

    try {
      // Get all regions
      const regions = await queryAll('SELECT * FROM regions');

      for (const region of regions) {
        // Calculate the local hour in the region's timezone
        const localHour = getLocalHour(currentHour, region.timezone);
        const localDay = getLocalDay(currentDay, currentHour, region.timezone);

        // Check if it's Sunday at 8 AM in this region
        if (localDay === 0 && localHour === 8) {
          console.log(`📧 Sending weekly digest for ${region.name} (${region.timezone})`);

          try {
            await sendWeeklyDigestsForRegion(region.slug);
          } catch (error) {
            console.error(`Failed to send digest for ${region.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error in weekly digest scheduler:', error);
    }
  });

  console.log('✅ Weekly digest scheduler started');
}

/**
 * Convert UTC hour to local hour based on timezone offset
 */
function getLocalHour(utcHour, timezone) {
  const now = new Date();

  // Create date strings in both UTC and local timezone
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  // Calculate offset in hours
  const offsetMs = localDate - utcDate;
  const offsetHours = Math.round(offsetMs / (1000 * 60 * 60));

  // Apply offset to current UTC hour
  let localHour = utcHour + offsetHours;

  // Normalize to 0-23 range
  if (localHour < 0) localHour += 24;
  if (localHour >= 24) localHour -= 24;

  return localHour;
}

/**
 * Get local day of week (0-6, 0=Sunday) based on timezone
 */
function getLocalDay(utcDay, utcHour, timezone) {
  const now = new Date();
  const localDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return localDate.getDay();
}

/**
 * Manual trigger for testing (can be called via API endpoint)
 */
export async function triggerWeeklyDigestForRegion(regionSlug) {
  console.log(`🧪 Manually triggering weekly digest for ${regionSlug}`);
  return await sendWeeklyDigestsForRegion(regionSlug);
}
