# Netlify Deployment Guide - Walz Travels Trip Planner

## Pre-Deployment Status

Your application is ready for deployment:
- Build successful (`npm run build` completed)
- Next.js 15 optimized production build
- All dependencies resolved
- Environment variables configured
- `netlify.toml` configured correctly

## Quick Deployment Steps

### Option 1: Web UI Deployment (Recommended)

1. Go to Netlify Dashboard
   - Visit: https://app.netlify.com
   - Sign in with your account

2. Deploy New Site
   - Click "Add new site" → "Deploy manually"
   - Drag and drop the `.next` folder from your project
   - OR use "Browse to upload" and select the `.next` folder

3. Configure Environment Variables  
   After deployment, go to Site Settings → Environment Variables and add all variables from your `.env.production` file, including but not limited to:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   CLERK_SECRET_KEY=your_clerk_secret_key
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
   OPENAI_API_KEY=your_openai_api_key
   NEXT_PUBLIC_OPENAI_MODEL=gpt-4
   STRIPE_SECRET_KEY=your_stripe_secret_key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```

### Option 2: Git-based Deployment

1. Connect Repository  
   - Connect your Git repository to Netlify  
   - Configure build settings:  
     - Build command: `npm install && npm run build`  
     - Publish directory: `.next`  
     - Node version: 18

2. Add Environment Variables  
   Add the same environment variables as above in Site Settings → Environment Variables.

3. Deploy  
   Trigger a deploy and monitor the build logs for success.

## Build Configuration

Ensure your `netlify.toml` file is configured as follows:

```toml
[build]
  command = "npm install && npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

## Troubleshooting

- **Application Error**  
  1. Verify environment variables are correctly set in Netlify.  
  2. Confirm the build completed successfully without errors.  
  3. Check Netlify function logs for runtime errors.

- **Deployment Fails**  
  1. Ensure the `.next` folder exists after the build step.  
  2. Confirm Node version is set to 18 in build environment.  
  3. Verify all dependencies are listed in `package.json`.

## Files to Deploy

Deploy the `.next` folder which contains:  
- Static assets  
- Server functions  
- Compiled pages  
- Build manifest

## Expected Results

After successful deployment:  
- Homepage loads with Walz Travels branding  
- Authentication works (sign-in/sign-up)  
- Trip planner form functions correctly  
- API endpoints respond as expected  
- Stripe payments process successfully  
- OpenAI trip generation works seamlessly

## Custom Domain Setup

To set up `walzplanner.com`:  
1. Go to Site Settings → Domain management  
2. Add custom domain: `walzplanner.com`  
3. Update DNS records as instructed by Netlify  
4. Enable HTTPS (Netlify provides automatic SSL certificates)

## Post-Deployment Checklist

- [ ] Homepage loads without errors  
- [ ] Authentication flow works correctly  
- [ ] Trip planner generates itineraries  
- [ ] Payment processing is functional  
- [ ] Mobile responsive design verified  
- [ ] All API endpoints accessible  
- [ ] Environment variables properly configured  
- [ ] Custom domain configured (if applicable)

## Success!

Once deployed, your site will be available at:  
- Netlify URL: `https://[site-name].netlify.app`  
- Custom domain: `https://walzplanner.com` (if configured)

Your Walz Travels AI Trip Planner is ready for production use! 🚀