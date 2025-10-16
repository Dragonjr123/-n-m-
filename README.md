# {n/m} Game

Browser-based side scrolling video game with the matter.js physics engine.

## 🚀 Deploy to Vercel

### Quick Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone)

### Manual Deployment

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

## 📁 Project Structure

```
/
├── index.html          # Main game page
├── css/
│   └── style.css       # Game styles
├── js/                 # All game JavaScript files
│   ├── matter.min.js
│   ├── decomp.min.js
│   ├── simulation.js
│   ├── player.js
│   ├── powerup.js
│   ├── tech.js
│   ├── bullet.js
│   ├── mob.js
│   ├── spawn.js
│   ├── level.js
│   ├── lore.js
│   ├── engine.js
│   └── index.js
└── images/
    └── favicon.ico
```

## 🔧 Local Development

Simply open `index.html` in a web browser or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server
```

## 📝 Notes

- All files must be committed to Git for Vercel to deploy them
- The game is a pure static site (HTML/CSS/JS)
- No build process required

## 🎮 Game Info

Original game: n-gon by Tony Valsamis
Repository: https://github.com/landgreen/n-gon
