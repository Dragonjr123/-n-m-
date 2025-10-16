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
        
        for (const [id, player] of Object.entries(this.players)) {
            const pos = this.interpolatePlayer(player, deltaTime);
            
            // Skip if player has no position data
            if (!pos.x && !pos.y) continue;
            
            // Draw player body (same as local player - use the actual player shape)
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(player.angle || 0);
            
            // Draw player vertices (same as m.draw())
            ctx.fillStyle = player.color || "#4a9eff";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            
            // Draw player body shape (simplified n-gon shape)
            const radius = 30;
            const sides = 6;
            ctx.beginPath();
            for (let i = 0; i < sides; i++) {
                const angle = (Math.PI * 2 * i) / sides;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Draw field if active
            if (player.fieldActive) {
                ctx.beginPath();
                ctx.arc(0, 0, 55, 0, 2 * Math.PI);
                ctx.strokeStyle = "rgba(0, 200, 255, 0.6)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            
            ctx.restore();
            
            // Draw health bar above player
            const barWidth = 60;
            const barHeight = 6;
            const barX = pos.x - barWidth / 2;
            const barY = pos.y - 50;
            
            // Background
            ctx.fillStyle = "#333";
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Health
            ctx.fillStyle = player.health > 0.5 ? "#0f0" : player.health > 0.25 ? "#ff0" : "#f00";
            ctx.fillRect(barX, barY, barWidth * player.health, barHeight);
            
            // Border
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            
            // Draw player name
            ctx.fillStyle = player.nameColor;
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(player.name, pos.x, barY - 5);
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
