# Main Menu UI Update

## Changes Made

### 1. **Shrunk the Controls Display**
- Mouse graphic scaled down from `0.28` to `0.20` and repositioned
- Keyboard controls scaled down from `0.8` to `0.6` and repositioned
- Labels resized and repositioned to fit the smaller controls

### 2. **Added Main Menu Buttons**

#### **PLAY Button** (Large, Cyan)
- Size: 250x55px
- Color: Bright cyan (#0cf)
- Function: Starts the game (`simulation.startGame()`)

#### **Settings Button** (Medium, Gray)
- Size: 120x45px
- Color: Gray (#888)
- Function: Opens the settings dropdown menu

#### **PolyTree Button** (Medium, Green)
- Size: 120x45px
- Color: Green (#5a5)
- Function: Currently shows "PolyTree coming soon!" alert
- Ready for future implementation

### 3. **Button Interactions**
- Hover effect: Buttons brighten by 20%
- Click effect: Buttons darken by 10%
- Smooth transitions (0.2s ease)

## Layout

```
┌─────────────────────────────┐
│         {n/m} Title         │
│                             │
│    [Controls - Smaller]     │
│     Mouse + Keyboard        │
│                             │
│    ┌─────────────────┐      │
│    │      PLAY       │      │
│    └─────────────────┘      │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │ Settings │ │ PolyTree │  │
│  └──────────┘ └──────────┘  │
└─────────────────────────────┘
```

## Colors
- **Play**: Cyan (#0cf) - Eye-catching, inviting
- **Settings**: Gray (#888) - Neutral, secondary action
- **PolyTree**: Green (#5a5) - Future feature, positive

## To Implement PolyTree
Replace the `onclick` handler in index.html (line ~429):
```javascript
onclick="yourPolyTreeFunction()"
```
