// Multiplayer system for {n/m}
import { database, ref, set, get, onValue, push, remove, update, onDisconnect } from './firebase-config.js';

const multiplayerSystem = {
    currentRoom: null,
    currentRoomId: null,
    playerId: null,
    isHost: false,
    playerData: {
        name: '',
        color: '#00ccff',
        nameColor: '#ffffff'
    },
    
    init() {
        // Generate unique player ID
        this.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        
        // Load saved player data from localStorage
        const savedName = localStorage.getItem('mp_player_name');
        const savedColor = localStorage.getItem('mp_player_color');
        const savedNameColor = localStorage.getItem('mp_player_name_color');
        
        if (savedName) {
            document.getElementById('player-name').value = savedName;
            this.playerData.name = savedName;
        }
        if (savedColor) {
            document.getElementById('player-color').value = savedColor;
            this.playerData.color = savedColor;
        }
        if (savedNameColor) {
            document.getElementById('player-name-color').value = savedNameColor;
            this.playerData.nameColor = savedNameColor;
        }
        
        // Setup event listeners
        document.getElementById('room-private').addEventListener('change', (e) => {
            document.getElementById('room-password-container').style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Listen for public rooms
        this.listenForPublicRooms();
    },
    
    generateRoomCode() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    },
    
    async createRoom() {
        const roomName = document.getElementById('room-name').value.trim() || 'Unnamed Room';
        const isPrivate = document.getElementById('room-private').checked;
        const password = document.getElementById('room-password').value;
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        const playerColor = document.getElementById('player-color').value;
        const nameColor = document.getElementById('player-name-color').value;
        
        // Save player data
        this.playerData.name = playerName;
        this.playerData.color = playerColor;
        this.playerData.nameColor = nameColor;
        localStorage.setItem('mp_player_name', playerName);
        localStorage.setItem('mp_player_color', playerColor);
        localStorage.setItem('mp_player_name_color', nameColor);
        
        const roomCode = this.generateRoomCode();
        const roomId = 'room_' + Date.now();
        
        const roomData = {
            name: roomName,
            code: roomCode,
            host: this.playerId,
            isPrivate: isPrivate,
            password: isPrivate ? password : null,
            maxPlayers: 10,
            createdAt: Date.now(),
            gameSettings: {
                mode: 'progressive',
                difficulty: 2,
                level: 0,
                oneLife: false
            },
            players: {
                [this.playerId]: {
                    name: playerName,
                    color: playerColor,
                    nameColor: nameColor,
                    isHost: true,
                    isAlive: true,
                    joinedAt: Date.now()
                }
            }
        };
        
        try {
            await set(ref(database, 'rooms/' + roomId), roomData);
            
            // Setup disconnect handler to remove player when they leave
            const playerRef = ref(database, `rooms/${roomId}/players/${this.playerId}`);
            onDisconnect(playerRef).remove();
            
            this.currentRoomId = roomId;
            this.currentRoom = roomData;
            this.isHost = true;
            
            this.showRoomSettings(roomData, roomCode);
            this.listenToRoomUpdates(roomId);
        } catch (error) {
            console.error('Error creating room:', error);
            alert('Failed to create room. Please try again.');
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
            let targetRoomId = null;
            let targetRoom = null;
            
            for (const [roomId, room] of Object.entries(rooms)) {
                if (room.code === roomCode) {
                    targetRoomId = roomId;
                    targetRoom = room;
                    break;
                }
            }
            
            if (!targetRoom) {
                alert('Room not found');
                return;
            }
            
            this.joinRoom(targetRoomId, targetRoom);
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room. Please try again.');
        }
    },
    
    async joinRoom(roomId, roomData) {
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        const playerColor = document.getElementById('player-color').value;
        const nameColor = document.getElementById('player-name-color').value;
        
        // Check if room is full
        const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
        if (playerCount >= roomData.maxPlayers) {
            alert('Room is full');
            return;
        }
        
        // Check password if private
        if (roomData.isPrivate) {
            const password = prompt('Enter room password:');
            if (password !== roomData.password) {
                alert('Incorrect password');
                return;
            }
        }
        
        // Save player data
        this.playerData.name = playerName;
        this.playerData.color = playerColor;
        this.playerData.nameColor = nameColor;
        localStorage.setItem('mp_player_name', playerName);
        localStorage.setItem('mp_player_color', playerColor);
        localStorage.setItem('mp_player_name_color', nameColor);
        
        try {
            await set(ref(database, `rooms/${roomId}/players/${this.playerId}`), {
                name: playerName,
                color: playerColor,
                nameColor: nameColor,
                isHost: false,
                isAlive: true,
                joinedAt: Date.now()
            });
            
            // Setup disconnect handler
            const playerRef = ref(database, `rooms/${roomId}/players/${this.playerId}`);
            onDisconnect(playerRef).remove();
            
            this.currentRoomId = roomId;
            this.currentRoom = roomData;
            this.isHost = false;
            
            this.showRoomSettings(roomData, roomData.code);
            this.listenToRoomUpdates(roomId);
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room. Please try again.');
        }
    },
    
    listenToRoomUpdates(roomId) {
        const roomRef = ref(database, 'rooms/' + roomId);
        onValue(roomRef, (snapshot) => {
            if (!snapshot.exists()) {
                // Room was deleted
                alert('Room has been closed');
                this.leaveRoom();
                return;
            }
            
            const roomData = snapshot.val();
            this.currentRoom = roomData;
            
            // Update players list
            this.updatePlayersList(roomData.players);
            
            // Update game settings if not host
            if (!this.isHost && roomData.gameSettings) {
                document.getElementById('mp-game-mode').value = roomData.gameSettings.mode;
                document.getElementById('mp-difficulty').value = roomData.gameSettings.difficulty;
                document.getElementById('mp-level').value = roomData.gameSettings.level;
                document.getElementById('mp-one-life').checked = roomData.gameSettings.oneLife;
            }
            
            // Check if game started
            if (roomData.gameStarted) {
                this.startMultiplayerGame(roomData.gameSettings);
            }
        });
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
                display: flex;
                align-items: center;
                justify-content: space-between;
            `;
            
            const playerInfo = document.createElement('div');
            playerInfo.innerHTML = `
                <div style="color: ${player.nameColor}; font-weight: bold; font-size: 1.1em;">${player.name}</div>
                <div style="color: rgba(255,255,255,0.8); font-size: 0.85em;">${player.isHost ? '👑 Host' : 'Player'}</div>
            `;
            
            playerCard.appendChild(playerInfo);
            
            // Add kick/ban buttons for host
            if (this.isHost && playerId !== this.playerId) {
                const actions = document.createElement('div');
                actions.style.cssText = 'display: flex; gap: 5px;';
                
                const kickBtn = document.createElement('button');
                kickBtn.textContent = '🚫';
                kickBtn.className = 'SVG-button';
                kickBtn.style.cssText = 'padding: 5px 10px; background: #f44; color: #fff;';
                kickBtn.onclick = () => this.kickPlayer(playerId);
                
                actions.appendChild(kickBtn);
                playerCard.appendChild(actions);
            }
            
            playersList.appendChild(playerCard);
        });
    },
    
    async kickPlayer(playerId) {
        if (!this.isHost) return;
        
        try {
            await remove(ref(database, `rooms/${this.currentRoomId}/players/${playerId}`));
        } catch (error) {
            console.error('Error kicking player:', error);
        }
    },
    
    showRoomSettings(roomData, roomCode) {
        document.getElementById('multiplayer-lobby').style.display = 'none';
        document.getElementById('room-settings').style.display = 'block';
        document.getElementById('current-room-name').textContent = roomData.name;
        document.getElementById('current-room-code').textContent = roomCode;
        
        // Show/hide host settings
        const hostSettings = document.getElementById('host-settings');
        const startBtn = document.getElementById('start-game-btn');
        if (this.isHost) {
            hostSettings.style.display = 'block';
            startBtn.style.display = 'block';
            
            // Setup game settings listeners
            ['mp-game-mode', 'mp-difficulty', 'mp-level', 'mp-one-life'].forEach(id => {
                const elem = document.getElementById(id);
                elem.addEventListener('change', () => this.updateGameSettings());
            });
        } else {
            hostSettings.style.display = 'none';
            startBtn.style.display = 'none';
            
            // Disable inputs for non-hosts
            ['mp-game-mode', 'mp-difficulty', 'mp-level', 'mp-one-life'].forEach(id => {
                document.getElementById(id).disabled = true;
            });
        }
    },
    
    async updateGameSettings() {
        if (!this.isHost) return;
        
        const settings = {
            mode: document.getElementById('mp-game-mode').value,
            difficulty: parseInt(document.getElementById('mp-difficulty').value),
            level: parseInt(document.getElementById('mp-level').value),
            oneLife: document.getElementById('mp-one-life').checked
        };
        
        try {
            await update(ref(database, `rooms/${this.currentRoomId}/gameSettings`), settings);
        } catch (error) {
            console.error('Error updating game settings:', error);
        }
    },
    
    async startGame() {
        if (!this.isHost) return;
        
        try {
            await update(ref(database, `rooms/${this.currentRoomId}`), {
                gameStarted: true
            });
        } catch (error) {
            console.error('Error starting game:', error);
        }
    },
    
    startMultiplayerGame(settings) {
        // Prevent multiple initializations
        if (this.isGameStarted) {
            console.log('Game already started, ignoring...');
            return;
        }
        this.isGameStarted = true;
        
        // Hide room settings
        document.getElementById('room-settings').style.display = 'none';
        
        // Set game difficulty
        simulation.difficultyMode = settings.difficulty;
        
        // Start the game based on mode
        if (settings.mode === 'progressive') {
            // Start progressive mode - lore is handled automatically in simulation.startGame()
            simulation.startGame();
        } else {
            // Start adventure mode
            simulation.startGame();
        }
        
        // Store multiplayer settings
        simulation.isMultiplayer = true;
        simulation.multiplayerSettings = settings;
        simulation.multiplayerRoomId = this.currentRoomId;
        
        // Initialize multiplayer gameplay after ensuring player is spawned
        setTimeout(() => {
            // Wait for player to be properly initialized
            if (player && m && !this.isInitialized) {
                this.isInitialized = true;
                this.initMultiplayerGameplay();
            } else if (!this.isInitialized) {
                // Retry after another small delay
                setTimeout(() => {
                    if (!this.isInitialized) {
                        this.isInitialized = true;
                        this.initMultiplayerGameplay();
                    }
                }, 200);
            }
        }, 200);
    },
    
    // ===== MULTIPLAYER GAMEPLAY SYSTEM =====
    remotePlayers: {},
    positionUpdateInterval: null,
    isGhost: false,
    isGameStarted: false,
    isInitialized: false,
    
    initMultiplayerGameplay() {
        console.log('🚀 INITIALIZING MULTIPLAYER GAMEPLAY');
        console.log('🚀 Current room ID:', this.currentRoomId);
        console.log('🚀 Player ID:', this.playerId);
        
        // Start syncing player position
        this.startPositionSync();
        
        // Listen for other players' positions
        this.listenToPlayerPositions();
        
        // Listen for player deaths
        this.listenToPlayerDeaths();
        
        // Add revival powerup to spawn pool
        this.addRevivalPowerup();
        
        console.log('✅ Multiplayer initialized successfully');
    },
    
    startPositionSync() {
        // Clear any existing interval
        if (this.positionUpdateInterval) {
            clearInterval(this.positionUpdateInterval);
        }
        
        // Send position every 100ms (10 times per second) - reduced from 50ms to reduce spam
        this.positionUpdateInterval = setInterval(() => {
            if (!m || !player || !player.position || !this.currentRoomId) return;
            
            // Ensure we have valid position data
            if (typeof player.position.x !== 'number' || typeof player.position.y !== 'number' || 
                isNaN(player.position.x) || isNaN(player.position.y)) {
                return;
            }
            
            const playerState = {
                x: Math.round(player.position.x * 100) / 100, // Round to reduce data size
                y: Math.round(player.position.y * 100) / 100,
                vx: Math.round(player.velocity.x * 100) / 100,
                vy: Math.round(player.velocity.y * 100) / 100,
                radius: m.radius || 30,
                isAlive: m.alive !== false,
                health: m.health || 100,
                maxHealth: m.maxHealth || 100,
                timestamp: Date.now()
            };
            
            // Update player state in Firebase
            const path = `rooms/${this.currentRoomId}/playerStates/${this.playerId}`;
            console.log('📤 Sending position to Firebase:', path, playerState);
            
            set(ref(database, path), playerState)
                .then(() => {
                    console.log('✅ Position sent successfully');
                })
                .catch(err => {
                    console.error('❌ Position sync error:', err);
                });
        }, 100);
    },
    
    listenToPlayerPositions() {
        const statesRef = ref(database, `rooms/${this.currentRoomId}/playerStates`);
        console.log('🔥 Setting up Firebase listener for:', `rooms/${this.currentRoomId}/playerStates`);
        
        onValue(statesRef, (snapshot) => {
            console.log('🔥 Firebase snapshot received:', snapshot.exists(), snapshot.val());
            
            if (!snapshot.exists()) {
                console.log('❌ No player states in database');
                return;
            }
            
            const states = snapshot.val();
            console.log('✅ Received states:', states);
            console.log('🔥 Current player ID:', this.playerId);
            console.log('🔥 Available player IDs:', Object.keys(states || {}));
            
            // Update remote players
            for (const [playerId, state] of Object.entries(states)) {
                console.log('🔄 Processing player:', playerId, 'State:', state);
                
                if (playerId === this.playerId) {
                    console.log('⏭️ Skipping self:', playerId);
                    continue; // Skip self
                }
                
                // Validate state has required position data
                if (!state || typeof state.x !== 'number' || typeof state.y !== 'number') {
                    console.log('❌ Invalid state for player:', playerId, state);
                    continue;
                }
                
                if (!this.remotePlayers[playerId]) {
                    // Create new remote player with proper defaults
                    const playerName = this.currentRoom?.players?.[playerId]?.name || 'Player';
                    this.remotePlayers[playerId] = {
                        x: state.x || 0,
                        y: state.y || 0,
                        vx: state.vx || 0,
                        vy: state.vy || 0,
                        radius: state.radius || 30,
                        isAlive: state.isAlive !== false,
                        health: state.health || 100,
                        maxHealth: state.maxHealth || 100,
                        name: playerName,
                        color: this.currentRoom?.players?.[playerId]?.color || '#ff0000',
                        nameColor: this.currentRoom?.players?.[playerId]?.nameColor || '#ffffff'
                    };
                    console.log('🎮 NEW PLAYER JOINED:', playerName, 'at position', state.x, state.y);
                    console.log('🎮 Remote players now:', Object.keys(this.remotePlayers));
                } else {
                    // Update existing remote player, preserving name/color info
                    this.remotePlayers[playerId].x = state.x;
                    this.remotePlayers[playerId].y = state.y;
                    this.remotePlayers[playerId].vx = state.vx;
                    this.remotePlayers[playerId].vy = state.vy;
                    this.remotePlayers[playerId].radius = state.radius || 30;
                    this.remotePlayers[playerId].isAlive = state.isAlive !== false;
                    this.remotePlayers[playerId].health = state.health || 100;
                    this.remotePlayers[playerId].maxHealth = state.maxHealth || 100;
                    console.log('🔄 Updated player position:', this.remotePlayers[playerId].name, state.x, state.y);
                }
            }
            
            // Remove disconnected players
            for (const playerId in this.remotePlayers) {
                if (!states[playerId]) {
                    console.log('Player left:', this.remotePlayers[playerId]?.name || playerId);
                    delete this.remotePlayers[playerId];
                }
            }
        });
    },
    
    listenToPlayerDeaths() {
        const playersRef = ref(database, `rooms/${this.currentRoomId}/players`);
        onValue(playersRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const players = snapshot.val();
            let allDead = true;
            
            for (const [playerId, player] of Object.entries(players)) {
                if (player.isAlive) {
                    allDead = false;
                    break;
                }
            }
            
            // If all players dead and not in one-life mode, show game over
            if (allDead && !simulation.multiplayerSettings?.oneLife) {
                this.handleAllPlayersDead();
            }
        });
    },
    
    async onLocalPlayerDeath() {
        if (!this.currentRoomId) return;
        
        // Update player status in Firebase
        await update(ref(database, `rooms/${this.currentRoomId}/players/${this.playerId}`), {
            isAlive: false
        });
        
        // Enter ghost mode if not one-life
        if (!simulation.multiplayerSettings?.oneLife) {
            this.enterGhostMode();
        }
    },
    
    enterGhostMode() {
        this.isGhost = true;
        
        // Make player semi-transparent
        if (m && m.draw) {
            const originalDraw = m.draw;
            m.draw = function() {
                ctx.globalAlpha = 0.3;
                originalDraw.call(this);
                ctx.globalAlpha = 1.0;
                
                // Draw "GHOST" text above player
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.strokeText('👻 GHOST', this.position.x, this.position.y - this.radius - 30);
                ctx.fillText('👻 GHOST', this.position.x, this.position.y - this.radius - 30);
            };
        }
        
        // Disable damage
        if (m) {
            m.immuneCycle = Infinity;
        }
    },
    
    async revivePlayer(targetPlayerId) {
        if (!this.currentRoomId) return;
        
        // Update player status
        await update(ref(database, `rooms/${this.currentRoomId}/players/${targetPlayerId}`), {
            isAlive: true
        });
        
        // If it's the local player, exit ghost mode
        if (targetPlayerId === this.playerId) {
            this.exitGhostMode();
        }
    },
    
    exitGhostMode() {
        this.isGhost = false;
        
        // Restore player
        if (m) {
            m.alive = true;
            m.health = m.maxHealth * 0.5; // Revive with 50% health
            m.immuneCycle = m.cycle + 60; // 1 second immunity
            m.displayHealth();
        }
    },
    
    handleAllPlayersDead() {
        // Show game over screen
        alert('All players have fallen! Game Over.');
        
        // Return to lobby
        this.leaveRoom();
        simulation.isMultiplayer = false;
    },
    
    addRevivalPowerup() {
        // Add revival powerup to the powerup spawn system
        if (typeof powerUps !== 'undefined' && powerUps.spawnRandomPowerUp) {
            const originalSpawn = powerUps.spawnRandomPowerUp;
            
            powerUps.spawnRandomPowerUp = (x, y) => {
                // In multiplayer, 20% chance to spawn revival instead
                if (simulation.isMultiplayer && Math.random() < 0.2) {
                    multiplayerSystem.spawnRevivalPowerup(x, y);
                } else {
                    originalSpawn.call(powerUps, x, y);
                }
            };
        }
    },
    
    spawnRevivalPowerup(x, y) {
        // Create revival powerup
        const revivalPowerup = {
            position: { x, y },
            radius: 20,
            color: '#0f0',
            effect: () => {
                // Find a random dead player and revive them
                const deadPlayers = [];
                for (const [playerId, player] of Object.entries(this.currentRoom.players)) {
                    if (!player.isAlive) {
                        deadPlayers.push(playerId);
                    }
                }
                
                if (deadPlayers.length > 0) {
                    const randomDead = deadPlayers[Math.floor(Math.random() * deadPlayers.length)];
                    this.revivePlayer(randomDead);
                    
                    // Show message
                    const playerName = this.currentRoom.players[randomDead]?.name || 'Player';
                    console.log(`💚 ${playerName} has been revived!`);
                }
            }
        };
        
        // Add to powerups array
        if (typeof powerUp !== 'undefined' && Array.isArray(powerUp)) {
            powerUp.push(revivalPowerup);
        }
    },
    
    // Render other players
    renderRemotePlayers() {
        if (!ctx) {
            console.log('❌ No canvas context for rendering');
            return;
        }
        if (!simulation.isMultiplayer) {
            console.log('❌ Not in multiplayer mode for rendering');
            return;
        }
        
        // Debug: log remote players info more frequently
        const playerCount = Object.keys(this.remotePlayers).length;
        if (playerCount > 0) {
            console.log(`🎨 RENDERING: Found ${playerCount} remote players:`, Object.keys(this.remotePlayers));
            console.log('🎨 Remote players data:', this.remotePlayers);
        } else {
            console.log('🎨 RENDERING: No remote players found');
        }
        
        for (const [playerId, player] of Object.entries(this.remotePlayers)) {
            // Check for valid position data
            if (!player || typeof player.x !== 'number' || typeof player.y !== 'number' ||
                isNaN(player.x) || isNaN(player.y)) {
                if (Math.random() < 0.01) {
                    console.log(`Skipping invalid player data:`, player);
                }
                continue;
            }
            
            // Draw player circle
            ctx.beginPath();
            const radius = player.radius || 30;
            ctx.arc(player.x, player.y, radius, 0, 2 * Math.PI);
            
            // Debug: log occasionally when rendering
            if (Math.random() < 0.001) {
                console.log(`Rendering player ${player.name} at (${player.x}, ${player.y})`);
            }
            
            if (player.isAlive) {
                ctx.fillStyle = player.color || '#ff0000';
                ctx.globalAlpha = 0.8; // Increased opacity
            } else {
                // Ghost appearance
                ctx.fillStyle = '#888';
                ctx.globalAlpha = 0.5; // Increased opacity
            }
            
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            
            // Draw health bar
            if (player.isAlive && player.health && player.maxHealth) {
                const barWidth = player.radius * 2;
                const barHeight = 5;
                const barX = player.x - player.radius;
                const barY = player.y - player.radius - 15;
                
                // Background
                ctx.fillStyle = '#333';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Health
                ctx.fillStyle = '#0f0';
                ctx.fillRect(barX, barY, barWidth * (player.health / player.maxHealth), barHeight);
            }
            
            // Draw nametag
            const displayName = player.name || 'Player';
            const nameY = player.y - radius - (player.isAlive ? 25 : 35);
            
            // Make nametag more visible
            ctx.fillStyle = player.nameColor || '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.font = 'bold 16px Arial'; // Increased font size
            ctx.textAlign = 'center';
            
            // Draw text with outline for better visibility
            ctx.strokeText(displayName, player.x, nameY);
            ctx.fillText(displayName, player.x, nameY);
        }
    },
    
    async leaveRoom() {
        if (!this.currentRoomId) return;
        
        try {
            // Clear position sync interval
            if (this.positionUpdateInterval) {
                clearInterval(this.positionUpdateInterval);
                this.positionUpdateInterval = null;
            }
            
            // Clear remote players
            this.remotePlayers = {};
            
            // Remove player from room
            await remove(ref(database, `rooms/${this.currentRoomId}/players/${this.playerId}`));
            
            // If host, delete the entire room
            if (this.isHost) {
                await remove(ref(database, `rooms/${this.currentRoomId}`));
            }
            
            this.currentRoomId = null;
            this.currentRoom = null;
            this.isHost = false;
            
            // Reset initialization flags
            this.isGameStarted = false;
            this.isInitialized = false;
            
            // Return to lobby
            document.getElementById('room-settings').style.display = 'none';
            document.getElementById('multiplayer-lobby').style.display = 'block';
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    },
    
    listenForPublicRooms() {
        const roomsRef = ref(database, 'rooms');
        onValue(roomsRef, (snapshot) => {
            const roomList = document.getElementById('room-list');
            roomList.innerHTML = '';
            
            if (!snapshot.exists()) {
                roomList.innerHTML = '<p style="text-align: center; color: #999;">No public rooms available</p>';
                return;
            }
            
            const rooms = snapshot.val();
            const publicRooms = Object.entries(rooms).filter(([_, room]) => !room.isPrivate);
            
            if (publicRooms.length === 0) {
                roomList.innerHTML = '<p style="text-align: center; color: #999;">No public rooms available</p>';
                return;
            }
            
            publicRooms.forEach(([roomId, room]) => {
                const playerCount = room.players ? Object.keys(room.players).length : 0;
                
                const roomCard = document.createElement('div');
                roomCard.className = 'SVG-button';
                roomCard.style.cssText = `
                    padding: 10px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    text-align: left;
                `;
                roomCard.innerHTML = `
                    <div style="font-weight: bold;">${room.name}</div>
                    <div style="font-size: 0.85em; color: #666;">
                        Players: ${playerCount}/${room.maxPlayers} | Code: ${room.code}
                    </div>
                `;
                roomCard.onclick = () => this.joinRoom(roomId, room);
                
                roomList.appendChild(roomCard);
            });
        });
    }
};

// Expose globally for onclick handlers
window.multiplayerSystem = multiplayerSystem;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Multiplayer system loaded');
    });
} else {
    console.log('Multiplayer system loaded');
}

export default multiplayerSystem;
