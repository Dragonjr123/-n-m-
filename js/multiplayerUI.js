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
        
        // Update settings on change
        document.getElementById('mp-player-name').addEventListener('input', (e) => {
            multiplayer.settings.name = e.target.value || 'Player';
        });
        document.getElementById('mp-player-color').addEventListener('input', (e) => {
            multiplayer.settings.color = e.target.value;
        });
        document.getElementById('mp-name-color').addEventListener('input', (e) => {
            multiplayer.settings.nameColor = e.target.value;
        });
    },
    
    // Show create lobby screen
    showCreateLobby() {
        const html = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 21; display: flex; align-items: center; justify-content: center;">
                <div style="background: #fff; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
                    <h2 style="margin: 0 0 20px 0; text-align: center;">CREATE LOBBY</h2>
                    
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
        const lobbies = await multiplayer.getPublicLobbies();
        
        let lobbiesList = '';
        if (lobbies.length === 0) {
            lobbiesList = '<p style="text-align: center; color: #666;">No public lobbies available</p>';
        } else {
            lobbiesList = '<div style="max-height: 300px; overflow-y: auto;">';
            lobbies.forEach(lobby => {
                lobbiesList += `
                    <div onclick="multiplayerUI.joinLobby('${lobby.id}')" style="padding: 15px; margin-bottom: 10px; background: #f0f0f0; border-radius: 5px; cursor: pointer; border: 2px solid #ccc;">
                        <div style="font-weight: bold; font-size: 18px;">${lobby.gameMode.toUpperCase()}</div>
                        <div style="color: #666;">Players: ${lobby.playerCount} | Created: ${new Date(lobby.createdAt).toLocaleTimeString()}</div>
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
        const isPrivate = document.getElementById('mp-private').checked;
        const password = isPrivate ? document.getElementById('mp-password').value : null;
        const gameMode = document.getElementById('mp-gamemode').value;
        
        if (isPrivate && !password) {
            alert('Please enter a password for private lobby');
            return;
        }
        
        this.closeCreateLobby();
        this.close();
        
        // Start game FIRST, then create lobby
        simulation.gameMode = gameMode;
        simulation.startGame();
        
        // Wait for game to initialize, then create lobby
        setTimeout(async () => {
            try {
                const lobbyId = await multiplayer.createLobby(isPrivate, password, gameMode);
                
                // Show lobby code if private
                if (isPrivate) {
                    simulation.makeTextLog(`<span class='color-text'>Lobby created!</span><br>Code: ${lobbyId}<br>Password: ${password}`);
                } else {
                    simulation.makeTextLog(`<span class='color-text'>Public lobby created!</span><br>Code: ${lobbyId}`);
                }
            } catch (error) {
                simulation.makeTextLog(`<span class='color-d'>Failed to create lobby:</span> ${error.message}`);
            }
        }, 500);
    },
    
    // Join public lobby
    async joinLobby(lobbyId) {
        try {
            const gameMode = await multiplayer.joinLobby(lobbyId, null);
            this.closeJoinLobby();
            this.close();
            
            // Start game FIRST
            simulation.gameMode = gameMode;
            simulation.startGame();
            
            setTimeout(() => {
                simulation.makeTextLog(`<span class='color-text'>Joined lobby!</span>`);
            }, 500);
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
            const gameMode = await multiplayer.joinLobby(lobbyCode, password);
            this.closeJoinLobby();
            this.close();
            
            // Start game FIRST
            simulation.gameMode = gameMode;
            simulation.startGame();
            
            setTimeout(() => {
                simulation.makeTextLog(`<span class='color-text'>Joined private lobby!</span>`);
            }, 500);
        } catch (error) {
            alert('Failed to join lobby: ' + error.message);
        }
    },
    
    // Close menus
    close() {
        const menu = document.getElementById('multiplayer-menu');
        if (menu) menu.remove();
    },
    
    closeCreateLobby() {
        const menu = document.getElementById('create-lobby-menu');
        if (menu) menu.remove();
    },
    
    closeJoinLobby() {
        const menu = document.getElementById('join-lobby-menu');
        if (menu) menu.remove();
    }
};

// Export for global use
window.multiplayerUI = multiplayerUI;
