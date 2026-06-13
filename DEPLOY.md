# Deploying Frontier Chess

This prototype is a static Vite web app. It can be deployed to Vercel so testers can open a public URL and run their own local game session in the browser.

It does not add real-time multiplayer. Each visitor has a separate local playtest session.

## Deploy to Vercel

1. Push the project to GitHub.
2. Go to Vercel.
3. Import the GitHub repository.
4. Use these settings:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Deploy.
6. Share the generated Vercel URL with testers.

## Local Production Preview

Run this before deploying if you want to test the production build locally:

```bash
npm run build
npm run preview
```

Then open the local preview URL shown by Vite.

## Post-Deploy Checklist

After deployment, test:

- Board loads correctly.
- Pieces display correctly.
- Human vs Heuristic AI works.
- AI moves after 200ms.
- Cannon capture rules work.
- Promotion markers `P★` and `G★` appear.
- Undo, replay, and reset still work.
- Simulation panel works.
- Balance simulator works.
