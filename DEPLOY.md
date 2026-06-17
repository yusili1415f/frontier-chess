# Deploying Frontier Chess

This prototype is a static Vite web app. It can be deployed to Vercel so testers can open a public URL, play local modes in their browser, or join shared online rooms through Firebase Firestore.

Local modes are still separate per browser. Online Multiplayer rooms sync through Firestore and require Firebase environment variables.

## Branch Deployment Policy

- The `main` branch deploys the stable core game with no faction rules.
- The `faction-dev` branch can be deployed separately as a faction test app.
- Do not merge `faction-dev` into `main` until faction rules are tested.
- Online room documents include `gameVersion: "core" | "faction"` so stable rooms and faction-test rooms can be separated when needed.

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

## Enable Online Multiplayer

Online multiplayer uses Firebase Firestore. Each visitor still runs the app in their browser, but online rooms sync through Firestore.

1. Create a Firebase project.
2. Enable Firestore Database.
3. Add a Firebase web app.
4. Copy the Firebase web config values into `.env.local` for local testing:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

5. Add the same variables in Vercel Project Settings -> Environment Variables.
6. Redeploy Vercel.
7. Test with two browsers:
   - Browser 1 creates a game.
   - Browser 2 opens the invite link.
   - Browser 1 is Blue.
   - Browser 2 is Red.
   - Moves sync both ways.

## Prototype Firestore Rules

These rules are only for prototype playtesting. They are not production-ready and should be hardened before a public release with accounts, rate limits, or abuse protection.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      allow read, create, update: if true;
    }
  }
}
```

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
- Create online room works.
- Join online room works.
- A third browser becomes Spectator.
- Blue cannot move Red pieces.
- Red cannot move Blue pieces.
- Blue cannot move twice.
- Red cannot move before Blue.
- Online board and move log sync after each move.
- Combat, Cannon capture, promotion, and King capture results sync.
- Refreshing a room link restores the online game.
- Leaving online game returns to local mode.
