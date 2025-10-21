// Multiplayer mob targeting fix
// This code should be injected into the mob's targeting logic

const multiplayerMobTargeting = {
    // Get all alive players (local + remote) with positions
    getAllPlayers() {
        const players = [];
        
        // Add local player
        if (typeof m !== 'undefined' && m.alive && m.pos) {
            players.push({
                x: m.pos.x,
                y: m.pos.y,
                isLocal: true,
                id: 'local'
            });
        }
        
        // Add remote players
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && multiplayer.players) {
            for (const [id, player] of Object.entries(multiplayer.players)) {
                if (player.alive !== false && player.x !== undefined && player.y !== undefined) {
                    players.push({
                        x: player.x,
                        y: player.y,
                        isLocal: false,
                        id: id
                    });
                }
            }
        }
        
        return players;
    },
    
    // Find the closest player to a mob
    findClosestPlayer(mobPosition) {
        const players = this.getAllPlayers();
        let closest = null;
        let minDist = Infinity;
        
        for (const player of players) {
            const dx = player.x - mobPosition.x;
            const dy = player.y - mobPosition.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < minDist) {
                minDist = dist;
                closest = player;
            }
        }
        
        return { player: closest, distance: minDist };
    },
    
    // Patch mob's locatePlayer to target any player
    patchMobTargeting(mob) {
        const originalLocatePlayer = mob.locatePlayer;
        
        mob.locatePlayer = function() {
            // If not in multiplayer, use original logic
            if (!multiplayer || !multiplayer.enabled) {
                if (originalLocatePlayer) {
                    originalLocatePlayer.call(this);
                } else {
                    // Fallback to default single-player targeting
                    this.seePlayer.recall = this.seePlayerFreq;
                    this.seePlayer.position.x = m.pos.x;
                    this.seePlayer.position.y = m.pos.y;
                }
                return;
            }
            
            // Multiplayer: target closest player
            const result = multiplayerMobTargeting.findClosestPlayer(this.position);
            
            if (result.player) {
                this.seePlayer.recall = this.seePlayerFreq;
                this.seePlayer.position.x = result.player.x;
                this.seePlayer.position.y = result.player.y;
                
                // Store target info for networking
                this.targetPlayer = result.player;
                this.targetDistance = result.distance;
            }
        };
        
        // Also patch distance calculation
        if (mob.distanceToPlayer) {
            mob.distanceToPlayer = function() {
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.position.x;
                    const dy = this.targetPlayer.y - this.position.y;
                    return Math.sqrt(dx * dx + dy * dy);
                }
                // Fallback to original calculation
                const dx = m.pos.x - this.position.x;
                const dy = m.pos.y - this.position.y;
                return Math.sqrt(dx * dx + dy * dy);
            };
        }
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.multiplayerMobTargeting = multiplayerMobTargeting;
}
