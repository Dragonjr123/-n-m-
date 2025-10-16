# PolyTree - All Tech Implementation

## ✅ What's Implemented

### **Dynamic Tech Tree Generation**
- **Automatically includes ALL tech** from the game (~250+ tech items)
- Excludes: Lore tech, junk tech, and non-refundable tech
- Organizes by **frequency** (rare tech = more powerful = higher tier)

### **Tier System**
- **20 tech per tier** (automatic distribution)
- **Exponential cost scaling**:
  - Base: 20-120 polys per tech within a tier
  - Multiplier: 1.5x per tier (Tier 1: 20-120, Tier 2: 30-180, Tier 3: 45-270, etc.)
- **~13-15 tiers total** depending on available tech

### **Dependency System**
- **Tier 1**: No dependencies (starter tech)
- **Tier 2+**: Must own at least one tech from previous tier
- Random dependency selection creates varied progression paths
- Forces strategic choices - can't rush to best tech

### **UI Features**
1. **Grid Layout**: Scrollable grid that fits all tech
2. **Color Coding**:
   - Green = Owned (appears in powerup choices)
   - Yellow = Available to buy
   - Gray = Locked (need dependencies or polys)
3. **Tier Headers**: Shows tier number and tech count
4. **In-Game Poly Counter**: Top-right corner (progressive mode only)

### **Progressive Mode Mechanics**

#### **Earning Polys:**
- Kill enemies: 1-10+ polys (scales with mob health)
- Complete levels: 50 + (10 × levelsCleared) polys

#### **Powerup System:**
- **First powerup**: Random from ALL available tech (so you can fight)
- **After first**: Only tech you've unlocked in PolyTree
- Forces strategic planning - must invest in tech tree early

#### **Tech Unlocking:**
1. Click "PolyTree" button (works in both modes)
2. View all available tech organized by tier
3. Click yellow tech to purchase with polys
4. Purchased tech appears in future powerups

### **Adventure Mode**
- PolyTree available for viewing
- All tech available in powerups (classic behavior)
- No poly earning or spending
- No restrictions

## 📊 Tech Organization

### **By Frequency (Rarity)**
```
High Frequency (4-6) → Common tech → Tier 1
Medium Frequency (2-3) → Uncommon tech → Tier 2-5  
Low Frequency (1) → Rare tech → Tier 6-10
Very Low Frequency (<1) → Ultra-rare tech → Tier 11+
```

### **Cost Examples**
- **Tier 1**: 20-120 polys (affordable after 1-2 levels)
- **Tier 5**: ~150-500 polys (mid-game investment)
- **Tier 10**: ~600-2000 polys (late-game power)
- **Tier 15**: ~1500-5000+ polys (endgame god-mode)

## 🎮 Gameplay Flow

### **Early Game (Levels 1-3)**
1. Start with 0 polys
2. Get first powerup (random, any tech) - can fight back
3. Kill enemies to earn polys
4. Open PolyTree, buy cheap Tier 1 tech
5. Future powerups only show owned tech

### **Mid Game (Levels 4-10)**
1. Accumulate polys from kills + level completions
2. Unlock Tier 2-5 tech strategically
3. Build toward a focused strategy
4. Earn 50-150 polys per level

### **Late Game (Levels 11+)**
1. Save for expensive high-tier tech
2. Unlock powerful rare abilities
3. Dominate with your custom build
4. Earn 150-300+ polys per level

## 🔧 Technical Details

### **Files Modified:**
- `js/polytree.js` - Complete rewrite with dynamic generation
- `js/simulation.js` - Init/poly display logic
- `js/powerup.js` - Tech filtering for progressive mode
- `js/mob.js` - Poly rewards on kill
- `js/level.js` - Poly rewards on level complete
- `index.html` - In-game poly counter

### **Key Functions:**
```javascript
polyTree.generateTechTree()  // Build tree from game tech
polyTree.init()              // Initialize progressive mode
polyTree.buyTech(techId)     // Purchase tech
polyTree.awardPolyForKill()  // Give polys on mob death
polyTree.awardPolyForLevel() // Give polys on level complete
polyTree.renderTree()        // Display UI
```

## 🚀 Benefits

1. **Every tech is accessible** - No arbitrary exclusions
2. **Automatic organization** - No manual curation needed
3. **Scalable** - Works with any number of tech
4. **Balanced** - Costs scale with power
5. **Strategic** - Must plan progression path
6. **Replayable** - Different paths each run

## 📝 Future Ideas

- Save PolyTree progress between runs
- Add "prestige" system to reset with bonuses
- Create synergy bonuses for related tech
- Add tech descriptions to PolyTree UI
- Filter/search functionality for large tree
- Visual dependency connections (optional)
