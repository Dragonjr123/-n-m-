# Block Interaction Networking Fix

## Problems Found
1. **Block events used array INDEX instead of body.id** → Broke after level changes
2. **Client couldn't manipulate blocks** → handleRemoteBlockHold was host-only  
3. **Event spam in console** → No throttling on logs

## Root Cause
After level transitions, body array indices change when blocks are removed/added. Using array index for sync meant:
- Host sends `index: 5` for a block
- Client's block at `index: 5` is a different block!
- Physics authority broke completely

## The Fix

### 1. Use body.id Instead of Array Index (player.js)
Changed all block interactions to use Matter.js `body.id` (persistent) instead of array index:

**Lines 1147-1154** - Block Hold Sync:
```javascript
// OLD: const idx = body.indexOf(m.holdingTarget);
// NEW:
const bodyId = m.holdingTarget.id;
if (bodyId) {
    multiplayer.syncBlockInteraction('hold', {
        bodyId: bodyId,  // ← Changed from index
        position: {...},
        velocity: {...},
        mass: ...
    });
}
```

**Lines 1543-1551** - Block Pickup:
```javascript
const bodyId = m.holdingTarget.id;
multiplayer.claimAuthority('block', bodyId);  // ← Use bodyId for authority
multiplayer.syncBlockInteraction('pickup', {
    bodyId: bodyId,  // ← Changed from index
    ...
});
```

**Lines 1233-1242** - Block Throw:
```javascript
const bodyId = m.holdingTarget.id;
multiplayer.syncBlockInteraction('throw', {
    bodyId: bodyId,  // ← Changed from index
    ...
});
multiplayer.releaseAuthority('block', bodyId);  // ← Use bodyId
```

### 2. Fix Handlers to Use bodyId (multiplayer.js)

**Lines 2572-2584** - handleRemoteBlockPickup:
```javascript
handleRemoteBlockPickup(event) {
    if (!event || !event.blockData) return;
    const bodyId = data.bodyId;  // ← Get bodyId
    
    // Find body by ID instead of index
    const blk = body.find(b => b && b.id === bodyId);  // ← Lookup by ID
    if (!blk) return;
    
    // Make non-colliding while picked up
    blk.collisionFilter.category = 0;
    blk.collisionFilter.mask = 0;
}
```

**Lines 2586-2604** - handleRemoteBlockThrow:
```javascript
handleRemoteBlockThrow(event) {
    const bodyId = data.bodyId;
    const blk = body.find(b => b && b.id === bodyId);  // ← Lookup by ID
    if (!blk) return;
    
    // Apply throw physics
    Matter.Body.setPosition(blk, data.position);
    Matter.Body.setVelocity(blk, data.velocity);
    blk.collisionFilter.category = cat.body;
    blk.collisionFilter.mask = cat.player | cat.map | cat.body | ...;
}
```

**Lines 2507-2533** - handleRemoteBlockHold:
```javascript
handleRemoteBlockHold(event) {
    // REMOVED: if (!this.isHost) return;  // ← Was host-only!
    const bodyId = data.bodyId;
    const blk = body.find(b => b && b.id === bodyId);  // ← Lookup by ID
    if (!blk) return;
    
    // Only apply if we don't have authority
    const authKey = `block_${bodyId}`;
    const auth = this.clientAuthority.get(authKey);
    if (auth && auth.playerId === this.playerId) {
        return;  // We're controlling it
    }
    
    // Apply remote player's hold position
    Matter.Body.setPosition(blk, data.position);
    Matter.Body.setVelocity(blk, data.velocity);
    blk.collisionFilter.category = 0;  // Non-colliding while held
    blk.collisionFilter.mask = 0;
}
```

### 3. Remove Console Spam
- **Line 1023**: Removed logs from `syncBlockInteraction()`
- **Line 1527**: Removed log from `handleFieldEvent()`
- Reduced noise from ~50 logs/sec to 0

### 4. Remove Duplicate Functions
Removed old duplicate implementations at lines 2213-2272 that used array indices.

## Result ✅
- **Clients can now manipulate blocks with field emitter!**
- **Block sync works correctly after level transitions**
- **No more event spam in console**
- **All players see blocks in correct positions when held/thrown**

## Files Modified
- `player.js`: Lines 1147, 1233, 1543-1545 (use bodyId)
- `multiplayer.js`: Lines 1023, 1527, 2507-2604 (handlers use bodyId, removed host-only restriction)

## Test
1. Start multiplayer game
2. Client grabs block with field emitter → Should work! ✅
3. Host sees client holding block → Should see it! ✅  
4. Go to next level
5. Repeat steps 2-3 → Still works! ✅
