-- Insert default email templates for Philly region
-- These templates use {{variable}} syntax for dynamic content

-- Weekly Digest Template
INSERT INTO email_templates (region_id, template_type, subject, html_body, text_body)
SELECT
  (SELECT id FROM regions WHERE slug = 'philly'),
  'weekly_digest',
  'Your Weekly Bike Train Update - {{region_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #E85D04; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #fff; padding: 30px 20px; }
    .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
    .footer a { color: #E85D04; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚴 Your Weekly Bike Train Update</h1>
  </div>
  <div class="content">
    <p>Here are the bike train rides happening this week:</p>
    {{routes}}
    <p style="margin-top: 30px;">See you on the bike train!</p>
  </div>
  <div class="footer">
    <p>{{region_name}} • Sent every Sunday at 8 AM</p>
    <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
  </div>
</body>
</html>',
  'YOUR WEEKLY BIKE TRAIN UPDATE

Here are the bike train rides happening this week:

{{routes}}

See you on the bike train!

---
{{region_name}}
Unsubscribe: {{unsubscribe_url}}'
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates
  WHERE region_id = (SELECT id FROM regions WHERE slug = 'philly')
  AND template_type = 'weekly_digest'
);

-- Confirmation Template
INSERT INTO email_templates (region_id, template_type, subject, html_body, text_body)
SELECT
  (SELECT id FROM regions WHERE slug = 'philly'),
  'confirmation',
  'Welcome to {{region_name}}!',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #E85D04; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #fff; padding: 30px 20px; }
    .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
    .footer a { color: #E85D04; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Welcome to the Bike Train!</h1>
  </div>
  <div class="content">
    <p>Thanks for subscribing to {{region_name}} updates!</p>
    <p>You''ll receive a weekly email every Sunday at 8 AM with upcoming bike train rides for the week.</p>
    <p><strong>What to expect:</strong></p>
    <ul>
      <li>Weekly digest of all scheduled rides</li>
      <li>Route details, departure times, and meeting points</li>
      <li>Special event announcements</li>
    </ul>
    <p>We''re excited to ride with you!</p>
  </div>
  <div class="footer">
    <p>{{region_name}}</p>
    <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
  </div>
</body>
</html>',
  'WELCOME TO THE BIKE TRAIN!

Thanks for subscribing to {{region_name}} updates!

You''ll receive a weekly email every Sunday at 8 AM with upcoming bike train rides for the week.

What to expect:
- Weekly digest of all scheduled rides
- Route details, departure times, and meeting points
- Special event announcements

We''re excited to ride with you!

---
{{region_name}}
Unsubscribe: {{unsubscribe_url}}'
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates
  WHERE region_id = (SELECT id FROM regions WHERE slug = 'philly')
  AND template_type = 'confirmation'
);

-- Email Blast Template
INSERT INTO email_templates (region_id, template_type, subject, html_body, text_body)
SELECT
  (SELECT id FROM regions WHERE slug = 'philly'),
  'blast',
  'Important Update - {{region_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #E85D04; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #fff; padding: 30px 20px; }
    .message { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
    .footer a { color: #E85D04; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📢 Important Update</h1>
  </div>
  <div class="content">
    <div class="message">
      {{message}}
    </div>
    <p>This is a special announcement from the {{region_name}} organizers.</p>
  </div>
  <div class="footer">
    <p>{{region_name}}</p>
    <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
  </div>
</body>
</html>',
  'IMPORTANT UPDATE

{{message}}

This is a special announcement from the {{region_name}} organizers.

---
{{region_name}}
Unsubscribe: {{unsubscribe_url}}'
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates
  WHERE region_id = (SELECT id FROM regions WHERE slug = 'philly')
  AND template_type = 'blast'
);
