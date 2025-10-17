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
        });
    },
    
    // Get current player data
    getPlayerData() {
        // Check if player exists and is in game
        if (typeof m === 'undefined' || !m.pos || !m.velocity) {
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
        
        return {
            name: this.settings.name,
            color: this.settings.color,
            nameColor: this.settings.nameColor,
            x: m.pos.x || 0,
            y: m.pos.y || 0,
            vx: m.velocity.x || 0,
            vy: m.velocity.y || 0,
            angle: m.angle || 0,
            health: m.health || 1,
            fieldActive: (m.fieldMode > 0 && m.energy > 0) || false,
            lastUpdate: Date.now()
        };
    },
    
    // Update player position (called every frame)
    update() {
        if (!this.enabled || !this.lobbyId) return;
        
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        
        this.lastUpdateTime = now;
        
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        playerRef.update(this.getPlayerData());
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
        if (!this.enabled || !this.gameStarted) return;
        
        const deltaTime = 1 / 60; // Assume 60fps
        
        for (const [id, player] of Object.entries(this.players)) {
            const pos = this.interpolatePlayer(player, deltaTime);
            
            // Skip if player has no valid position data
            if (!pos || (pos.x === 0 && pos.y === 0)) continue;
            
            ctx.save();
            
            // Draw player body (EXACT same as m.draw())
            ctx.translate(pos.x, pos.y);
            ctx.rotate(player.angle || 0);
            
            // Body circle with gradient (same as player.js line 2926-2936)
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, 2 * Math.PI);
            
            // Create gradient from player color
            const playerColor = player.color || "#4a9eff";
            let grd = ctx.createLinearGradient(-30, 0, 30, 0);
            
            // Darken the color for gradient start
            const darkColor = this.darkenColor(playerColor, 0.7);
            grd.addColorStop(0, darkColor);
            grd.addColorStop(1, playerColor);
            
            ctx.fillStyle = grd;
            ctx.fill();
            
            // Eye dot (same as player.js line 2933)
            ctx.arc(15, 0, 4, 0, 2 * Math.PI);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw field if active
            if (player.fieldActive) {
                ctx.beginPath();
                ctx.arc(0, 0, 55, 0, 2 * Math.PI);
                ctx.strokeStyle = "rgba(0, 200, 255, 0.8)";
                ctx.lineWidth = 5;
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
