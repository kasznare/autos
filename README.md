# Autos - 3D Kids Car Game

A React + TypeScript + Three.js (R3F) prototype focused on a simple, fun loop for young kids.

## Stack
- React + TypeScript + Vite
- @react-three/fiber + @react-three/drei
- @react-three/rapier (physics)
- Zustand (game state)

## Current MVP
- Drive with `WASD` or arrow keys
- Crash into objects and build up damage
- Car color changes with damage level
- At 100% damage you lose (`Pit Stop Time!`) and restart
- Collect stars for score
- Collect repair cubes to reduce damage

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run lint
```

## Roadmap
See [docs/ROADMAP.md](./docs/ROADMAP.md).
