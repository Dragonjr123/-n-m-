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
    
    // Powerup networking
    powerupIdCounter: 0,
    localPowerupIds: new Map(), // Maps local powerUp array index to network ID
    networkPowerups: new Map(), // Maps network ID to powerup data
    
    // Physics networking
    lastPhysicsSyncTime: 0,
    physicsSyncInterval: 100, // Sync physics every 100ms (10 times/sec)
    
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
        
        // Start listening for field interaction events
        this.listenToFieldEvents();
        
        // Start listening for powerup events
        this.listenToPowerupEvents();
        
        // Start listening for physics (all players)
        this.listenToPhysics();
        
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
            data: data,
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
    
    // Sync level change (when someone goes to next level)
    syncLevelChange(levelName, levelIndex) {
        if (!this.enabled || !this.lobbyId) return;
        
        console.log('📤 Syncing level change:', levelName);
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'level_change',
            playerId: this.playerId,
            levelName: levelName,
            levelIndex: levelIndex,
            levelsCleared: level.levelsCleared,
            timestamp: Date.now()
        });
    },
    
    // Sync mob damage (for team combat)
    syncMobDamage(mobIndex, damage, health, alive) {
        if (!this.enabled || !this.lobbyId) return;
        
        // Throttle mob damage sync (only sync every few frames)
        const now = Date.now();
        if (now - (this.lastMobSyncTime || 0) < 50) return; // Max 20 updates/sec
        this.lastMobSyncTime = now;
        
        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'mob_damage',
            playerId: this.playerId,
            mobIndex: mobIndex,
            damage: damage,
            health: health,
            alive: alive,
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
                this.handleRemoteBlockPush(event.data);
                break;
            case 'block_pickup':
                this.handleRemoteBlockPickup(event.blockData);
                break;
            case 'block_throw':
                this.handleRemoteBlockThrow(event.blockData);
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
            case 'teleport':
                this.handleRemoteTeleport(event);
                break;
        }
    },
    
    // Handle remote gun fire - spawn bullets visually, DON'T fire the gun
    handleRemoteGunFire(event) {
        console.log('🔫 Remote gun fire:', event.gunName, 'from remote player');
        
        // DON'T call gun.fire() - that would make the remote player fire too!
        // Instead, just spawn visual bullets at the remote player's position
        
        if (typeof b !== 'undefined' && event.position) {
            // Temporarily set position/angle for bullet spawning
            const originalPos = { x: m.pos.x, y: m.pos.y };
            const originalAngle = m.angle;
            const originalCrouch = m.crouch;
            
            m.pos = event.position;
            m.angle = event.angle;
            m.crouch = event.crouch;
            
            // Temporarily disable multiplayer to prevent echo
            const wasEnabled = this.enabled;
            this.enabled = false;
            
            // Spawn bullets based on gun type (without consuming ammo or triggering fire)
            try {
                const gun = b.guns.find(g => g.name === event.gunName);
                if (gun && gun.fire) {
                    gun.fire(); // Spawn bullets only
                }
            } catch (e) {
                console.error('Error spawning remote bullets:', e);
            }
            
            // Re-enable multiplayer
            this.enabled = wasEnabled;
            
            // Restore original position/angle
            m.pos = originalPos;
            m.angle = originalAngle;
            m.crouch = originalCrouch;
            
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

    // Sync teleport event so all players are moved together
    syncTeleport(position, velocity) {
        if (!this.enabled || !this.lobbyId) return;
        if (!position) return;

        const eventRef = database.ref(`lobbies/${this.lobbyId}/events`).push();
        eventRef.set({
            type: 'teleport',
            playerId: this.playerId,
            position: { x: position.x, y: position.y },
            velocity: velocity ? { x: velocity.x, y: velocity.y } : null,
            timestamp: Date.now()
        });
    },

    // Handle remote teleport - move local player to the given position
    handleRemoteTeleport(event) {
        try {
            console.log('🌀 Remote teleport to:', event.position);
            if (typeof Matter === 'undefined' || typeof player === 'undefined' || !event.position) return;

            // Prevent echo while applying remote teleport
            const wasEnabled = this.enabled;
            this.enabled = false;

            Matter.Body.setPosition(player, event.position);
            if (event.velocity) {
                Matter.Body.setVelocity(player, event.velocity);
            }

            this.enabled = wasEnabled;
        } catch (e) {
            console.error('Error applying remote teleport:', e);
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
    
    // Handle remote tech selection
    handleRemoteTechSelection(event) {
        console.log('🔬 Remote tech selection:', event.techName, 'by player:', event.playerId);
        
        // Apply the tech to the remote player (if we want to show it)
        // For now, just show a notification
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
        
        // If someone else goes to next level, follow them
        if (typeof level !== 'undefined' && level.nextLevel) {
            const playerName = this.otherPlayers.get(event.playerId)?.name || 'Player';
            simulation.makeTextLog(`<span style='color:#0cf'>${playerName}</span> entered <span style='color:#ff0'>next level</span>`);
            
            // Sync level state
            level.levelsCleared = event.levelsCleared;
            level.onLevel = event.levelIndex;
            
            // Load the same level
            console.log('🔄 Loading level:', event.levelName);
            setTimeout(() => {
                if (typeof level[event.levelName] === 'function') {
                    level[event.levelName]();
                    level.levelAnnounce();
                    simulation.noCameraScroll();
                    simulation.setZoom();
                    level.addToWorld();
                    simulation.draw.setPaths();
                }
            }, 100);
        }
    },
    
    // Handle remote mob damage (team combat)
    handleRemoteMobDamage(event) {
        // Apply damage to the mob on this client
        if (typeof mob !== 'undefined' && mob[event.mobIndex]) {
            const targetMob = mob[event.mobIndex];
            if (targetMob && targetMob.alive) {
                // Sync health state
                targetMob.health = event.health;
                targetMob.alive = event.alive;
                
                // Show damage indicator
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: targetMob.position.x,
                        y: targetMob.position.y,
                        radius: Math.log(2 * event.damage + 1.1) * 40,
                        color: "rgba(255,0,100,0.3)", // Different color for remote damage
                        time: simulation.drawTime
                    });
                }
                
                // Kill mob if dead
                if (!event.alive && targetMob.alive) {
                    targetMob.death();
                }
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
    
    // Sync physics state (all players)
    syncPhysics() {
        if (!this.enabled || !this.lobbyId) return;
        
        const now = Date.now();
        if (now - this.lastPhysicsSyncTime < this.physicsSyncInterval) return;
        
        this.lastPhysicsSyncTime = now;
        
        // Collect physics data for mobs, blocks, and powerups
        const physicsData = {
            timestamp: now,
            mobs: [],
            blocks: [],
            powerups: []
        };
        
        // Sync mobs (enemies)
        if (typeof mob !== 'undefined') {
            for (let i = 0; i < Math.min(mob.length, 50); i++) { // Limit to 50 mobs
                if (mob[i] && mob[i].position) {
                    physicsData.mobs.push({
                        index: i,
                        x: mob[i].position.x,
                        y: mob[i].position.y,
                        vx: mob[i].velocity.x,
                        vy: mob[i].velocity.y,
                        angle: mob[i].angle,
                        health: mob[i].health || 1,
                        alive: mob[i].alive
                    });
                }
            }
        }
        
        // Sync blocks (physics bodies)
        if (typeof body !== 'undefined') {
            for (let i = 0; i < Math.min(body.length, 30); i++) {
                if (body[i] && body[i].position) {
                    physicsData.blocks.push({
                        index: i,
                        x: body[i].position.x,
                        y: body[i].position.y,
                        vx: body[i].velocity.x,
                        vy: body[i].velocity.y,
                        angle: body[i].angle,
                        angularVelocity: body[i].angularVelocity
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
                this.applyPhysicsUpdate(physicsData);
            }
        });
        
        console.log('Listening for physics updates from all players');
    },
    
    // Apply physics update from host
    applyPhysicsUpdate(physicsData) {
        // Update mobs (use interpolation to smooth the updates)
        if (physicsData.mobs && typeof mob !== 'undefined') {
            for (const mobData of physicsData.mobs) {
                if (mob[mobData.index]) {
                    // Smoothly interpolate to new position instead of snapping
                    const currentPos = mob[mobData.index].position;
                    const lerpFactor = 0.3; // 30% towards new position
                    
                    Matter.Body.setPosition(mob[mobData.index], {
                        x: currentPos.x + (mobData.x - currentPos.x) * lerpFactor,
                        y: currentPos.y + (mobData.y - currentPos.y) * lerpFactor
                    });
                    Matter.Body.setVelocity(mob[mobData.index], { x: mobData.vx, y: mobData.vy });
                    Matter.Body.setAngle(mob[mobData.index], mobData.angle);
                    if (mobData.health !== undefined) mob[mobData.index].health = mobData.health;
                    if (mobData.alive !== undefined) mob[mobData.index].alive = mobData.alive;
                }
            }
        }
        
        // Update blocks (use interpolation to smooth the updates)
        if (physicsData.blocks && typeof body !== 'undefined') {
            for (const blockData of physicsData.blocks) {
                if (body[blockData.index]) {
                    // Smoothly interpolate to new position
                    const currentPos = body[blockData.index].position;
                    const lerpFactor = 0.3;
                    
                    Matter.Body.setPosition(body[blockData.index], {
                        x: currentPos.x + (blockData.x - currentPos.x) * lerpFactor,
                        y: currentPos.y + (blockData.y - currentPos.y) * lerpFactor
                    });
                    Matter.Body.setVelocity(body[blockData.index], { x: blockData.vx, y: blockData.vy });
                    Matter.Body.setAngle(body[blockData.index], blockData.angle);
                    Matter.Body.setAngularVelocity(body[blockData.index], blockData.angularVelocity);
                }
            }
        }
        
        // Update powerups (use interpolation)
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
