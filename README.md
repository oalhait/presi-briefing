# Daily AI & Markets Brief

A Vercel cronjob that sends a daily brief email with:

- Tech/AI news from Hacker News
- World news from NY Times
- Market snapshot

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

   - Copy `env.example` to `.env.local`
   - Add your OpenAI API key
   - Add your Resend API key (see Resend setup below)

3. For local development:

```bash
npm run dev
```

## Resend Setup

1. **Sign up for Resend** at [resend.com](https://resend.com)
2. **Create an API key**:
   - Go to your Resend dashboard
   - Click "API Keys" in the sidebar
   - Click "Create API Key"
   - Copy the key and use it for `RESEND_API_KEY`
3. **Verify your domain** (optional but recommended):
   - Add your domain (omar.fyi) in the Resend dashboard
   - Follow DNS verification steps
   - This improves deliverability

## Deployment

1. Deploy to Vercel:

```bash
npx vercel --prod
```

2. Set environment variables in Vercel dashboard:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `RESEND_API_KEY`: Your Resend API key

## Environment Variables

- `OPENAI_API_KEY`: OpenAI API key for generating the brief summary
- `RESEND_API_KEY`: Resend API key for sending emails

## How it works

- The cronjob runs daily at 7 AM PST (15:00 UTC)
- It fetches RSS feeds from Hacker News and NY Times
- OpenAI generates a concise summary
- Email is sent to mail@omar.fyi and omar@reducto.ai via Resend

## Why Resend?

- **Simple setup** - just an API key, no 2FA needed
- **Great deliverability** - built by email experts
- **Developer-friendly** - clean API and dashboard
- **Free tier** - 100 emails/day, 3,000/month
- **Modern** - built for developers, not marketing teams

## Alternative Email Providers

If you prefer other providers, you can easily switch by updating the transporter configuration:

### AWS SES

```javascript
const transporter = nodemailer.createTransport({
  host: "email-smtp.us-east-1.amazonaws.com",
  port: 587,
  auth: {
    user: process.env.AWS_SES_ACCESS_KEY,
    pass: process.env.AWS_SES_SECRET_KEY,
  },
});
```

### Mailgun

```javascript
const transporter = nodemailer.createTransport({
  host: "smtp.mailgun.org",
  port: 587,
  auth: {
    user: process.env.MAILGUN_USERNAME,
    pass: process.env.MAILGUN_PASSWORD,
  },
});
```

### Postmark

```javascript
const transporter = nodemailer.createTransport({
  host: "smtp.postmarkapp.com",
  port: 587,
  auth: {
    user: process.env.POSTMARK_SERVER_TOKEN,
    pass: process.env.POSTMARK_SERVER_TOKEN,
  },
});
```

## Testing

To test the endpoint manually:

```bash
curl -X POST http://localhost:3000/api/daily-brief
```

Or visit the deployed URL:

```bash
curl -X POST https://your-app.vercel.app/api/daily-brief
```
