// Multiplayer UI system
const multiplayerUI = {
    // Show multiplayer menu
    showMenu() {
        // Ensure multiplayer is initialized
        if (typeof multiplayer !== 'undefined' && !multiplayer.playerId) {
            if (!multiplayer.init()) {
                alert('Failed to initialize multiplayer. Please refresh the page.');
                return;
            }
        }
        const html = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 20; display: flex; align-items: center; justify-content: center;">
                <div style="background: #fff; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
                    <h1 style="margin: 0 0 20px 0; text-align: center;">MULTIPLAYER</h1>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Player Name:</label>
                        <input type="text" id="mp-player-name" value="${multiplayer.settings.name}" style="width: 100%; padding: 8px; font-size: 16px; box-sizing: border-box;">
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: ${multiplayer.settings.nameColor === '#ffffff' || multiplayer.settings.nameColor === '#fff' ? '#000' : multiplayer.settings.nameColor};">Preview: ${multiplayer.settings.name}</p>
                    </div>
                    
                    <div style="margin-bottom: 20px; display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Player Color:</label>
                            <input type="color" id="mp-player-color" value="${multiplayer.settings.color}" style="width: 100%; height: 40px;">
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Name Color:</label>
                            <input type="color" id="mp-name-color" value="${multiplayer.settings.nameColor}" style="width: 100%; height: 40px;">
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <button onclick="multiplayerUI.showCreateLobby()" style="flex: 1; padding: 15px; font-size: 18px; cursor: pointer; background: #0a0; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Create Lobby</button>
                        <button onclick="multiplayerUI.showJoinLobby()" style="flex: 1; padding: 15px; font-size: 18px; cursor: pointer; background: #08f; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Join Lobby</button>
                    </div>
                    
                    <button onclick="multiplayerUI.close()" style="width: 100%; padding: 10px; font-size: 16px; cursor: pointer; background: #333; color: #fff; border: none; border-radius: 5px;">Back</button>
                </div>
            </div>
        `;
        
        const container = document.createElement('div');
        container.id = 'multiplayer-menu';
        container.innerHTML = html;
        document.body.appendChild(container);
        // Prevent splash click-through starting the game
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'none';
        
        // Mark that we are in a multiplayer lobby context
        if (typeof simulation !== 'undefined') simulation.isMultiplayerLobby = true;
        
        // Update settings on change
        const nameInput = document.getElementById('mp-player-name');
        const nameColorInput = document.getElementById('mp-name-color');
        const previewText = nameInput.parentElement.querySelector('p');
        
        const updatePreview = () => {
            const name = nameInput.value || 'Player';
            const nameColor = nameColorInput.value;
            multiplayer.settings.name = name;
            multiplayer.settings.nameColor = nameColor;
            multiplayer.saveSettings(); // Save to localStorage
            // If name color is white, show as black in preview
            const displayColor = (nameColor === '#ffffff' || nameColor === '#fff') ? '#000' : nameColor;
            previewText.style.color = displayColor;
            previewText.textContent = `Preview: ${name}`;
        };
        
        nameInput.addEventListener('input', updatePreview);
        document.getElementById('mp-player-color').addEventListener('input', (e) => {
            multiplayer.settings.color = e.target.value;
            multiplayer.saveSettings(); // Save to localStorage
        });
        nameColorInput.addEventListener('input', updatePreview);
    },
    
    // Show create lobby screen
    showCreateLobby() {
        const html = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 21; display: flex; align-items: center; justify-content: center;">
                <div style="background: #fff; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
                    <h2 style="margin: 0 0 20px 0; text-align: center;">CREATE LOBBY</h2>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Lobby Name:</label>
                        <input type="text" id="mp-lobby-name" value="${multiplayer.settings.name}'s Lobby" maxlength="30" style="width: 100%; padding: 8px; font-size: 16px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 10px;">
                            <input type="checkbox" id="mp-private" style="width: 20px; height: 20px; vertical-align: middle;">
                            <span style="font-weight: bold; margin-left: 5px;">Private Lobby</span>
                        </label>
                    </div>
                    
                    <div id="mp-password-container" style="margin-bottom: 20px; display: none;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Password:</label>
                        <input type="text" id="mp-password" style="width: 100%; padding: 8px; font-size: 16px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 10px;">
                            <input type="checkbox" id="mp-host-only-exit" style="width: 20px; height: 20px; vertical-align: middle;">
                            <span style="font-weight: bold; margin-left: 5px;">Host Only Level Exit</span>
                        </label>
                        <p style="margin: 5px 0 0 25px; font-size: 12px; color: #666;">Only the host can trigger level transitions</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 10px;">
                            <input type="checkbox" id="mp-friendly-fire" style="width: 20px; height: 20px; vertical-align: middle;">
                            <span style="font-weight: bold; margin-left: 5px;">Enable Friendly Fire</span>
                        </label>
                        <p style="margin: 5px 0 0 25px; font-size: 12px; color: #666;">Allow players to damage each other with weapons</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Game Mode:</label>
                        <select id="mp-gamemode" style="width: 100%; padding: 8px; font-size: 16px;">
                            <option value="adventure">Adventure</option>
                            <option value="progressive">Progressive</option>
                        </select>
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <button onclick="multiplayerUI.createLobby()" style="flex: 1; padding: 15px; font-size: 18px; cursor: pointer; background: #0a0; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Create</button>
                        <button onclick="multiplayerUI.closeCreateLobby()" style="flex: 1; padding: 15px; font-size: 18px; cursor: pointer; background: #333; color: #fff; border: none; border-radius: 5px;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        // tralalalalas
        const container = document.createElement('div');
        container.id = 'create-lobby-menu';
        container.innerHTML = html;
        document.body.appendChild(container);
        
        // Toggle password field
        document.getElementById('mp-private').addEventListener('change', (e) => {
            document.getElementById('mp-password-container').style.display = e.target.checked ? 'block' : 'none';
        });
    },
    
    // Show join lobby screen
    async showJoinLobby() {
        // Remove existing join lobby menu to prevent duplicate IDs
        const existing = document.getElementById('join-lobby-menu');
        if (existing) existing.remove();
        
        const lobbies = await multiplayer.getPublicLobbies();
        
        let lobbiesList = '';
        if (lobbies.length === 0) {
            lobbiesList = '<p style="text-align: center; color: #666;">No public lobbies available</p>';
        } else {
            lobbiesList = '<div style="max-height: 300px; overflow-y: auto;">';
            lobbies.forEach(lobby => {
                const lobbyName = lobby.name || 'Unnamed Lobby';
                lobbiesList += `
                    <div onclick="multiplayerUI.joinLobby('${lobby.id}')" style="padding: 15px; margin-bottom: 10px; background: #f0f0f0; border-radius: 5px; cursor: pointer; border: 2px solid #ccc;">
                        <div style="font-weight: bold; font-size: 18px;">${lobbyName}</div>
                        <div style="color: #666;">${lobby.gameMode.toUpperCase()} | Players: ${lobby.playerCount}</div>
                    </div>
                `;
            });
            lobbiesList += '</div>';
        }
        
        const html = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 21; display: flex; align-items: center; justify-content: center;">
                <div style="background: #fff; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
                    <h2 style="margin: 0 0 20px 0; text-align: center;">JOIN LOBBY</h2>
                    
                    <h3 style="margin: 0 0 10px 0;">Public Lobbies:</h3>
                    ${lobbiesList}
                    
                    <div style="margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0;">Join Private Lobby:</h3>
                        <input type="text" id="mp-lobby-code" placeholder="Lobby Code" style="width: 100%; padding: 8px; font-size: 16px; box-sizing: border-box; margin-bottom: 10px;">
                        <input type="text" id="mp-lobby-password" placeholder="Password" style="width: 100%; padding: 8px; font-size: 16px; box-sizing: border-box; margin-bottom: 10px;">
                        <button onclick="multiplayerUI.joinPrivateLobby()" style="width: 100%; padding: 12px; font-size: 16px; cursor: pointer; background: #08f; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Join Private</button>
                    </div>
                    
                    <button onclick="multiplayerUI.closeJoinLobby()" style="width: 100%; padding: 10px; font-size: 16px; cursor: pointer; background: #333; color: #fff; border: none; border-radius: 5px; margin-top: 10px;">Back</button>
                </div>
            </div>
        `;
        
        const container = document.createElement('div');
        container.id = 'join-lobby-menu';
        container.innerHTML = html;
        document.body.appendChild(container);
    },
    
    // Create lobby
    async createLobby() {
        const lobbyName = document.getElementById('mp-lobby-name').value.trim() || `${multiplayer.settings.name}'s Lobby`;
        const isPrivate = document.getElementById('mp-private').checked;
        const password = isPrivate ? document.getElementById('mp-password').value : null;
        const gameMode = document.getElementById('mp-gamemode').value;
        const hostOnlyExit = document.getElementById('mp-host-only-exit').checked;
        const friendlyFire = document.getElementById('mp-friendly-fire').checked;
        
        if (isPrivate && !password) {
            alert('Please enter a password for private lobby');
            return;
        }
        
        this.closeCreateLobby();
        this.close();
        
        // Create lobby WITHOUT starting game
        try {
            const lobbyId = await multiplayer.createLobby(isPrivate, password, gameMode, lobbyName);
            
            // Set host-only exit if enabled
            if (hostOnlyExit) {
                await multiplayer.setHostOnlyLevelExit(true);
            }
            
            // Set friendly fire setting
            await multiplayer.setFriendlyFire(friendlyFire);
            
            // Show lobby waiting room
            this.showLobbyRoom(lobbyId, isPrivate, password, gameMode);
        } catch (error) {
            alert('Failed to create lobby: ' + error.message);
        }
    },
    
    // Join public lobby
    async joinLobby(lobbyId) {
        try {
            // Prevent underlying splash from catching this click
            const splash = document.getElementById('splash');
            if (splash) splash.style.pointerEvents = 'none';
            const gameMode = await multiplayer.joinLobby(lobbyId, null);
            this.closeJoinLobby();
            this.close();
            
            // Show lobby waiting room
            this.showLobbyRoom(lobbyId, false, null, gameMode);
        } catch (error) {
            alert('Failed to join lobby: ' + error.message);
        }
    },
    
    // Join private lobby
    async joinPrivateLobby() {
        const lobbyCode = document.getElementById('mp-lobby-code').value.trim();
        const password = document.getElementById('mp-lobby-password').value;
        
        if (!lobbyCode) {
            alert('Please enter a lobby code');
            return;
        }
        
        try {
            // Prevent underlying splash from catching this click
            const splash = document.getElementById('splash');
            if (splash) splash.style.pointerEvents = 'none';
            const gameMode = await multiplayer.joinLobby(lobbyCode, password);
            this.closeJoinLobby();
            this.close();
            
            // Show lobby waiting room
            this.showLobbyRoom(lobbyCode, true, password, gameMode);
        } catch (error) {
            alert('Failed to join lobby: ' + error.message);
        }
    },
    
    // Close menus
    close() {
        const menu = document.getElementById('multiplayer-menu');
        if (menu) menu.remove();
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
    },
    
    closeCreateLobby() {
        const menu = document.getElementById('create-lobby-menu');
        if (menu) menu.remove();
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
    },
    
    closeJoinLobby() {
        const menu = document.getElementById('join-lobby-menu');
        if (menu) menu.remove();
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
    },
    
    // Show lobby waiting room
    showLobbyRoom(lobbyId, isPrivate, password, gameMode) {
        const html = `
            <div id="lobby-room" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 25; display: flex; align-items: center; justify-content: center;">
                <div style="background: #fff; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%;">
                    <h1 style="margin: 0 0 10px 0; text-align: center;">LOBBY</h1>
                    <p style="text-align: center; color: #666; margin: 0 0 20px 0;">
                        Code: <strong>${lobbyId}</strong>
                        ${isPrivate ? `<br>Password: <strong>${password}</strong>` : ''}
                        <br>Mode: <strong>${gameMode.toUpperCase()}</strong>
                    </p>
                    
                    <div id="player-list" style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; max-height: 300px; overflow-y: auto;">
                        <h3 style="margin: 0 0 10px 0;">Players (1/${multiplayer.maxPlayers})</h3>
                        <div id="players-container"></div>
                    </div>
                    
                    ${multiplayer.isHost ? `
                        <button id="start-game-btn" onclick="multiplayerUI.startLobbyGame('${gameMode}')" style="width: 100%; padding: 15px; font-size: 20px; cursor: pointer; background: #0a0; color: #fff; border: none; border-radius: 5px; font-weight: bold; margin-bottom: 10px;">START GAME</button>
                    ` : `
                        <p style="text-align: center; color: #666; font-style: italic;">Waiting for host to start...</p>
                    `}
                    
                    <button onclick="multiplayerUI.leaveLobbyRoom()" style="width: 100%; padding: 10px; font-size: 16px; cursor: pointer; background: #f44; color: #fff; border: none; border-radius: 5px;">Leave Lobby</button>
                </div>
            </div>
        `;
        
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        
        // Update player list periodically
        this.updatePlayerList();
        this.playerListInterval = setInterval(() => this.updatePlayerList(), 1000);
        
        // Listen for game start if not host
        if (!multiplayer.isHost) {
            multiplayer.listenForGameStart(() => {
                console.log('🎮 Client received game start signal - closing lobby UI');
                this.startLobbyGame(gameMode);
            });
        }
    },
    
    // Update player list in lobby
    updatePlayerList() {
        const container = document.getElementById('players-container');
        if (!container) return;
        
        const players = multiplayer.players;
        const playerCount = Object.keys(players).length + 1; // +1 for self
        
        // Helper to fix white text on white background
        const getVisibleColor = (color) => {
            const c = (color || '#fff').toLowerCase();
            return (c === '#ffffff' || c === '#fff' || c === 'white') ? '#000' : color;
        };
        
        const myNameColor = getVisibleColor(multiplayer.settings.nameColor);
        
        let html = `
            <div style="padding: 10px; background: #fff; border-radius: 5px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="display: inline-block; width: 20px; height: 20px; background: ${multiplayer.settings.color}; border-radius: 50%; margin-right: 10px; vertical-align: middle;"></span>
                    <strong style="color: ${myNameColor};">${multiplayer.settings.name}</strong>
                    ${multiplayer.isHost ? ' <span style="color: #fa0;">(HOST)</span>' : ''}
                </div>
            </div>
        `;
        
        for (const [id, player] of Object.entries(players)) {
            const playerNameColor = getVisibleColor(player.nameColor);
            html += `
                <div style="padding: 10px; background: #fff; border-radius: 5px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="display: inline-block; width: 20px; height: 20px; background: ${player.color}; border-radius: 50%; margin-right: 10px; vertical-align: middle;"></span>
                        <strong style="color: ${playerNameColor};">${player.name}</strong>
                    </div>
                    ${multiplayer.isHost ? `<button onclick="multiplayer.kickPlayer('${id}')" style="padding: 5px 10px; background: #f44; color: #fff; border: none; border-radius: 3px; cursor: pointer;">Kick</button>` : ''}
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Update player count
        const listHeader = document.querySelector('#player-list h3');
        if (listHeader) {
            listHeader.textContent = `Players (${playerCount}/${multiplayer.maxPlayers})`;
        }
    },
    
    // Start game from lobby
    async startLobbyGame(gameMode) {
        console.log('🎮 startLobbyGame called, isHost:', multiplayer.isHost, 'gameMode:', gameMode);
        
        // Host: toggle start flag, then proceed
        if (multiplayer.isHost) {
            await multiplayer.startGame();
        }
        // Clients will be called by listenForGameStart callback (gameStarted already verified)

        // Close lobby room UI but keep connection
        console.log('🚪 Closing lobby room UI');
        this.leaveLobbyRoom(false);
        
        // Hide splash screen if still visible
        const splash = document.getElementById('splash');
        if (splash) splash.style.display = 'none';

        // Start actual game on both host and clients
        simulation.gameMode = gameMode;
        simulation.startGame();
        if (typeof simulation !== 'undefined') simulation.isMultiplayerLobby = false;
        
        setTimeout(() => {
            simulation.makeTextLog(`<span class='color-text'>Game started!</span>`);
        }, 500);
    },
    
    // Leave lobby room
    async leaveLobbyRoom(disconnect = true) {
        console.log('🚪 leaveLobbyRoom called, disconnect:', disconnect);
        
        if (this.playerListInterval) {
            clearInterval(this.playerListInterval);
            this.playerListInterval = null;
        }
        
        const room = document.getElementById('lobby-room');
        if (room) {
            console.log('✅ Removing lobby room UI');
            room.remove();
        } else {
            console.log('⚠️ Lobby room already removed');
        }
        
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
        if (disconnect && typeof simulation !== 'undefined') simulation.isMultiplayerLobby = false;
        
        if (disconnect) {
            await multiplayer.leaveLobby();
        }
    }
};

// Export for global use
window.multiplayerUI = multiplayerUI;
