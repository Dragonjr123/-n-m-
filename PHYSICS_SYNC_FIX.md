# Physics Networking Fix - Level Transitions

## Problem
After the FIRST level transition, physics (blocks) stopped syncing properly for the HOST. The only way blocks would sync is if players grabbed them with the field emitter.

## Root Cause
The block sync logic had a critical flaw:

1. **First level**: All blocks synced once with full vertex data ✅
2. **After initial sync**: Host only synced **MOVING** blocks (velocity > 0.01) ❌
3. **Level transition**: Reset sync flag, triggered new full sync ✅
4. **Then again**: Only moving blocks synced ❌

**The Issue**: Line 2858-2859 in multiplayer.js
```javascript
const speed = body[i].velocity.x * body[i].velocity.x + body[i].velocity.y * body[i].velocity.y;
if (speed > 0.01 || Math.abs(body[i].angularVelocity) > 0.001) {
```

This meant:
- Stationary blocks weren't synced
- Host couldn't sync blocks it was holding (they're stationary in the field)
- Only field emitter movement triggered sync (because it makes blocks move)

## Solution

### 1. Track Level Changes (Line 65)
Added `lastLevelChangeTime: 0` to track when levels change.

### 2. Increased Resync Frequency After Level Changes (Line 2828-2831)
```javascript
const timeSinceLevelChange = now - this.lastLevelChangeTime;
const resyncChance = (timeSinceLevelChange < 10000) ? 0.20 : 0.01;
const syncAllBlocks = this.isHost && (!this.hasInitialBlockSync || Math.random() < resyncChance);
```
- First 10 seconds after level change: 20% chance to resync all blocks per frame
- After 10 seconds: Back to 1% chance (normal operation)

### 3. Always Sync Held Blocks (Line 2866-2881)
```javascript
const isHeld = (typeof m !== 'undefined' && m.holdingTarget && m.holdingTarget.id === bodyId);
// Sync if moving OR being held by host
if (speed > 0.01 || Math.abs(body[i].angularVelocity) > 0.001 || isHeld) {
    physicsData.blocks.push({
        // ... position/velocity
        // Include vertices for held blocks so clients can render correct shape
        vertices: isHeld && body[i].vertices ? body[i].vertices.map(v => ({ x: v.x, y: v.y })) : null,
        mass: isHeld ? body[i].mass : undefined,
        friction: isHeld ? body[i].friction : undefined,
        restitution: isHeld ? body[i].restitution : undefined
    });
}
```
Now HOST syncs blocks it's holding even if they're stationary!

### 4. Update Timestamp on Remote Level Changes (Line 2011-2012)
Both host and clients track level change time for consistent increased resync frequency.

## Result
✅ HOST can now sync stationary blocks after level transitions
✅ Blocks held by HOST are always synced with full shape data
✅ Increased resync frequency for 10 seconds after level changes ensures all blocks sync
✅ Physics networking works consistently across all levels

## Files Modified
- `multiplayer.js`: Lines 65, 1413, 2012, 2828-2831, 2866-2881
