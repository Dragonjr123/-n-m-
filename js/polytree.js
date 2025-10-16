// Progressive Mode - PolyTree System
const polyTree = {
    // Tech tree structure with costs and dependencies
    techTree: [
        // Tier 1 - Starter tech (cheap, no dependencies)
        { id: "supply_chain", name: "supply chain", cost: 50, tier: 1, dependencies: [] },
        { id: "logistics", name: "logistics", cost: 75, tier: 1, dependencies: [] },
        { id: "gun_sciences", name: "gun sciences", cost: 100, tier: 1, dependencies: [] },
        
        // Tier 2 - Basic upgrades (require tier 1)
        { id: "arsenal", name: "arsenal", cost: 150, tier: 2, dependencies: ["gun_sciences"] },
        { id: "active_cooling", name: "active cooling", cost: 150, tier: 2, dependencies: ["gun_sciences"] },
        { id: "desublimated_ammunition", name: "desublimated ammunition", cost: 125, tier: 2, dependencies: ["logistics"] },
        
        // Tier 3 - Advanced upgrades
        { id: "integrated_armament", name: "integrated armament", cost: 250, tier: 3, dependencies: ["arsenal"] },
        { id: "entanglement", name: "entanglement", cost: 200, tier: 3, dependencies: ["arsenal"] },
        { id: "generalist", name: "generalist", cost: 300, tier: 3, dependencies: ["active_cooling"] },
        { id: "specialist", name: "specialist", cost: 300, tier: 3, dependencies: ["gun_sciences"] },
        
        // Tier 4 - Elite upgrades
        { id: "gun_turret", name: "gun turret", cost: 400, tier: 4, dependencies: ["desublimated_ammunition"] },
        { id: "inertial_frame", name: "inertial frame", cost: 350, tier: 4, dependencies: ["active_cooling"] },
        { id: "automatic", name: "automatic", cost: 500, tier: 4, dependencies: ["inertial_frame"] },
    ],
    
    ownedTech: [], // Array of tech IDs that player owns
    
    // Initialize progressive mode
    init() {
        simulation.polys = 0;
        simulation.firstPowerUpSpawned = false;
        this.ownedTech = [];
        this.updatePolyDisplay();
    },
    
    // Add polys to player
    addPolys(amount) {
        simulation.polys += amount;
        this.updatePolyDisplay();
    },
    
    // Update poly display
    updatePolyDisplay() {
        const polyElement = document.getElementById('poly-count');
        if (polyElement) {
            polyElement.textContent = simulation.polys;
        }
    },
    
    // Check if player can buy a tech
    canBuy(techId) {
        const techNode = this.techTree.find(t => t.id === techId);
        if (!techNode) return false;
        
        // Check if already owned
        if (this.ownedTech.includes(techId)) return false;
        
        // Check if player has enough polys
        if (simulation.polys < techNode.cost) return false;
        
        // Check if dependencies are met
        for (let dep of techNode.dependencies) {
            if (!this.ownedTech.includes(dep)) return false;
        }
        
        return true;
    },
    
    // Buy a tech
    buyTech(techId) {
        if (!this.canBuy(techId)) return false;
        
        const techNode = this.techTree.find(t => t.id === techId);
        simulation.polys -= techNode.cost;
        this.ownedTech.push(techId);
        
        this.updatePolyDisplay();
        this.renderTree();
        
        return true;
    },
    
    // Get random owned tech for powerup selection
    getRandomOwnedTech() {
        if (this.ownedTech.length === 0) return null;
        return this.ownedTech[Math.floor(Math.random() * this.ownedTech.length)];
    },
    
    // Render the tech tree UI
    renderTree() {
        const container = document.getElementById('polytree-content');
        if (!container) return;
        
        let html = '<svg width="1100" height="800" style="border: 1px solid #ccc;">';
        
        // Group techs by tier
        const tierPositions = {
            1: { x: 100, y: 100 },
            2: { x: 300, y: 100 },
            3: { x: 500, y: 100 },
            4: { x: 700, y: 100 }
        };
        
        const techPositions = {};
        
        // Calculate positions for each tech
        this.techTree.forEach((tech, index) => {
            const tierTechs = this.techTree.filter(t => t.tier === tech.tier);
            const tierIndex = tierTechs.indexOf(tech);
            const basePos = tierPositions[tech.tier];
            
            techPositions[tech.id] = {
                x: basePos.x,
                y: basePos.y + (tierIndex * 120)
            };
        });
        
        // Draw dependency lines
        this.techTree.forEach(tech => {
            const pos = techPositions[tech.id];
            tech.dependencies.forEach(depId => {
                const depPos = techPositions[depId];
                if (depPos && pos) {
                    const isOwned = this.ownedTech.includes(tech.id) && this.ownedTech.includes(depId);
                    html += `<line x1="${depPos.x + 80}" y1="${depPos.y + 25}" x2="${pos.x}" y2="${pos.y + 25}" stroke="${isOwned ? '#0a0' : '#999'}" stroke-width="2"/>`;
                }
            });
        });
        
        // Draw tech nodes
        this.techTree.forEach(tech => {
            const pos = techPositions[tech.id];
            const isOwned = this.ownedTech.includes(tech.id);
            const canBuy = this.canBuy(tech.id);
            
            let fillColor = '#fff';
            let strokeColor = '#333';
            let textColor = '#333';
            
            if (isOwned) {
                fillColor = '#afa';
                strokeColor = '#0a0';
            } else if (canBuy) {
                fillColor = '#ffa';
                strokeColor = '#f90';
            } else {
                fillColor = '#ddd';
                strokeColor = '#999';
                textColor = '#999';
            }
            
            html += `<g onclick="polyTree.buyTech('${tech.id}')" style="cursor: pointer;">`;
            html += `<rect x="${pos.x}" y="${pos.y}" width="160" height="50" rx="5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>`;
            html += `<text x="${pos.x + 80}" y="${pos.y + 22}" text-anchor="middle" fill="${textColor}" font-size="12" font-family="Arial">${tech.name}</text>`;
            html += `<text x="${pos.x + 80}" y="${pos.y + 38}" text-anchor="middle" fill="${textColor}" font-size="11" font-family="Arial">${isOwned ? 'OWNED' : tech.cost + ' polys'}</text>`;
            html += `</g>`;
        });
        
        html += '</svg>';
        
        html += '<div style="margin-top: 20px; padding: 10px; border: 1px solid #333; background-color: #f5f5f5;">';
        html += '<p><strong>How to use:</strong></p>';
        html += '<p>• <span style="color: #0a0;">Green</span> = Owned tech (appears in powerup choices)</p>';
        html += '<p>• <span style="color: #f90;">Yellow</span> = Can purchase now</p>';
        html += '<p>• <span style="color: #999;">Gray</span> = Locked (need dependencies or more polys)</p>';
        html += '<p>• Click a yellow tech to purchase it</p>';
        html += '<p>• Must buy prerequisites before advanced tech</p>';
        html += '</div>';
        
        container.innerHTML = html;
    },
    
    // Award polys for killing a mob
    awardPolyForKill(mob) {
        if (simulation.gameMode !== 'progressive') return;
        
        // Base polys based on mob health
        let polyReward = Math.floor(mob.maxHealth / 100);
        polyReward = Math.max(1, polyReward); // Minimum 1 poly
        
        this.addPolys(polyReward);
    },
    
    // Award polys for completing a level
    awardPolyForLevel() {
        if (simulation.gameMode !== 'progressive') return;
        
        const levelReward = 50 + (level.levelsCleared * 10);
        this.addPolys(levelReward);
        simulation.makeTextLog(`<span class='color-text'>Level complete! +${levelReward} polys</span>`);
    }
};
