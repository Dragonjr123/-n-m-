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
            
            // Initialize map generation sync immediately when creating room
            this.initMapGenerationSync();
            
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
            
            // Initialize map generation sync immediately when joining room
            this.initMapGenerationSync();
            
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
            ['mp-game-mode', 'mp-difficulty', 'mp-level', 'mp-one-life', 'mp-shared-level-progression'].forEach(id => {
                const elem = document.getElementById(id);
                elem.addEventListener('change', () => this.updateGameSettings());
            });
        } else {
            hostSettings.style.display = 'none';
            startBtn.style.display = 'none';
            
            // Disable inputs for non-hosts
            ['mp-game-mode', 'mp-difficulty', 'mp-level', 'mp-one-life', 'mp-shared-level-progression'].forEach(id => {
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
            oneLife: document.getElementById('mp-one-life').checked,
            sharedLevelProgression: document.getElementById('mp-shared-level-progression').checked
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
        
        // Hook into startGame to ensure map sync happens before isHorizontalFlipped is set
        this.hookGameStartup();
        
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
    
    hookGameStartup() {
        // Hook into simulation to override isHorizontalFlipped assignment
        if (typeof simulation !== 'undefined') {
            // Wait a tick to ensure we can override the assignment in startGame
            setTimeout(() => {
                // Override the random assignment with our synchronized value
                if (this.isHost && this.masterSeed !== undefined) {
                    // Host already has the seed set, just ensure it's applied
                    console.log('Host applying synchronized map seed before startGame');
                } else {
                    // For clients, we need to wait for the seed to arrive and then override
                    this.waitForMapSeed();
                }
            }, 10);
        }
    },
    
    waitForMapSeed() {
        // Clients need to wait for the map seed to arrive before startGame sets random value
        const checkForSeed = () => {
            if (this.masterSeed !== undefined && typeof simulation !== 'undefined') {
                console.log('Client applying synchronized map seed before startGame');
                // The seed will be applied by listenToMapGeneration when it arrives
                return;
            }
            
            // Keep checking for up to 2 seconds
            setTimeout(checkForSeed, 100);
        };
        checkForSeed();
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
        
        // Initialize powerup synchronization
        this.initPowerupSync();
        
        // Initialize level synchronization
        this.initLevelSync();
        
        // Initialize tech and physics synchronization
        this.initTechAndPhysicsSync();
        
        // Initialize comprehensive physics synchronization
        this.initComprehensivePhysicsSync();
        
        // Map generation synchronization is initialized earlier when joining/creating room
        
        // Initialize comprehensive game state synchronization
        this.initComprehensiveGameSync();
        
        // Fix bullet safety to prevent crashes
        this.fixBulletSafety();
        
        console.log('✅ Multiplayer initialized successfully');
    },
    
    fixBulletSafety() {
        // Hook into bulletDo to prevent crashes from bullets without do function
        if (typeof b !== 'undefined' && typeof b.bulletDo === 'function') {
            const originalBulletDo = b.bulletDo;
            b.bulletDo = function() {
                // Clean up any bullets that don't have the required do function
                if (typeof bullet !== 'undefined') {
                    for (let i = bullet.length - 1; i >= 0; i--) {
                        if (bullet[i] && typeof bullet[i].do !== 'function') {
                            console.log('Removing bullet without do function at index', i);
                            // Remove the problematic bullet
                            if (typeof engine !== 'undefined' && typeof Matter !== 'undefined') {
                                try {
                                    Matter.World.remove(engine.world, bullet[i]);
                                } catch (error) {
                                    console.warn('Error removing bullet:', error);
                                }
                            }
                            bullet.splice(i, 1);
                        }
                    }
                }
                
                // Call original function
                return originalBulletDo.call(b);
            };
            console.log('✅ Bullet safety fix applied');
        }
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
                // Player model data for proper rendering
                angle: Math.round((m.angle || 0) * 100) / 100,
                walkCycle: Math.round((m.walk_cycle || 0) * 100) / 100,
                yOff: Math.round((m.yOff || 70) * 100) / 100,
                onGround: m.onGround || false,
                immuneCycle: m.immuneCycle || 0,
                cycle: m.cycle || 0,
                fillColor: m.fillColor || '#ff0000',
                fillColorDark: m.fillColorDark || '#cc0000',
                Vx: Math.round((m.Vx || 0) * 100) / 100, // Movement speed for animation
                timestamp: Date.now()
            };
            
            // Update player state in Firebase
            const path = `rooms/${this.currentRoomId}/playerStates/${this.playerId}`;
            
            set(ref(database, path), playerState)
                .catch(err => {
                    // Only log errors occasionally to reduce spam
                    if (Math.random() < 0.01) {
                        console.error('❌ Position sync error:', err);
                    }
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
            
            // Debug: log occasionally to reduce spam
            if (Math.random() < 0.01) {
                console.log('✅ Received states:', states);
                console.log('🔥 Current player ID:', this.playerId);
                console.log('🔥 Available player IDs:', Object.keys(states || {}));
            }
            
            // Update remote players
            for (const [playerId, state] of Object.entries(states)) {
                if (playerId === this.playerId) {
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
                        nameColor: this.currentRoom?.players?.[playerId]?.nameColor || '#ffffff',
                        // Player model data
                        angle: state.angle || 0,
                        walkCycle: state.walkCycle || 0,
                        yOff: state.yOff || 70,
                        onGround: state.onGround || false,
                        immuneCycle: state.immuneCycle || 0,
                        cycle: state.cycle || 0,
                        fillColor: state.fillColor || '#ff0000',
                        fillColorDark: state.fillColorDark || '#cc0000',
                        Vx: state.Vx || 0,
                        lastUpdate: Date.now()
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
                    // Update player model data
                    this.remotePlayers[playerId].angle = state.angle || 0;
                    this.remotePlayers[playerId].walkCycle = state.walkCycle || 0;
                    this.remotePlayers[playerId].yOff = state.yOff || 70;
                    this.remotePlayers[playerId].onGround = state.onGround || false;
                    this.remotePlayers[playerId].immuneCycle = state.immuneCycle || 0;
                    this.remotePlayers[playerId].cycle = state.cycle || 0;
                    this.remotePlayers[playerId].fillColor = state.fillColor || '#ff0000';
                    this.remotePlayers[playerId].fillColorDark = state.fillColorDark || '#cc0000';
                    this.remotePlayers[playerId].Vx = state.Vx || 0;
                    this.remotePlayers[playerId].lastUpdate = Date.now();
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
        
        // Debug: log remote players info occasionally
        const playerCount = Object.keys(this.remotePlayers).length;
        if (playerCount > 0 && Math.random() < 0.01) {
            console.log(`🎨 RENDERING: Found ${playerCount} remote players:`, Object.keys(this.remotePlayers));
        }
        
        for (const [playerId, remotePlayer] of Object.entries(this.remotePlayers)) {
            // Check for valid position data
            if (!remotePlayer || typeof remotePlayer.x !== 'number' || typeof remotePlayer.y !== 'number' ||
                isNaN(remotePlayer.x) || isNaN(remotePlayer.y)) {
                if (Math.random() < 0.01) {
                    console.log(`❌ Skipping invalid player data:`, remotePlayer);
                }
                continue;
            }
            
            // Debug: log occasionally when rendering (reduced frequency)
            if (Math.random() < 0.001) {
                console.log(`🎨 Rendering ${remotePlayer.name} at (${remotePlayer.x}, ${remotePlayer.y})`);
            }
            
            // Render actual player model for remote player
            this.drawRemotePlayerModel(remotePlayer);
        }
    },
    
    // Draw actual player model for remote players
    drawRemotePlayerModel(remotePlayer) {
        ctx.fillStyle = remotePlayer.fillColor || '#ff0000';
        
        // Apply immunity transparency
        const isImmune = remotePlayer.cycle < (remotePlayer.immuneCycle || 0);
        ctx.save();
        ctx.globalAlpha = remotePlayer.isAlive ? (isImmune ? 0.5 : 1.0) : 0.3;
        ctx.translate(remotePlayer.x, remotePlayer.y);

        // Draw legs
        this.drawRemotePlayerLegs(remotePlayer);

        // Rotate and draw body
        ctx.rotate(remotePlayer.angle || 0);
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, 2 * Math.PI);
        let grd = ctx.createLinearGradient(-30, 0, 30, 0);
        grd.addColorStop(0, remotePlayer.fillColorDark || '#cc0000');
        grd.addColorStop(1, remotePlayer.fillColor || '#ff0000');
        ctx.fillStyle = grd;
            ctx.fill();
        
        // Draw eye/direction indicator
        ctx.beginPath();
        ctx.arc(15, 0, 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();

        // Draw health bar first (isolated from field effects)
        if (remotePlayer.isAlive && remotePlayer.health && remotePlayer.maxHealth) {
            ctx.save();
            const barWidth = 60;
                const barHeight = 5;
            const barX = remotePlayer.x - 30;
            const barY = remotePlayer.y - 50;
                
                // Background
                ctx.fillStyle = '#333';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Health
                ctx.fillStyle = '#0f0';
            ctx.fillRect(barX, barY, barWidth * (remotePlayer.health / remotePlayer.maxHealth), barHeight);
            ctx.restore();
        }
            
        // Draw nametag (isolated from field effects)
        ctx.save();
        const displayName = remotePlayer.name || 'Player';
        const nameY = remotePlayer.y - 55;
        
        ctx.fillStyle = remotePlayer.nameColor || '#ffffff';
        ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
        ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
        ctx.globalAlpha = 1.0; // Ensure nametag is fully visible
        
        // Draw text with outline for better visibility
        ctx.strokeText(displayName, remotePlayer.x, nameY);
        ctx.fillText(displayName, remotePlayer.x, nameY);
        ctx.restore();
        
        // Draw field effects LAST to prevent interference with health/nametag
        this.drawRemotePlayerField(remotePlayer);
    },
    
    drawRemotePlayerField(remotePlayer) {
        // Draw field effects for remote players
        if (!remotePlayer.fieldEffects || remotePlayer.fieldEffects.length === 0) return;
        
        ctx.save();
        
        try {
            // Get the most recent field effect
            const latestField = remotePlayer.fieldEffects[remotePlayer.fieldEffects.length - 1];
            if (!latestField || Date.now() - latestField.timestamp > 500) {
                ctx.restore();
                return;
            }
            
            // Validate field data before drawing
            if (typeof latestField.angle !== 'number' || typeof remotePlayer.x !== 'number' || typeof remotePlayer.y !== 'number') {
                ctx.restore();
                return;
            }
            
            // Draw field similar to m.drawField but for remote player
            const fieldRange = 100; // Approximate field range
            const energy = Math.min(latestField.energy || 0.5, 1);
            
            // Set field colors
            ctx.fillStyle = `rgba(110,170,200,${0.02 + energy * 0.15})`;
            ctx.strokeStyle = `rgba(110, 200, 235, 0.6)`;
            ctx.lineWidth = 2;
            ctx.lineCap = "butt";
            
            // Draw field arc
            ctx.beginPath();
            const fieldArc = 0.8; // Approximate field arc
            const startAngle = latestField.angle - Math.PI * fieldArc;
            const endAngle = latestField.angle + Math.PI * fieldArc;
            
            if (!isNaN(startAngle) && !isNaN(endAngle)) {
                ctx.arc(remotePlayer.x, remotePlayer.y, fieldRange, startAngle, endAngle, false);
                ctx.stroke();
            }
            
            // Draw field fill area with proper path management
            ctx.beginPath();
            const eye = 13;
            const aMag = 0.75 * Math.PI * fieldArc;
            
            // Start path from center
            ctx.moveTo(remotePlayer.x, remotePlayer.y);
            
            // Add quadratic curves for field shape
            let a = latestField.angle + aMag;
            let cp1x = remotePlayer.x + 0.6 * fieldRange * Math.cos(a);
            let cp1y = remotePlayer.y + 0.6 * fieldRange * Math.sin(a);
            
            if (!isNaN(cp1x) && !isNaN(cp1y)) {
                const endX = remotePlayer.x + eye * Math.cos(latestField.angle);
                const endY = remotePlayer.y + eye * Math.sin(latestField.angle);
                
                if (!isNaN(endX) && !isNaN(endY)) {
                    ctx.quadraticCurveTo(cp1x, cp1y, endX, endY);
                }
            }
            
            a = latestField.angle - aMag;
            cp1x = remotePlayer.x + 0.6 * fieldRange * Math.cos(a);
            cp1y = remotePlayer.y + 0.6 * fieldRange * Math.sin(a);
            
            if (!isNaN(cp1x) && !isNaN(cp1y)) {
                const endX2 = remotePlayer.x + fieldRange * Math.cos(latestField.angle - Math.PI * fieldArc);
                const endY2 = remotePlayer.y + fieldRange * Math.sin(latestField.angle - Math.PI * fieldArc);
                
                if (!isNaN(endX2) && !isNaN(endY2)) {
                    ctx.quadraticCurveTo(cp1x, cp1y, endX2, endY2);
                }
            }
            
            // Close path and fill
            ctx.closePath();
            ctx.fill();
            
            // If grabbing, add grab effect indicator
            if (latestField.isGrabbing) {
                ctx.save();
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(remotePlayer.x, remotePlayer.y, 50, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
            }
            
        } catch (error) {
            console.error('Error drawing remote player field:', error);
        } finally {
            // Ensure canvas state is always restored
            ctx.restore();
        }
    },
    
    // Draw legs for remote player (simplified version of m.drawLeg)
    drawRemotePlayerLegs(remotePlayer) {
        // Calculate simplified leg positions based on walk cycle and movement
        const walkCycle = remotePlayer.walkCycle || 0;
        const Vx = remotePlayer.Vx || 0;
        const onGround = remotePlayer.onGround || false;
        
        // Step size similar to local player calculation
        let stepSize = 7 * Math.sqrt(Math.min(9, Math.abs(Vx))) * onGround;
        
        // Calculate leg angles
        const stepAngle1 = 0.034 * walkCycle + Math.PI;
        const stepAngle2 = 0.034 * walkCycle;
        
        // Hip positions
        const hip1 = { x: 9, y: 24 };
        const hip2 = { x: 15, y: 24 };
        
        // Foot positions based on animation
        const foot1 = {
            x: 2.2 * stepSize * Math.cos(stepAngle1) - 3,
            y: 24 + 1.2 * stepSize * Math.sin(stepAngle1) + remotePlayer.yOff
        };
        const foot2 = {
            x: 2.2 * stepSize * Math.cos(stepAngle2),
            y: 24 + 1.2 * stepSize * Math.sin(stepAngle2) + remotePlayer.yOff
        };
        
        // Calculate knee positions (simplified)
        const legLength1 = 55, legLength2 = 45;
        
        // Helper function to calculate knee position
        const calcKneePos = (hip, foot) => {
            const d = Math.sqrt((hip.x - foot.x) ** 2 + (hip.y - foot.y) ** 2);
            const l = (legLength1 ** 2 - legLength2 ** 2 + d ** 2) / (2 * d);
            const h = Math.sqrt(legLength1 ** 2 - l ** 2);
            
            return {
                x: (l / d) * (foot.x - hip.x) - (h / d) * (foot.y - hip.y) + hip.x,
                y: (l / d) * (foot.y - hip.y) + (h / d) * (foot.x - hip.x) + hip.y
            };
        };
        
        const knee1 = calcKneePos(hip1, foot1);
        const knee2 = calcKneePos(hip2, foot2);
        
        // Determine leg direction based on angle
        const flipLegs = (remotePlayer.angle > -Math.PI / 2 && remotePlayer.angle < Math.PI / 2) ? 1 : -1;
        
        // Draw legs
        ctx.save();
        ctx.scale(flipLegs, 1);
        
        // First leg
        ctx.beginPath();
        ctx.moveTo(hip1.x, hip1.y);
        ctx.lineTo(knee1.x, knee1.y);
        ctx.lineTo(foot1.x, foot1.y);
        ctx.strokeStyle = "#4a4a4a";
        ctx.lineWidth = 7;
        ctx.stroke();
        
        // Toe lines
        ctx.beginPath();
        ctx.moveTo(foot1.x, foot1.y);
        ctx.lineTo(foot1.x - 15, foot1.y + 5);
        ctx.moveTo(foot1.x, foot1.y);
        ctx.lineTo(foot1.x + 15, foot1.y + 5);
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Second leg
        ctx.beginPath();
        ctx.moveTo(hip2.x, hip2.y);
        ctx.lineTo(knee2.x, knee2.y);
        ctx.lineTo(foot2.x, foot2.y);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 7;
        ctx.stroke();
        
        // Toe lines
        ctx.beginPath();
        ctx.moveTo(foot2.x, foot2.y);
        ctx.lineTo(foot2.x - 15, foot2.y + 5);
        ctx.moveTo(foot2.x, foot2.y);
        ctx.lineTo(foot2.x + 15, foot2.y + 5);
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Joint circles
        ctx.beginPath();
        ctx.arc(hip1.x, hip1.y, 11, 0, 2 * Math.PI);
        ctx.arc(knee1.x, knee1.y, 7, 0, 2 * Math.PI);
        ctx.arc(foot1.x, foot1.y, 6, 0, 2 * Math.PI);
        ctx.arc(hip2.x, hip2.y, 11, 0, 2 * Math.PI);
        ctx.arc(knee2.x, knee2.y, 7, 0, 2 * Math.PI);
        ctx.arc(foot2.x, foot2.y, 6, 0, 2 * Math.PI);
        
        ctx.fillStyle = remotePlayer.fillColor || '#ff0000';
        ctx.fill();
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
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
    
    // ===== POWERUP SYNCHRONIZATION =====
    initPowerupSync() {
        // Monitor powerup collection locally and sync to Firebase
        this.monitorPowerupCollections();
        
        // Listen for powerup collections from other players
        this.listenToPowerupCollections();
        
        // Listen for powerup spawns from other players
        this.listenToPowerupSpawns();
        
        // Monitor powerup spawning for all players
        this.monitorPowerupSpawning();
    },
    
    monitorPowerupCollections() {
        // Hook into the powerup collection system
        const originalGrabPowerUp = m.grabPowerUp;
        m.grabPowerUp = () => {
            const powerUpLengthBefore = powerUp.length;
            const powerUpStatesBefore = powerUp.map((p, index) => ({ 
                index, 
                x: p.position.x, 
                y: p.position.y, 
                name: p.name,
                color: p.color,
                size: p.size,
                id: p.id || `${p.position.x}_${p.position.y}_${p.name}` 
            }));
            
            // Call original function
            originalGrabPowerUp.call(m);
            
            // Check if any powerups were collected by comparing lengths
            if (powerUp.length < powerUpLengthBefore) {
                console.log(`Player ${this.playerId} collected a powerup. Before: ${powerUpLengthBefore}, After: ${powerUp.length}`);
                
                // Find which powerup was collected by checking which ones are missing
                let collectedPowerup = null;
                for (let i = 0; i < powerUpStatesBefore.length; i++) {
                    const beforePU = powerUpStatesBefore[i];
                    let stillExists = false;
                    
                    // Check if this powerup still exists in the current array
                    for (let j = 0; j < powerUp.length; j++) {
                        if (powerUp[j] && 
                            Math.abs(powerUp[j].position.x - beforePU.x) < 50 && 
                            Math.abs(powerUp[j].position.y - beforePU.y) < 50 &&
                            powerUp[j].name === beforePU.name) {
                            stillExists = true;
                            break;
                        }
                    }
                    
                    if (!stillExists) {
                        collectedPowerup = beforePU;
                        break;
                    }
                }
                
                if (collectedPowerup) {
                    // Notify other players about the specific powerup collection
                    this.notifyPowerupCollection({
                        collectedBy: this.playerId,
                        collectedPowerup: collectedPowerup,
                        powerupType: collectedPowerup.name,
                        powerupColor: collectedPowerup.color,
                        powerupSize: collectedPowerup.size,
                        remainingCount: powerUp.length,
                        timestamp: Date.now()
                    });
                }
                
                // Also notify about physics effects (knockback, etc.)
                if (player && player.velocity && player.position) {
                    const currentVel = { x: player.velocity.x, y: player.velocity.y };
                    this.notifyPowerupPhysicsEffect({
                        playerId: this.playerId,
                        velocity: currentVel,
                        position: { x: player.position.x, y: player.position.y },
                        timestamp: Date.now()
                    });
                }
            }
        };
    },
    
    async notifyPowerupCollection(collectionData = {}) {
        if (!this.currentRoomId) return;
        
        try {
            // Send notification about powerup collection with enhanced data
            const notificationRef = push(ref(database, `rooms/${this.currentRoomId}/notifications`));
            await set(notificationRef, {
                type: 'powerup_collected',
                playerId: this.playerId,
                collectedBy: collectionData.collectedBy || this.playerId,
                collectedPowerup: collectionData.collectedPowerup || null,
                powerupType: collectionData.powerupType || null,
                powerupColor: collectionData.powerupColor || null,
                powerupSize: collectionData.powerupSize || null,
                remainingCount: collectionData.remainingCount || (typeof powerUp !== 'undefined' ? powerUp.length : 0),
                timestamp: collectionData.timestamp || Date.now()
            });
        } catch (error) {
            console.error('Failed to notify powerup collection:', error);
        }
    },
    
    listenToPowerupCollections() {
        if (!this.currentRoomId) return;
        
        const notificationsRef = ref(database, `rooms/${this.currentRoomId}/notifications`);
        onValue(notificationsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const notifications = snapshot.val();
            for (const [notificationId, notification] of Object.entries(notifications)) {
                if (notification.type === 'powerup_collected' && 
                    notification.playerId !== this.playerId && 
                    Date.now() - notification.timestamp < 5000) { // Only process recent notifications
                    
                    // Sync powerup state with other player
                    this.syncPowerupState(notification);
                    
                    // Clean up old notification
                    remove(ref(database, `rooms/${this.currentRoomId}/notifications/${notificationId}`));
                }
            }
        });
    },
    
    monitorPowerupSpawning() {
        // Hook into powerup spawning to sync spawns across players
        if (typeof powerUps !== 'undefined' && powerUps.spawn) {
            const originalSpawn = powerUps.spawn;
            this.isRemoteSpawn = false; // Flag to prevent recursive spawning
            
            powerUps.spawn = (x, y, target, moving, mode, size) => {
                // Call original spawn function
                originalSpawn.call(powerUps, x, y, target, moving, mode, size);
                
                // Only notify other players if this is not a remote spawn
                // Allow all players to notify about powerup spawns for better sync
                if (!this.isRemoteSpawn) {
                    this.notifyPowerupSpawn({
                        x: typeof x === 'number' ? Math.round(x * 100) / 100 : 0,
                        y: typeof y === 'number' ? Math.round(y * 100) / 100 : 0,
                        target: target || 'tech',
                        moving: moving !== false,
                        mode: mode || null,
                        size: size || null,
                        timestamp: Date.now()
                    });
                }
            };
        }
    },
    
    async notifyPowerupSpawn(spawnData) {
        if (!this.currentRoomId) return;
        
        try {
            const spawnRef = push(ref(database, `rooms/${this.currentRoomId}/powerupSpawns`));
            await set(spawnRef, spawnData);
        } catch (error) {
            console.error('Failed to notify powerup spawn:', error);
        }
    },
    
    listenToPowerupSpawns() {
        if (!this.currentRoomId) return;
        
        const spawnsRef = ref(database, `rooms/${this.currentRoomId}/powerupSpawns`);
        onValue(spawnsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const spawns = snapshot.val();
            for (const [spawnId, spawnData] of Object.entries(spawns)) {
                if (Date.now() - spawnData.timestamp < 1000) { // Only process recent spawns
                    // Spawn powerup locally if we don't have it (set flag to prevent recursive notification)
                    if (typeof powerUps !== 'undefined' && powerUps.spawn) {
                        this.isRemoteSpawn = true;
                        // Include all spawn parameters including size and mode
                        powerUps.spawn(
                            spawnData.x, 
                            spawnData.y, 
                            spawnData.target, 
                            spawnData.moving, 
                            spawnData.mode, 
                            spawnData.size
                        );
                        this.isRemoteSpawn = false;
                    }
                    
                    // Clean up old spawn data
                    remove(ref(database, `rooms/${this.currentRoomId}/powerupSpawns/${spawnId}`));
                }
            }
        });
    },
    
    syncPowerupState(notification = null) {
        // Force a powerup state refresh to sync with other players
        try {
            if (typeof powerUp !== 'undefined' && powerUp.length !== undefined) {
                console.log('Syncing powerup state - current powerups:', powerUp.length);
                
                // If we have notification data, try to sync more intelligently
                if (notification && notification.collectedPowerup) {
                    const collectedPU = notification.collectedPowerup;
                    
                    // Find and remove the specific powerup that was collected by another player
                    for (let i = powerUp.length - 1; i >= 0; i--) {
                        if (powerUp[i] && powerUp[i].position) {
                            const distance = Math.sqrt(
                                Math.pow(powerUp[i].position.x - collectedPU.x, 2) + 
                                Math.pow(powerUp[i].position.y - collectedPU.y, 2)
                            );
                            
                            // If powerup is close enough to the collected one and has same name, remove it
                            if (distance < 50 && powerUp[i].name === collectedPU.name) {
                                console.log(`Removing collected powerup: ${collectedPU.name} at ${collectedPU.x}, ${collectedPU.y}`);
                                
                                // Create visual effect for powerup collection
                                if (typeof simulation !== 'undefined' && simulation.drawList) {
                                    simulation.drawList.push({
                                        x: powerUp[i].position.x,
                                        y: powerUp[i].position.y,
                                        radius: powerUp[i].size || 30,
                                        color: notification.powerupColor || powerUp[i].color || "#ffffff",
                                        time: simulation.drawTime * 2
                                    });
                                }
                                
                                // Remove the powerup from physics world and array
                                if (typeof Matter !== 'undefined' && typeof engine !== 'undefined') {
                                    Matter.World.remove(engine.world, powerUp[i]);
                                }
                                powerUp.splice(i, 1);
                                break; // Only remove one matching powerup
                            }
                        }
                    }
                } else if (notification && notification.remainingCount !== undefined) {
                    const expectedCount = notification.remainingCount;
                    const currentCount = powerUp.length;
                    
                    // If we have more powerups than expected, something was collected elsewhere
                    if (currentCount > expectedCount) {
                        console.log(`Powerup sync mismatch: expected ${expectedCount}, have ${currentCount}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing powerup state:', error);
        }
    },
    
    // ===== LEVEL SYNCHRONIZATION =====
    initLevelSync() {
        // Listen for level changes from other players
        this.listenToLevelChanges();
        
        // Monitor level changes locally (for host)
        if (this.isHost) {
            this.monitorLevelChanges();
        }
    },
    
    monitorLevelChanges() {
        // Hook into level.start() to sync level transitions
        if (typeof level !== 'undefined' && level.start) {
            const originalStart = level.start;
            level.start = () => {
                // Call original function
                originalStart.call(level);
                
                // Only notify if we have permission to progress
                this.checkLevelProgressionPermission().then(hasPermission => {
                    if (hasPermission) {
                        // Notify other players about level change
                        this.notifyLevelChange({
                            currentLevel: level.onLevel || 0,
                            levelsCleared: level.levelsCleared || 0,
                            timestamp: Date.now()
                        });
                    }
                });
            };
        }
    },
    
    async notifyLevelChange(levelData) {
        if (!this.currentRoomId) return;
        
        try {
            // Update room level state
            await update(ref(database, `rooms/${this.currentRoomId}`), {
                currentLevel: levelData.currentLevel,
                levelsCleared: levelData.levelsCleared,
                levelTimestamp: levelData.timestamp
            });
        } catch (error) {
            console.error('Failed to notify level change:', error);
        }
    },
    
    listenToLevelChanges() {
        if (!this.currentRoomId) return;
        
        const roomRef = ref(database, `rooms/${this.currentRoomId}`);
        onValue(roomRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const roomData = snapshot.val();
            if (roomData.currentLevel !== undefined && 
                roomData.currentLevel !== level.onLevel && 
                roomData.levelTimestamp && 
                Date.now() - roomData.levelTimestamp < 5000) { // Only process recent changes
                
                // Check permissions before syncing
                this.checkLevelProgressionPermission().then(hasPermission => {
                    if (hasPermission) {
                        // Sync to the new level
                        this.syncToLevel(roomData.currentLevel, roomData.levelsCleared);
                    } else {
                        console.log('Level progression denied - shared progression is disabled');
                    }
                });
            }
        });
    },
    
    syncToLevel(targetLevel, targetLevelsCleared) {
        if (typeof level === 'undefined') return;
        
        console.log(`Syncing to level ${targetLevel}, cleared: ${targetLevelsCleared}`);
        
        // Update local level state
        level.onLevel = targetLevel;
        level.levelsCleared = targetLevelsCleared;
        
        // Clear current map and restart with synchronized level
        if (typeof simulation !== 'undefined' && simulation.clearNow !== undefined) {
            simulation.clearNow = true;
        }
    },
    
    // ===== TECH AND PHYSICS SYNCHRONIZATION =====
    initTechAndPhysicsSync() {
        // Monitor tech ability usage and sync effects
        this.monitorTechAbilities();
        
        // Monitor portal teleportation
        this.monitorPortalTeleportation();
        
        // Monitor field emitter object interactions (grabbing/throwing)
        this.monitorFieldEmitterInteractions();
        
        // Monitor tech-based projectile creation
        this.monitorTechProjectiles();
        
        // Listen for tech/physics events from other players
        this.listenToTechAndPhysicsEvents();
    },
    
    monitorTechProjectiles() {
        // Hook into the bullet firing system to catch tech abilities that create projectiles
        if (typeof b !== 'undefined' && b.fire) {
            // Monitor all bullet creation by hooking into the firing system
            setInterval(() => {
                if (!this.isGameStarted || typeof bullet === 'undefined') return;
                
                // This will be handled by the existing bullet monitoring, but we need to ensure
                // that tech abilities that create projectiles are properly caught
                
                // Monitor for tech-specific projectiles that might not be caught by normal monitoring
                if (typeof m !== 'undefined' && typeof tech !== 'undefined') {
                    // Check for specific tech abilities that create projectiles
                    if (tech.isWormBullets && bullet.length > 0) {
                        // Worm bullets - these need special handling
                        const recentBullets = bullet.filter(b => b && b.isInHole === true);
                        if (recentBullets.length > 0) {
                            // Notify about worm bullet teleportation
                            console.log('Worm bullet detected - should sync teleportation');
                        }
                    }
                }
            }, 100); // Check frequently for tech projectiles
        }
    },
    
    monitorTechAbilities() {
        // Monitor field usage with polling to avoid hook conflicts
        if (typeof m !== 'undefined') {
            let lastFieldActive = false;
            let lastFieldGrabbing = false;
            let lastFieldNotifiedTime = 0;
            let lastGrabNotifiedTime = 0;
            
            setInterval(() => {
                if (!this.isGameStarted) return;
                
                const now = Date.now();
                
                // Check if field is currently active
                const fieldActive = m.energy > 0.05 && input.field && m.fieldCDcycle < m.cycle;
                const fieldGrabbing = fieldActive && m && m.grabPowerUp && typeof powerUp !== 'undefined';
                
                // Validate data before sending notifications
                if (player && player.position && typeof m.angle === 'number' && typeof m.energy === 'number' && 
                    !isNaN(m.angle) && !isNaN(m.energy) && !isNaN(player.position.x) && !isNaN(player.position.y)) {
                    
                    // Only notify when field state changes, not continuously
                    // Notify when field becomes active (much longer throttle)
                    if (fieldActive && !lastFieldActive && (now - lastFieldNotifiedTime > 500)) {
                        this.notifyFieldUsage({
                            playerId: this.playerId,
                            position: { x: player.position.x, y: player.position.y },
                            angle: m.angle,
                            energy: Math.max(0, Math.min(m.energy, 1)), // Clamp energy
                            timestamp: now
                        });
                        lastFieldNotifiedTime = now;
                    }
                    
                    // Notify when field grabbing state changes (longer throttle)
                    if (fieldGrabbing !== lastFieldGrabbing && (now - lastGrabNotifiedTime > 300)) {
                        this.notifyFieldUsage({
                            playerId: this.playerId,
                            position: { x: player.position.x, y: player.position.y },
                            angle: m.angle,
                            energy: Math.max(0, Math.min(m.energy, 1)), // Clamp energy
                            isGrabbing: fieldGrabbing,
                            timestamp: now
                        });
                        lastGrabNotifiedTime = now;
                    }
                }
                
                lastFieldActive = fieldActive;
                lastFieldGrabbing = fieldGrabbing;
            }, 250); // Check less frequently to reduce spam
        }
    },
    
    async notifyFieldUsage(fieldData) {
        if (!this.currentRoomId) return;
        
        try {
            const fieldRef = push(ref(database, `rooms/${this.currentRoomId}/fieldUsage`));
            await set(fieldRef, {
                ...fieldData,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Failed to notify field usage:', error);
        }
    },
    
    
    async notifyPowerupPhysicsEffect(effectData) {
        if (!this.currentRoomId) return;
        
        try {
            const effectRef = push(ref(database, `rooms/${this.currentRoomId}/physicsEffects`));
            await set(effectRef, effectData);
        } catch (error) {
            console.error('Failed to notify powerup physics effect:', error);
        }
    },
    
    monitorPortalTeleportation() {
        // Hook into portal system to sync teleportation
        if (typeof level !== 'undefined') {
            // Monitor player position for large jumps (indicating teleportation)
            let lastPlayerPosition = { x: 0, y: 0 };
            let lastTeleportTime = 0;
            let initialized = false;
            
            setInterval(() => {
                if (!player || !player.position || !this.isGameStarted) return;
                
                const currentPos = { x: player.position.x, y: player.position.y };
                
                // Don't process until we have a valid starting position
                if (!initialized && lastPlayerPosition.x !== 0 && lastPlayerPosition.y !== 0) {
                    initialized = true;
                }
                
                if (initialized) {
                    const distance = Math.sqrt(
                        Math.pow(currentPos.x - lastPlayerPosition.x, 2) + 
                        Math.pow(currentPos.y - lastPlayerPosition.y, 2)
                    );
                    
                    const now = Date.now();
                    const timeSinceLastTeleport = now - lastTeleportTime;
                    
                    // Lower threshold for teleportation detection - portals might be close together
                    if (distance > 800 && timeSinceLastTeleport > 500) { // More sensitive detection, less aggressive throttling
                        // Validate coordinates more strictly
                        if (!isNaN(currentPos.x) && !isNaN(currentPos.y) && 
                            Math.abs(currentPos.x) < 50000 && Math.abs(currentPos.y) < 50000 &&
                            !isNaN(lastPlayerPosition.x) && !isNaN(lastPlayerPosition.y)) {
                            
                            this.notifyTeleportation({
                                playerId: this.playerId,
                                fromPosition: lastPlayerPosition,
                                toPosition: currentPos,
                                levelData: {
                                    currentLevel: typeof level !== 'undefined' ? level.onLevel : -1,
                                    levelsCleared: typeof level !== 'undefined' ? level.levelsCleared : 0
                                },
                                timestamp: now
                            });
                            lastTeleportTime = now;
                            console.log('Teleportation detected and notified:', lastPlayerPosition, '->', currentPos);
                        }
                    }
                }
                
                lastPlayerPosition = currentPos;
            }, 200); // Check more frequently for better teleportation detection
        }
    },
    
    async notifyTeleportation(teleportData) {
        if (!this.currentRoomId) return;
        
        try {
            const teleportRef = push(ref(database, `rooms/${this.currentRoomId}/teleportations`));
            await set(teleportRef, teleportData);
        } catch (error) {
            console.error('Failed to notify teleportation:', error);
        }
    },
    
    monitorFieldEmitterInteractions() {
        // Monitor when objects are grabbed and thrown with field emitter
        if (typeof m !== 'undefined' && typeof body !== 'undefined') {
            let lastHoldingTarget = null;
            let lastThrowCharge = 0;
            
            setInterval(() => {
                if (!this.isGameStarted) return;
                
                // Monitor for object grabbing changes
                if (m.holdingTarget !== lastHoldingTarget) {
                    try {
                        if (m.holdingTarget && !lastHoldingTarget) {
                            // Object was just grabbed
                            const targetId = typeof body !== 'undefined' ? body.indexOf(m.holdingTarget) : -1;
                            if (targetId >= 0 && m.holdingTarget.position) {
                                this.notifyObjectInteraction({
                                    playerId: this.playerId,
                                    action: 'grab',
                                    targetId: targetId,
                                    targetPosition: m.holdingTarget.position,
                                    timestamp: Date.now()
                                });
                            }
                        } else if (!m.holdingTarget && lastHoldingTarget && lastHoldingTarget.position) {
                            // Object was just released/dropped
                            const targetId = typeof body !== 'undefined' ? body.indexOf(lastHoldingTarget) : -1;
                            if (targetId >= 0) {
                                this.notifyObjectInteraction({
                                    playerId: this.playerId,
                                    action: 'release',
                                    targetId: targetId,
                                    targetPosition: lastHoldingTarget.position,
                                    targetVelocity: lastHoldingTarget.velocity,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error monitoring object grabbing:', error);
                    }
                    lastHoldingTarget = m.holdingTarget;
                }
                
                // Monitor for throwing (when throw charge is reset to 0 from a higher value)
                if (m.throwCharge !== undefined) {
                    try {
                        if (lastThrowCharge > 0 && m.throwCharge === 0 && m.holdingTarget) {
                            // Object was just thrown
                            const targetId = typeof body !== 'undefined' ? body.indexOf(m.holdingTarget) : -1;
                            if (targetId >= 0 && m.holdingTarget.position && m.holdingTarget.velocity) {
                                this.notifyObjectInteraction({
                                    playerId: this.playerId,
                                    action: 'throw',
                                    targetId: targetId,
                                    targetPosition: m.holdingTarget.position,
                                    targetVelocity: m.holdingTarget.velocity,
                                    throwCharge: lastThrowCharge,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error monitoring object throwing:', error);
                    }
                    lastThrowCharge = m.throwCharge || 0;
                }
            }, 100); // Check every 100ms for responsive object interaction sync
        }
    },
    
    async notifyObjectInteraction(interactionData) {
        if (!this.currentRoomId) return;
        
        try {
            const interactionRef = push(ref(database, `rooms/${this.currentRoomId}/objectInteractions`));
            await set(interactionRef, interactionData);
        } catch (error) {
            console.error('Failed to notify object interaction:', error);
        }
    },
    
    listenToTechAndPhysicsEvents() {
        if (!this.currentRoomId) return;
        
        // Listen for physics effects from other players
        const physicsRef = ref(database, `rooms/${this.currentRoomId}/physicsEffects`);
        onValue(physicsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const effects = snapshot.val();
            for (const [effectId, effect] of Object.entries(effects)) {
                if (effect.playerId !== this.playerId && 
                    Date.now() - effect.timestamp < 1000) { // Only process recent effects
                    
                    // Apply physics effects to remote players visually
                    this.applyPhysicsEffect(effect);
                    
                    // Clean up old effect
                    remove(ref(database, `rooms/${this.currentRoomId}/physicsEffects/${effectId}`));
                }
            }
        });
        
        // Listen for teleportations from other players
        const teleportRef = ref(database, `rooms/${this.currentRoomId}/teleportations`);
        let lastTeleportApplied = 0;
        
        // Initialize lastAppliedTeleport if not exists
        if (!this.lastAppliedTeleport) {
            this.lastAppliedTeleport = null;
        }
        
        onValue(teleportRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const teleports = snapshot.val();
            const now = Date.now();
            
            for (const [teleportId, teleport] of Object.entries(teleports)) {
                if (teleport.playerId !== this.playerId && 
                    now - teleport.timestamp < 5000) { // Extended processing window, removed throttling
                    
                    // ALWAYS teleport everyone when someone uses a teleporter (but throttle per teleport event)
                    if (teleport.fromPosition && teleport.toPosition && player && Matter.Body) {
                        // Only apply if we haven't already applied this specific teleportation recently
                        const teleportKey = `${teleport.playerId}_${teleport.timestamp}`;
                        if (!this.lastAppliedTeleport || this.lastAppliedTeleport !== teleportKey) {
                            try {
                                // Validate teleportation coordinates
                                if (!isNaN(teleport.toPosition.x) && !isNaN(teleport.toPosition.y) &&
                                    Math.abs(teleport.toPosition.x) < 50000 && Math.abs(teleport.toPosition.y) < 50000 &&
                                    !isNaN(teleport.fromPosition.x) && !isNaN(teleport.fromPosition.y)) {
                                    
                                    // Teleport local player to the same destination safely
                                    Matter.Body.setPosition(player, teleport.toPosition);
                                    
                                    // Clear any velocity to prevent sliding
                                    Matter.Body.setVelocity(player, { x: 0, y: 0 });
                                    
                                    this.lastAppliedTeleport = teleportKey;
                                    console.log('Applied teleportation from', teleport.playerId, 'to:', teleport.toPosition);
                                } else {
                                    console.warn('Invalid teleportation coordinates:', teleport.toPosition);
                                }
                            } catch (error) {
                                console.error('Error during teleportation:', error);
                            }
                        }
                    }
                    
                    // Also sync level progression if teleportation included level data
                    if (teleport.levelData && typeof level !== 'undefined') {
                        try {
                            const remoteLevel = teleport.levelData.currentLevel;
                            const remoteLevelsCleared = teleport.levelData.levelsCleared;
                            
                            // If the remote player is on a different level, sync to that level
                            if (remoteLevel !== undefined && remoteLevel !== level.onLevel) {
                                console.log(`Syncing to level ${remoteLevel} (cleared: ${remoteLevelsCleared}) from teleportation`);
                                this.syncToLevel(remoteLevel, remoteLevelsCleared);
                            }
                        } catch (error) {
                            console.error('Error syncing level from teleportation:', error);
                        }
                    }
                    
                    // Update remote player position
                    this.applyTeleportation(teleport);
                    
                    // Clean up old teleport
                    remove(ref(database, `rooms/${this.currentRoomId}/teleportations/${teleportId}`));
                }
            }
        });
        
        // Listen for field usage from other players
        const fieldRef = ref(database, `rooms/${this.currentRoomId}/fieldUsage`);
        onValue(fieldRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            try {
                const fieldUsages = snapshot.val();
                if (!fieldUsages || typeof fieldUsages !== 'object') return;
                
                for (const [fieldId, fieldData] of Object.entries(fieldUsages)) {
                    // Validate field data before processing
                    if (fieldData && 
                        fieldData.playerId && 
                        fieldData.playerId !== this.playerId && 
                        fieldData.timestamp && 
                        Date.now() - fieldData.timestamp < 200 && // Field effects are very short-lived
                        typeof fieldData.angle === 'number' && 
                        typeof fieldData.energy === 'number' &&
                        !isNaN(fieldData.angle) && 
                        !isNaN(fieldData.energy)) {
                        
                        // Store field usage data for rendering
                        this.applyFieldUsage(fieldData);
                    }
                    
                    // Clean up field usage data regardless of validity
                    try {
                        remove(ref(database, `rooms/${this.currentRoomId}/fieldUsage/${fieldId}`));
                    } catch (cleanupError) {
                        console.warn('Failed to clean up field usage data:', cleanupError);
                    }
                }
            } catch (error) {
                console.error('Error processing field usage data:', error);
            }
        });
        
        // Listen for object interactions (grabbing/throwing) from other players
        const objectInteractionsRef = ref(database, `rooms/${this.currentRoomId}/objectInteractions`);
        onValue(objectInteractionsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            try {
                const interactions = snapshot.val();
                if (!interactions || typeof interactions !== 'object') return;
                
                for (const [interactionId, interaction] of Object.entries(interactions)) {
                    if (interaction.playerId !== this.playerId && 
                        Date.now() - interaction.timestamp < 1000) {
                        
                        // Apply object interaction sync
                        this.applyObjectInteraction(interaction);
                        
                        // Clean up old interaction
                        try {
                            remove(ref(database, `rooms/${this.currentRoomId}/objectInteractions/${interactionId}`));
                        } catch (cleanupError) {
                            console.warn('Failed to clean up object interaction data:', cleanupError);
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing object interaction data:', error);
            }
        });
    },
    
    applyObjectInteraction(interactionData) {
        try {
            if (!interactionData || typeof body === 'undefined') return;
            
            const targetId = interactionData.targetId;
            if (targetId >= 0 && targetId < body.length && body[targetId]) {
                const targetBody = body[targetId];
                
                if (interactionData.action === 'throw' && interactionData.targetVelocity) {
                    // Apply the throw to the physics object
                    if (typeof Matter !== 'undefined' && Matter.Body) {
                        Matter.Body.setVelocity(targetBody, interactionData.targetVelocity);
                        console.log('Applied remote throw to body:', targetId, 'velocity:', interactionData.targetVelocity);
                    }
                } else if (interactionData.action === 'grab') {
                    // Create visual effect for grabbing
                    if (typeof simulation !== 'undefined' && simulation.drawList) {
                        simulation.drawList.push({
                            x: interactionData.targetPosition.x,
                            y: interactionData.targetPosition.y,
                            radius: 30,
                            color: "rgba(0,255,255,0.3)",
                            time: simulation.drawTime * 1.5
                        });
                    }
                    console.log('Applied remote grab effect to body:', targetId);
                }
            }
        } catch (error) {
            console.error('Error applying object interaction:', error);
        }
    },
    
    applyFieldUsage(fieldData) {
        try {
            // Validate field data before applying
            if (!fieldData || 
                typeof fieldData.playerId !== 'string' || 
                typeof fieldData.angle !== 'number' || 
                typeof fieldData.energy !== 'number' ||
                isNaN(fieldData.angle) || 
                isNaN(fieldData.energy) ||
                fieldData.energy < 0 || 
                fieldData.energy > 10) { // Reasonable energy range
                return;
            }
            
            // Store field usage data for remote players so we can render the field effect
            if (fieldData.playerId in this.remotePlayers) {
                const remotePlayer = this.remotePlayers[fieldData.playerId];
                if (!remotePlayer.fieldEffects) remotePlayer.fieldEffects = [];
                
                // Add validated field effect data
                remotePlayer.fieldEffects.push({
                    angle: fieldData.angle,
                    energy: Math.max(0, Math.min(fieldData.energy, 1)), // Clamp energy between 0 and 1
                    isGrabbing: Boolean(fieldData.isGrabbing),
                    timestamp: fieldData.timestamp || Date.now()
                });
                
                // Keep only recent field effects (within last 300ms to avoid buildup)
                remotePlayer.fieldEffects = remotePlayer.fieldEffects.filter(
                    effect => Date.now() - effect.timestamp < 300
                );
                
                // Limit max field effects to prevent memory issues
                if (remotePlayer.fieldEffects.length > 10) {
                    remotePlayer.fieldEffects = remotePlayer.fieldEffects.slice(-5);
                }
            }
        } catch (error) {
            console.error('Error applying field usage:', error);
        }
    },
    
    applyPhysicsEffect(effect) {
        // Apply visual/physics effects for remote players
        if (effect.playerId in this.remotePlayers) {
            const remotePlayer = this.remotePlayers[effect.playerId];
            // Update remote player position/velocity to show the physics effect
            remotePlayer.vx = effect.velocity.x;
            remotePlayer.vy = effect.velocity.y;
            remotePlayer.x = effect.position.x;
            remotePlayer.y = effect.position.y;
        }
    },
    
    applyTeleportation(teleport) {
        // Update remote player position when they teleport
        if (teleport.playerId in this.remotePlayers) {
            const remotePlayer = this.remotePlayers[teleport.playerId];
            remotePlayer.x = teleport.toPosition.x;
            remotePlayer.y = teleport.toPosition.y;
            // Clear velocity on teleportation to prevent sliding
            remotePlayer.vx = 0;
            remotePlayer.vy = 0;
        }
    },
    
    // Enhanced level sync that respects shared level progression setting
    async checkLevelProgressionPermission() {
        if (!this.currentRoomId) return false;
        
        try {
            const roomRef = ref(database, `rooms/${this.currentRoomId}/gameSettings`);
            const snapshot = await get(roomRef);
            
            if (snapshot.exists()) {
                const settings = snapshot.val();
                // Only allow level progression if you're the host OR if shared progression is enabled
                return this.isHost || settings.sharedLevelProgression;
            }
        } catch (error) {
            console.error('Error checking level progression permission:', error);
        }
        
        return this.isHost; // Default to host-only if we can't check
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
    },
    
    // ===== COMPREHENSIVE PHYSICS SYNCHRONIZATION =====
    initComprehensivePhysicsSync() {
        // Monitor bullet firing and explosions
        this.monitorBulletAndExplosions();
        
        // Monitor mob interactions and deaths
        this.monitorMobInteractions();
        
        // Listen for physics events from other players
        this.listenToPhysicsEvents();
    },
    
    monitorBulletAndExplosions() {
        // Monitor bullet firing using polling approach
        let lastBulletCount = 0;
        
        setInterval(() => {
            if (!this.isGameStarted || typeof bullet === 'undefined') return;
            
            // Check for new bullets created
            if (bullet.length > lastBulletCount) {
                // New bullets were created, notify other players
                const newBullets = bullet.slice(lastBulletCount);
                for (let i = 0; i < newBullets.length; i++) {
                    const newBullet = newBullets[i];
                    if (newBullet && newBullet.position) {
                        this.notifyBulletFired({
                            playerId: this.playerId,
                            position: { x: newBullet.position.x, y: newBullet.position.y },
                            velocity: { x: newBullet.velocity.x, y: newBullet.velocity.y },
                            bulletType: newBullet.bulletType || 'default',
                            timestamp: Date.now()
                        });
                    }
                }
                lastBulletCount = bullet.length;
            } else if (bullet.length < lastBulletCount) {
                // Bullets were removed, update count
                lastBulletCount = bullet.length;
            }
        }, 100); // Check every 100ms
        
        // Monitor explosions
        if (typeof b !== 'undefined' && b.explosion) {
            const originalExplosion = b.explosion;
            b.explosion = (where, radius, color) => {
                // Call original function first
                originalExplosion.call(b, where, radius, color);
                
                // Notify other players about explosion
                this.notifyExplosion({
                    playerId: this.playerId,
                    position: { x: where.x, y: where.y },
                    radius: radius,
                    color: color || "rgba(255,25,0,0.6)",
                    timestamp: Date.now()
                });
            };
        }
    },
    
    async notifyExplosion(explosionData) {
        if (!this.currentRoomId) return;
        
        try {
            const explosionRef = push(ref(database, `rooms/${this.currentRoomId}/explosions`));
            await set(explosionRef, explosionData);
        } catch (error) {
            console.error('Failed to notify explosion:', error);
        }
    },
    
    async notifyBulletFired(bulletData) {
        if (!this.currentRoomId) return;
        
        try {
            const bulletRef = push(ref(database, `rooms/${this.currentRoomId}/bullets`));
            await set(bulletRef, bulletData);
        } catch (error) {
            console.error('Failed to notify bullet fired:', error);
        }
    },
    
    monitorMobInteractions() {
        // Monitor mob deaths using a polling approach since hooking can be unreliable
        let lastMobCount = mob.length;
        let lastMobHealths = [];
        
        setInterval(() => {
            if (!this.isGameStarted || typeof mob === 'undefined') return;
            
            // Check for mob count changes (deaths)
            if (lastMobCount !== mob.length) {
                console.log(`Mob count changed: ${lastMobCount} -> ${mob.length}`);
                lastMobCount = mob.length;
                lastMobHealths = [];
            }
            
            // Check for mob health changes (deaths)
            for (let i = 0; i < mob.length; i++) {
                if (mob[i] && typeof mob[i].health === 'number') {
                    const lastHealth = lastMobHealths[i] || mob[i].maxHealth;
                    const currentHealth = mob[i].health;
                    
                    // If mob died (health went from > 0 to <= 0)
                    if (lastHealth > 0 && currentHealth <= 0 && mob[i].alive) {
                        this.notifyMobDeath({
                            mobId: i,
                            position: { x: mob[i].position.x, y: mob[i].position.y },
                            playerId: this.playerId,
                            timestamp: Date.now()
                        });
                    }
                    
                    lastMobHealths[i] = currentHealth;
                }
            }
        }, 200); // Check every 200ms
    },
    
    async notifyMobDeath(mobData) {
        if (!this.currentRoomId) return;
        
        try {
            const mobRef = push(ref(database, `rooms/${this.currentRoomId}/mobDeaths`));
            await set(mobRef, mobData);
        } catch (error) {
            console.error('Failed to notify mob death:', error);
        }
    },
    
    listenToPhysicsEvents() {
        if (!this.currentRoomId) return;
        
        // Listen for explosions from other players
        const explosionsRef = ref(database, `rooms/${this.currentRoomId}/explosions`);
        onValue(explosionsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const explosions = snapshot.val();
            for (const [explosionId, explosionData] of Object.entries(explosions)) {
                if (explosionData.playerId !== this.playerId && 
                    Date.now() - explosionData.timestamp < 1000) { // Only process recent explosions
                    
                    // Trigger explosion on this client
                    this.triggerExplosion(explosionData);
                    
                    // Clean up old explosion data
                    remove(ref(database, `rooms/${this.currentRoomId}/explosions/${explosionId}`));
                }
            }
        });
        
        // Listen for bullets from other players
        const bulletsRef = ref(database, `rooms/${this.currentRoomId}/bullets`);
        onValue(bulletsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const bullets = snapshot.val();
            for (const [bulletId, bulletData] of Object.entries(bullets)) {
                if (bulletData.playerId !== this.playerId && 
                    Date.now() - bulletData.timestamp < 500) { // Only process recent bullets
                    
                    // Trigger bullet creation on this client
                    this.triggerBullet(bulletData);
                    
                    // Clean up old bullet data
                    remove(ref(database, `rooms/${this.currentRoomId}/bullets/${bulletId}`));
                }
            }
        });
        
        // Listen for mob deaths from other players
        const mobDeathsRef = ref(database, `rooms/${this.currentRoomId}/mobDeaths`);
        onValue(mobDeathsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const mobDeaths = snapshot.val();
            for (const [deathId, mobData] of Object.entries(mobDeaths)) {
                if (mobData.playerId !== this.playerId && 
                    Date.now() - mobData.timestamp < 2000) { // Only process recent deaths
                    
                    // Sync mob death on this client
                    this.syncMobDeath(mobData);
                    
                    // Clean up old death data
                    remove(ref(database, `rooms/${this.currentRoomId}/mobDeaths/${deathId}`));
                }
            }
        });
    },
    
    triggerExplosion(explosionData) {
        try {
            if (typeof b !== 'undefined' && b.explosion && explosionData.position && explosionData.radius) {
                // Create explosion effect visually without affecting local game state
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: explosionData.position.x,
                        y: explosionData.position.y,
                        radius: explosionData.radius,
                        color: explosionData.color || "rgba(255,25,0,0.6)",
                        time: simulation.drawTime * 2
                    });
                }
                
                console.log('Triggered remote explosion at:', explosionData.position);
            }
        } catch (error) {
            console.error('Error triggering explosion:', error);
        }
    },
    
    syncMobDeath(mobData) {
        try {
            // Find the corresponding mob and sync its death
            if (typeof mob !== 'undefined' && mob.length > mobData.mobId && mob[mobData.mobId]) {
                const targetMob = mob[mobData.mobId];
                if (targetMob && targetMob.alive && typeof targetMob.damage === 'function') {
                    // Force the mob to die to match the other client
                    targetMob.damage(targetMob.health + 1); // Ensure death
                }
            }
        } catch (error) {
            console.error('Error syncing mob death:', error);
        }
    },
    
    triggerBullet(bulletData) {
        try {
            // Create a visual bullet effect for remote players
            // This is a simplified version - in a full implementation, you'd create actual bullet bodies
            if (typeof simulation !== 'undefined' && simulation.drawList && bulletData.position) {
                // Add a bullet trail effect to the draw queue
                simulation.drawList.push({
                    x: bulletData.position.x,
                    y: bulletData.position.y,
                    radius: 3,
                    color: "rgba(255,255,0,0.8)",
                    time: simulation.drawTime * 0.5 // Short-lived bullet trail
                });
                
                console.log('Triggered remote bullet at:', bulletData.position);
            }
        } catch (error) {
            console.error('Error triggering bullet:', error);
        }
    },
    
    // ===== MAP GENERATION SYNCHRONIZATION =====
    initMapGenerationSync() {
        // Synchronize map generation parameters across all players
        this.syncMapGeneration();
        this.listenToMapGeneration();
    },
    
    async syncMapGeneration() {
        if (!this.currentRoomId) return;
        
        try {
            // Only the host should set the initial map generation seed
            if (this.isHost) {
                const seedValue = Math.random();
                const mapSeed = {
                    isHorizontalFlipped: seedValue < 0.5,
                    masterSeed: seedValue,
                    wimpPowerupSeeds: [], // Will store seeds for WIMP powerup generation
                    timestamp: Date.now(),
                    hostPlayerId: this.playerId
                };
                
                // Pre-generate seeds for level randomizations using a temporary seeded generator
                const tempRandom = this.createSeededRandom(seedValue);
                for (let i = 0; i < 100; i++) {
                    mapSeed.wimpPowerupSeeds.push(tempRandom());
                }
                
                await set(ref(database, `rooms/${this.currentRoomId}/mapSeed`), mapSeed);
                console.log('Host set comprehensive map generation seed:', mapSeed);
                
                // Apply the seed immediately for the host too
                this.applyMapSeed(mapSeed);
                this.startMapSyncWatchdog(mapSeed);
            }
        } catch (error) {
            console.error('Failed to sync map generation:', error);
        }
    },
    
    createSeededRandom(seed) {
        // Simple seeded random number generator
        let state = seed * 2147483647;
        return function() {
            state = (state * 16807) % 2147483647;
            return state / 2147483647;
        };
    },
    
    applyMapSeed(mapSeed) {
        // Apply map seed for both host and clients
        if (typeof simulation !== 'undefined') {
            // Always set the synchronized value, overriding any random assignment
            simulation.isHorizontalFlipped = mapSeed.isHorizontalFlipped;
            console.log('Applied isHorizontalFlipped:', mapSeed.isHorizontalFlipped);
            
            // Store the master seed for consistent random generation
            if (mapSeed.masterSeed !== undefined) {
                this.masterSeed = mapSeed.masterSeed;
                this.wimpPowerupSeeds = mapSeed.wimpPowerupSeeds || [];
                this.seedIndex = 0;
                
                // Override Math.random to use synchronized seeds
                this.setupSynchronizedRandom();
                
                console.log('✅ Map generation fully synchronized - all players should have identical maps!');
            }
        }
    },
    
    listenToMapGeneration() {
        if (!this.currentRoomId) return;
        
        const mapSeedRef = ref(database, `rooms/${this.currentRoomId}/mapSeed`);
        onValue(mapSeedRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const mapSeed = snapshot.val();
            if (mapSeed && mapSeed.hostPlayerId) {
                // Apply for both host and clients - use the new unified function
                this.applyMapSeed(mapSeed);
                
                // Set up a watchdog to ensure isHorizontalFlipped stays synchronized
                this.startMapSyncWatchdog(mapSeed);
                
                console.log('Applied synchronized map generation:', mapSeed);
            }
        });
    },
    
    startMapSyncWatchdog(mapSeed) {
        // Ensure isHorizontalFlipped stays synchronized even if startGame() overrides it
        if (this.mapSyncWatchdog) {
            clearInterval(this.mapSyncWatchdog);
        }
        
        this.synchronizedIsHorizontalFlipped = mapSeed.isHorizontalFlipped;
        
        this.mapSyncWatchdog = setInterval(() => {
            if (typeof simulation !== 'undefined' && 
                simulation.isHorizontalFlipped !== this.synchronizedIsHorizontalFlipped) {
                console.log('Correcting isHorizontalFlipped to synchronized value:', this.synchronizedIsHorizontalFlipped);
                simulation.isHorizontalFlipped = this.synchronizedIsHorizontalFlipped;
            }
        }, 100); // Check every 100ms for the first few seconds
    },
    
    setupSynchronizedRandom() {
        // Hook into Math.random to use synchronized seeds for consistent generation
        if (this.masterSeed !== undefined) {
            const originalRandom = Math.random;
            
            // Initialize seed index if not set
            if (this.seedIndex === undefined) {
                this.seedIndex = 0;
            }
            
            Math.random = () => {
                // Use synchronized seeds for consistent generation
                if (this.wimpPowerupSeeds && this.wimpPowerupSeeds.length > 0 && this.seedIndex < this.wimpPowerupSeeds.length) {
                    const result = this.wimpPowerupSeeds[this.seedIndex];
                    this.seedIndex++;
                    return result;
                }
                // Fallback to deterministic generation based on master seed
                return originalRandom();
            };
            
            console.log('✅ Synchronized random generation activated with', this.wimpPowerupSeeds.length, 'seeds');
        }
    },
    
    // ===== COMPREHENSIVE GAME STATE SYNCHRONIZATION =====
    initComprehensiveGameSync() {
        // Network ALL game elements that should be synchronized
        this.initBulletAndSporeSync();
        this.initMobStateSync();
        this.initEngineEventSync();
        this.initVisualEffectSync();
        this.initPowerupEffectSync();
        this.initPhysicsObjectSync();
    },
    
    // ===== BULLET AND SPORE SYNCHRONIZATION =====
    initBulletAndSporeSync() {
        // Monitor bullet creation more comprehensively
        this.monitorAllBulletCreation();
        this.monitorSporeCreation();
        this.listenToBulletAndSporeEvents();
    },
    
    monitorAllBulletCreation() {
        // Monitor the bullet array for any changes
        let lastBulletCount = 0;
        let bulletStates = [];
        
        setInterval(() => {
            if (!this.isGameStarted || typeof bullet === 'undefined') return;
            
            // Check for new bullets - be more aggressive to catch all types
            if (bullet.length > lastBulletCount) {
                const newBullets = bullet.slice(lastBulletCount);
                for (let i = 0; i < newBullets.length; i++) {
                    const newBullet = newBullets[i];
                    if (newBullet && newBullet.position && newBullet.velocity) {
                        // Try to determine bullet color based on type and properties
                        let bulletColor = '#ffffff'; // default
                        
                        // Check for various bullet color properties
                        if (newBullet.fill) {
                            bulletColor = newBullet.fill;
                        } else if (newBullet.color) {
                            bulletColor = newBullet.color;
                        } else if (newBullet.render && newBullet.render.fillStyle) {
                            bulletColor = newBullet.render.fillStyle;
                        }
                        
                        // Determine color based on bullet type and tech
                        if (typeof tech !== 'undefined') {
                            if (newBullet.bulletType === 'explosive' || newBullet.explodeRad) {
                                bulletColor = '#ff6600'; // Orange for explosive
                            } else if (tech.isDemonic) {
                                bulletColor = '#ff0000'; // Red for demonic
                            } else if (newBullet.totalSpores) {
                                bulletColor = '#ff00ff'; // Magenta for spore bullets
                            } else {
                                // Default bullet color based on current gun or tech
                                bulletColor = '#000000'; // Black is the default in bulletDraw
                            }
                        }
                        
                        this.notifyBulletCreation({
                            playerId: this.playerId,
                            position: { x: newBullet.position.x, y: newBullet.position.y },
                            velocity: { x: newBullet.velocity.x, y: newBullet.velocity.y },
                            bulletType: newBullet.bulletType || 'default',
                            radius: newBullet.radius || 4.5,
                            color: bulletColor,
                            timestamp: Date.now()
                        });
                    }
                }
                lastBulletCount = bullet.length;
            }
            
            // Update bullet states
            if (bullet.length !== bulletStates.length) {
                bulletStates = bullet.map(b => ({
                    position: { x: b.position.x, y: b.position.y },
                    velocity: { x: b.velocity.x, y: b.velocity.y },
                    radius: b.radius
                }));
            }
        }, 100); // Check every 100ms - reduced frequency to prevent spam
    },
    
    monitorSporeCreation() {
        // Monitor for spore creation (from bullet deaths, etc.)
        if (typeof b !== 'undefined' && typeof b.spore === 'function') {
            const originalSpore = b.spore;
            b.spore = (position, count = 1) => {
                // Call original function first
                originalSpore.call(b, position, count);
                
                // Notify other players about spore creation
                this.notifySporeCreation({
                    playerId: this.playerId,
                    position: { x: position.x, y: position.y },
                    count: count,
                    timestamp: Date.now()
                });
            };
        }
    },
    
    async notifyBulletCreation(bulletData) {
        if (!this.currentRoomId) return;
        
        try {
            const bulletRef = push(ref(database, `rooms/${this.currentRoomId}/bulletCreations`));
            await set(bulletRef, bulletData);
        } catch (error) {
            console.error('Failed to notify bullet creation:', error);
        }
    },
    
    async notifySporeCreation(sporeData) {
        if (!this.currentRoomId) return;
        
        try {
            const sporeRef = push(ref(database, `rooms/${this.currentRoomId}/sporeCreations`));
            await set(sporeRef, sporeData);
        } catch (error) {
            console.error('Failed to notify spore creation:', error);
        }
    },
    
    listenToBulletAndSporeEvents() {
        if (!this.currentRoomId) return;
        
        // Listen for bullet creations
        const bulletCreationsRef = ref(database, `rooms/${this.currentRoomId}/bulletCreations`);
        onValue(bulletCreationsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const bullets = snapshot.val();
            for (const [bulletId, bulletData] of Object.entries(bullets)) {
                if (bulletData.playerId !== this.playerId && 
                    Date.now() - bulletData.timestamp < 500) {
                    
                    this.triggerBulletCreation(bulletData);
                    remove(ref(database, `rooms/${this.currentRoomId}/bulletCreations/${bulletId}`));
                }
            }
        });
        
        // Listen for spore creations
        const sporeCreationsRef = ref(database, `rooms/${this.currentRoomId}/sporeCreations`);
        onValue(sporeCreationsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const spores = snapshot.val();
            for (const [sporeId, sporeData] of Object.entries(spores)) {
                if (sporeData.playerId !== this.playerId && 
                    Date.now() - sporeData.timestamp < 500) {
                    
                    this.triggerSporeCreation(sporeData);
                    remove(ref(database, `rooms/${this.currentRoomId}/sporeCreations/${sporeId}`));
                }
            }
        });
    },
    
    triggerBulletCreation(bulletData) {
        try {
            if (typeof b !== 'undefined' && bulletData.position && typeof bullet !== 'undefined') {
                // Create actual bullet for remote players with proper color
                const bulletIndex = bullet.length;
                
                // Create bullet based on type using proper bullet creation method
                if (typeof Matter !== 'undefined' && typeof Bodies !== 'undefined' && typeof b !== 'undefined') {
                    let newBullet;
                    const bulletAngle = bulletData.velocity ? Math.atan2(bulletData.velocity.y, bulletData.velocity.x) : 0;
                    
                    // Use the proper fireAttributes for collision setup
                    let bulletAttributes = {};
                    if (typeof b.fireAttributes === 'function') {
                        bulletAttributes = b.fireAttributes(bulletAngle);
                    } else {
                        // Fallback attributes
                        bulletAttributes = {
                            classType: "bullet",
                            collisionFilter: {
                                category: 0x0002, // cat.bullet
                                mask: 0xFFFF
                            },
                            minDmgSpeed: 10,
                            beforeDmg() {},
                            onEnd() {}
                        };
                    }
                    
                    if (bulletData.bulletType === 'explosive' || bulletData.radius > 10) {
                        // Create explosive bullet
                        newBullet = Matter.Bodies.circle(bulletData.position.x, bulletData.position.y, bulletData.radius || 4.5, bulletAttributes);
                    } else {
                        // Create regular bullet
                        newBullet = Matter.Bodies.polygon(bulletData.position.x, bulletData.position.y, 4, bulletData.radius || 4.5, bulletAttributes);
                    }
                    
                    // Set bullet properties
                    if (newBullet && bulletData.velocity) {
                        Matter.Body.setVelocity(newBullet, bulletData.velocity);
                        newBullet.color = bulletData.color || '#000000';
                        newBullet.bulletType = bulletData.bulletType || 'default';
                        newBullet.endCycle = simulation.cycle + 300; // 5 second lifetime
                        newBullet.minDmgSpeed = 10; // Required for collision detection
                        newBullet.frictionAir = 0; // Standard bullet property
                        
                        // CRITICAL: Ensure the do function always exists that bulletDo() expects
                        if (typeof newBullet.do !== 'function') {
                            newBullet.do = function() {
                                // Basic bullet behavior - this prevents the crash
                                if (typeof simulation !== 'undefined' && simulation.cycle > this.endCycle) {
                                    // Bullet should be removed when endCycle is reached
                                    // This will be handled by the normal bullet removal system
                                }
                            };
                        }
                        
                        // Add other required properties
                        newBullet.beforeDmg = function() {};
                        newBullet.onEnd = function() {};
                        newBullet.classType = 'bullet';
                        
                        bullet.push(newBullet);
                        if (typeof engine !== 'undefined' && typeof Matter !== 'undefined') {
                            Matter.World.add(engine.world, newBullet);
                        }
                        
                        console.log('Created remote bullet with color:', bulletData.color, 'at:', bulletData.position);
                    }
                }
                
                // Also create visual effect for immediate feedback
                if (typeof simulation !== 'undefined' && simulation.drawList) {
                    simulation.drawList.push({
                        x: bulletData.position.x,
                        y: bulletData.position.y,
                        radius: bulletData.radius || 4.5,
                        color: bulletData.color || "#000000",
                        time: simulation.drawTime * 0.8
                    });
                }
            }
        } catch (error) {
            console.error('Error triggering bullet creation:', error);
        }
    },
    
    triggerSporeCreation(sporeData) {
        try {
            if (typeof b !== 'undefined' && b.spore && sporeData.position) {
                // Create spore effects for remote players
                for (let i = 0; i < (sporeData.count || 1); i++) {
                    if (typeof simulation !== 'undefined' && simulation.drawList) {
                        simulation.drawList.push({
                            x: sporeData.position.x + (Math.random() - 0.5) * 20,
                            y: sporeData.position.y + (Math.random() - 0.5) * 20,
                            radius: 2 + Math.random() * 3,
                            color: "rgba(255,0,255,0.6)",
                            time: simulation.drawTime * 1.5
                        });
                    }
                }
                console.log('Triggered remote spore creation at:', sporeData.position);
            }
        } catch (error) {
            console.error('Error triggering spore creation:', error);
        }
    },
    
    // ===== MOB STATE SYNCHRONIZATION =====
    initMobStateSync() {
        // Monitor mob health, deaths, and status effects
        this.monitorMobStates();
        this.listenToMobStateEvents();
    },
    
    monitorMobStates() {
        let lastMobStates = [];
        
        setInterval(() => {
            if (!this.isGameStarted || typeof mob === 'undefined') return;
            
            // Check for mob state changes
            for (let i = 0; i < mob.length; i++) {
                if (mob[i] && typeof mob[i].health === 'number') {
                    const currentState = {
                        id: i,
                        health: mob[i].health,
                        position: { x: mob[i].position.x, y: mob[i].position.y },
                        alive: mob[i].alive
                    };
                    
                    const lastState = lastMobStates[i];
                    if (!lastState || lastState.health !== currentState.health || lastState.alive !== currentState.alive) {
                        // Mob state changed, notify other players
                        this.notifyMobStateChange({
                            playerId: this.playerId,
                            mobId: i,
                            mobState: currentState,
                            timestamp: Date.now()
                        });
                    }
                    
                    lastMobStates[i] = currentState;
                }
            }
            
            // Trim array if mobs were removed
            if (lastMobStates.length > mob.length) {
                lastMobStates = lastMobStates.slice(0, mob.length);
            }
        }, 200);
    },
    
    async notifyMobStateChange(mobData) {
        if (!this.currentRoomId) return;
        
        try {
            const mobRef = push(ref(database, `rooms/${this.currentRoomId}/mobStates`));
            await set(mobRef, mobData);
        } catch (error) {
            console.error('Failed to notify mob state change:', error);
        }
    },
    
    listenToMobStateEvents() {
        if (!this.currentRoomId) return;
        
        const mobStatesRef = ref(database, `rooms/${this.currentRoomId}/mobStates`);
        onValue(mobStatesRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const mobStates = snapshot.val();
            for (const [stateId, mobData] of Object.entries(mobStates)) {
                if (mobData.playerId !== this.playerId && 
                    Date.now() - mobData.timestamp < 1000) {
                    
                    this.syncMobState(mobData);
                    remove(ref(database, `rooms/${this.currentRoomId}/mobStates/${stateId}`));
                }
            }
        });
    },
    
    syncMobState(mobData) {
        try {
            if (typeof mob !== 'undefined' && mob.length > mobData.mobId && mob[mobData.mobId]) {
                const targetMob = mob[mobData.mobId];
                const remoteState = mobData.mobState;
                
                // Sync health
                if (typeof targetMob.health === 'number' && Math.abs(targetMob.health - remoteState.health) > 0.01) {
                    targetMob.health = remoteState.health;
                    console.log(`Synced mob ${mobData.mobId} health to ${remoteState.health}`);
                }
                
                // Sync alive state
                if (targetMob.alive !== remoteState.alive) {
                    if (!remoteState.alive && targetMob.alive) {
                        // Remote player says mob died, sync the death
                        if (typeof targetMob.death === 'function') {
                            targetMob.death();
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing mob state:', error);
        }
    },
    
    // ===== ENGINE EVENT SYNCHRONIZATION =====
    initEngineEventSync() {
        // Monitor and sync collision events, damage effects, etc.
        this.hookEngineEvents();
    },
    
    hookEngineEvents() {
        // Hook into Matter.js collision events to sync damage effects
        if (typeof Matter !== 'undefined' && typeof engine !== 'undefined') {
            // This would require more extensive modification to sync all collision events
            console.log('Engine event hooks would need to be implemented based on specific collision needs');
        }
    },
    
    // ===== VISUAL EFFECT SYNCHRONIZATION =====
    initVisualEffectSync() {
        // Monitor simulation.drawList for visual effects
        this.monitorVisualEffects();
        this.listenToVisualEffectEvents();
    },
    
    monitorVisualEffects() {
        const originalPush = Array.prototype.push;
        if (typeof simulation !== 'undefined' && simulation.drawList) {
            // Hook into drawList to monitor visual effects
            let lastDrawListLength = 0;
            
            setInterval(() => {
                if (!this.isGameStarted || !simulation.drawList) return;
                
                if (simulation.drawList.length > lastDrawListLength) {
                    const newEffects = simulation.drawList.slice(lastDrawListLength);
                    for (let i = 0; i < newEffects.length; i++) {
                        const effect = newEffects[i];
                        if (effect && effect.x && effect.y) {
                            this.notifyVisualEffect({
                                playerId: this.playerId,
                                effect: {
                                    x: effect.x,
                                    y: effect.y,
                                    radius: effect.radius,
                                    color: effect.color,
                                    time: effect.time
                                },
                                timestamp: Date.now()
                            });
                        }
                    }
                    lastDrawListLength = simulation.drawList.length;
                }
            }, 100);
        }
    },
    
    async notifyVisualEffect(effectData) {
        if (!this.currentRoomId) return;
        
        try {
            const effectRef = push(ref(database, `rooms/${this.currentRoomId}/visualEffects`));
            await set(effectRef, effectData);
        } catch (error) {
            console.error('Failed to notify visual effect:', error);
        }
    },
    
    listenToVisualEffectEvents() {
        if (!this.currentRoomId) return;
        
        const visualEffectsRef = ref(database, `rooms/${this.currentRoomId}/visualEffects`);
        onValue(visualEffectsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const effects = snapshot.val();
            for (const [effectId, effectData] of Object.entries(effects)) {
                if (effectData.playerId !== this.playerId && 
                    Date.now() - effectData.timestamp < 1000) {
                    
                    this.triggerVisualEffect(effectData);
                    remove(ref(database, `rooms/${this.currentRoomId}/visualEffects/${effectId}`));
                }
            }
        });
    },
    
    triggerVisualEffect(effectData) {
        try {
            if (typeof simulation !== 'undefined' && simulation.drawList && effectData.effect) {
                simulation.drawList.push(effectData.effect);
                console.log('Triggered remote visual effect:', effectData.effect);
            }
        } catch (error) {
            console.error('Error triggering visual effect:', error);
        }
    },
    
    // ===== POWERUP EFFECT SYNCHRONIZATION =====
    initPowerupEffectSync() {
        // Monitor powerup effects and ensure they're properly networked
        this.monitorPowerupEffects();
    },
    
    monitorPowerupEffects() {
        // Hook into powerup effect functions to ensure they're networked
        if (typeof powerUps !== 'undefined') {
            // Monitor powerup effects like healing, tech giving, etc.
            setInterval(() => {
                if (!this.isGameStarted) return;
                
                // This would monitor for powerup effects that need to be synced
                // Implementation depends on specific powerup effects that need networking
            }, 500);
        }
    },
    
    // ===== PHYSICS OBJECT SYNCHRONIZATION =====
    initPhysicsObjectSync() {
        // Monitor physics objects like cubes when they're grabbed/thrown
        this.monitorPhysicsObjectChanges();
        this.listenToPhysicsObjectEvents();
    },
    
    monitorPhysicsObjectChanges() {
        // Monitor body array for physics object changes (grabbing, throwing, etc.)
        let lastBodyStates = [];
        let lastNotificationTime = {};
        
        setInterval(() => {
            if (!this.isGameStarted || typeof body === 'undefined') return;
            
            const now = Date.now();
            
            // Check for body state changes that indicate physics interactions
            for (let i = 0; i < body.length; i++) {
                if (body[i] && body[i].position && body[i].velocity) {
                    const currentState = {
                        id: i,
                        position: { x: body[i].position.x, y: body[i].position.y },
                        velocity: { x: body[i].velocity.x, y: body[i].velocity.y },
                        isHeld: body[i] === m.holdingTarget
                    };
                    
                    const lastState = lastBodyStates[i];
                    if (!lastState) {
                        // New body detected
                        lastBodyStates[i] = currentState;
                    } else {
                        // Check for significant changes - much more restrictive thresholds
                        const posChange = Math.sqrt(
                            Math.pow(currentState.position.x - lastState.position.x, 2) + 
                            Math.pow(currentState.position.y - lastState.position.y, 2)
                        );
                        const velChange = Math.sqrt(
                            Math.pow(currentState.velocity.x - lastState.velocity.x, 2) + 
                            Math.pow(currentState.velocity.y - lastState.velocity.y, 2)
                        );
                        
                        // Throttle notifications per object to prevent spam
                        const lastNotified = lastNotificationTime[i] || 0;
                        const timeSinceLastNotification = now - lastNotified;
                        
                        // Only notify for major changes and not too frequently
                        if ((posChange > 500 || velChange > 100 || currentState.isHeld !== lastState.isHeld) && 
                            timeSinceLastNotification > 1000) { // At least 1 second between notifications per object
                            this.notifyPhysicsObjectChange({
                                playerId: this.playerId,
                                bodyId: i,
                                bodyState: currentState,
                                timestamp: now
                            });
                            lastBodyStates[i] = currentState;
                            lastNotificationTime[i] = now;
                        }
                    }
                }
            }
            
            // Update array length
            if (body.length !== lastBodyStates.length) {
                lastBodyStates = lastBodyStates.slice(0, body.length);
            }
        }, 200); // Check every 200ms
    },
    
    async notifyPhysicsObjectChange(bodyData) {
        if (!this.currentRoomId) return;
        
        try {
            const bodyRef = push(ref(database, `rooms/${this.currentRoomId}/physicsObjects`));
            await set(bodyRef, bodyData);
        } catch (error) {
            console.error('Failed to notify physics object change:', error);
        }
    },
    
    listenToPhysicsObjectEvents() {
        if (!this.currentRoomId) return;
        
        const physicsObjectsRef = ref(database, `rooms/${this.currentRoomId}/physicsObjects`);
        onValue(physicsObjectsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const objects = snapshot.val();
            for (const [objectId, objectData] of Object.entries(objects)) {
                if (objectData.playerId !== this.playerId && 
                    Date.now() - objectData.timestamp < 1000) {
                    
                    this.syncPhysicsObject(objectData);
                    remove(ref(database, `rooms/${this.currentRoomId}/physicsObjects/${objectId}`));
                }
            }
        });
    },
    
    syncPhysicsObject(objectData) {
        try {
            if (typeof body !== 'undefined' && body.length > objectData.bodyId && body[objectData.bodyId]) {
                const targetBody = body[objectData.bodyId];
                const remoteState = objectData.bodyState;
                
                // Sync position and velocity for physics objects
                if (remoteState.position && remoteState.velocity) {
                    // Check if the change is significant enough to apply
                    const currentPos = targetBody.position;
                    
                    // Validate remote position data
                    if (isNaN(remoteState.position.x) || isNaN(remoteState.position.y) ||
                        Math.abs(remoteState.position.x) > 100000 || Math.abs(remoteState.position.y) > 100000) {
                        return; // Skip invalid coordinates
                    }
                    
                    const posDistance = Math.sqrt(
                        Math.pow(currentPos.x - remoteState.position.x, 2) + 
                        Math.pow(currentPos.y - remoteState.position.y, 2)
                    );
                    
                    // Only sync if the difference is significant and coordinates are valid
                    if (posDistance > 200) { // Increased threshold to reduce spam
                        if (typeof Matter !== 'undefined' && Matter.Body) {
                            Matter.Body.setPosition(targetBody, remoteState.position);
                            Matter.Body.setVelocity(targetBody, remoteState.velocity);
                            // Remove verbose logging that was causing spam
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing physics object:', error);
        }
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
