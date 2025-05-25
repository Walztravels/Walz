# 🚀 Netlify Environment Variables Setup

## Required Environment Variables for Production

Copy and paste these into your Netlify Site Settings → Environment Variables:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZGVlcC13aWxkY2F0LTcuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=sk_test_mrJs49PsdqoOF64hWWdbSbaIzG17kmu74F86sSgm9J
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
OPENAI_API_KEY=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
NEXT_PUBLIC_OPENAI_MODEL=gpt-3.5-turbo
STRIPE_SECRET_KEY=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
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51PZOhURt8fhfZOLoV8hDHQeZXqtGDjsEHgbFemKYMZ23ZPs1UeyuqElfuC2ZYS7ZutL9vfO1uK74QyG2L4R5utXa00hi06IXdp
```

## Quick Deployment Steps

1. **Build the project locally** (already done)
2. **Upload to Netlify**:
   - Go to https://app.netlify.com
   - Click "Add new site" → "Deploy manually"
   - Drag and drop this entire project folder
3. **Set environment variables** (copy from above)
4. **Redeploy** if needed

## Build Settings for Git Deployment

If connecting via Git repository:
- **Build command**: `npm install && npm run build`
- **Publish directory**: `.next`
- **Node version**: 18

## ✅ After Deployment

Your live URL will be: `https://[site-name].netlify.app`

Test these features:
- ✅ Homepage loads with Walz Travels branding
- ✅ Authentication (sign-up/sign-in) works
- ✅ Trip planner is protected and redirects to sign-in
- ✅ All APIs respond correctly

## Custom Domain Setup

To use **walzplanner.com**:
1. In Netlify: Site Settings → Domain management → Add custom domain
2. Add DNS records as provided by Netlify
3. SSL auto-configured

Your Walz Travels AI Trip Planner is ready for production! 🎉
