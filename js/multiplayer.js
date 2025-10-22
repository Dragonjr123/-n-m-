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
    // Deterministic level build
    pendingRngSeed: null,
    // Deterministic mob picks for the next level
    pendingNextSpawnPick: null,
    pendingDupChance: null,
    
    // Powerup networking
    powerupIdCounter: 0,
    localPowerupIds: new Map(), // Maps local powerUp array index to network ID
    networkPowerups: new Map(), // Maps network ID to powerup data
    
    // Physics networking
    lastPhysicsSyncTime: 0,
    physicsSyncInterval: 33, // Sync physics every 33ms (30 times/sec) for smoother mob movement
    // Interpolation caches
    mobInterp: new Map(), // index -> {x,y,angle,t}
    // Host authority
    hostId: null,
    // Pagination for mob sync so large counts eventually update
    mobSyncCursor: 0,
    maxMobsPerSync: 100, // Increase limit for better sync coverage
    // Stable mob identifiers
    mobNetIdCounter: 0,
    mobIndexByNetId: new Map(), // netId -> index
    
    // Client authority tracking (which player is manipulating which object)
    clientAuthority: new Map(), // objectId -> {playerId, type, timestamp}
    
    // Lobby settings
    hostOnlyLevelExit: false, // Only host can trigger level exits
    friendlyFire: false, // Whether players can damage each other
    
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
        // Ensure we have a playerId
        if (!this.playerId) {
            const ok = this.init();
            if (!ok) throw new Error('Multiplayer init failed');
        }
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
            hostOnlyLevelExit: false,
            persistEmptyLobby: true,
            players: {}
        };
        
        lobbyData.players[this.playerId] = this.getPlayerData();
        
        await database.ref('lobbies/' + this.lobbyId).set(lobbyData).catch((e) => {
            console.error('Failed to create lobby at path:', 'lobbies/' + this.lobbyId, e);
            throw e;
        });
        this.hostId = this.playerId; // host is self
        
        // Initialize local start state for host
        this.gameStarted = false;

        // Setup disconnect handler
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        playerRef.onDisconnect().remove();
        
        // Listen for other players joining
        this.listenToPlayers();
        
        // Start listening for field interaction events
        this.listenToFieldEvents();
        
        // Start listening for powerup events
        this.listenToPowerupEvents();
        
        // Start listening for physics (all players)
        this.listenToPhysics();
        
        // Host listens for client authority claims
        if (this.isHost) {
            this.listenToAuthority();
        }

        this.listenForGameStart(() => {
            if (typeof simulation !== 'undefined') simulation.paused = false;
        });
        
        console.log('Lobby created:', this.lobbyId);
        return this.lobbyId;
    },
    
    // Join an existing lobby
    async joinLobby(lobbyId, password) {
        // Ensure we have a playerId
        if (!this.playerId) {
            const ok = this.init();
            if (!ok) throw new Error('Multiplayer init failed');
        }
        const lobbyRef = database.ref('lobbies/' + lobbyId);
        const snapshot = await lobbyRef.once('value').catch((e) => {
            console.error('Failed to read lobby path:', 'lobbies/' + lobbyId, e);
            throw e;
        });
        
        if (!snapshot.exists()) {
            throw new Error('Lobby not found');
        }
        
        const lobbyData = snapshot.val();
        this.hostId = lobbyData.host || null;
        this.hostOnlyLevelExit = !!lobbyData.hostOnlyLevelExit;
        this.friendlyFire = !!lobbyData.friendlyFire;
        
        if (lobbyData.isPrivate && lobbyData.password !== password) {
            throw new Error('Invalid password');
        }
        
        this.lobbyId = lobbyId;
        this.enabled = true;
        this.isHost = false;
        
        // Add self to lobby
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        await playerRef.set(this.getPlayerData()).catch((e) => {
            console.error('Failed to add player to lobby:', this.playerId, 'at', `lobbies/${this.lobbyId}/players/${this.playerId}`, e);
            throw e;
        });
        
        // Setup disconnect handler
        playerRef.onDisconnect().remove();
        
        // Initialize local start state based on lobby
        this.gameStarted = !!lobbyData.gameStarted;
        // If host hasn't started the game yet, pause until start signal
        if (!this.gameStarted && typeof simulation !== 'undefined') simulation.paused = true;

        // Listen to other players
        this.listenToPlayers();
        
        // Start listening for field interaction events
        this.listenToFieldEvents();
        
        // Start listening for powerup events
        this.listenToPowerupEvents();
        
        // Start listening for physics (all players)
        this.listenToPhysics();
        
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
        
        // Don't delete lobby when host leaves - allow it to persist for others to join
        // Lobbies will be cleaned up by Firebase TTL or manual cleanup
        
        this.enabled = false;
        this.lobbyId = null;
        this.isHost = false;
        this.gameStarted = false;
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
            alive: !!m.alive,
            fieldActive: this.isFieldActive(),
            // Aim and input state
            aimX: (typeof simulation !== 'undefined' && simulation.mouseInGame) ? simulation.mouseInGame.x : 0,
            aimY: (typeof simulation !== 'undefined' && simulation.mouseInGame) ? simulation.mouseInGame.y : 0,
            isFiring: !!(typeof input !== 'undefined' && input.fire),
            isFieldDown: !!(typeof input !== 'undefined' && input.field),
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
            fieldThreshold: m.fieldThreshold,
            fieldRegen: m.fieldRegen,
            fieldMeterColor: m.fieldMeterColor,
            fieldMode: m.fieldMode,
            fieldCDcycle: isFinite(m.fieldCDcycle) ? m.fieldCDcycle : 0,
            fireCDcycle: isFinite(m.fireCDcycle) ? m.fireCDcycle : 0,
            isHolding: m.isHolding || false,
            holdingTarget: m.holdingTarget ? {
                position: { x: m.holdingTarget.position.x, y: m.holdingTarget.position.y },
                velocity: { x: m.holdingTarget.velocity.x, y: m.holdingTarget.velocity.y },
                mass: m.holdingTarget.mass
            } : null,
            lastUpdate: Date.now()
        };
    },
    
    // Check if field should be active based on field type and conditions
    // This determines the LOCAL player's field state to send to others
    isFieldActive() {
        // Check if no field is equipped (undefined/null) or no energy
        if (m.fieldMode === undefined || m.fieldMode === null || m.energy <= 0) return false;
        
        const fieldName = m.fieldUpgrades[m.fieldMode].name;
        
        // For local player, check actual input state
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
        
        // Auto-claim authority for objects player is physically interacting with
        this.checkAndClaimCollisionAuthority();
        
        const playerData = this.getPlayerData();
        
        // Debug: Log field state when active
        if (playerData.fieldActive && Math.random() < 0.1) {
            console.log('SENDING FIELD ACTIVE:', playerData.fieldActive, 'energy:', playerData.energy, 'input.field:', input.field, 'fieldMode:', playerData.fieldMode);
        }
        
        // Debug: Log position data occasionally
        if (Math.random() < 0.01) {
            console.log('Sending player data:', playerData.x, playerData.y, 'player.position:', player.position?.x, player.position?.y);
        }
        
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${this.playerId}`);
        playerRef.update(playerData);
        
        // All players sync physics (peer-to-peer)
        this.syncPhysics();
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
    
    // Draw field emitter based on field type (matches player.js logic)
    drawPlayerField(ctx, player, pos) {
        // Debug: Log field state for remote players
        if (Math.random() < 0.05) {
            console.log('REMOTE PLAYER FIELD:', player.name, 'fieldActive:', player.fieldActive, 'energy:', player.energy, 'fieldMode:', player.fieldMode);
        }
        
        // Use the transmitted fieldActive state from the remote player
        if (!player.fieldActive) return;
        
        console.log('DRAWING FIELD for', player.name, 'at', pos.x, pos.y);
        
        const fieldMode = player.fieldMode || 0;
        const fieldName = m.fieldUpgrades[fieldMode]?.name || "field emitter";
        
        switch (fieldName) {
            case "field emitter":
            case "nano-scale manufacturing":
                this.drawBasicField(ctx, player, pos);
                break;
            case "standing wave harmonics":
                this.drawStandingWaveField(ctx, player, pos);
                break;
            case "perfect diamagnetism":
                this.drawDiamagnetismField(ctx, player, pos);
                break;
            case "negative mass field":
                this.drawNegativeMassField(ctx, player, pos);
                break;
            case "plasma torch":
                this.drawPlasmaField(ctx, player, pos);
                break;
            case "time dilation field":
                this.drawTimeDilationField(ctx, player, pos);
                break;
            case "metamaterial cloaking":
                this.drawCloakingField(ctx, player, pos);
                break;
            case "pilot wave":
                this.drawPilotWaveField(ctx, player, pos);
                break;
            case "wormhole":
                this.drawWormholeField(ctx, player, pos);
                break;
            default:
                this.drawBasicField(ctx, player, pos);
        }
    },
    
    // Basic field emitter (from player.js lines 1211-1248)
    drawBasicField(ctx, player, pos) {
        // Field colors based on holding state
        if (player.isHolding) {
            ctx.fillStyle = `rgba(110,170,200,${player.energy * (0.05 + 0.05 * Math.random())})`;
            ctx.strokeStyle = `rgba(110, 200, 235, ${0.3 + 0.08 * Math.random()})`;
        } else {
            ctx.fillStyle = `rgba(110,170,200,${0.02 + player.energy * (0.15 + 0.15 * Math.random())})`;
            ctx.strokeStyle = `rgba(110, 200, 235, ${0.6 + 0.2 * Math.random()})`;
        }
        
        const range = player.fieldRange || 155;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, range, player.angle - Math.PI * (player.fieldArc || 0.2), player.angle + Math.PI * (player.fieldArc || 0.2), false);
        ctx.lineWidth = 2;
        ctx.lineCap = "butt";
        ctx.stroke();
        
        let eye = 13;
        let aMag = 0.75 * Math.PI * (player.fieldArc || 0.2);
        let a = player.angle + aMag;
        let cp1x = pos.x + 0.6 * range * Math.cos(a);
        let cp1y = pos.y + 0.6 * range * Math.sin(a);
        ctx.quadraticCurveTo(cp1x, cp1y, pos.x + eye * Math.cos(player.angle), pos.y + eye * Math.sin(player.angle));
        
        a = player.angle - aMag;
        cp1x = pos.x + 0.6 * range * Math.cos(a);
        cp1y = pos.y + 0.6 * range * Math.sin(a);
        ctx.quadraticCurveTo(cp1x, cp1y, pos.x + range * Math.cos(player.angle - Math.PI * (player.fieldArc || 0.2)), pos.y + range * Math.sin(player.angle - Math.PI * (player.fieldArc || 0.2)));
        ctx.fill();
        
        // Draw random lines in field for cool effect
        let offAngle = player.angle + 1.7 * Math.PI * (player.fieldArc || 0.2) * (Math.random() - 0.5);
        ctx.beginPath();
        eye = 15;
        ctx.moveTo(pos.x + eye * Math.cos(player.angle), pos.y + eye * Math.sin(player.angle));
        ctx.lineTo(pos.x + range * Math.cos(offAngle), pos.y + range * Math.sin(offAngle));
        ctx.strokeStyle = "rgba(120,170,255,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
    },
    
    // Standing wave harmonics field (from player.js lines 1515-1555)
    drawStandingWaveField(ctx, player, pos) {
        if (player.energy > 0.1) {
            const fieldRange1 = (0.7 + 0.3 * Math.sin(Date.now() / 400)) * (player.fieldRange || 175);
            const fieldRange2 = (0.63 + 0.37 * Math.sin(Date.now() / 620)) * (player.fieldRange || 175);
            const fieldRange3 = (0.65 + 0.35 * Math.sin(Date.now() / 780)) * (player.fieldRange || 175);
            
            ctx.fillStyle = `rgba(110,170,200,${Math.min(0.73, (0.04 + player.energy * (0.11 + 0.13 * Math.random())))})`;
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, fieldRange1, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, fieldRange2, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, fieldRange3, 0, 2 * Math.PI);
            ctx.fill();
        }
    },
    
    // Perfect diamagnetism field (from player.js lines 1561-1628)
    drawDiamagnetismField(ctx, player, pos) {
        const wave = Math.sin(Date.now() * 0.022);
        const fieldRange = (player.fieldRange || 170) + 12 * wave;
        const fieldArc = (player.fieldArc || 0.33) + 0.045 * wave;
        
        if (player.energy > 0.05) {
            // Field colors based on holding state
            if (player.isHolding) {
                ctx.fillStyle = `rgba(110,170,200,${0.06 + 0.03 * Math.random()})`;
                ctx.strokeStyle = `rgba(110, 200, 235, ${0.35 + 0.05 * Math.random()})`;
            } else {
                ctx.fillStyle = `rgba(110,170,200,${0.27 + 0.2 * Math.random() - 0.1 * wave})`;
                ctx.strokeStyle = `rgba(110, 200, 235, ${0.4 + 0.5 * Math.random()})`;
            }
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, fieldRange, player.angle - Math.PI * fieldArc, player.angle + Math.PI * fieldArc, false);
            ctx.lineWidth = 2.5 - 1.5 * wave;
            ctx.lineCap = "butt";
            ctx.stroke();
            
            const curve = 0.57 + 0.04 * wave;
            const aMag = (1 - curve * 1.2) * Math.PI * fieldArc;
            let a = player.angle + aMag;
            let cp1x = pos.x + curve * fieldRange * Math.cos(a);
            let cp1y = pos.y + curve * fieldRange * Math.sin(a);
            ctx.quadraticCurveTo(cp1x, cp1y, pos.x + 30 * Math.cos(player.angle), pos.y + 30 * Math.sin(player.angle));
            
            a = player.angle - aMag;
            cp1x = pos.x + curve * fieldRange * Math.cos(a);
            cp1y = pos.y + curve * fieldRange * Math.sin(a);
            ctx.quadraticCurveTo(cp1x, cp1y, pos.x + fieldRange * Math.cos(player.angle - Math.PI * fieldArc), pos.y + fieldRange * Math.sin(player.angle - Math.PI * fieldArc));
            ctx.fill();
        }
    },
    
    // Negative mass field (from player.js lines 1685-1798)
    drawNegativeMassField(ctx, player, pos) {
        if (player.energy > 0.00035) {
            const drawRadius = (player.fieldDrawRadius || 0) * 0.97 + 650 * 0.03;
            
            // Draw zero-G range
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, drawRadius, 0, 2 * Math.PI);
            ctx.fillStyle = "#f5f5ff";
            ctx.globalCompositeOperation = "difference";
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
        }
    },
    
    // Plasma torch field (from player.js lines 1802-1850)
    drawPlasmaField(ctx, player, pos) {
        // Plasma effects would be drawn by the bullet system
        // This is mainly for the field indicator
        if (player.energy > 0.05) {
            ctx.fillStyle = `rgba(255,0,255,${0.3 + 0.2 * Math.random()})`;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 50, 0, 2 * Math.PI);
            ctx.fill();
        }
    },
    
    // Time dilation field (from player.js lines 1855-1950)
    drawTimeDilationField(ctx, player, pos) {
        if (player.energy > 0.0013) {
            // Draw saturation effect
            ctx.globalCompositeOperation = "saturation";
            ctx.fillStyle = "#ccc";
            ctx.fillRect(-100000, -100000, 200000, 200000);
            ctx.globalCompositeOperation = "source-over";
        }
    },
    
    // Metamaterial cloaking field (from player.js lines 1953-2104)
    drawCloakingField(ctx, player, pos) {
        const energy = Math.max(0.01, Math.min(player.energy || 0, 1));
        const drawRadius = 1000;
        const fieldRange = drawRadius * Math.min(1, 0.3 + 0.5 * Math.min(1, energy * energy));
        
        ctx.fillStyle = `rgba(255,255,255,${200 / fieldRange / fieldRange})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, fieldRange, 0, 2 * Math.PI);
        ctx.globalCompositeOperation = "destination-in";
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.clip();
    },
    
    // Pilot wave field (from player.js lines 2240-2420)
    drawPilotWaveField(ctx, player, pos) {
        if (player.fieldOn && player.fieldRadius > 0) {
            const rotate = Date.now() * 0.008;
            const fieldPhase = (player.fieldPhase || 0) + 0.2;
            const off1 = 1 + 0.06 * Math.sin(fieldPhase);
            const off2 = 1 - 0.06 * Math.sin(fieldPhase);
            
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y, 1.2 * player.fieldRadius * off1, 1.2 * player.fieldRadius * off2, rotate, 0, 2 * Math.PI);
            ctx.globalCompositeOperation = "exclusion";
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
            
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y, 1.2 * player.fieldRadius * off1, 1.2 * player.fieldRadius * off2, rotate, 0, 2 * Math.PI * player.energy / (player.maxEnergy || 1));
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    },
    
    // Wormhole field (from player.js lines 2422-2665)
    drawWormholeField(ctx, player, pos) {
        if (player.hole && player.hole.isOn) {
            const fieldRange = (player.fieldRange || 0) * 0.97 + 0.03 * (50 + 10 * Math.sin(Date.now() * 0.025));
            const semiMajorAxis = fieldRange + 30;
            
            // Draw wormhole connection
            ctx.beginPath();
            ctx.moveTo(player.hole.pos1.x + semiMajorAxis, player.hole.pos1.y);
            ctx.bezierCurveTo(player.hole.pos1.x, player.hole.pos1.y, player.hole.pos2.x, player.hole.pos2.y, player.hole.pos2.x + semiMajorAxis, player.hole.pos2.y);
            ctx.lineTo(player.hole.pos2.x - semiMajorAxis, player.hole.pos2.y);
            ctx.bezierCurveTo(player.hole.pos2.x, player.hole.pos2.y, player.hole.pos1.x, player.hole.pos1.y, player.hole.pos1.x - semiMajorAxis, player.hole.pos1.y);
            ctx.fillStyle = `rgba(255,255,255,${200 / fieldRange / fieldRange})`;
            ctx.fill();
            
            // Draw wormhole portals
            ctx.beginPath();
            ctx.ellipse(player.hole.pos1.x, player.hole.pos1.y, fieldRange, semiMajorAxis, player.hole.angle || 0, 0, 2 * Math.PI);
            ctx.ellipse(player.hole.pos2.x, player.hole.pos2.y, fieldRange, semiMajorAxis, player.hole.angle || 0, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(255,255,255,${32 / fieldRange})`;
            ctx.fill();
        }
    },
    
    // Draw holding target visualization (from player.js lines 1075-1103)
    drawHoldingTarget(ctx, player, pos) {
        if (!player.holdingTarget) return;
        
        const eye = 15;
        const targetPos = player.holdingTarget.position;
        
        ctx.fillStyle = "rgba(110,170,200," + (0.2 + 0.4 * Math.random()) + ")";
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#000";
        
        // Draw connection lines from player to holding target
        ctx.beginPath();
        ctx.moveTo(pos.x + eye * Math.cos(player.angle), pos.y + eye * Math.sin(player.angle));
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.stroke();
        
        // Draw holding target as a simple circle
        ctx.beginPath();
        ctx.arc(targetPos.x, targetPos.y, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Draw mass indicator
        if (player.holdingTarget.mass) {
            ctx.font = "10px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "#fff";
            ctx.fillText(Math.round(player.holdingTarget.mass * 10) / 10, targetPos.x, targetPos.y + 3);
        }
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
            
            // Skip rendering dead players (spectator mode)
            if (player.alive === false) {
                continue;
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
            
            
            ctx.restore();
            
            // Draw field emitter based on field type (like player.js field emitter logic)
            this.drawPlayerField(ctx, player, pos);
            
            // Draw holding target if player is holding something (like player.js drawHold)
            if (player.isHolding && player.holdingTarget) {
                this.drawHoldingTarget(ctx, player, pos);
            }
            
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
            
            // Draw field meter (like player.js drawFieldMeter)
            if (player.energy !== undefined && player.maxEnergy !== undefined && player.energy < player.maxEnergy) {
                const fieldBarWidth = 60;
                const fieldBarHeight = 6;
                const fieldBarX = pos.x - fieldBarWidth / 2;
                const fieldBarY = pos.y - 70;
                
                // Field meter background
                ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                ctx.fillRect(fieldBarX, fieldBarY, fieldBarWidth, fieldBarHeight);
                
                // Field meter fill with player's field meter color
                const fieldColor = player.fieldMeterColor || "#0cf";
                ctx.fillStyle = fieldColor;
                ctx.fillRect(fieldBarX, fieldBarY, fieldBarWidth * (player.energy / player.maxEnergy), fieldBarHeight);
                
                // Field meter border
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.strokeRect(fieldBarX, fieldBarY, fieldBarWidth, fieldBarHeight);
            }
            
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
    
    // Sync field interactions (powerup grabbing, block pushing)
    syncFieldInteraction(type, data) {
        console.log('syncFieldInteraction called:', type, data, 'enabled:', this.enabled, 'lobbyId:', this.lobbyId);
        if (!this.enabled || !this.lobbyId) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: `field_${type}`,
            playerId: this.playerId,
            data: data,
            timestamp: Date.now()
        });
        console.log('Field interaction synced to Firebase');
    },
    
    // Sync block pickup/throw
    syncBlockInteraction(type, blockData) {
        console.log('syncBlockInteraction called:', type, blockData, 'enabled:', this.enabled, 'lobbyId:', this.lobbyId);
        if (!this.enabled || !this.lobbyId) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: `block_${type}`,
            playerId: this.playerId,
            blockData: blockData,
            timestamp: Date.now()
        });
        console.log('Block interaction synced to Firebase');
    },
    
    // Sync gun fire - call this from each gun's fire() function
    syncGunFire(gunName, angle, position, extraData = {}) {
        if (!this.enabled || !this.lobbyId) return;
        
        console.log('📤 Syncing gun fire:', gunName);
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'gun_fire',
            playerId: this.playerId,
            gunName: gunName,
            angle: angle,
            position: { x: position.x, y: position.y },
            crouch: extraData.crouch || false,
            timestamp: Date.now()
        });
    },
    
    // Sync individual bullet spawn (for precise bullet networking)
    syncBulletSpawn(bulletData) {
        if (!this.enabled || !this.lobbyId) return;
        
        // Only sync if bullet count is reasonable (prevent spam)
        if (bullet.length > 200) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'bullet_spawn',
            playerId: this.playerId,
            bulletData: bulletData,
            timestamp: Date.now()
        });
    },
    
    // Sync explosion effect
    syncExplosion(position, radius) {
        if (!this.enabled || !this.lobbyId) return;
        
        console.log('📤 Syncing explosion at:', position, 'radius:', radius);
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'explosion',
            playerId: this.playerId,
            position: { x: position.x, y: position.y },
            radius: radius,
            timestamp: Date.now()
        });
    },
    
    // Sync visual effect (generic)
    syncVisualEffect(effectType, data) {
        if (!this.enabled || !this.lobbyId) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'visual_effect',
            playerId: this.playerId,
            effectType: effectType,
            data: data || {},
            timestamp: Date.now()
        });
    },
    
    // Sync mob status effect (slow, stun, etc.)
    syncMobStatusEffect(mobNetId, effectType, effectData = {}) {
        if (!this.enabled || !this.lobbyId) return;
        if (!mobNetId) return;
        
        console.log(`🎭 Syncing mob status effect: ${effectType} for ${mobNetId}`);
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'mob_status_effect',
            playerId: this.playerId,
            mobNetId: mobNetId,
            effectType: effectType,
            effectData: effectData,
            timestamp: Date.now()
        });
    },
    
    // INSTANT mob spawn notification (called immediately when mob spawns)
    syncMobSpawn(mobIndex, mobType = null, spawnParams = {}) {
        if (!this.enabled || !this.lobbyId || !this.isHost) return;
        if (typeof mob === 'undefined' || mobIndex >= mob.length) return;
        
        const m = mob[mobIndex];
        if (!m || !m.position) return;
        
        // Assign netId if not already assigned
        if (!m.netId) m.netId = `${this.playerId}_m${this.mobNetIdCounter++}`;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'mob_spawn',
            playerId: this.playerId,
            mobType: mobType, // e.g., "hopper", "shooter", "pulsar"
            spawnParams: spawnParams, // e.g., { radius: 50 }
            mobData: {
                netId: m.netId,
                x: m.position.x,
                y: m.position.y,
                vx: m.velocity?.x || 0,
                vy: m.velocity?.y || 0,
                angle: m.angle || 0,
                radius: m.radius || 30,
                sides: m.vertices ? m.vertices.length : 6,
                fill: m.fill || '#735084',
                stroke: m.stroke || '#000000'
            },
            timestamp: Date.now()
        });
    },
    
    // Sync mob action (for special mob behaviors)
    syncMobAction(actionType, mobIndex, data) {
        if (!this.enabled || !this.lobbyId) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'mob_action',
            playerId: this.playerId,
            actionType: actionType,
            mobIndex: mobIndex,
            data: data,
            timestamp: Date.now()
        });
    },
    
    // UNIVERSAL BOT SYNC - automatically syncs all bot spawns
    syncBotSpawn(botType, position, params = {}) {
        if (!this.enabled || !this.lobbyId) return;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'bot_spawn',
            playerId: this.playerId,
            botType: botType,
            position: { x: position.x, y: position.y },
            params: params,
            timestamp: Date.now()
        });
    },
    
    // Sync tech selection
    syncTechSelection(techName, techIndex) {
        if (!this.enabled || !this.lobbyId) return;
        
        console.log('📤 Syncing tech selection:', techName);
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'tech_selection',
            playerId: this.playerId,
            techName: techName,
            techIndex: techIndex,
            timestamp: Date.now()
        });
    },

    // Sync that this player died (for UI only)
    syncPlayerDied() {
        if (!this.enabled || !this.lobbyId) return;
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'player_died',
            playerId: this.playerId,
            timestamp: Date.now()
        });
    },

    // Request a revive of a specific playerId
    syncPlayerRevive(targetPlayerId) {
        if (!this.enabled || !this.lobbyId || !targetPlayerId) return;
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'player_revive',
            playerId: this.playerId,
            data: { targetId: targetPlayerId },
            timestamp: Date.now()
        });
    },

    // Host requests damage be applied to a specific player client-side
    syncPlayerDamage(targetPlayerId, damage, meta = {}) {
        if (!this.enabled || !this.lobbyId || !this.isHost || !targetPlayerId || !(damage > 0)) return;
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'player_damage',
            playerId: this.playerId,
            data: { targetId: targetPlayerId, damage, meta },
            timestamp: Date.now()
        });
    },

    // List of dead players (by latest known state)
    getDeadPlayers() {
        const list = [];
        try {
            // Include others
            for (const [id, p] of Object.entries(this.players || {})) {
                if ((p && (p.alive === false || (typeof p.health === 'number' && p.health <= 0)))) {
                    list.push({ id, name: p.name, color: p.color });
                }
            }
            // Include self if dead
            if (typeof m !== 'undefined' && m.alive === false) {
                list.push({ id: this.playerId, name: this.settings?.name || 'Player', color: this.settings?.color });
            }
        } catch (e) { /* no-op */ }
        return list;
    },

    // Alive players for spectating
    getAlivePlayers() {
        const list = [];
        try {
            for (const [id, p] of Object.entries(this.players || {})) {
                if (p && p.alive !== false) list.push({ id, name: p.name, color: p.color });
            }
            // include self only if alive (rare spectator to self)
            if (typeof m !== 'undefined' && m.alive !== false) {
                list.push({ id: this.playerId, name: this.settings?.name || 'Player', color: this.settings?.color });
            }
        } catch (e) { /* no-op */ }
        return list;
    },

    ensureSpectateTarget() {
        if (!this._spectateTargetId) {
            const alive = this.getAlivePlayers();
            if (alive.length) this._spectateTargetId = alive[0].id;
        } else {
            const aliveIds = new Set(this.getAlivePlayers().map(p => p.id));
            if (!aliveIds.has(this._spectateTargetId)) {
                const alive = this.getAlivePlayers();
                this._spectateTargetId = alive.length ? alive[0].id : null;
            }
        }
    },

    cycleSpectate(dir = 1) {
        const alive = this.getAlivePlayers();
        if (!alive.length) return;
        const idx = Math.max(0, alive.findIndex(p => p.id === this._spectateTargetId));
        const next = (idx + (dir > 0 ? 1 : -1) + alive.length) % alive.length;
        this._spectateTargetId = alive[next].id;
        this.showSpectateUI(true);
    },

    getSpectateTargetPos() {
        try {
            this.ensureSpectateTarget();
            const id = this._spectateTargetId;
            if (!id) return null;
            if (id === this.playerId && typeof m !== 'undefined') return { x: m.pos.x, y: m.pos.y };
            const p = (this.players && this.players[id]) || null;
            if (p && isFinite(p.x) && isFinite(p.y)) return { x: p.x, y: p.y };
        } catch(e) { /* no-op */ }
        return null;
    },

    showSpectateUI(refreshOnly = false) {
        if (!this.enabled) return;
        try {
            this.ensureSpectateTarget();
            const alive = this.getAlivePlayers();
            const current = alive.find(p => p.id === this._spectateTargetId) || alive[0];
            const name = current ? current.name || 'Player' : 'No targets';
            let el = document.getElementById('spectate-ui');
            if (!el) {
                el = document.createElement('div');
                el.id = 'spectate-ui';
                el.style.position = 'fixed';
                el.style.bottom = '24px';
                el.style.left = '24px';
                el.style.background = 'rgba(0,0,0,0.6)';
                el.style.color = '#fff';
                el.style.padding = '8px 12px';
                el.style.borderRadius = '8px';
                el.style.fontFamily = 'monospace';
                el.style.fontSize = '14px';
                el.style.zIndex = '9999';
                document.body.appendChild(el);
            }
            el.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <button id="spec-prev" style="background:#333;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">◀</button>
                    <div>SPECTATING: <span style="color:#fcbf2d;">${name}</span></div>
                    <button id="spec-next" style="background:#333;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">▶</button>
                </div>
            `;
            // Always re-attach event listeners after innerHTML update
            const prev = document.getElementById('spec-prev');
            const next = document.getElementById('spec-next');
            if (prev) prev.onclick = () => this.cycleSpectate(-1);
            if (next) next.onclick = () => this.cycleSpectate(1);
        } catch(e) { /* no-op */ }
    },

    hideSpectateUI() {
        try {
            const el = document.getElementById('spectate-ui');
            if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch(e) { /* no-op */ }
    },

    // Local revive logic (only runs on the revived client's machine)
    reviveLocal() {
        try {
            if (typeof m !== 'undefined') {
                m.alive = true;
                if (typeof b !== 'undefined' && typeof b.removeAllGuns === 'function') {
                    b.removeAllGuns();
                    if (typeof simulation !== 'undefined' && typeof simulation.makeGunHUD === 'function') simulation.makeGunHUD();
                }
                if (typeof tech !== 'undefined' && typeof tech.setupAllTech === 'function') {
                    tech.setupAllTech();
                    if (typeof simulation !== 'undefined' && typeof simulation.updateTechHUD === 'function') simulation.updateTechHUD();
                }
                if (typeof m.setMaxHealth === 'function') m.setMaxHealth();
                m.health = m.maxHealth;
                if (typeof m.displayHealth === 'function') m.displayHealth();
                if (typeof m.setMaxEnergy === 'function') m.setMaxEnergy();
                if (typeof m.maxEnergy !== 'undefined') m.energy = m.maxEnergy;
                if (typeof m.setField === 'function') m.setField(0);
            }
            if (typeof simulation !== 'undefined') simulation.paused = false;
            // Optional: small visual effect
            if (typeof simulation !== 'undefined' && simulation.drawList) {
                simulation.drawList.push({ x: m.pos.x, y: m.pos.y, radius: 60, color: 'rgba(255,230,0,0.4)', time: 14 });
            }
            this.hideSpectateUI();
        } catch (e) { /* no-op */ }
    },
    
    // Sync level change (when someone goes to next level)
    syncLevelChange(levelName, levelIndex) {
        if (!this.enabled || !this.lobbyId) return;
        
        console.log('📤 Syncing level change:', levelName);
        // Reset block sync flag for new level
        this.hasInitialBlockSync = false;
        // generate and store a seed to be used by all clients during level build
        const rngSeed = Date.now() ^ Math.floor(Math.random() * 1e9);
        this.pendingRngSeed = rngSeed;
        // Choose next mob pick deterministically from host and share it
        let nextSpawnPick = null;
        let spawnPriorPick = null;
        try {
            if (typeof spawn !== 'undefined') {
                nextSpawnPick = spawn.fullPickList[Math.floor(Math.random() * spawn.fullPickList.length)];
                // pickList format is [older, prior]; we want prior for the carry-over slot
                spawnPriorPick = Array.isArray(spawn.pickList) && spawn.pickList.length > 1 ? spawn.pickList[1] : 'starter';
                this.pendingNextSpawnPick = nextSpawnPick;
            }
        } catch (e) {
            console.warn('Could not compute nextSpawnPick/priorPick:', e);
        }
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'level_change',
            playerId: this.playerId,
            levelName: levelName,
            levelIndex: levelIndex,
            levelsCleared: level.levelsCleared,
            rngSeed: rngSeed,
            difficulty: (typeof simulation !== 'undefined' ? simulation.difficulty : undefined),
            difficultyMode: (typeof simulation !== 'undefined' ? simulation.difficultyMode : undefined),
            isHorizontalFlipped: (typeof simulation !== 'undefined' ? !!simulation.isHorizontalFlipped : undefined),
            techBuildFlags: (typeof tech !== 'undefined' ? {
                isSwitchReality: !!tech.isSwitchReality,
                isHealLowHealth: !!tech.isHealLowHealth,
                isMACHO: !!tech.isMACHO,
                wimpCount: tech.wimpCount || 0,
                wimpExperiment: tech.wimpExperiment || 0,
                isFlipFlopLevelReset: !!tech.isFlipFlopLevelReset,
                isFlipFlopOn: !!tech.isFlipFlopOn,
                isDuplicateBoss: !!tech.isDuplicateBoss,
                duplicateChance: (typeof tech.duplicationChance === 'function') ? tech.duplicationChance() : (tech.duplicateChance || 0)
            } : undefined),
            // Mob spawn pick alignment
            spawnPriorPick: spawnPriorPick,
            nextSpawnPick: nextSpawnPick,
            timestamp: Date.now()
        });
    },
    
    // Sync mob damage (for team combat)
    syncMobDamage(mobNetId, damage, health, alive) {
        if (!this.enabled || !this.lobbyId) return;
        if (!mobNetId) return; // Must have netId
        
        // Throttle mob damage sync (only sync every few frames)
        const now = Date.now();
        if (now - (this.lastMobSyncTime || 0) < 50) return; // Max 20 updates/sec
        this.lastMobSyncTime = now;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'mob_damage',
            playerId: this.playerId,
            mobNetId: mobNetId, // Use netId instead of index
            damage: damage,
            health: health,
            alive: alive,
            timestamp: Date.now()
        });
    },
    
    // Sync mob death (separate from damage for reliability)
    syncMobDeath(mobNetId, mobData = {}) {
        if (!this.enabled || !this.lobbyId) return;
        if (!mobNetId) return; // Must have netId
        
        // Find the mob to get its position for death VFX
        let deathPosition = null;
        let mobRadius = 30;
        let mobFill = '#735084';
        if (typeof mob !== 'undefined') {
            const targetMob = mob.find(m => m && m.netId === mobNetId);
            if (targetMob) {
                deathPosition = { x: targetMob.position.x, y: targetMob.position.y };
                mobRadius = targetMob.radius || 30;
                mobFill = targetMob.fill || '#735084';
            }
        }
        
        console.log(`💀 Syncing mob death: ${mobNetId} at`, deathPosition);
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'mob_death',
            playerId: this.playerId,
            mobNetId: mobNetId,
            position: deathPosition,
            radius: mobRadius,
            fill: mobFill,
            ...mobData,
            timestamp: Date.now()
        });
    },
    
    // Listen for field interaction events from other players
    listenToFieldEvents() {
        if (!this.enabled || !this.lobbyId) return;
        
        const eventsRef = database.ref(`lobbies/${this.lobbyId}/events`);
        eventsRef.on('child_added', (snapshot) => {
            const event = snapshot.val();
            if (event.playerId === this.playerId) return; // Ignore own events
            
            this.handleFieldEvent(event);
        });
    },
    
    // Handle incoming field events from other players
    handleFieldEvent(event) {
        console.log('handleFieldEvent called with:', event);
        switch (event.type) {
            case 'field_powerup_grab':
                this.handleRemotePowerupGrab(event.data);
                break;
            case 'field_block_push':
                this.handleRemoteBlockPush(event);
                break;
            case 'field_mob_push':
                this.handleRemoteMobPush(event);
                break;
            case 'block_pickup':
                this.handleRemoteBlockPickup(event);
                break;
            case 'block_throw':
                this.handleRemoteBlockThrow(event);
                break;
            case 'block_hold':
                this.handleRemoteBlockHold(event);
                break;
            case 'gun_fire':
                this.handleRemoteGunFire(event);
                break;
            case 'bullet_spawn':
                this.handleRemoteBulletSpawn(event);
                break;
            case 'explosion':
                this.handleRemoteExplosion(event);
                break;
            case 'visual_effect':
                this.handleRemoteVisualEffect(event);
                break;
            case 'tech_selection':
                this.handleRemoteTechSelection(event);
                break;
            case 'level_change':
                this.handleRemoteLevelChange(event);
                break;
            case 'mob_damage':
                this.handleRemoteMobDamage(event);
                break;
            case 'mob_death':
                this.handleRemoteMobDeath(event);
                break;
            case 'mob_action':
                this.handleRemoteMobAction(event);
                break;
            case 'mob_status_effect':
                this.handleRemoteMobStatusEffect(event);
                break;
            case 'bot_spawn':
                if (event.playerId !== this.playerId && typeof b !== 'undefined') {
                    // Handle remote bot spawn
                    console.log('🤖 Remote bot spawn:', event.botType, 'from', event.playerId);
                    // Call the appropriate bot spawn function
                    if (event.botType === 'random' && typeof b.randomBot === 'function') {
                        b.randomBot(event.position, event.params.isKeep, event.params.isAll);
                    }
                    // Add more bot types as needed
                }
                break;
            case 'mob_spawn':
                if (event.playerId !== this.playerId && event.mobData && typeof mob !== 'undefined') {
                    // INSTANT mob spawn from host - create ghost mob immediately
                    console.log('👹 Instant mob spawn from host:', event.mobType, event.mobData.netId);
                    const mobData = event.mobData;
                    
                    // Check if we already have this mob
                    const exists = mob.some(m => m && m.netId === mobData.netId);
                    if (!exists) {
                        // Create ghost mob immediately using the PROPER spawn function
                        try {
                            const beforeCount = mob.length;
                            
                            // Call the proper spawn function if mobType is provided
                            if (event.mobType && typeof spawn !== 'undefined') {
                                const params = event.spawnParams || {};
                                
                                // Special handling for shields and orbitals (need to find target mob)
                                if (event.mobType === 'shield' && params.targetNetId) {
                                    // Find the target mob by netId
                                    const targetMob = mob.find(m => m && m.netId === params.targetNetId);
                                    if (targetMob && typeof spawn.shield === 'function') {
                                        spawn.shield(targetMob, mobData.x, mobData.y, 1); // Force spawn with chance=1
                                        console.log(`✅ Created shield for mob ${params.targetNetId}`);
                                    } else {
                                        console.warn(`⚠️ Could not find target mob ${params.targetNetId} for shield`);
                                    }
                                } else if (event.mobType === 'orbital' && params.targetNetId) {
                                    // Find the target mob by netId
                                    const targetMob = mob.find(m => m && m.netId === params.targetNetId);
                                    if (targetMob && typeof spawn.orbital === 'function') {
                                        spawn.orbital(targetMob, params.radius, params.phase, params.speed);
                                        console.log(`✅ Created orbital for mob ${params.targetNetId}`);
                                    } else {
                                        console.warn(`⚠️ Could not find target mob ${params.targetNetId} for orbital`);
                                    }
                                } else if (typeof spawn[event.mobType] === 'function') {
                                    // Call the specific spawn function (e.g., spawn.hopper, spawn.shooter)
                                    // Pass forceSpawn=true to bypass client guards in spawn functions
                                    spawn[event.mobType](mobData.x, mobData.y, params.radius, true);
                                    console.log(`✅ Created ${event.mobType} with full behaviors`);
                                }
                            } else {
                                // Fallback to basic spawn
                                const radius = mobData.radius || 30;
                                const sides = Math.max(3, Math.min(8, Math.floor(mobData.sides) || 6));
                                
                                if (typeof mobs !== 'undefined' && typeof mobs.spawn === 'function') {
                                    mobs.spawn(mobData.x, mobData.y, sides, radius, mobData.fill || '#735084');
                                }
                            }
                            
                            // Assign netId to the newly created mob
                            if (mob.length > beforeCount) {
                                const newMob = mob[mob.length - 1];
                                if (newMob) {
                                    newMob.netId = mobData.netId;
                                    // CRITICAL: Register in tracking map to prevent duplicate ghost mob creation
                                    const newIndex = mob.length - 1;
                                    this.mobIndexByNetId.set(mobData.netId, newIndex);
                                    // Sync position/velocity in case spawn function placed it differently
                                    Matter.Body.setPosition(newMob, { x: mobData.x, y: mobData.y });
                                    Matter.Body.setVelocity(newMob, { x: mobData.vx || 0, y: mobData.vy || 0 });
                                    Matter.Body.setAngle(newMob, mobData.angle || 0);
                                    console.log('✅ Created mob with netId:', mobData.netId, 'at index', newIndex);
                                }
                            }
                        } catch (e) {
                            console.error('❌ Failed to create instant ghost mob:', e);
                        }
                    }
                }
                break;
            case 'player_died': {
                // Show notification that a player died
                try {
                    const p = (this.players && this.players[event.playerId]) || {};
                    if (typeof simulation !== 'undefined' && simulation.makeTextLog) {
                        simulation.makeTextLog(`<span class='color-text'>${p.name || 'Player'}</span> has died. Find an <span style='color:#FFD700'>ANGELIC-HEXIL</span> to revive them!`);
                    }
                    // NO automatic revive spawn - revives only come from ANGELIC-HEXIL mobs
                } catch (e) { /* no-op */ }
                break;
            }
            case 'player_revive': {
                try {
                    const targetId = event.data && event.data.targetId;
                    if (targetId) {
                        // If this client is the revive target, restore local player state
                        if (this.playerId === targetId && typeof this.reviveLocal === 'function') {
                            this.reviveLocal();
                        }
                        // Everyone shows a small message
                        const who = (this.players && this.players[targetId]) || {};
                        if (typeof simulation !== 'undefined' && simulation.makeTextLog) {
                            simulation.makeTextLog(`<span class='color-text'>${who.name || 'Player'}</span> was revived`);
                        }
                    }
                } catch (e) { /* no-op */ }
                break;
            }
            case 'player_damage': {
                // Only the targeted client applies damage locally
                try {
                    const data = event.data || {};
                    if (data.targetId === this.playerId && typeof m !== 'undefined' && typeof m.damage === 'function') {
                        const dmg = Math.max(0, Number(data.damage) || 0);
                        if (dmg > 0) m.damage(dmg);
                        // If death just occurred, show spectate UI
                        if (m.alive === false && typeof this.showSpectateUI === 'function') {
                            this.showSpectateUI();
                        }
                    }
                } catch(e) { /* no-op */ }
                break;
            }
        }
    },

    // ===== MOB ACTION SYNC =====
    syncMobAction(action, mobIndex, data) {
        if (!this.enabled || !this.lobbyId || !this.isHost) return;
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        // Try to include a persistent netId if present on this mob
        let netId = null;
        if (typeof mob !== 'undefined' && mob[mobIndex] && mob[mobIndex].netId) netId = mob[mobIndex].netId;
        eventRef.set({
            type: 'mob_action',
            playerId: this.playerId,
            action: action,
            mobIndex: mobIndex,
            netId: netId,
            data: data || {},
            timestamp: Date.now()
        });
    },
    handleRemoteMobAction(event) {
        if (typeof mob === 'undefined') return;
        let i = event.mobIndex;
        let mref = null;
        if (event.netId && this.mobIndexByNetId.has(event.netId)) {
            const idx = this.mobIndexByNetId.get(event.netId);
            if (mob[idx]) mref = mob[idx];
        }
        if (!mref && isFinite(i) && mob[i]) mref = mob[i];
        if (!mref) return;
        switch (event.action) {
            case 'striker_dash': {
                const p = event.data && event.data.to;
                if (p) {
                    Matter.Body.setPosition(mref, p);
                    Matter.Body.setVelocity(mref, {
                        x: (event.data.vx || 0) * 0.5,
                        y: (event.data.vy || 0) * 0.5
                    });
                }
                break;
            }
            case 'pulsar_start': {
                if (mref) {
                    mref.isFiring = true;
                    mref.fireTarget = event.data && event.data.target ? event.data.target : mref.fireTarget;
                    mref.fireCycle = 0;
                }
                break;
            }
            case 'pulsar_commit': {
                const t = event.data && event.data.target;
                const r = event.data && event.data.radius;
                if (t && r && typeof simulation !== 'undefined') {
                    simulation.drawList.push({ x: t.x, y: t.y, radius: r, color: event.data.color || 'rgba(255,0,100,0.6)', time: simulation.drawTime });
                }
                if (mref) mref.isFiring = false;
                break;
            }
            case 'pulsarBoss_start': {
                if (mref) {
                    mref.isFiring = true;
                    mref.fireTarget = event.data && event.data.target ? event.data.target : mref.fireTarget;
                    mref.fireCycle = 0;
                }
                break;
            }
            case 'pulsarBoss_commit': {
                const t = event.data && event.data.target;
                const r = event.data && event.data.radius;
                if (t && r && typeof simulation !== 'undefined') {
                    simulation.drawList.push({ x: t.x, y: t.y, radius: r, color: event.data.color || 'rgba(120,0,255,0.6)', time: simulation.drawTime });
                }
                if (mref) mref.isFiring = false;
                break;
            }
        }
    },
    
    // Handle remote gun fire - spawn bullets visually, DON'T alter local player state or ammo
    handleRemoteGunFire(event) {
        console.log('🔫 Remote gun fire:', event.gunName, 'from remote player');
        
        if (typeof b !== 'undefined' && event.position && typeof m !== 'undefined') {
            // Snapshot local player state to avoid side-effects
            const snap = {
                pos: { x: m.pos.x, y: m.pos.y },
                angle: m.angle,
                crouch: m.crouch,
                fireCDcycle: m.fireCDcycle,
                fieldCDcycle: m.fieldCDcycle,
                energy: m.energy,
                activeGun: typeof b !== 'undefined' ? b.activeGun : null
            };

            // Override to remote player's pose
            m.pos = event.position;
            m.angle = event.angle;
            m.crouch = !!event.crouch;

            // Tag spawned bullets with remote ownerId
            this.isSpawningRemote = true;
            this.spawningRemoteOwnerId = event.playerId;

            try {
                const gunIndex = (typeof b !== 'undefined' && b.guns) ? b.guns.findIndex(g => g.name === event.gunName) : -1;
                if (gunIndex >= 0 && b.guns[gunIndex] && typeof b.guns[gunIndex].fire === 'function') {
                    const oldActive = b.activeGun;
                    b.activeGun = gunIndex;
                    // Call gun.fire() directly (no ammo decrement)
                    b.guns[gunIndex].fire();
                    b.activeGun = oldActive;
                }
            } catch (e) {
                console.error('Error spawning remote bullets:', e);
            } finally {
                this.isSpawningRemote = false;
                this.spawningRemoteOwnerId = null;
                // Restore local player state
                m.pos = snap.pos;
                m.angle = snap.angle;
                m.crouch = snap.crouch;
                m.fireCDcycle = snap.fireCDcycle;
                m.fieldCDcycle = snap.fieldCDcycle;
                m.energy = snap.energy;
                if (snap.activeGun !== null) b.activeGun = snap.activeGun;
            }
            console.log('✅ Spawned remote bullets for:', event.gunName);
        }
    },
    
    // Handle remote bullet spawn (for individual bullets)
    handleRemoteBulletSpawn(event) {
        console.log('🎯 Remote bullet spawn');
        // This can be used for very precise bullet syncing if needed
        // For now, gun fire handles it
    },
    
    // Handle remote explosion
    handleRemoteExplosion(event) {
        console.log('💥 Remote explosion at:', event.position, 'radius:', event.radius);
        
        if (typeof b !== 'undefined' && b.explosion) {
            // Call the actual explosion function with skipSync=true to prevent infinite loop
            b.explosion(event.position, event.radius, "rgba(255,25,0,0.6)", true);
            console.log('✅ Triggered explosion effect');
        } else {
            console.log('❌ Could not trigger explosion - b.explosion not available');
        }
    },

    
    
    // Handle remote visual effect
    handleRemoteVisualEffect(event) {
        console.log('Remote visual effect:', event.effectType);
        
        if (typeof simulation !== 'undefined' && simulation.drawList && event.data) {
            simulation.drawList.push({
                x: event.data.x,
                y: event.data.y,
                radius: event.data.radius || 20,
                color: event.data.color || "rgba(255,255,255,0.5)",
                time: event.data.time || 10
            });
        }
    },
    
    // Handle remote mob status effect
    handleRemoteMobStatusEffect(event) {
        if (!event.mobNetId || !event.effectType) return;
        
        console.log(`🎭 Received mob status effect: ${event.effectType} for ${event.mobNetId}`);
        
        // Find the mob by netId
        let targetMob = null;
        if (typeof mob !== 'undefined') {
            for (let i = 0; i < mob.length; i++) {
                if (mob[i] && mob[i].netId === event.mobNetId) {
                    targetMob = mob[i];
                    break;
                }
            }
        }
        
        if (!targetMob) {
            console.log(`⚠️ Could not find mob with netId ${event.mobNetId} for status effect`);
            return;
        }
        
        const data = event.effectData || {};
        
        switch (event.effectType) {
            case 'slow':
                // Apply slow visual effect
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    // Blue slow effect circle
                    simulation.drawList.push({
                        x: targetMob.position.x,
                        y: targetMob.position.y,
                        radius: data.radius || targetMob.radius * 2,
                        color: "rgba(0,100,255,0.3)",
                        time: data.duration || 20
                    });
                }
                
                // Mark mob as slowed for visual indication
                targetMob.isSlowed = true;
                if (data.duration) {
                    setTimeout(() => {
                        if (targetMob) targetMob.isSlowed = false;
                    }, data.duration * 16); // Convert frames to ms
                }
                break;
                
            case 'damage':
                // Damage flash effect
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: targetMob.position.x,
                        y: targetMob.position.y,
                        radius: targetMob.radius * 1.5,
                        color: "rgba(255,0,0,0.6)",
                        time: 8
                    });
                }
                break;
                
            case 'stun':
                // Stun effect
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: targetMob.position.x,
                        y: targetMob.position.y,
                        radius: targetMob.radius * 1.8,
                        color: "rgba(255,255,0,0.4)",
                        time: data.duration || 15
                    });
                }
                break;
                
            case 'explosion':
                // Explosion at mob position
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: targetMob.position.x,
                        y: targetMob.position.y,
                        radius: data.radius || targetMob.radius * 3,
                        color: data.color || "rgba(255,100,0,0.4)",
                        time: data.time || 20
                    });
                }
                break;
                
            default:
                console.log(`Unknown mob status effect type: ${event.effectType}`);
        }
    },
    
    // Handle remote tech selection
    handleRemoteTechSelection(event) {
        console.log('🔬 Remote tech selection:', event.techName, 'by player:', event.playerId);
        
        // Ignore our own event (the local picker already applied the tech)
        if (event.playerId === this.playerId) return;

        // Don't give tech to other players - each player has their own tech
        // Just show notification that someone picked up tech
        if (typeof simulation !== 'undefined' && simulation.makeTextLog) {
            const playerName = this.otherPlayers.get(event.playerId)?.name || 'Player';
            simulation.makeTextLog(`<span style='color:#0cf'>${playerName}</span> selected <span class='color-m'>${event.techName}</span>`);
        }
    },
    
    // Handle remote level change
    handleRemoteLevelChange(event) {
        console.log('🗺️ Remote level change:', event.levelName, 'by player:', event.playerId);
        
        // ONLY sync if game is actually running (not in lobby/menu)
        if (typeof simulation === 'undefined' || simulation.paused || !level || level.onLevel === -1) {
            console.log('⚠️ Ignoring level change - game not started yet');
            return;
        }
        
        // CRITICAL: Clear tracking data BEFORE level transition to prevent phantom mobs
        this.clearLevelData();
        
        // Follow the same transition path as local nextLevel, without rebroadcasting
        if (typeof level !== 'undefined' && typeof level.nextLevel === 'function') {
            const playerName = this.otherPlayers?.get?.(event.playerId)?.name || 'Player';
            if (typeof simulation !== 'undefined' && simulation.makeTextLog) {
                simulation.makeTextLog(`<span style='color:#0cf'>${playerName}</span> entered <span style='color:#ff0'>next level</span>`);
            }
            // Save RNG seed to be applied during level construction
            this.pendingRngSeed = event.rngSeed || null;
            // Align simulation parameters that influence build
            if (typeof simulation !== 'undefined') {
                if (typeof event.difficultyMode !== 'undefined') simulation.difficultyMode = event.difficultyMode;
                if (typeof event.difficulty !== 'undefined') simulation.difficulty = event.difficulty;
                if (typeof event.isHorizontalFlipped !== 'undefined') simulation.isHorizontalFlipped = !!event.isHorizontalFlipped;
            }
            // Align critical tech flags that influence build/spawns
            if (typeof tech !== 'undefined' && event.techBuildFlags) {
                tech.isSwitchReality = !!event.techBuildFlags.isSwitchReality;
                tech.isHealLowHealth = !!event.techBuildFlags.isHealLowHealth;
                tech.isMACHO = !!event.techBuildFlags.isMACHO;
                tech.wimpCount = event.techBuildFlags.wimpCount || 0;
                tech.wimpExperiment = event.techBuildFlags.wimpExperiment || 0;
                tech.isFlipFlopLevelReset = !!event.techBuildFlags.isFlipFlopLevelReset;
                tech.isFlipFlopOn = !!event.techBuildFlags.isFlipFlopOn;
                tech.isDuplicateBoss = !!event.techBuildFlags.isDuplicateBoss;
                // Where duplicationChance is a method, we can't overwrite it; but many branches use isDuplicateBoss && Math.random() < 2 * tech.duplicationChance()
                // The RNG seed aligns the random < threshold, so aligning isDuplicateBoss is usually enough to keep call counts identical.
            }
            // Provide override for duplication chance during build
            this.pendingDupChance = (event.techBuildFlags && typeof event.techBuildFlags.duplicateChance === 'number') ? event.techBuildFlags.duplicateChance : null;
            // Align mob pick list across clients: set prior, and override next pick
            if (typeof spawn !== 'undefined') {
                if (event.spawnPriorPick) {
                    spawn.pickList = ['starter', event.spawnPriorPick];
                }
                this.pendingNextSpawnPick = event.nextSpawnPick || null;
            }
            // Set indices so nextLevel() advances to the same named level
            level.levelsCleared = Math.max(0, (event.levelsCleared || 1) - 1);
            const idxByName = Array.isArray(level.levels) ? level.levels.indexOf(event.levelName) : -1;
            if (idxByName >= 0) {
                level.onLevel = idxByName - 1;
            } else {
                // Fallback to index if name not found (should not happen if level lists are consistent)
                level.onLevel = Math.max(-1, (event.levelIndex || 0) - 1);
            }
            // Advance without syncing
            level.nextLevel(true);
        }
    },
    
    // Handle remote mob damage (team combat)
    handleRemoteMobDamage(event) {
        // Apply damage to the mob on this client using netId
        if (typeof mob !== 'undefined' && event.mobNetId) {
            // Find mob by netId instead of index (indices change when mobs die)
            const targetMob = mob.find(m => m && m.netId === event.mobNetId);
            if (targetMob && targetMob.alive) {
                // Only sync if health is valid (prevent negative health)
                if (isFinite(event.health) && event.health >= 0) {
                    targetMob.health = event.health;
                }
                
                // Show damage indicator
                if (typeof simulation !== 'undefined' && simulation.drawList && event.damage > 0) {
                    simulation.drawList.push({
                        x: targetMob.position.x,
                        y: targetMob.position.y,
                        radius: Math.log(2 * event.damage + 1.1) * 40,
                        color: "rgba(255,0,100,0.3)", // Different color for remote damage
                        time: simulation.drawTime
                    });
                }
            }
        }
    },
    
    // Handle remote mob death (separate from damage for reliability)
    handleRemoteMobDeath(event) {
        if (typeof mob !== 'undefined' && event.mobNetId) {
            console.log(`💀 Received mob death event for ${event.mobNetId}`);
            
            // Find mob by netId
            let targetMob = null;
            let targetIndex = -1;
            for (let i = 0; i < mob.length; i++) {
                if (mob[i] && mob[i].netId === event.mobNetId) {
                    targetMob = mob[i];
                    targetIndex = i;
                    break;
                }
            }
            
            if (targetMob) {
                // Death VFX - explosion effect at death position
                if (event.position && typeof simulation !== 'undefined' && simulation.drawList) {
                    // Death explosion visual
                    simulation.drawList.push({
                        x: event.position.x,
                        y: event.position.y, 
                        radius: (event.radius || 30) * 2,
                        color: event.fill ? event.fill.replace('rgb', 'rgba').replace(')', ',0.3)') : "rgba(115,80,132,0.3)",
                        time: 20
                    });
                    
                    // Add smaller secondary explosion for effect
                    simulation.drawList.push({
                        x: event.position.x,
                        y: event.position.y,
                        radius: (event.radius || 30) * 1.5,
                        color: "rgba(255,50,50,0.5)",
                        time: 15
                    });
                }
                
                if (targetMob.alive) {
                    // Mark as dead first to prevent duplicate death calls
                    targetMob.alive = false;
                    
                    // Try to call the mob's death method if it exists
                    if (typeof targetMob.death === 'function') {
                        try {
                            targetMob.death();
                        } catch (e) {
                            console.warn('Error calling mob.death():', e);
                            // Fallback: manually remove the mob
                            try {
                                Matter.World.remove(engine.world, targetMob);
                            } catch (e2) { /* ignore */ }
                            if (targetIndex >= 0) {
                                mob.splice(targetIndex, 1);
                            }
                        }
                    } else {
                        // No death method, manually remove
                        try {
                            Matter.World.remove(engine.world, targetMob);
                        } catch (e) { /* ignore */ }
                        if (targetIndex >= 0) {
                            mob.splice(targetIndex, 1);
                        }
                    }
                    
                    // Clean up netId tracking
                    if (this.mobIndexByNetId.has(event.mobNetId)) {
                        this.mobIndexByNetId.delete(event.mobNetId);
                    }
                }
            } else {
                console.log(`⚠️ Could not find mob with netId ${event.mobNetId} to kill`);
            }
        }
    },
    
    // Handle remote powerup grabbing
    handleRemotePowerupGrab(data) {
        console.log('handleRemotePowerupGrab called with:', data);
        // Visual effect for remote powerup grab
        if (data.powerupIndex !== undefined && powerUp[data.powerupIndex]) {
            // Add visual effect to show powerup was grabbed by remote player
            const powerup = powerUp[data.powerupIndex];
            simulation.drawList.push({
                x: powerup.position.x,
                y: powerup.position.y,
                radius: 30,
                color: "rgba(0,255,0,0.5)",
                time: 10
            });
        } else if (data.active) {
            // Field usage indicator
            console.log('Field is active, showing field usage effect');
            // Could add a general field usage effect here
        }
    },
    
    // Handle remote block pushing
    handleRemoteBlockPush(data) {
        // Visual effect for remote block push
        if (data.blockIndex !== undefined && body[data.blockIndex]) {
            const block = body[data.blockIndex];
            simulation.drawList.push({
                x: block.position.x,
                y: block.position.y,
                radius: 20,
                color: "rgba(0,200,255,0.3)",
                time: 15
            });
        }
    },
    
    // Handle remote block pickup
    handleRemoteBlockPickup(blockData) {
        // Visual effect for remote block pickup
        if (blockData.position) {
            simulation.drawList.push({
                x: blockData.position.x,
                y: blockData.position.y,
                radius: 25,
                color: "rgba(255,255,0,0.4)",
                time: 20
            });
        }
    },
    
    // Handle remote block throw
    handleRemoteBlockThrow(blockData) {
        if (!blockData.position || !blockData.velocity) return;
        
        console.log('Remote block throw:', blockData);
        
        // Find the closest block to the thrown position (within reasonable distance)
        if (typeof body !== 'undefined') {
            let closestBlock = null;
            let closestDist = 100; // Max 100 pixels away
            
            for (let i = 0; i < body.length; i++) {
                if (body[i] && body[i].position) {
                    const dx = body[i].position.x - blockData.position.x;
                    const dy = body[i].position.y - blockData.position.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestBlock = body[i];
                    }
                }
            }
            
            // Apply the throw velocity to the closest block
            if (closestBlock) {
                Matter.Body.setVelocity(closestBlock, blockData.velocity);
                Matter.Body.setPosition(closestBlock, blockData.position);
                console.log('Applied remote throw to block');
            }
        }
        
        // Visual effect for remote block throw
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: blockData.position.x + blockData.velocity.x * i * 0.1,
                        y: blockData.position.y + blockData.velocity.y * i * 0.1,
                        radius: 15 - i * 2,
                        color: `rgba(255,100,0,${0.6 - i * 0.1})`,
                        time: 10 - i
                    });
                }
            }, i * 50);
        }
    },
    
    // Kick player (host only)
    async kickPlayer(playerId) {
        if (!this.isHost || !this.lobbyId) return;
        
        const playerRef = database.ref(`lobbies/${this.lobbyId}/players/${playerId}`);
        await playerRef.remove();
    },
    
    // Set host-only level exit (host only)
    async setHostOnlyLevelExit(enabled) {
        if (!this.isHost || !this.lobbyId) return;
        this.hostOnlyLevelExit = enabled;
        const lobbyRef = database.ref(`lobbies/${this.lobbyId}`);
        await lobbyRef.update({ hostOnlyLevelExit: enabled });
    },
    
    // Set friendly fire (host only)
    async setFriendlyFire(enabled) {
        if (!this.isHost || !this.lobbyId) return;
        this.friendlyFire = enabled;
        const lobbyRef = database.ref(`lobbies/${this.lobbyId}`);
        await lobbyRef.update({ friendlyFire: enabled });
        console.log('Friendly fire set to:', enabled);
    },
    
    // Check if damage from a bullet/effect should be applied (friendly fire check)
    shouldAllowDamage(sourceOwnerId, targetPlayerId) {
        if (!this.enabled) return true; // Not in multiplayer, allow all damage
        if (this.friendlyFire) return true; // Friendly fire enabled, allow all damage
        if (!sourceOwnerId) return true; // No owner (mob bullet, etc.), allow damage
        if (sourceOwnerId === targetPlayerId) return true; // Same player, allow self-damage
        return false; // Different player and friendly fire disabled, block damage
    },
    
    // Start game (host only)
    async startGame() {
        if (!this.isHost || !this.lobbyId) return;
        
        const lobbyRef = database.ref(`lobbies/${this.lobbyId}`);
        await lobbyRef.update({ gameStarted: true });
        
        this.gameStarted = true;
    },
    
    // Claim client authority over an object (prevents host from overwriting)
    claimAuthority(objectType, objectIndex, duration = 1000) {
        if (!this.enabled || !this.lobbyId) return;
        const key = `${objectType}_${objectIndex}`;
        const timestamp = Date.now();
        this.clientAuthority.set(key, {
            playerId: this.playerId,
            type: objectType,
            timestamp: timestamp,
            expiry: timestamp + duration
        });
        
        // Notify host
        const authRef = database.ref(`lobbies/${this.lobbyId}/authority/${key}`);
        authRef.set({
            playerId: this.playerId,
            type: objectType,
            index: objectIndex,
            timestamp: timestamp,
            expiry: timestamp + duration
        });
    },
    
    // Release client authority
    releaseAuthority(objectType, objectIndex) {
        if (!this.enabled || !this.lobbyId) return;
        const key = `${objectType}_${objectIndex}`;
        this.clientAuthority.delete(key);
        
        // Notify host
        const authRef = database.ref(`lobbies/${this.lobbyId}/authority/${key}`);
        authRef.remove();
    },
    
    // Auto-claim authority when player physically collides with objects
    checkAndClaimCollisionAuthority() {
        if (!this.enabled || !this.lobbyId || typeof player === 'undefined' || typeof body === 'undefined') return;
        
        const now = Date.now();
        
        // Check for collisions with blocks (physics bodies)
        for (let i = 0; i < body.length; i++) {
            if (!body[i] || !body[i].position || !body[i].id) continue;
            
            // Calculate distance to player
            const dx = body[i].position.x - player.position.x;
            const dy = body[i].position.y - player.position.y;
            const dist2 = dx * dx + dy * dy;
            
            // If player is touching this block (within 80 units)
            if (dist2 < 6400) {
                const authKey = `block_${body[i].id}`; // Use body.id instead of array index
                const existing = this.clientAuthority.get(authKey);
                
                // Only claim if not already claimed or if expired
                if (!existing || now > existing.expiry) {
                    this.claimAuthority('block', body[i].id, 500); // 500ms authority - use bodyId
                }
            }
        }
        
        // Check for collisions with mobs (for pushing)
        if (typeof mob !== 'undefined') {
            for (let i = 0; i < mob.length; i++) {
                if (!mob[i] || !mob[i].position || !mob[i].alive) continue;
                
                // Calculate distance to player
                const dx = mob[i].position.x - player.position.x;
                const dy = mob[i].position.y - player.position.y;
                const dist2 = dx * dx + dy * dy;
                const radius = mob[i].radius || 30;
                
                // If player is touching this mob (within mob radius + player radius)
                if (dist2 < (radius + 40) * (radius + 40)) {
                    const authKey = `mob_${i}`;
                    const existing = this.clientAuthority.get(authKey);
                    
                    // Only claim if not already claimed or if expired
                    if (!existing || now > existing.expiry) {
                        this.claimAuthority('mob', i, 300); // 300ms authority for mobs
                    }
                }
            }
        }
    },
    
    // Listen for authority claims (host only)
    listenToAuthority() {
        if (!this.enabled || !this.lobbyId) return;
        
        const authRef = database.ref(`lobbies/${this.lobbyId}/authority`);
        authRef.on('value', (snapshot) => {
            const authorities = snapshot.val();
            this.clientAuthority.clear();
            if (authorities) {
                for (const [key, auth] of Object.entries(authorities)) {
                    this.clientAuthority.set(key, auth);
                }
            }
        });
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
    },
    
    // ===== LEVEL TRANSITION CLEANUP =====
    
    // Clear all multiplayer tracking data during level transitions
    clearLevelData() {
        console.log('🧹 Clearing multiplayer tracking data for level transition');
        
        // Clear mob tracking
        this.mobIndexByNetId.clear();
        this.mobNetIdCounter = 0; // Reset counter for new level
        
        // Clear powerup tracking
        this.localPowerupIds.clear();
        this.networkPowerups.clear();
        this.powerupIdCounter = 0;
        
        // Clear client authority claims (old objects are gone)
        this.clientAuthority.clear();
        
        // Clear ghost mob tracking if it exists
        if (this.ghostMobLastUpdate) {
            this.ghostMobLastUpdate.clear();
        }
        
        // Reset physics sync flag to force full resync on new level
        this.hasInitialBlockSync = false;
        
        console.log('✅ Multiplayer tracking data cleared');
    },
    
    // ===== POWERUP NETWORKING =====
    
    // Sync powerup spawn to all players
    syncPowerupSpawn(powerupIndex) {
        if (!this.enabled || !this.lobbyId || typeof powerUp === 'undefined') return;
        
        const powerup = powerUp[powerupIndex];
        if (!powerup) return;
        
        // Generate unique network ID for this powerup
        const networkId = `${this.playerId}_${this.powerupIdCounter++}`;
        this.localPowerupIds.set(powerupIndex, networkId);
        this.networkPowerups.set(networkId, powerupIndex); // Add reverse mapping for host's own powerups
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/powerups/${networkId}`);
        eventRef.set({
            id: networkId,
            spawnedBy: this.playerId,
            name: powerup.name,
            color: powerup.color,
            size: powerup.size,
            position: { x: powerup.position.x, y: powerup.position.y },
            velocity: { x: powerup.velocity.x, y: powerup.velocity.y },
            timestamp: Date.now()
        });
        
        console.log('Powerup spawned:', networkId, powerup.name, 'at index:', powerupIndex);
    },
    
    // Sync powerup pickup to all players (by index - legacy)
    syncPowerupPickup(powerupIndex) {
        if (!this.enabled || !this.lobbyId) return;
        
        const networkId = this.localPowerupIds.get(powerupIndex);
        if (!networkId) {
            console.log('Warning: Picked up powerup without network ID, index:', powerupIndex, 'Available IDs:', Array.from(this.localPowerupIds.keys()));
            return;
        }
        
        this.syncPowerupPickupByNetworkId(networkId);
    },
    
    // Sync powerup pickup by network ID (preferred method)
    syncPowerupPickupByNetworkId(networkId) {
        if (!this.enabled || !this.lobbyId) return;
        
        console.log('✅ Syncing powerup pickup by networkId:', networkId, 'by', this.playerId);
        
        // Remove from Firebase (this will trigger removal for all players)
        const powerupRef = database.ref(`lobbies/${this.lobbyId}/powerups/${networkId}`);
        powerupRef.remove();
        
        // Clean up local mapping - find and remove the index mapping
        for (const [index, id] of this.localPowerupIds.entries()) {
            if (id === networkId) {
                this.localPowerupIds.delete(index);
                break;
            }
        }
    },
    
    // Listen for powerup events from other players
    listenToPowerupEvents() {
        if (!this.enabled || !this.lobbyId) return;
        
        const powerupsRef = database.ref(`lobbies/${this.lobbyId}/powerups`);
        
        // Listen for new powerups
        powerupsRef.on('child_added', (snapshot) => {
            const powerupData = snapshot.val();
            if (powerupData.spawnedBy === this.playerId) return; // Ignore own spawns
            
            this.handleRemotePowerupSpawn(powerupData);
        });
        
        // Listen for powerup removals (pickups)
        powerupsRef.on('child_removed', (snapshot) => {
            const powerupData = snapshot.val();
            // Don't process removal if we don't have this powerup locally
            if (!this.networkPowerups.has(powerupData.id)) {
                console.log('Ignoring powerup removal - not in local map:', powerupData.id);
                return;
            }
            this.handleRemotePowerupPickup(powerupData);
        });
        
        console.log('Listening for powerup events');
    },

    // ===== REMOTE FIELD/BLOCK HANDLERS (host applies; clients ignore) =====
    handleRemoteBlockPush(event) {
        if (!this.isHost) return; // host authoritative
        if (!event || !event.data || !isFinite(event.data.blockIndex)) return;
        if (typeof body === 'undefined' || !body[event.data.blockIndex]) return;
        const blk = body[event.data.blockIndex];
        const p = this.players && this.players[event.playerId];
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
        // Push block away from remote player position
        const unit = Matter.Vector.normalise(Matter.Vector.sub({ x: blk.position.x, y: blk.position.y }, { x: p.x, y: p.y }));
        const massRoot = Math.sqrt(Math.max(0.15, blk.mass));
        Matter.Body.setVelocity(blk, {
            x: blk.velocity.x + (20 * unit.x) / massRoot,
            y: blk.velocity.y + (20 * unit.y) / massRoot
        });
    },

    handleRemoteBlockPickup(event) {
        if (!this.isHost) return; // host authoritative
        if (!event || !event.blockData) return;
        const idx = event.blockData.index;
        if (!isFinite(idx) || typeof body === 'undefined' || !body[idx]) return;
        const blk = body[idx];
        // Make non-colliding while held
        blk.collisionFilter.category = 0;
        blk.collisionFilter.mask = 0;
    },

    handleRemoteBlockThrow(event) {
        if (!this.isHost) return; // host authoritative
        if (!event || !event.blockData) return;
        const data = event.blockData;
        const idx = data.index;
        if (!isFinite(idx) || typeof body === 'undefined' || !body[idx]) return;
        const blk = body[idx];
        // Reposition near throw origin and apply throw velocity
        if (data.position && isFinite(data.position.x) && isFinite(data.position.y)) {
            Matter.Body.setPosition(blk, { x: data.position.x, y: data.position.y });
        }
        if (data.velocity) {
            Matter.Body.setVelocity(blk, { x: data.velocity.x || 0, y: data.velocity.y || 0 });
        }
        // Restore collisions after throw
        blk.collisionFilter.category = cat.body;
        blk.collisionFilter.mask = cat.player | cat.map | cat.body | cat.bullet | cat.mob | cat.mobBullet | cat.mobShield;
    },

    handleRemoteBlockHold(event) {
        if (!this.isHost) return; // host authoritative
        if (!event || !event.blockData) return;
        const data = event.blockData;
        const idx = data.index;
        if (!isFinite(idx) || typeof body === 'undefined' || !body[idx]) return;
        const blk = body[idx];
        if (data.position && isFinite(data.position.x) && isFinite(data.position.y)) {
            Matter.Body.setPosition(blk, { x: data.position.x, y: data.position.y });
        }
        if (data.velocity) {
            Matter.Body.setVelocity(blk, { x: data.velocity.x || 0, y: data.velocity.y || 0 });
        }
        // Keep non-colliding while held
        blk.collisionFilter.category = 0;
        blk.collisionFilter.mask = 0;
    },

    handleRemoteMobPush(event) {
        if (!this.isHost) return; // host authoritative
        if (!event || !event.data) return;
        // Resolve mob by netId first
        let idx = null;
        const netId = event.data.netId;
        if (netId && this.mobIndexByNetId && this.mobIndexByNetId.has(netId)) {
            idx = this.mobIndexByNetId.get(netId);
        } else if (isFinite(event.data.index)) {
            idx = event.data.index;
        }
        if (!isFinite(idx) || typeof mob === 'undefined' || !mob[idx]) return;
        const mref = mob[idx];
        // Find remote player's position to compute push direction
        const p = this.players && this.players[event.playerId];
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
        const unit = Matter.Vector.normalise(Matter.Vector.sub(mref.position, { x: p.x, y: p.y }));
        const massRoot = Math.sqrt(Math.max(0.15, mref.mass || 1));
        Matter.Body.setVelocity(mref, {
            x: mref.velocity.x + (18 * unit.x) / massRoot,
            y: mref.velocity.y + (18 * unit.y) / massRoot
        });
        mref.locatePlayer && mref.locatePlayer();
    },
    
    // Handle remote powerup spawn
    handleRemotePowerupSpawn(powerupData) {
        if (typeof powerUp === 'undefined' || typeof powerUps === 'undefined') return;
        
        console.log('Remote powerup spawned:', powerupData.name, 'at', powerupData.position.x, powerupData.position.y);
        
        // Spawn the powerup locally
        const index = powerUp.length;
        const target = powerUps[powerupData.name];
        if (!target) {
            console.error('Unknown powerup type:', powerupData.name);
            return;
        }
        
        powerUp[index] = Matter.Bodies.polygon(
            powerupData.position.x,
            powerupData.position.y,
            0,
            powerupData.size,
            {
                density: 0.001,
                frictionAir: 0.03,
                restitution: 0.85,
                inertia: Infinity,
                collisionFilter: {
                    group: 0,
                    category: cat.powerUp,
                    mask: cat.map | cat.powerUp
                },
                color: powerupData.color,
                effect: target.effect,
                name: powerupData.name,
                size: powerupData.size
            }
        );
        
        // Set velocity
        Matter.Body.setVelocity(powerUp[index], powerupData.velocity);
        
        // Add to world
        Matter.World.add(engine.world, powerUp[index]);
        
        // Store network ID mapping
        this.localPowerupIds.set(index, powerupData.id);
        this.networkPowerups.set(powerupData.id, index);
    },
    
    // Handle remote powerup pickup
    handleRemotePowerupPickup(powerupData) {
        if (typeof powerUp === 'undefined') return;
        
        console.log('🗑️ Remote powerup picked up:', powerupData.id, 'Looking for local index...');
        
        // Find the local powerup with this network ID
        const localIndex = this.networkPowerups.get(powerupData.id);
        if (localIndex === undefined) {
            console.log('⚠️ Powerup not found in networkPowerups map. Available:', Array.from(this.networkPowerups.keys()));
            return;
        }
        
        console.log('✅ Found powerup at local index:', localIndex, 'Removing...');
        
        // Remove the powerup locally
        if (powerUp[localIndex]) {
            // Safety check: ensure the powerup object is valid before removing
            if (powerUp[localIndex].type) {
                Matter.World.remove(engine.world, powerUp[localIndex]);
            }
            powerUp.splice(localIndex, 1);
            
            // Update all mappings after splice
            this.updatePowerupMappingsAfterRemoval(localIndex);
            
            console.log('✅ Powerup removed successfully');
        } else {
            console.log('⚠️ Powerup at index', localIndex, 'is undefined, skipping Matter.World.remove');
        }
        
        // Clean up network mapping
        this.networkPowerups.delete(powerupData.id);
    },
    
    // Update powerup index mappings after array splice
    updatePowerupMappingsAfterRemoval(removedIndex) {
        // Update localPowerupIds map (index -> networkId)
        const newLocalMap = new Map();
        for (const [index, networkId] of this.localPowerupIds.entries()) {
            if (index < removedIndex) {
                newLocalMap.set(index, networkId);
            } else if (index > removedIndex) {
                newLocalMap.set(index - 1, networkId); // Shift down by 1
                this.networkPowerups.set(networkId, index - 1); // Update reverse mapping
            }
        }
        this.localPowerupIds = newLocalMap;
    },
    
    // Render networked powerups (called from render loop)
    renderPowerups() {
        if (!this.enabled) return;
        
        // Powerups are already rendered by the main game loop
        // This function is here for future enhancements like showing who spawned what
    },
    
    // ===== PHYSICS NETWORKING =====
    
    // Sync physics state to Firebase
    syncPhysics() {
        // Both host and clients sync physics they have authority over
        if (!this.enabled || !this.lobbyId) return;
        
        const now = Date.now();
        if (now - this.lastPhysicsSyncTime < this.physicsSyncInterval) return;
        
        this.lastPhysicsSyncTime = now;
        
        // Collect physics data for mobs, blocks, powerups, and mob bullets
        const physicsData = {
            timestamp: now,
            mobs: [],
            blocks: [],
            powerups: [],
            mobBullets: []
        };
        
        // Sync mobs (enemies) - host syncs all mobs, clients sync those they're interacting with
        if (typeof mob !== 'undefined' && mob.length) {
            for (let i = 0; i < mob.length; i++) {
                const m = mob[i];
                if (m && m.position && m.alive) { // Only sync alive mobs
                    // For host: skip mobs under client authority
                    // For clients: only sync mobs they have authority over
                    const authKey = `mob_${i}`;
                    if (this.isHost) {
                        if (this.clientAuthority.has(authKey)) {
                            const auth = this.clientAuthority.get(authKey);
                            if (auth.playerId !== this.playerId && now < auth.expiry) {
                                continue; // Skip this mob, client has authority
                            }
                        }
                    } else {
                        // Clients only sync mobs they're actively interacting with
                        const auth = this.clientAuthority.get(authKey);
                        if (!auth || auth.playerId !== this.playerId || now >= auth.expiry) {
                            continue; // Skip, we don't have authority
                        }
                    }
                    
                    // Assign persistent netId lazily on host
                    if (!m.netId) m.netId = `${this.playerId}_m${this.mobNetIdCounter++}`;
                    physicsData.mobs.push({
                        index: i,
                        netId: m.netId || null,
                        x: m.position.x,
                        y: m.position.y,
                        vx: m.velocity.x,
                        vy: m.velocity.y,
                        angle: m.angle,
                        health: m.health,
                        alive: m.alive,
                        radius: m.radius || 30,
                        sides: m.vertices ? m.vertices.length : 6,
                        fill: m.fill || '#735084',
                        stroke: m.stroke || '#000000',
                        seePlayerYes: m.seePlayer ? m.seePlayer.yes : false,
                        targetX: (m.seePlayer && m.seePlayer.yes && m.seePlayer.position) ? m.seePlayer.position.x : null,
                        targetY: (m.seePlayer && m.seePlayer.yes && m.seePlayer.position) ? m.seePlayer.position.y : null,
                        // ALWAYS send vertices so clients can render correct shapes
                        verts: (m.vertices && m.vertices.length >= 3) ? m.vertices.map(v => ({ x: v.x, y: v.y })) : null
                    });
                }
            }
            // Debug: log mob sync count occasionally
            if (physicsData.mobs.length > 0 && Math.random() < 0.05) {
                console.log(`📡 Syncing ${physicsData.mobs.length} alive mobs out of ${mob.length} total`);
                const mobsWithVerts = physicsData.mobs.filter(m => m.verts && m.verts.length > 0);
                if (mobsWithVerts.length > 0) {
                    console.log(`📡 ${mobsWithVerts.length} mobs have vertex data, sample:`, mobsWithVerts[0].verts.length, 'vertices');
                }
            }
        }
        
        // Sync blocks (physics bodies) - sync ALL blocks for consistency
        if (typeof body !== 'undefined') {
            // On first sync or periodically, sync ALL blocks
            const syncAllBlocks = this.isHost && (!this.hasInitialBlockSync || Math.random() < 0.01); // 1% chance to resync all
            if (syncAllBlocks) {
                this.hasInitialBlockSync = true;
                // Sync ALL blocks
                for (let i = 0; i < body.length; i++) {
                    if (body[i] && body[i].position && body[i].id) {
                        physicsData.blocks.push({
                            bodyId: body[i].id, // Use Matter.js body ID instead of array index
                            x: body[i].position.x,
                            y: body[i].position.y,
                            vx: body[i].velocity.x,
                            vy: body[i].velocity.y,
                            angle: body[i].angle,
                            angularVelocity: body[i].angularVelocity
                        });
                    }
                }
                console.log(`📦 Syncing ALL ${physicsData.blocks.length} blocks`);
            } else {
                // Normal sync
                const maxBlocks = 50;
                let count = 0;
                for (let i = 0; i < body.length && count < maxBlocks; i++) {
                    if (!body[i] || !body[i].position || !body[i].id) continue;
                    const bodyId = body[i].id;
                    const authKey = `block_${bodyId}`;
                    
                    if (this.isHost) {
                        // Host syncs ALL moving blocks (host has final authority)
                        const speed = body[i].velocity.x * body[i].velocity.x + body[i].velocity.y * body[i].velocity.y;
                        if (speed > 0.01 || Math.abs(body[i].angularVelocity) > 0.001) {
                            physicsData.blocks.push({
                                bodyId: bodyId,
                                x: body[i].position.x,
                                y: body[i].position.y,
                                vx: body[i].velocity.x,
                                vy: body[i].velocity.y,
                                angle: body[i].angle,
                                angularVelocity: body[i].angularVelocity
                            });
                            count++;
                        }
                    } else {
                        // Clients: only sync blocks we're actively touching
                        const auth = this.clientAuthority.get(authKey);
                        if (auth && auth.playerId === this.playerId) {
                            physicsData.blocks.push({
                                bodyId: bodyId,
                                x: body[i].position.x,
                                y: body[i].position.y,
                                vx: body[i].velocity.x,
                                vy: body[i].velocity.y,
                                angle: body[i].angle,
                                angularVelocity: body[i].angularVelocity
                            });
                            count++;
                        }
                    }
                }
            }
            // Always include currently held block if any (prioritize for visibility)
            if (typeof m !== 'undefined' && m.holdingTarget && m.holdingTarget.id) {
                const heldBodyId = m.holdingTarget.id;
                if (!physicsData.blocks.some(b => b.bodyId === heldBodyId)) {
                    if (Math.random() < 0.05) {
                        console.log(`📦 Syncing held block ID ${heldBodyId} at (${m.holdingTarget.position.x.toFixed(0)}, ${m.holdingTarget.position.y.toFixed(0)})`);
                    }
                    physicsData.blocks.unshift({
                        bodyId: heldBodyId,
                        x: m.holdingTarget.position.x,
                        y: m.holdingTarget.position.y,
                        vx: m.holdingTarget.velocity.x,
                        vy: m.holdingTarget.velocity.y,
                        angle: m.holdingTarget.angle,
                        angularVelocity: m.holdingTarget.angularVelocity
                    });
                }
            }
        }
        
        // Sync powerup positions (they move with physics)
        if (typeof powerUp !== 'undefined') {
            for (let i = 0; i < powerUp.length; i++) {
                if (powerUp[i] && powerUp[i].position) {
                    const networkId = this.localPowerupIds.get(i);
                    if (networkId) {
                        physicsData.powerups.push({
                            id: networkId,
                            x: powerUp[i].position.x,
                            y: powerUp[i].position.y,
                            vx: powerUp[i].velocity.x,
                            vy: powerUp[i].velocity.y
                        });
                    }
                }
            }
        }
        
        // Sync mob bullets (projectiles from mobs) - sync ALL without culling
        if (typeof mob !== 'undefined') {
            for (let i = 0; i < mob.length; i++) {
                const m = mob[i];
                if (m && m.position && m.collisionFilter && m.collisionFilter.category === cat.mobBullet) {
                    physicsData.mobBullets.push({
                        index: i,
                        netId: m.netId || `${this.playerId}_bullet${i}`, // Track bullets by ID
                        x: m.position.x,
                        y: m.position.y,
                        vx: m.velocity.x,
                        vy: m.velocity.y,
                        angle: m.angle
                    });
                }
            }
            
            // Log if bullets were synced
            if (physicsData.mobBullets.length > 0 && Math.random() < 0.1) {
                console.log(`🚀 HOST syncing ${physicsData.mobBullets.length} bullets from mob array size ${mob.length}`);
            }
        }
        
        // Debug: Log what we're syncing occasionally
        if (Math.random() < 0.02) {
            console.log(`📤 Syncing physics: ${physicsData.mobs.length} mobs, ${physicsData.blocks.length} blocks, ${physicsData.powerups.length} powerups, ${physicsData.mobBullets.length} bullets`);
            if (physicsData.blocks.length > 0) {
                console.log(`📤 Block indices being synced:`, physicsData.blocks.map(b => b.index));
            }
            if (typeof mob !== 'undefined') {
                const totalMobsInArray = mob.length;
                const totalBulletsInArray = mob.filter(m => m && m.collisionFilter && m.collisionFilter.category === cat.mobBullet).length;
                console.log(`📤 Total in arrays: ${totalMobsInArray} mob array size, ${totalBulletsInArray} bullets in mob array`);
            }
        }
        
        // Send to Firebase under player's own path
        const physicsRef = database.ref(`lobbies/${this.lobbyId}/physics/${this.playerId}`);
        physicsRef.set(physicsData);
    },
    
    // Listen for physics updates (all players)
    listenToPhysics() {
        if (!this.enabled || !this.lobbyId) return;
        
        const physicsRef = database.ref(`lobbies/${this.lobbyId}/physics`);
        physicsRef.on('value', (snapshot) => {
            const allPhysicsData = snapshot.val();
            if (!allPhysicsData) return;
            
            // Apply physics updates from all other players
            for (const [playerId, physicsData] of Object.entries(allPhysicsData)) {
                if (playerId === this.playerId) continue; // Skip own physics
                this.applyPhysicsUpdate(physicsData, playerId);
            }
        });
        
        console.log('Listening for physics updates from all players');
    },
    
    // Apply physics update from other players
    applyPhysicsUpdate(physicsData, fromPlayerId) {
        // Update mobs (from host OR from clients with authority)
        if (physicsData.mobs && typeof mob !== 'undefined') {
            // Track which netIds were updated this cycle
            const updatedNetIds = new Set();
            
            // Debug: log received mob data
            if (physicsData.mobs.length > 0) {
                console.log(`📥 Client received ${physicsData.mobs.length} mob updates from host, local mob count: ${mob.length}`);
                if (Math.random() < 0.05) {
                    const mobsWithVerts = physicsData.mobs.filter(m => m.verts && m.verts.length > 0);
                    console.log(`📥 ${mobsWithVerts.length} received mobs have vertex data`);
                }
            }
            for (const mobData of physicsData.mobs) {
                if (mobData.netId) updatedNetIds.add(mobData.netId);
                // Resolve by netId first for stability
                let targetIndex = null;
                let mobExists = false;
                
                if (mobData.netId) {
                    if (this.mobIndexByNetId.has(mobData.netId)) {
                        targetIndex = this.mobIndexByNetId.get(mobData.netId);
                        mobExists = mob[targetIndex] !== undefined;
                    }
                }
                
                // If we don't have this mob tracked yet, try to find it by index
                if (!mobExists && isFinite(mobData.index) && mob[mobData.index]) {
                    targetIndex = mobData.index;
                    mobExists = true;
                    // Register the netId if we have one
                    if (mobData.netId) {
                        this.mobIndexByNetId.set(mobData.netId, mobData.index);
                        mob[mobData.index].netId = mobData.netId;
                    }
                }
                
                if (mobExists && targetIndex !== null && mob[targetIndex]) {
                    const bodyRef = mob[targetIndex];
                    const now = physicsData.timestamp || Date.now();
                    const target = { x: mobData.x, y: mobData.y, angle: mobData.angle, t: now };
                    const cur = bodyRef.position;
                    const dx = target.x - cur.x, dy = target.y - cur.y;
                    const dist2 = dx*dx + dy*dy;
                    // Snap if way off; otherwise smooth
                    if (dist2 > 500*500) {
                        Matter.Body.setPosition(bodyRef, { x: target.x, y: target.y });
                        Matter.Body.setVelocity(bodyRef, { x: mobData.vx, y: mobData.vy });
                        Matter.Body.setAngle(bodyRef, target.angle);
                    } else {
                        // Increased alpha for more responsive physics
                        const alpha = 0.7; // More aggressive interpolation for better sync
                        Matter.Body.setPosition(bodyRef, { x: cur.x + dx * alpha, y: cur.y + dy * alpha });
                        Matter.Body.setVelocity(bodyRef, { x: mobData.vx, y: mobData.vy });
                        // Angle wrap smoothing
                        let ca = bodyRef.angle, ta = target.angle;
                        let da = ((ta - ca + Math.PI) % (2*Math.PI)) - Math.PI;
                        Matter.Body.setAngle(bodyRef, ca + da * alpha);
                    }
                    // Apply exact vertex geometry when provided (special shapes)
                    if (Array.isArray(mobData.verts) && mobData.verts.length >= 3) {
                        try { 
                            Matter.Body.setVertices(bodyRef, mobData.verts);
                            if (Math.random() < 0.05) {
                                console.log(`🔷 Updated vertices for mob ${targetIndex}, ${mobData.verts.length} vertices`);
                            }
                        } catch(e) { 
                            console.warn('Failed to update mob vertices:', e);
                        }
                    }
                    if (mobData.health !== undefined) mob[targetIndex].health = mobData.health;
                    // Update visual properties
                    if (mobData.fill) mob[targetIndex].fill = mobData.fill;
                    if (mobData.stroke) mob[targetIndex].stroke = mobData.stroke;
                    if (mobData.radius) mob[targetIndex].radius = mobData.radius;
                    // Sync targeting data
                    if (mob[targetIndex].seePlayer) {
                        mob[targetIndex].seePlayer.yes = mobData.seePlayerYes || false;
                        mob[targetIndex].seePlayer.recall = mobData.seePlayerYes || false;
                        if (mobData.targetX !== null && mobData.targetY !== null) {
                            mob[targetIndex].targetPos = { x: mobData.targetX, y: mobData.targetY };
                        }
                    }
                    // If host reports dead, trigger local death transition once
                    if (mobData.alive !== undefined) {
                        const wasAlive = mob[targetIndex].alive;
                        mob[targetIndex].alive = mobData.alive;
                        if (wasAlive && mobData.alive === false && typeof mob[targetIndex].death === 'function') {
                            mob[targetIndex].death();
                        }
                    }
                } else if (!mobExists && mobData.netId && mobData.alive !== false && (typeof mob !== 'undefined') && !this.isHost && fromPlayerId === this.hostId) {
                    // Create a simple ghost mob for clients when HOST reports a new mob
                    // Only create if we don't have this mob yet, have a netId, the mob is alive, we're not the host, and this update is from the host
                    console.log(`👻 Client creating ghost mob with netId: ${mobData.netId} at (${Math.round(mobData.x)}, ${Math.round(mobData.y)})`);
                    try {
                        const radius = mobData.radius || 30; // Use actual radius if available
                        // Clamp sides to a reasonable small polygon to avoid near-circles from high vertex counts
                        const sides = Math.max(3, Math.min(8, isFinite(mobData.sides) ? Math.floor(mobData.sides) : 6));
                        let ghost;
                        const baseOpts = {
                            inertia: Infinity,
                            frictionAir: 0.005,
                            restitution: 0.5,
                            density: 0.001,
                            // Ensure ghost mobs behave like real mobs re: collisions
                            collisionFilter: {
                                group: 0,
                                category: cat.mob,
                                mask: cat.player | cat.map | cat.body | cat.bullet | cat.mob
                            },
                            classType: 'mob',
                            mob: true,
                            isGhost: true,
                            alive: true,
                            health: isFinite(mobData.health) ? mobData.health : 1,
                            maxHealth: 1, // Add maxHealth for proper health bar rendering
                            radius: radius,
                            seePlayer: { recall: mobData.seePlayerYes || false, yes: mobData.seePlayerYes || false, position: { x: mobData.x || 0, y: mobData.y || 0 } },
                            showHealthBar: true,
                            fill: mobData.fill || '#735084', // Use actual fill or default purple
                            stroke: mobData.stroke || '#000000', // Use actual stroke or black
                            // Add required mob properties
                            cd: 0,
                            seePlayerFreq: 30,
                            isDropPowerUp: true,
                            isShielded: false,
                            isBoss: false,
                            shield: null,
                            status: [], // Status effects array
                            vertices: [] // Will be set below
                        };
                        if (Array.isArray(mobData.verts) && mobData.verts.length >= 3) {
                            try {
                                ghost = Matter.Bodies.fromVertices(mobData.x || 0, mobData.y || 0, mobData.verts, baseOpts);
                                // Validate: if body has no vertices or degenerate, fall back to polygon
                                if (!ghost || !ghost.vertices || ghost.vertices.length < 3) {
                                    console.warn('fromVertices created invalid body, falling back to polygon');
                                    ghost = Matter.Bodies.polygon(mobData.x || 0, mobData.y || 0, sides, radius, baseOpts);
                                }
                            } catch(e) {
                                console.warn('fromVertices failed:', e, 'falling back to polygon');
                                ghost = Matter.Bodies.polygon(mobData.x || 0, mobData.y || 0, sides, radius, baseOpts);
                            }
                        } else {
                            ghost = Matter.Bodies.polygon(mobData.x || 0, mobData.y || 0, sides, radius, baseOpts);
                        }
                        
                        // Add minimal required methods for proper mob behavior
                        ghost.damage = function(dmg) { 
                            // Apply damage visually but don't actually kill (host has authority)
                            this.health = Math.max(0, this.health - dmg);
                        };
                        ghost.locatePlayer = function() { 
                            // Simple player tracking for ghost mobs
                            if (this.seePlayer) {
                                this.seePlayer.recall = true;
                                this.seePlayer.yes = true;
                                if (typeof m !== 'undefined' && m.pos) {
                                    this.seePlayer.position = { x: m.pos.x, y: m.pos.y };
                                }
                            }
                        };
                        ghost.foundPlayer = function() { /* no-op on clients */ };
                        ghost.death = function() {
                            this.alive = false;
                            // Clean removal from world
                            try {
                                Matter.World.remove(engine.world, this);
                            } catch(e) { /* ignore */ }
                            // Remove from mob array
                            for (let i = 0; i < mob.length; i++) {
                                if (mob[i] === this) { 
                                    mob.splice(i, 1); 
                                    break; 
                                }
                            }
                        };
                        ghost.onDamage = function() { /* no-op */ };
                        ghost.onDeath = function() { /* no-op */ };
                        ghost.replace = function(index) {
                            // Simple cleanup without spawning bodies
                            Matter.World.remove(engine.world, this);
                            mob.splice(index, 1);
                        };
                        // Ensure mob loop can safely call replace(i) on ghost
                        ghost.replace = function(i) {
                            try {
                                Matter.World.remove(engine.world, this);
                            } catch(e) { /* no-op */ }
                            if (isFinite(i) && i >= 0 && i < mob.length && mob[i] === this) {
                                mob.splice(i, 1);
                            } else {
                                for (let j = 0; j < mob.length; j++) {
                                    if (mob[j] === this) { mob.splice(j, 1); break; }
                                }
                            }
                        };
                        ghost.do = function() { /* no-op */ };
                        ghost.onDeath = function() { /* no-op */ };
                        ghost.onDamage = function() { /* no-op */ };
                        ghost.checkStatus = function() { /* no-op */ };
                        ghost.gravity = function() { this.force.y += this.mass * simulation.g; };
                        ghost.distanceToPlayer = function() { 
                            const dx = this.position.x - player.position.x;
                            const dy = this.position.y - player.position.y;
                            return Math.sqrt(dx * dx + dy * dy);
                        };
                        ghost.distanceToPlayer2 = function() {
                            const dx = this.position.x - player.position.x;
                            const dy = this.position.y - player.position.y;
                            return dx * dx + dy * dy;
                        };
                        
                        // Add to world and mob array
                        World.add(engine.world, ghost);
                        const newIndex = mob.length;
                        mob[newIndex] = ghost;
                        
                        // Register netId mapping
                        this.mobIndexByNetId.set(mobData.netId, newIndex);
                        ghost.netId = mobData.netId;
                        
                        // Set initial physics
                        Matter.Body.setVelocity(ghost, { x: mobData.vx || 0, y: mobData.vy || 0 });
                        Matter.Body.setAngle(ghost, mobData.angle || 0);
                    } catch (e) {
                        console.warn('Failed to create ghost mob:', e);
                    }
                }
            }
            
            // CLEANUP: Track last update time for ghost mobs, only remove if not updated for 5 seconds
            if (!this.isHost) {
                const now = Date.now();
                if (!this.ghostMobLastUpdate) this.ghostMobLastUpdate = new Map();
                
                // Update timestamps for synced mobs
                for (const netId of updatedNetIds) {
                    this.ghostMobLastUpdate.set(netId, now);
                }
                
                // Remove ghost mobs that haven't been updated in 5 seconds (likely dead/despawned)
                for (let i = mob.length - 1; i >= 0; i--) {
                    if (mob[i] && mob[i].isGhost && mob[i].netId) {
                        const lastUpdate = this.ghostMobLastUpdate.get(mob[i].netId) || 0;
                        if (now - lastUpdate > 5000) { // 5 seconds timeout
                            console.log(`🗑️ Removing stale ghost mob ${i} with netId ${mob[i].netId} - not updated for 5s`);
                            try {
                                Matter.World.remove(engine.world, mob[i]);
                            } catch(e) { /* ignore */ }
                            this.mobIndexByNetId.delete(mob[i].netId);
                            this.ghostMobLastUpdate.delete(mob[i].netId);
                            mob.splice(i, 1);
                        }
                    }
                }
            }
        }
        
        // Update blocks (use interpolation to smooth the updates) - accept from any player
        if (physicsData.blocks && typeof body !== 'undefined') {
            if (physicsData.blocks.length > 0 && Math.random() < 0.02) {
                console.log(`📥 Applying ${physicsData.blocks.length} block updates from player ${fromPlayerId}`);
            }
            for (const blockData of physicsData.blocks) {
                // Find body by ID instead of index (indices change when bodies are removed)
                const targetBody = body.find(b => b && b.id === blockData.bodyId);
                if (targetBody) {
                    // If update is from host, always accept (host has final authority)
                    // If from client, only skip if we're currently touching it
                    const authKey = `block_${blockData.bodyId}`;
                    const isFromHost = this.players[fromPlayerId] && this.players[fromPlayerId].isHost;
                    
                    if (!isFromHost && this.clientAuthority.has(authKey) && 
                        this.clientAuthority.get(authKey).playerId === this.playerId) {
                        if (Math.random() < 0.01) {
                            console.log(`⏭️ Skipping block ${blockData.bodyId} - under my authority (from client)`);
                        }
                        continue;
                    }
                    
                    const currentPos = targetBody.position;
                    const dx = blockData.x - currentPos.x;
                    const dy = blockData.y - currentPos.y;
                    const dist2 = dx*dx + dy*dy;
                    
                    // Always update, but vary the lerp factor based on distance
                    let lerpFactor = 0.15; // Very gentle interpolation to avoid jitter
                    
                    if (dist2 > 40000) { // More than 200 units away - snap to position
                        lerpFactor = 1.0;
                    } else if (dist2 > 10000) { // More than 100 units away - moderate catch up
                        lerpFactor = 0.4;
                    } else if (dist2 > 2500) { // More than 50 units away - gentle catch up
                        lerpFactor = 0.25;
                    }
                    
                    const newX = currentPos.x + dx * lerpFactor;
                    const newY = currentPos.y + dy * lerpFactor;
                    
                    if (Math.random() < 0.01) {
                        console.log(`✅ Applying block ${blockData.bodyId} update: (${currentPos.x.toFixed(0)},${currentPos.y.toFixed(0)}) -> (${newX.toFixed(0)},${newY.toFixed(0)}) [dist: ${Math.sqrt(dist2).toFixed(0)}]`);
                    }
                    
                    Matter.Body.setPosition(targetBody, { x: newX, y: newY });
                    Matter.Body.setVelocity(targetBody, { x: blockData.vx, y: blockData.vy });
                    
                    // Smooth angle interpolation
                    const currentAngle = targetBody.angle;
                    const targetAngle = blockData.angle;
                    const angleDiff = ((targetAngle - currentAngle + Math.PI) % (2*Math.PI)) - Math.PI;
                    const newAngle = currentAngle + angleDiff * lerpFactor;
                    Matter.Body.setAngle(targetBody, newAngle);
                    Matter.Body.setAngularVelocity(targetBody, blockData.angularVelocity || 0);
                }
            }
        }
        
        // Update powerups (they move with physics)
        if (physicsData.powerups && typeof powerUp !== 'undefined') {
            for (const powerupData of physicsData.powerups) {
                const localIndex = this.networkPowerups.get(powerupData.id);
                if (localIndex !== undefined && powerUp[localIndex]) {
                    const currentPos = powerUp[localIndex].position;
                    const lerpFactor = 0.3;
                    
                    Matter.Body.setPosition(powerUp[localIndex], {
                        x: currentPos.x + (powerupData.x - currentPos.x) * lerpFactor,
                        y: currentPos.y + (powerupData.y - currentPos.y) * lerpFactor
                    });
                    Matter.Body.setVelocity(powerUp[localIndex], { x: powerupData.vx, y: powerupData.vy });
                }
            }
        }
        
        // Update mob bullets (use interpolation)
        if (physicsData.mobBullets && typeof mob !== 'undefined') {
            if (physicsData.mobBullets.length > 0 && Math.random() < 0.1) {
                console.log(`🚀 CLIENT received ${physicsData.mobBullets.length} bullet updates, local mob array size: ${mob.length}`);
            }
            for (const bulletData of physicsData.mobBullets) {
                if (mob[bulletData.index] && mob[bulletData.index].collisionFilter && 
                    mob[bulletData.index].collisionFilter.category === cat.mobBullet) {
                    const currentPos = mob[bulletData.index].position;
                    const lerpFactor = 0.4;
                    
                    Matter.Body.setPosition(mob[bulletData.index], {
                        x: currentPos.x + (bulletData.x - currentPos.x) * lerpFactor,
                        y: currentPos.y + (bulletData.y - currentPos.y) * lerpFactor
                    });
                    Matter.Body.setVelocity(mob[bulletData.index], { x: bulletData.vx, y: bulletData.vy });
                    Matter.Body.setAngle(mob[bulletData.index], bulletData.angle);
                }
            }
        }
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
