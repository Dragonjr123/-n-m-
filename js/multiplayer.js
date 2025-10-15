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
        // Hide room settings
        document.getElementById('room-settings').style.display = 'none';
        
        // Set game difficulty
        simulation.difficultyMode = settings.difficulty;
        
        // Start the game based on mode
        if (settings.mode === 'progressive') {
            // Start progressive mode
            lore.setUp();
            simulation.startGame();
        } else {
            // Start adventure mode
            simulation.startGame();
        }
        
        // Store multiplayer settings
        simulation.isMultiplayer = true;
        simulation.multiplayerSettings = settings;
        simulation.multiplayerRoomId = this.currentRoomId;
    },
    
    async leaveRoom() {
        if (!this.currentRoomId) return;
        
        try {
            // Remove player from room
            await remove(ref(database, `rooms/${this.currentRoomId}/players/${this.playerId}`));
            
            // If host, delete the entire room
            if (this.isHost) {
                await remove(ref(database, `rooms/${this.currentRoomId}`));
            }
            
            this.currentRoomId = null;
            this.currentRoom = null;
            this.isHost = false;
            
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
