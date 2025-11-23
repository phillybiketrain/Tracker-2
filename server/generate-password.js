/**
 * Generate bcrypt hash for admin password
 * Usage: node server/generate-password.js <your-password>
 */

import bcrypt from 'bcrypt';

const password = process.argv[2] || 'admin123';

bcrypt.hash(password, 12, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
    process.exit(1);
  }

  console.log('\n✅ Password hash generated!\n');
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nAdd this to Railway environment variables:');
  console.log('ADMIN_PASSWORD_HASH=' + hash);
  console.log('\n');
});
