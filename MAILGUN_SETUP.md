# Mailgun Setup Guide

## Prerequisites
- Mailgun account at https://app.mailgun.com/
- DNS records configured for your domain (you mentioned these are already in place)

## Step 1: Get Your SMTP Credentials

1. Log in to Mailgun: https://app.mailgun.com/
2. Go to **Sending** → **Domains** → Select your domain
3. Click **SMTP** in the left sidebar
4. You'll see:
   - **SMTP Hostname**: `smtp.mailgun.org` (already configured in code)
   - **Port**: `587` (already configured in code)
   - **Username**: Something like `postmaster@mg.phillybiketrain.org`
   - **Password**: Your SMTP password (click "Show" to reveal)

## Step 2: Update Your .env File

Add these variables to your `.env` file (both local and on Railway):

```bash
# Mailgun SMTP Credentials
MAILGUN_SMTP_USER=postmaster@mg.yourdomain.org
MAILGUN_SMTP_PASSWORD=your_actual_smtp_password
FROM_EMAIL=noreply@phillybiketrain.org
```

**Important Notes:**
- `MAILGUN_SMTP_USER` is usually `postmaster@` followed by your Mailgun domain
- `MAILGUN_SMTP_PASSWORD` is the SMTP password (NOT the API key)
- `FROM_EMAIL` should match your verified domain or subdomain

## Step 3: Configure on Railway (Production)

1. Go to your Railway project
2. Select your backend service
3. Go to **Variables** tab
4. Add the three environment variables:
   - `MAILGUN_SMTP_USER`
   - `MAILGUN_SMTP_PASSWORD`
   - `FROM_EMAIL`
5. Click **Deploy** or wait for auto-deploy

## Step 4: Test Email Sending

### Test Locally

1. Make sure your local `.env` has the credentials
2. Start the server: `cd server && npm start`
3. Test the confirmation email endpoint:

```bash
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-test-email@example.com",
    "all_routes": true
  }'
```

4. Check the server logs for email sending status
5. Check your inbox for the confirmation email

### Test Email Blast (Admin)

1. Log in to admin panel
2. Go to **Email Blast** section
3. Enter subject and message
4. Click **Send Email Blast**
5. Check subscriber emails

## Email Features Available

### 1. **Subscription Confirmation**
- Sent when users subscribe via `/subscribe` page
- Uses `confirmation` template

### 2. **Weekly Digest**
- Sent every Sunday at 8 AM (region timezone)
- Includes upcoming rides for the week
- Uses `weekly_digest` template
- Triggered by scheduler (runs via cron job)

### 3. **Email Blasts**
- Admin-only feature
- Send custom messages to all subscribers in a region
- Uses `blast` template
- Accessible from admin panel

## Troubleshooting

### Emails Not Sending?

1. **Check server logs** for error messages
2. **Verify credentials** in Mailgun dashboard
3. **Test SMTP connection**:
   ```bash
   cd server
   node -e "
   const nodemailer = require('nodemailer');
   const transport = nodemailer.createTransport({
     host: 'smtp.mailgun.org',
     port: 587,
     auth: {
       user: 'your-smtp-user',
       pass: 'your-smtp-password'
     }
   });
   transport.verify((err, success) => {
     if (err) console.error('SMTP Error:', err);
     else console.log('SMTP Connection OK');
   });
   "
   ```

### Email Goes to Spam?

1. Verify all DNS records (SPF, DKIM, DMARC) are correct
2. Check Mailgun domain verification status
3. Warm up your domain by sending gradually increasing volumes
4. Ensure FROM_EMAIL matches your verified domain

### Rate Limits?

Mailgun free tier includes:
- 5,000 emails/month
- Upgrade if you need more

## Email Templates

Templates are stored in the database (`email_templates` table) and can be edited:

1. Go to admin panel → Templates
2. Select region
3. Edit HTML and text versions
4. Use `{{variable}}` syntax for dynamic content

Available templates:
- `weekly_digest` - Sunday morning digest
- `confirmation` - Subscription confirmation
- `blast` - Admin email blasts

## Scheduler Setup (For Weekly Digests)

The weekly digest runs automatically via Railway's cron jobs:

1. Add to `railway.json`:
   ```json
   {
     "build": {
       "builder": "NIXPACKS"
     },
     "deploy": {
       "startCommand": "npm start",
       "healthcheckPath": "/health",
       "healthcheckTimeout": 100
     },
     "cron": [
       {
         "name": "weekly-digest",
         "schedule": "0 13 * * 0",
         "command": "curl -X POST http://localhost:3001/api/admin/weekly-digest/trigger -H 'Content-Type: application/json'"
       }
     ]
   }
   ```

**Note**: `0 13 * * 0` = Every Sunday at 1 PM UTC (8 AM EST)

## DNS Records Checklist

Ensure these are configured in your DNS:

### SPF Record
```
TXT @ v=spf1 include:mailgun.org ~all
```

### DKIM Records
Get from Mailgun dashboard - usually 2 TXT records

### DMARC Record
```
TXT _dmarc v=DMARC1; p=none; rua=mailto:postmaster@phillybiketrain.org
```

### MX Records (if using Mailgun for receiving)
```
MX @ mxa.mailgun.org priority 10
MX @ mxb.mailgun.org priority 10
```

## Support

If you encounter issues:
1. Check Mailgun logs: https://app.mailgun.com/app/logs
2. Review server logs for detailed errors
3. Verify environment variables are set correctly
4. Test with a simple nodemailer script first
