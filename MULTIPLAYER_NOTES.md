# Multiplayer Weapon Networking & Friendly Fire

## Networked Weapons
All weapons are automatically networked through the `b.fireWithAmmo()` system:

### How It Works
1. **Local Firing** (`bullet.js` line 82-86):
   - When a player fires any gun, `multiplayer.syncGunFire()` is called
   - Sends: gun name, angle, position, crouch state
   - Then executes the gun's `fire()` method locally

2. **Remote Replication** (`multiplayer.js` line 1315-1363):
   - `handleRemoteGunFire()` receives the event
   - Temporarily overrides local player position/angle
   - Calls the same gun's `fire()` method
   - Bullets are tagged with `ownerId` for friendly fire tracking

### Supported Weapons
- ✅ **Foam** - Fully networked (charge & discharge mechanics)
- ✅ **Laser** - Fully networked (all variants: normal, pulse, split beam, wide beam)
- ✅ **Rail Gun** - Fully networked (including area damage effects)
- ✅ All other guns (grenades, missiles, etc.)

## Friendly Fire System

### Settings
- **Location**: Lobby creation UI (`multiplayerUI.js` line 93-99)
- **Default**: Disabled (players cannot damage each other)
- **Storage**: Firebase lobby settings

### Implementation
1. **Bullet Owner Tracking**:
   - All bullets created with `ownerId` property
   - Tracks which player fired the bullet
   - Set in `fireAttributes()` and individual bullet creation

2. **Damage Check Helper**:
   - `multiplayer.shouldAllowDamage(sourceOwnerId, targetPlayerId)`
   - Returns `false` if friendly fire disabled and different players
   - Can be integrated into collision/damage systems

### Usage Example
```javascript
// In collision or damage code:
if (bullet.ownerId && typeof multiplayer !== 'undefined') {
    if (!multiplayer.shouldAllowDamage(bullet.ownerId, targetPlayer.id)) {
        return; // Block friendly fire damage
    }
}
// Apply damage...
```

## Technical Notes
- Bullets don't currently collide with players (only mobs)
- Friendly fire protection is framework for future features
- Area effects (explosions, railgun AOE) could use the same system
- Owner IDs are preserved when bullets spawn remotely
