// Menu System for {n/m}
const menuSystem = {
    escapeHoldStart: 0,
    escapeHoldInterval: null,
    escapeOverlay: null,
    
    init() {
        // Use static overlay from index.html
        this.escapeOverlay = document.getElementById('escape-overlay');
        
        // Escape key hold-to-kill mechanic
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !e.repeat) {
                // Only allow during active gameplay (not on menus/splash)
                if (typeof simulation !== 'undefined' && typeof m !== 'undefined' && m.alive && !simulation.onTitlePage) {
                    this.escapeHoldStart = Date.now();
                    if (this.escapeOverlay) this.escapeOverlay.style.display = 'block';
                    
                    this.escapeHoldInterval = setInterval(() => {
                        const holdTime = Date.now() - this.escapeHoldStart;
                        const progress = Math.min(holdTime / 3000, 1); // 3 seconds
                        
                        if (this.escapeOverlay) this.escapeOverlay.style.background = `rgba(255, 0, 0, ${progress * 0.7})`;
                        
                        if (progress >= 1) {
                            this.killPlayer();
                        }
                    }, 50);
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Escape') {
                clearInterval(this.escapeHoldInterval);
                if (this.escapeOverlay) {
                    this.escapeOverlay.style.display = 'none';
                    this.escapeOverlay.style.background = 'rgba(255, 0, 0, 0)';
                }
            }
        });
    },
    
    killPlayer() {
        clearInterval(this.escapeHoldInterval);
        this.escapeOverlay.style.display = 'none';
        this.escapeOverlay.style.background = 'rgba(255, 0, 0, 0)';
        
        // Kill the player
        if (typeof m !== 'undefined' && m.alive) {
            m.damage(Infinity);
            if (typeof build !== 'undefined') build.unPauseGrid();
            if (typeof simulation !== 'undefined') simulation.paused = false;
        }
    },
    
    showMainMenuFromSplash() {
        // Hide splash completely
        document.getElementById('splash').style.display = 'none';
        
        // Show main menu together with existing main UI (info + experiment button)
        document.getElementById('main-menu').style.display = 'block';
        document.getElementById('info').style.display = 'block';
        document.getElementById('experiment-button').style.display = 'block';
        document.body.style.cursor = 'auto';
    },
    
    showMainMenu() {
        document.getElementById('splash').style.display = 'none';
        // Keep info and experiment button visible as part of main UI
        document.getElementById('info').style.display = 'block';
        document.getElementById('experiment-button').style.display = 'block';
        document.getElementById('experiment-grid').style.display = 'none';
        document.getElementById('polytree-container').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        document.getElementById('gamemode-select').style.display = 'none';
        document.getElementById('settings-menu').style.display = 'none';
        document.body.style.cursor = 'auto';
        document.body.style.overflowY = 'hidden';
    },
    
    showGameModeSelect() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('gamemode-select').style.display = 'flex';
    },
    
    showSettings() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('settings-menu').style.display = 'flex';
        // Sync settings
        document.getElementById('fps-select-menu').value = document.getElementById('fps-select').value;
        document.getElementById('community-maps-menu').checked = document.getElementById('community-maps').checked;
    },
    
    applySettings() {
        const fps = document.getElementById('fps-select-menu').value;
        const community = document.getElementById('community-maps-menu').checked;
        
        document.getElementById('fps-select').value = fps;
        document.getElementById('community-maps').checked = community;
        
        if (fps === 'max') {
            simulation.fpsCapDefault = 60;
        } else {
            simulation.fpsCapDefault = Number(fps);
        }
        
        simulation.isCommunityMaps = community;
        localSettings.fpsCapDefault = fps;
        localSettings.isCommunityMaps = community;
        localStorage.setItem("localSettings", JSON.stringify(localSettings));
        
        this.showMainMenu();
    },
    
    startGame(mode) {
        polyTree.gameMode = mode;
        
        const difficulty = document.getElementById('difficulty-gamemode').value;
        simulation.difficultyMode = Number(difficulty);
        document.getElementById('difficulty-select').value = difficulty;
        
        // Hide all menus
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('gamemode-select').style.display = 'none';
        document.getElementById('settings-menu').style.display = 'none';
        document.getElementById('splash').style.display = 'none';
        
        document.body.style.cursor = 'none';
        document.body.style.overflowY = 'hidden';
        
        // Start game
        if (mode === 'survival') {
            this.startSurvivalMode();
        } else {
            simulation.startGame();
        }
        
        if (mode === 'progressive') {
            simulation.makeTextLog(`◆ Progressive Mode - Earn Tesseracts per room!`);
        } else if (mode === 'adventure') {
            simulation.makeTextLog(`⚔️ Adventure Mode`);
        } else if (mode === 'survival') {
            simulation.makeTextLog(`🌊 Survival Mode - Wave 1`);
        }
    },
    
    startSurvivalMode() {
        simulation.isSurvivalMode = true;
        simulation.survivalWave = 1;
        simulation.survivalKillCount = 0;
        simulation.survivalKillsNeeded = 15;
        
        // Override level selection to use survival arena
        level.levels = ["survivalArena"];
        
        // Start game with custom survival map
        simulation.startGame();
        // Wave will start automatically after survivalArena level loads
    },
    
    showMultiplayerLobby() {
        document.getElementById('gamemode-select').style.display = 'none';
        document.getElementById('multiplayer-lobby').style.display = 'block';
        
        // Initialize multiplayer system if available
        if (typeof multiplayerSystem !== 'undefined') {
            multiplayerSystem.init();
        }
    }
};
