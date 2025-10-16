// Core Multiplayer System for {n/m}
// Focused on: Player connections, models, and powerup networking
import { database, ref, set, get, onValue, push, remove, update, onDisconnect } from './firebase-config.js';

const multiplayerSystem = {
    // ===== CORE STATE =====
    playerId: null,
    currentRoomId: null,
    currentRoom: null,
    isHost: false,
    isGameStarted: false,
    
    // ===== PLAYER DATA =====
    localPlayer: {
        name: 'Player',
        color: '#00ccff',
        nameColor: '#ffffff'
    },
    remotePlayers: {},
    
    // ===== INITIALIZATION =====
    init() {
        this.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        
        // Load saved preferences
        const savedName = localStorage.getItem('mp_player_name');
        const savedColor = localStorage.getItem('mp_player_color');
        const savedNameColor = localStorage.getItem('mp_player_name_color');
        
        if (savedName) {
            document.getElementById('player-name').value = savedName;
            this.localPlayer.name = savedName;
        }
        if (savedColor) {
            document.getElementById('player-color').value = savedColor;
            this.localPlayer.color = savedColor;
        }
        if (savedNameColor) {
            document.getElementById('player-name-color').value = savedNameColor;
            this.localPlayer.nameColor = savedNameColor;
        }
        
        // Setup UI listeners
        document.getElementById('room-private').addEventListener('change', (e) => {
            document.getElementById('room-password-container').style.display = e.target.checked ? 'block' : 'none';
        });
        
        this.listenForPublicRooms();
        
        console.log('✅ Multiplayer initialized');
    },
    
    // ===== ROOM MANAGEMENT =====
    async createRoom() {
        const roomName = document.getElementById('room-name').value.trim() || 'Unnamed Room';
        const isPrivate = document.getElementById('room-private').checked;
        const password = document.getElementById('room-password').value;
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        const playerColor = document.getElementById('player-color').value;
        const nameColor = document.getElementById('player-name-color').value;
        
        this.savePlayerPreferences(playerName, playerColor, nameColor);
        
        const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        const roomId = 'room_' + Date.now();
        
        const roomData = {
            name: roomName,
            code: roomCode,
            host: this.playerId,
            isPrivate: isPrivate,
            password: isPrivate ? password : null,
            maxPlayers: 10,
            createdAt: Date.now(),
            gameStarted: false,
            gameSettings: {
                difficulty: 2,
                level: 0
            },
            players: {
                [this.playerId]: {
                    name: playerName,
                    color: playerColor,
                    nameColor: nameColor,
                    isHost: true,
                    connected: true,
                    joinedAt: Date.now()
                }
            }
        };
        
        try {
            await set(ref(database, 'rooms/' + roomId), roomData);
            
            const playerRef = ref(database, `rooms/${roomId}/players/${this.playerId}`);
            onDisconnect(playerRef).update({ connected: false });
            
            this.currentRoomId = roomId;
            this.currentRoom = roomData;
            this.isHost = true;
            
            this.showRoomUI(roomData, roomCode);
            this.startRoomListeners();
            
            console.log('✅ Room created:', roomCode);
        } catch (error) {
            console.error('Failed to create room:', error);
            alert('Failed to create room');
        }
    },
    
    async joinRoomByCode() {
        const roomCode = document.getElementById('join-room-code').value.trim().toUpperCase();
        if (!roomCode) {
            alert('Please enter a room code');
            return;
        }
        
        try {
            const roomsSnapshot = await get(ref(database, 'rooms'));
            if (!roomsSnapshot.exists()) {
                alert('Room not found');
                return;
            }
            
            const rooms = roomsSnapshot.val();
            for (const [roomId, room] of Object.entries(rooms)) {
                if (room.code === roomCode) {
                    await this.joinRoom(roomId, room);
                    return;
                }
            }
            
            alert('Room not found');
        } catch (error) {
            console.error('Error finding room:', error);
            alert('Failed to join room');
        }
    },
    
    async joinRoom(roomId, roomData) {
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        const playerColor = document.getElementById('player-color').value;
        const nameColor = document.getElementById('player-name-color').value;
        
        const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
        if (playerCount >= roomData.maxPlayers) {
            alert('Room is full');
            return;
        }
        
        if (roomData.isPrivate) {
            const password = prompt('Enter room password:');
            if (password !== roomData.password) {
                alert('Incorrect password');
                return;
            }
        }
        
        this.savePlayerPreferences(playerName, playerColor, nameColor);
        
        try {
            await set(ref(database, `rooms/${roomId}/players/${this.playerId}`), {
                name: playerName,
                color: playerColor,
                nameColor: nameColor,
                isHost: false,
                connected: true,
                joinedAt: Date.now()
            });
            
            const playerRef = ref(database, `rooms/${roomId}/players/${this.playerId}`);
            onDisconnect(playerRef).update({ connected: false });
            
            this.currentRoomId = roomId;
            this.currentRoom = roomData;
            this.isHost = false;
            
            this.showRoomUI(roomData, roomData.code);
            this.startRoomListeners();
            
            console.log('✅ Joined room:', roomData.code);
        } catch (error) {
            console.error('Failed to join room:', error);
            alert('Failed to join room');
        }
    },
    
    savePlayerPreferences(name, color, nameColor) {
        this.localPlayer.name = name;
        this.localPlayer.color = color;
        this.localPlayer.nameColor = nameColor;
        
        localStorage.setItem('mp_player_name', name);
        localStorage.setItem('mp_player_color', color);
        localStorage.setItem('mp_player_name_color', nameColor);
    },
    
    async leaveRoom() {
        if (this.currentRoomId) {
            try {
                await remove(ref(database, `rooms/${this.currentRoomId}/players/${this.playerId}`));
                await remove(ref(database, `rooms/${this.currentRoomId}/playerStates/${this.playerId}`));
            } catch (error) {
                console.error('Error leaving room:', error);
            }
        }
        
        this.currentRoomId = null;
        this.currentRoom = null;
        this.isHost = false;
        this.isGameStarted = false;
        this.remotePlayers = {};
        
        document.getElementById('room-settings').style.display = 'none';
        document.getElementById('multiplayer-lobby').style.display = 'block';
        
        if (typeof simulation !== 'undefined') {
            simulation.isMultiplayer = false;
        }
    },
    
    // ===== ROOM UI =====
    showRoomUI(roomData, roomCode) {
        document.getElementById('multiplayer-lobby').style.display = 'none';
        document.getElementById('room-settings').style.display = 'block';
        document.getElementById('current-room-name').textContent = roomData.name;
        document.getElementById('current-room-code').textContent = roomCode;
        
        const hostSettings = document.getElementById('host-settings');
        const startBtn = document.getElementById('start-game-btn');
        
        if (this.isHost) {
            hostSettings.style.display = 'block';
            startBtn.style.display = 'block';
            
            ['mp-difficulty', 'mp-level'].forEach(id => {
                document.getElementById(id).addEventListener('change', () => this.updateGameSettings());
            });
        } else {
            hostSettings.style.display = 'none';
            startBtn.style.display = 'none';
        }
    },
    
    async updateGameSettings() {
        if (!this.isHost || !this.currentRoomId) return;
        
        const settings = {
            difficulty: parseInt(document.getElementById('mp-difficulty').value),
            level: parseInt(document.getElementById('mp-level').value)
        };
        
        try {
            await update(ref(database, `rooms/${this.currentRoomId}/gameSettings`), settings);
        } catch (error) {
            console.error('Failed to update settings:', error);
        }
    },
    
    updatePlayersList(players) {
        const playersList = document.getElementById('players-list');
        const playerCount = document.getElementById('player-count');
        
        playersList.innerHTML = '';
        const playerArray = Object.entries(players || {});
        playerCount.textContent = playerArray.length;
        
        playerArray.forEach(([playerId, player]) => {
            const playerCard = document.createElement('div');
            playerCard.style.cssText = `
                background: ${player.color};
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 5px;
            `;
            
            playerCard.innerHTML = `
                <div style="color: ${player.nameColor}; font-weight: bold;">
                    ${player.name} ${player.isHost ? '👑' : ''} ${!player.connected ? '(Disconnected)' : ''}
                </div>
            `;
            
            playersList.appendChild(playerCard);
        });
    },
    
    // ===== ROOM LISTENERS =====
    startRoomListeners() {
        if (!this.currentRoomId) return;
        
        const roomRef = ref(database, `rooms/${this.currentRoomId}`);
        onValue(roomRef, (snapshot) => {
            if (!snapshot.exists()) {
                alert('Room closed');
                this.leaveRoom();
                return;
            }
            
            const roomData = snapshot.val();
            this.currentRoom = roomData;
            
            this.updatePlayersList(roomData.players);
            
            if (!this.isHost && roomData.gameSettings) {
                document.getElementById('mp-difficulty').value = roomData.gameSettings.difficulty;
                document.getElementById('mp-level').value = roomData.gameSettings.level;
            }
            
            if (roomData.gameStarted && !this.isGameStarted) {
                this.startMultiplayerGame(roomData.gameSettings);
            }
        });
    },
    
    listenForPublicRooms() {
        const roomsRef = ref(database, 'rooms');
        onValue(roomsRef, (snapshot) => {
            const roomsList = document.getElementById('public-rooms-list');
            if (!roomsList) return;
            
            roomsList.innerHTML = '';
            
            if (!snapshot.exists()) {
                roomsList.innerHTML = '<div style="color: #888;">No public rooms available</div>';
                return;
            }
            
            const rooms = snapshot.val();
            Object.entries(rooms).forEach(([roomId, room]) => {
                if (!room.isPrivate && !room.gameStarted) {
                    const playerCount = room.players ? Object.keys(room.players).length : 0;
                    
                    const roomCard = document.createElement('div');
                    roomCard.style.cssText = `
                        background: #333;
                        padding: 10px;
                        margin-bottom: 10px;
                        border-radius: 5px;
                        cursor: pointer;
                    `;
                    
                    roomCard.innerHTML = `
                        <div style="font-weight: bold;">${room.name}</div>
                        <div style="color: #888;">Code: ${room.code}</div>
                        <div style="color: #888;">Players: ${playerCount}/${room.maxPlayers}</div>
                    `;
                    
                    roomCard.onclick = () => this.joinRoom(roomId, room);
                    roomsList.appendChild(roomCard);
                }
            });
        });
    },
    
    // ===== GAME START =====
    async startGame() {
        if (!this.isHost || !this.currentRoomId) return;
        
        try {
            await update(ref(database, `rooms/${this.currentRoomId}`), {
                gameStarted: true
            });
        } catch (error) {
            console.error('Failed to start game:', error);
        }
    },
    
    startMultiplayerGame(settings) {
        if (this.isGameStarted) return;
        this.isGameStarted = true;
        
        document.getElementById('room-settings').style.display = 'none';
        
        simulation.difficultyMode = settings.difficulty;
        simulation.startGame();
        
        simulation.isMultiplayer = true;
        simulation.multiplayerRoomId = this.currentRoomId;
        
        setTimeout(() => {
            if (player && m) {
                // Apply player color from localPlayer settings
                this.applyPlayerColor();
                this.initGameplay();
            }
        }, 200);
    },
    
    applyPlayerColor() {
        if (!m || !this.localPlayer.color) return;
        
        // Convert hex color to HSL and apply to player
        const hex = this.localPlayer.color;
        const rgb = this.hexToRgb(hex);
        const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
        
        m.color.hue = Math.round(hsl.h);
        m.color.sat = Math.round(hsl.s);
        m.color.light = Math.round(hsl.l);
        m.setFillColors();
        
        console.log(`Applied player color: ${hex} -> HSL(${m.color.hue}, ${m.color.sat}%, ${m.color.light}%)`);
    },
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 204, b: 255 };
    },
    
    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        
        return {
            h: h * 360,
            s: s * 100,
            l: l * 100
        };
    },
    
    // ===== GAMEPLAY SYSTEMS =====
    initGameplay() {
        console.log('🎮 Starting multiplayer gameplay');
        
        this.startPlayerSync();
        this.startPowerupSync();
        this.hookRenderLoop();
        
        console.log('✅ Multiplayer gameplay ready');
    },
    
    // ===== PLAYER SYNC =====
    startPlayerSync() {
        // Send local player position
        setInterval(() => {
            if (!m || !player || !player.position || !this.currentRoomId) return;
            
            const state = {
                x: Math.round(player.position.x),
                y: Math.round(player.position.y),
                vx: Math.round(player.velocity?.x || 0),
                vy: Math.round(player.velocity?.y || 0),
                angle: Math.round((m.angle || 0) * 100) / 100,
                health: m.health || 1,
                maxHealth: m.maxHealth || 1,
                radius: m.radius || 30,
                fillColor: m.fillColor || this.localPlayer.color,
                yOff: m.yOff || 70,
                timestamp: Date.now()
            };
            
            set(ref(database, `rooms/${this.currentRoomId}/playerStates/${this.playerId}`), state)
                .catch(err => console.error('Position sync error:', err));
        }, 50);
        
        // Listen for remote players
        const statesRef = ref(database, `rooms/${this.currentRoomId}/playerStates`);
        onValue(statesRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const states = snapshot.val();
            for (const [playerId, state] of Object.entries(states)) {
                if (playerId === this.playerId) continue;
                
                if (!this.remotePlayers[playerId]) {
                    const playerData = this.currentRoom?.players?.[playerId];
                    this.remotePlayers[playerId] = {
                        name: playerData?.name || 'Player',
                        color: playerData?.color || '#ff0000',
                        nameColor: playerData?.nameColor || '#ffffff'
                    };
                    console.log('New player connected:', this.remotePlayers[playerId].name);
                }
                
                Object.assign(this.remotePlayers[playerId], state);
            }
            
            // Remove disconnected players
            for (const playerId in this.remotePlayers) {
                if (!states[playerId]) {
                    console.log('Player disconnected:', this.remotePlayers[playerId].name);
                    delete this.remotePlayers[playerId];
                }
            }
        });
    },
    
    // ===== POWERUP SYNC =====
    startPowerupSync() {
        // Monitor powerup collection
        if (typeof powerUp !== 'undefined') {
            let lastPowerupCount = powerUp.length;
            
            setInterval(() => {
                if (!this.isGameStarted) return;
                
                // Check if powerups were collected
                if (powerUp.length < lastPowerupCount) {
                    // Find which powerup was collected
                    const collected = lastPowerupCount - powerUp.length;
                    
                    // Notify other players
                    this.notifyPowerupCollection({
                        playerId: this.playerId,
                        remaining: powerUp.length,
                        timestamp: Date.now()
                    });
                }
                
                lastPowerupCount = powerUp.length;
            }, 100);
        }
        
        // Listen for powerup collections from other players
        const powerupRef = ref(database, `rooms/${this.currentRoomId}/powerupEvents`);
        onValue(powerupRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const events = snapshot.val();
            for (const [eventId, event] of Object.entries(events)) {
                if (event.playerId === this.playerId) continue;
                if (Date.now() - event.timestamp > 1000) {
                    remove(ref(database, `rooms/${this.currentRoomId}/powerupEvents/${eventId}`));
                    continue;
                }
                
                // Sync powerup count
                if (typeof powerUp !== 'undefined' && powerUp.length > event.remaining) {
                    const toRemove = powerUp.length - event.remaining;
                    for (let i = 0; i < toRemove && powerUp.length > 0; i++) {
                        const removed = powerUp.pop();
                        if (removed && typeof Matter !== 'undefined') {
                            Matter.World.remove(engine.world, removed);
                        }
                    }
                    console.log(`Synced powerup collection from ${this.currentRoom?.players?.[event.playerId]?.name}`);
                }
                
                remove(ref(database, `rooms/${this.currentRoomId}/powerupEvents/${eventId}`));
            }
        });
        
        // Sync powerup spawns (host only)
        if (this.isHost && typeof powerUps !== 'undefined' && powerUps.spawn) {
            const originalSpawn = powerUps.spawn;
            powerUps.spawn = (x, y, type, size) => {
                originalSpawn.call(powerUps, x, y, type, size);
                
                // Notify other players
                const spawnRef = push(ref(database, `rooms/${this.currentRoomId}/powerupSpawns`));
                set(spawnRef, {
                    x: x,
                    y: y,
                    type: type,
                    size: size || 'normal',
                    timestamp: Date.now()
                });
            };
        }
        
        // Listen for powerup spawns (non-host)
        if (!this.isHost) {
            const spawnRef = ref(database, `rooms/${this.currentRoomId}/powerupSpawns`);
            onValue(spawnRef, (snapshot) => {
                if (!snapshot.exists()) return;
                
                const spawns = snapshot.val();
                for (const [spawnId, spawn] of Object.entries(spawns)) {
                    if (Date.now() - spawn.timestamp > 1000) {
                        remove(ref(database, `rooms/${this.currentRoomId}/powerupSpawns/${spawnId}`));
                        continue;
                    }
                    
                    // Spawn powerup locally
                    if (typeof powerUps !== 'undefined' && powerUps.spawn) {
                        powerUps.spawn(spawn.x, spawn.y, spawn.type, spawn.size);
                        console.log(`Spawned powerup: ${spawn.type} at (${spawn.x}, ${spawn.y})`);
                    }
                    
                    remove(ref(database, `rooms/${this.currentRoomId}/powerupSpawns/${spawnId}`));
                }
            });
        }
    },
    
    async notifyPowerupCollection(data) {
        if (!this.currentRoomId) return;
        
        try {
            const eventRef = push(ref(database, `rooms/${this.currentRoomId}/powerupEvents`));
            await set(eventRef, data);
        } catch (error) {
            console.error('Failed to notify powerup collection:', error);
        }
    },
    
    // ===== RENDERING =====
    hookRenderLoop() {
        if (typeof simulation === 'undefined' || !simulation.normalLoop) return;
        
        // Hook into the main game loop instead of simulation.draw
        const originalNormalLoop = simulation.normalLoop;
        simulation.normalLoop = () => {
            originalNormalLoop.call(simulation);
            this.renderRemotePlayers();
        };
    },
    
    renderRemotePlayers() {
        if (!ctx || !simulation.isMultiplayer) return;
        
        for (const [playerId, remote] of Object.entries(this.remotePlayers)) {
            if (!remote.x || !remote.y) continue;
            
            ctx.save();
            ctx.translate(remote.x, remote.y);
            
            // Draw legs
            ctx.fillStyle = remote.fillColor || remote.color;
            const legAngle = Math.sin(remote.timestamp / 100) * 0.3;
            
            ctx.save();
            ctx.rotate(legAngle);
            ctx.beginPath();
            ctx.arc(12, 15, 7, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
            
            ctx.save();
            ctx.rotate(-legAngle);
            ctx.beginPath();
            ctx.arc(-12, 15, 7, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
            
            // Draw body
            ctx.rotate(remote.angle || 0);
            ctx.beginPath();
            ctx.arc(0, 0, remote.radius || 30, 0, 2 * Math.PI);
            
            const grd = ctx.createLinearGradient(-30, 0, 30, 0);
            grd.addColorStop(0, this.darkenColor(remote.fillColor || remote.color));
            grd.addColorStop(1, remote.fillColor || remote.color);
            ctx.fillStyle = grd;
            ctx.fill();
            
            // Draw eye
            ctx.beginPath();
            ctx.arc(15, 0, 4, 0, 2 * Math.PI);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
            
            // Draw name
            ctx.fillStyle = remote.nameColor;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText(remote.name, remote.x, remote.y - 55);
            ctx.fillText(remote.name, remote.x, remote.y - 55);
            
            // Draw health bar
            if (remote.health && remote.maxHealth) {
                const barWidth = 60;
                const barHeight = 5;
                const barX = remote.x - 30;
                const barY = remote.y - 45;
                
                ctx.fillStyle = '#333';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                ctx.fillStyle = '#0f0';
                ctx.fillRect(barX, barY, barWidth * (remote.health / remote.maxHealth), barHeight);
            }
        }
    },
    
    darkenColor(color) {
        if (!color || typeof color !== 'string') return '#666666';
        
        // Handle HSL colors
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const h = parseInt(match[1]);
                const s = parseInt(match[2]);
                const l = Math.max(0, parseInt(match[3]) - 25); // Darken by reducing lightness
                return `hsl(${h}, ${s}%, ${l}%)`;
            }
        }
        
        // Handle hex colors
        const hex = color.replace('#', '');
        if (hex.length !== 6) return '#666666'; // Invalid hex
        
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 40);
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 40);
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 40);
        
        if (isNaN(r) || isNaN(g) || isNaN(b)) return '#666666'; // Safety check
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
};

// Expose globally
window.multiplayerSystem = multiplayerSystem;

// Initialize when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Multiplayer system loaded');
    });
} else {
    console.log('Multiplayer system loaded');
}

export default multiplayerSystem;