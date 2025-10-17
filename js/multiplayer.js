// Multiplayer system using Firebase Realtime Database
// Firebase will be loaded via CDN in index.html

const firebaseConfig = {
    apiKey: "AIzaSyBg_cDvLmxahIxnD07TgeqsDdwg8b8_uVU",
    authDomain: "nmgame-a6938.firebaseapp.com",
    databaseURL: "https://nmgame-a6938-default-rtdb.firebaseio.com",
    projectId: "nmgame-a6938",
    storageBucket: "nmgame-a6938.firebasestorage.app",
    messagingSenderId: "1024928087353",
    appId: "1:1024928087353:web:b2450cf7ed3e8c559fbce8",
    measurementId: "G-D9MWV15YH9"
};

// Initialize Firebase (using global firebase object from CDN)
let database;

function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.error('Firebase not loaded!');
        return false;
    }
    
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    database = firebase.database();
    return true;
}

const multiplayer = {
    enabled: false,
    isHost: false,
    lobbyId: null,
    playerId: null,
    playerName: "Player",
    playerColor: "#4a9eff",
    nameColor: "#fff",
    players: {}, // Other players in the lobby
    lastUpdateTime: 0,
    updateInterval: 50, // Send updates every 50ms (20 updates/sec)
    maxPlayers: 10,
    gameStarted: false,
    
    // Player settings
    settings: {
        name: "Player",
        color: "#4a9eff",
        nameColor: "#fff"
    },
    
    // Initialize multiplayer system
    init() {
        if (!initFirebase()) {
            console.error('Failed to initialize Firebase');
            return false;
        }
        this.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        console.log('Multiplayer initialized. Player ID:', this.playerId);
        return true;
    },
    
    // Create a new lobby
    async createLobby(isPrivate, password, gameMode) {
        this.lobbyId = 'lobby_' + Math.random().toString(36).substr(2, 9);
        this.isHost = true;
        this.enabled = true;
        
        const lobbyData = {
            host: this.playerId,
            isPrivate: isPrivate,
            password: password || null,
            gameMode: gameMode,
            createdAt: Date.now(),
            gameStarted: false,
            players: {}
        };
        
        lobbyData.players[this.playerId] = this.getPlayerData();
        
        await database.ref('lobbies/' + this.lobbyId).set(lobbyData);
        
        // Setup disconnect handler
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        playerRef.onDisconnect().remove();
        
        // Listen for other players joining
        this.listenToPlayers();
        
        console.log('Lobby created:', this.lobbyId);
        return this.lobbyId;
    },
    
    // Join an existing lobby
    async joinLobby(lobbyId, password) {
        const lobbyRef = database.ref('lobbies/' + lobbyId);
        const snapshot = await lobbyRef.once('value');
        
        if (!snapshot.exists()) {
            throw new Error('Lobby not found');
        }
        
        const lobbyData = snapshot.val();
        
        if (lobbyData.isPrivate && lobbyData.password !== password) {
            throw new Error('Invalid password');
        }
        
        this.lobbyId = lobbyId;
        this.enabled = true;
        this.isHost = false;
        
        // Add self to lobby
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        await playerRef.set(this.getPlayerData());
        
        // Setup disconnect handler
        playerRef.onDisconnect().remove();
        
        // Listen to other players
        this.listenToPlayers();
        
        console.log('Joined lobby:', this.lobbyId);
        return lobbyData.gameMode;
    },
    
    // Get list of public lobbies
    async getPublicLobbies() {
        const lobbiesRef = database.ref('lobbies');
        const snapshot = await lobbiesRef.once('value');
        
        if (!snapshot.exists()) return [];
        
        const lobbies = [];
        snapshot.forEach((childSnapshot) => {
            const lobby = childSnapshot.val();
            if (!lobby.isPrivate) {
                lobbies.push({
                    id: childSnapshot.key,
                    playerCount: Object.keys(lobby.players || {}).length,
                    gameMode: lobby.gameMode,
                    createdAt: lobby.createdAt
                });
            }
        });
        
        return lobbies;
    },
    
    // Leave current lobby
    async leaveLobby() {
        if (!this.lobbyId) return;
        
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        await playerRef.remove();
        
        // If host, delete entire lobby
        if (this.isHost) {
            const lobbyRef = database.ref('lobbies/' + this.lobbyId);
            await lobbyRef.remove();
        }
        
        this.enabled = false;
        this.lobbyId = null;
        this.isHost = false;
        this.players = {};
        
        console.log('Left lobby');
    },
    
    // Listen to other players in the lobby
    listenToPlayers() {
        const playersRef = database.ref(`lobbies/${this.lobbyId}/players`);
        
        playersRef.on('value', (snapshot) => {
            if (!snapshot.exists()) return;
            
            const players = snapshot.val();
            this.players = {};
            
            for (const [id, data] of Object.entries(players)) {
                if (id !== this.playerId) {
                    this.players[id] = data;
                }
            }
            
            console.log('Updated player list:', Object.keys(this.players).length, 'other players');
        });
    },
    
    // Get current player data
    getPlayerData() {
        // Check if player exists and is in game
        if (typeof player === 'undefined' || !player.position || !player.velocity) {
            console.log('Player not ready:', typeof player, player?.position, player?.velocity);
            return {
                name: this.settings.name,
                color: this.settings.color,
                nameColor: this.settings.nameColor,
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                angle: 0,
                health: 1,
                fieldActive: false,
                lastUpdate: Date.now()
            };
        }
        
        // Use the SAME position calculation as the real player (m.pos)
        const posX = player.position.x || 0;
        const posY = (playerBody.position.y - m.yOff) || 0;
        
        // Debug: Log if we're getting (0,0) positions
        if (posX === 0 && posY === 0 && Math.random() < 0.1) {
            console.log('Warning: Player at (0,0), m.pos:', m.pos?.x, m.pos?.y, 'player.position:', player.position?.x, player.position?.y, 'playerBody.position.y:', playerBody?.position?.y, 'm.yOff:', m.yOff);
        }
        
        return {
            name: this.settings.name,
            color: this.settings.color,
            nameColor: this.settings.nameColor,
            x: posX,
            y: posY,
            vx: player.velocity.x || 0,
            vy: player.velocity.y || 0,
            angle: m.angle || 0,
            health: m.health || 1,
            fieldActive: this.isFieldActive(),
            // Network leg animation data
            walkCycle: m.walk_cycle || 0,
            flipLegs: m.flipLegs || 1,
            stepSize: m.stepSize || 0,
            onGround: m.onGround || false,
            yOff: m.yOff || 49,
            // Network field data
            energy: m.energy || 0,
            maxEnergy: m.maxEnergy || 1,
            fieldRange: m.fieldRange || 155,
            fieldArc: m.fieldArc || 0.2,
            isHolding: m.isHolding || false,
            lastUpdate: Date.now()
        };
    },
    
    // Check if field should be active based on field type and conditions
    isFieldActive() {
        if (m.fieldMode === 0 || m.energy <= 0) return false;
        
        const fieldName = m.fieldUpgrades[m.fieldMode].name;
        
        switch (fieldName) {
            case "field emitter":
                return m.energy > 0.05 && input.field;
            case "standing wave harmonics":
                return m.energy > 0.1 && m.fieldCDcycle < m.cycle;
            case "perfect diamagnetism":
                return m.energy > 0.05 && input.field;
            case "nano-scale manufacturing":
                return m.energy > 0.05 && input.field;
            case "negative mass field":
                return m.energy > 0.00035 && input.field;
            case "plasma torch":
                return input.field;
            case "time dilation field":
                return m.energy > 0.0013 && input.field;
            case "metamaterial cloaking":
                return true; // Always visible when cloaked
            case "pilot wave":
                return input.field && m.energy > 0.01;
            case "wormhole":
                return input.field;
            default:
                return m.energy > 0.05 && input.field;
        }
    },
    
    // Update player position (called every frame)
    update() {
        if (!this.enabled || !this.lobbyId) return;
        
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        
        this.lastUpdateTime = now;
        
        const playerData = this.getPlayerData();
        
        // Debug: Log position data occasionally
        if (Math.random() < 0.01) {
            console.log('Sending player data:', playerData.x, playerData.y, 'player.position:', player.position?.x, player.position?.y);
        }
        
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        playerRef.update(playerData);
    },
    
    // Helper function to darken a color
    darkenColor(color, factor) {
        // Parse hex color
        let r, g, b;
        if (color.startsWith('#')) {
            const hex = color.substring(1);
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            return color; // Return original if not hex
        }
        
        // Darken
        r = Math.floor(r * factor);
        g = Math.floor(g * factor);
        b = Math.floor(b * factor);
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    },
    
    // Interpolate player positions for smooth movement
    interpolatePlayer(player, deltaTime) {
        if (!player.targetX) {
            player.targetX = player.x;
            player.targetY = player.y;
            player.displayX = player.x;
            player.displayY = player.y;
        }
        
        // Smooth interpolation
        const lerpFactor = Math.min(deltaTime * 10, 1);
        player.displayX += (player.x - player.displayX) * lerpFactor;
        player.displayY += (player.y - player.displayY) * lerpFactor;
        
        return {
            x: player.displayX,
            y: player.displayY
        };
    },
    
    // Render other players
    render() {
        if (!this.enabled) return;
        
        const deltaTime = 1 / 60; // Assume 60fps
        const playerCount = Object.keys(this.players).length;
        
        // Debug: Always draw a test object to see if render function is called
        if (Math.random() < 0.01) {
            console.log('Multiplayer render called, player count:', playerCount);
        }
        
        // Draw a test object at a fixed position to verify rendering works
        ctx.save();
        ctx.translate(100, 100); // Fixed position
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(-10, -10, 20, 20);
        ctx.restore();
        
        // Debug: Log player count and positions more frequently
        if (Math.random() < 0.05) {
            console.log('Rendering', playerCount, 'other players');
            for (const [id, player] of Object.entries(this.players)) {
                console.log('Player', player.name, 'raw position:', player.x, player.y);
            }
        }
        
        for (const [id, player] of Object.entries(this.players)) {
            const pos = this.interpolatePlayer(player, deltaTime);
            
            // Debug: Log player data more frequently
            if (Math.random() < 0.05) {
                console.log('Player', player.name, 'at', pos.x, pos.y, 'raw:', player.x, player.y);
            }
            
            // Skip if player has no valid position data - but log this
            if (!pos || (pos.x === 0 && pos.y === 0)) {
                if (Math.random() < 0.1) {
                    console.log('Skipping player', player.name, 'due to invalid position:', pos, 'raw:', player.x, player.y);
                }
                // Don't skip - render anyway for debugging
                // continue;
            }
            
            ctx.save();
            
            // Draw player body (EXACT same as m.draw())
            ctx.translate(pos.x, pos.y);
            
            // Draw legs first (BEFORE rotation) - legs don't rotate with body!
            const playerColor = player.color || "#4a9eff";
            const darkColor = this.darkenColor(playerColor, 0.7);
            
            // Use networked leg animation data from other players
            const walkCycle = player.walkCycle || 0;
            const stepSize = player.stepSize || 0;
            const yOff = player.yOff || 49;
            const height = 42;
            const flipLegs = player.flipLegs || 1;
            const onGround = player.onGround || false;
            
            // Draw left leg (darker color)
            ctx.save();
            ctx.scale(flipLegs, 1); // Apply direction scaling
            ctx.strokeStyle = "#4a4a4a";
            ctx.lineWidth = 7;
            
            // Calculate leg positions using networked data (from calcLeg in player.js)
            const hipX = 12;
            const hipY = 24;
            const leftLegAngle = 0.034 * walkCycle + Math.PI;
            const footX = 2.2 * stepSize * Math.cos(leftLegAngle);
            const footY = 1.2 * stepSize * Math.sin(leftLegAngle) + yOff + height;
            
            // Calculate knee position (simplified intersection calculation)
            const d = Math.sqrt((hipX - footX) * (hipX - footX) + (hipY - footY) * (hipY - footY));
            const legLength1 = 55;
            const legLength2 = 45;
            const l = (legLength1 * legLength1 - legLength2 * legLength2 + d * d) / (2 * d);
            const h = Math.sqrt(legLength1 * legLength1 - l * l);
            const kneeX = (l / d) * (footX - hipX) - (h / d) * (footY - hipY) + hipX;
            const kneeY = (l / d) * (footY - hipY) + (h / d) * (footX - hipX) + hipY;
            
            // Draw leg segments
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
            
            // Draw toe lines
            ctx.beginPath();
            ctx.moveTo(footX, footY);
            ctx.lineTo(footX - 15, footY + 5);
            ctx.moveTo(footX, footY);
            ctx.lineTo(footX + 15, footY + 5);
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // Draw joints
            ctx.beginPath();
            ctx.arc(hipX, hipY, 11, 0, 2 * Math.PI);
            ctx.moveTo(kneeX + 7, kneeY);
            ctx.arc(kneeX, kneeY, 7, 0, 2 * Math.PI);
            ctx.moveTo(footX + 6, footY);
            ctx.arc(footX, footY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = playerColor;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
            
            // Draw right leg (lighter color)
            ctx.save();
            ctx.scale(flipLegs, 1); // Apply direction scaling
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 7;
            
            // Calculate right leg positions using networked data
            const rightLegAngle = 0.034 * walkCycle;
            const rightFootX = 2.2 * stepSize * Math.cos(rightLegAngle);
            const rightFootY = 1.2 * stepSize * Math.sin(rightLegAngle) + yOff + height;
            
            // Calculate right knee position
            const rightD = Math.sqrt((hipX - rightFootX) * (hipX - rightFootX) + (hipY - rightFootY) * (hipY - rightFootY));
            const rightL = (legLength1 * legLength1 - legLength2 * legLength2 + rightD * rightD) / (2 * rightD);
            const rightH = Math.sqrt(legLength1 * legLength1 - rightL * rightL);
            const rightKneeX = (rightL / rightD) * (rightFootX - hipX) - (rightH / rightD) * (rightFootY - hipY) + hipX;
            const rightKneeY = (rightL / rightD) * (rightFootY - hipY) + (rightH / rightD) * (rightFootX - hipX) + hipY;
            
            // Draw right leg segments
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(rightKneeX, rightKneeY);
            ctx.lineTo(rightFootX, rightFootY);
            ctx.stroke();
            
            // Draw right toe lines
            ctx.beginPath();
            ctx.moveTo(rightFootX, rightFootY);
            ctx.lineTo(rightFootX - 15, rightFootY + 5);
            ctx.moveTo(rightFootX, rightFootY);
            ctx.lineTo(rightFootX + 15, rightFootY + 5);
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // Draw right joints
            ctx.beginPath();
            ctx.arc(hipX, hipY, 11, 0, 2 * Math.PI);
            ctx.moveTo(rightKneeX + 7, rightKneeY);
            ctx.arc(rightKneeX, rightKneeY, 7, 0, 2 * Math.PI);
            ctx.moveTo(rightFootX + 6, rightFootY);
            ctx.arc(rightFootX, rightFootY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = playerColor;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
            
            // NOW rotate for body only (legs stay in world orientation)
            ctx.rotate(player.angle || 0);
            
            // Body circle with gradient (same as player.js line 2926-2936)
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, 2 * Math.PI);
            
            // Create gradient from player color
            let grd = ctx.createLinearGradient(-30, 0, 30, 0);
            grd.addColorStop(0, darkColor);
            grd.addColorStop(1, playerColor);
            
            ctx.fillStyle = grd;
            ctx.fill();
            
            // Eye dot (same as player.js line 2933)
            ctx.arc(15, 0, 4, 0, 2 * Math.PI);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            
            // Draw field emitter (same as player.js drawField)
            if (player.fieldActive && player.energy > 0) {
                // Field colors based on holding state (from player.js)
                if (player.isHolding) {
                    ctx.fillStyle = `rgba(110,170,200,${player.energy * (0.05 + 0.05 * Math.random())})`;
                    ctx.strokeStyle = `rgba(110, 200, 235, ${0.3 + 0.08 * Math.random()})`;
                } else {
                    ctx.fillStyle = `rgba(110,170,200,${0.02 + player.energy * (0.15 + 0.15 * Math.random())})`;
                    ctx.strokeStyle = `rgba(110, 200, 235, ${0.6 + 0.2 * Math.random()})`;
                }
                
                const range = player.fieldRange || 155;
                ctx.beginPath();
                ctx.arc(0, 0, range, player.angle - Math.PI * (player.fieldArc || 0.2), player.angle + Math.PI * (player.fieldArc || 0.2), false);
                ctx.lineWidth = 2;
                ctx.lineCap = "butt";
                ctx.stroke();
                
                let eye = 13;
                let aMag = 0.75 * Math.PI * (player.fieldArc || 0.2);
                let a = player.angle + aMag;
                let cp1x = 0.6 * range * Math.cos(a);
                let cp1y = 0.6 * range * Math.sin(a);
                ctx.quadraticCurveTo(cp1x, cp1y, eye * Math.cos(player.angle), eye * Math.sin(player.angle));
                
                a = player.angle - aMag;
                cp1x = 0.6 * range * Math.cos(a);
                cp1y = 0.6 * range * Math.sin(a);
                ctx.quadraticCurveTo(cp1x, cp1y, range * Math.cos(player.angle - Math.PI * (player.fieldArc || 0.2)), range * Math.sin(player.angle - Math.PI * (player.fieldArc || 0.2)));
                ctx.fill();
                
                // Draw random lines in field for cool effect
                let offAngle = player.angle + 1.7 * Math.PI * (player.fieldArc || 0.2) * (Math.random() - 0.5);
                ctx.beginPath();
                eye = 15;
                ctx.moveTo(eye * Math.cos(player.angle), eye * Math.sin(player.angle));
                ctx.lineTo(range * Math.cos(offAngle), range * Math.sin(offAngle));
                ctx.strokeStyle = "rgba(120,170,255,0.6)";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            
            ctx.restore();
            
            // Draw health bar and name AFTER restore (in world space)
            ctx.save();
            
            const barWidth = 70;
            const barHeight = 8;
            const barX = pos.x - barWidth / 2;
            const barY = pos.y - 55;
            
            // Health bar background
            ctx.fillStyle = "rgba(50, 50, 50, 0.8)";
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Health bar fill
            const healthPercent = Math.max(0, Math.min(1, player.health || 0));
            ctx.fillStyle = healthPercent > 0.5 ? "#0f0" : healthPercent > 0.25 ? "#ff0" : "#f00";
            ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            
            // Health bar border
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            
            // Draw player name with background
            const playerName = player.name || "Player";
            ctx.font = "bold 16px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            
            // Name background
            const nameWidth = ctx.measureText(playerName).width + 10;
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(pos.x - nameWidth/2, barY - 22, nameWidth, 18);
            
            // Name text
            ctx.fillStyle = player.nameColor || "#fff";
            ctx.fillText(playerName, pos.x, barY - 6);
            
            ctx.restore();
        }
    },
    
    // Sync powerup pickup
    syncPowerupPickup(powerupIndex) {
        if (!this.enabled || !this.lobbyId) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'powerup_pickup',
            playerId: this.playerId,
            powerupIndex: powerupIndex,
            timestamp: Date.now()
        });
    },
    
    // Kick player (host only)
    async kickPlayer(playerId) {
        if (!this.isHost || !this.lobbyId) return;
        
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${playerId}`);
        await playerRef.remove();
    },
    
    // Start game (host only)
    async startGame() {
        if (!this.isHost || !this.lobbyId) return;
        
        const lobbyRef = database.ref(`lobbies/${this.lobbyId}`);
        await lobbyRef.update({ gameStarted: true });
        
        this.gameStarted = true;
    },
    
    // Listen for game start
    listenForGameStart(callback) {
        if (!this.lobbyId) return;
        
        const gameStartRef = database.ref(`lobbies/${this.lobbyId}/gameStarted`);
        gameStartRef.on('value', (snapshot) => {
            if (snapshot.val() === true && !this.gameStarted) {
                this.gameStarted = true;
                if (callback) callback();
            }
        });
    }
};

// Export for global use
window.multiplayer = multiplayer;

// Initialize after page loads (Firebase needs to be loaded first)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => multiplayer.init(), 100);
    });
} else {
    setTimeout(() => multiplayer.init(), 100);
}
