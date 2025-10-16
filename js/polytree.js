// Progressive Mode - PolyTree System
const polyTree = {
    // Tech tree is dynamically generated from all available tech
    techTree: [],
    
    // Generate tech tree from game's tech list
    generateTechTree() {
        if (!tech || !tech.tech) return;
        
        this.techTree = [];
        const techPerTier = 20; // How many tech per tier
        
        // Get all non-lore, non-junk tech
        const availableTech = tech.tech.filter(t => !t.isLore && !t.isJunk && !t.isNonRefundable);
        
        // Sort by frequency (lower = rarer = better)
        availableTech.sort((a, b) => {
            // Use frequency as power indicator (lower frequency = rarer = more powerful)
            const freqA = a.frequency || 2;
            const freqB = b.frequency || 2;
            return freqB - freqA; // Higher frequency first (weaker tech)
        });
        
        // Distribute into tiers and assign costs
        availableTech.forEach((t, index) => {
            const tier = Math.floor(index / techPerTier) + 1;
            const tierIndex = index % techPerTier;
            
            // Cost increases exponentially with tier
            const baseCost = 20 + (tierIndex * 5);
            const tierMultiplier = Math.pow(1.5, tier - 1);
            const cost = Math.floor(baseCost * tierMultiplier);
            
            const techId = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            
            // Dependencies: require one tech from previous tier
            const dependencies = [];
            if (tier > 1) {
                const prevTierStart = (tier - 2) * techPerTier;
                const prevTierEnd = Math.min(prevTierStart + techPerTier, index);
                if (prevTierEnd > prevTierStart) {
                    // Pick a random dependency from previous tier
                    const depIndex = prevTierStart + Math.floor(Math.random() * (prevTierEnd - prevTierStart));
                    const depTech = availableTech[depIndex];
                    if (depTech) {
                        dependencies.push(depTech.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                    }
                }
            }
            
            this.techTree.push({
                id: techId,
                name: t.name,
                cost: cost,
                tier: tier,
                dependencies: dependencies
            });
        });
    },
    
    ownedTech: [], // Array of tech IDs that player owns
    
    // Initialize progressive mode
    init() {
        this.generateTechTree(); // Build tree from all available tech
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
        const polyGameElement = document.getElementById('poly-count-game');
        const polyDisplayElement = document.getElementById('poly-display');
        
        if (polyElement) {
            polyElement.textContent = simulation.polys;
        }
        if (polyGameElement) {
            polyGameElement.textContent = simulation.polys;
        }
        // Show/hide in-game counter based on mode
        if (polyDisplayElement && simulation.gameMode === 'progressive') {
            polyDisplayElement.style.display = 'block';
        } else if (polyDisplayElement) {
            polyDisplayElement.style.display = 'none';
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
        
        if (this.techTree.length === 0) {
            this.generateTechTree();
        }
        
        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding: 10px;">';
        
        // Group by tier
        const maxTier = Math.max(...this.techTree.map(t => t.tier));
        
        for (let tier = 1; tier <= maxTier; tier++) {
            const tierTech = this.techTree.filter(t => t.tier === tier);
            if (tierTech.length === 0) continue;
            
            html += `<div style="grid-column: 1 / -1; background: #ddd; padding: 8px; font-weight: bold; margin-top: ${tier > 1 ? '10px' : '0'};">TIER ${tier} (${tierTech.length} tech)</div>`;
            
            tierTech.forEach(tech => {
                const isOwned = this.ownedTech.includes(tech.id);
                const canBuy = this.canBuy(tech.id);
                
                let bgColor = '#fff';
                let borderColor = '#999';
                let textColor = '#333';
                
                if (isOwned) {
                    bgColor = '#afa';
                    borderColor = '#0a0';
                } else if (canBuy) {
                    bgColor = '#ffa';
                    borderColor = '#f90';
                } else {
                    bgColor = '#eee';
                    borderColor = '#999';
                    textColor = '#999';
                }
                
                html += `<div onclick="polyTree.buyTech('${tech.id}')" style="
                    padding: 10px;
                    background: ${bgColor};
                    border: 2px solid ${borderColor};
                    border-radius: 5px;
                    cursor: pointer;
                    color: ${textColor};
                    font-size: 12px;
                ">`;
                html += `<div style="font-weight: bold; margin-bottom: 5px;">${tech.name}</div>`;
                html += `<div style="font-size: 11px;">${isOwned ? '✓ OWNED' : tech.cost + ' polys'}</div>`;
                if (tech.dependencies.length > 0 && !isOwned) {
                    html += `<div style="font-size: 10px; color: #666; margin-top: 3px;">Requires prev tier</div>`;
                }
                html += `</div>`;
            });
        }
        
        html += '</div>';
        
        html += '<div style="margin-top: 20px; padding: 15px; border: 2px solid #333; background-color: #f5f5f5;">';
        html += `<p><strong>All ${this.techTree.length} Tech Available!</strong></p>`;
        html += '<p>• <span style="background: #afa; padding: 2px 5px;">Green</span> = Owned (appears in powerups) | ';
        html += '<span style="background: #ffa; padding: 2px 5px;">Yellow</span> = Can buy | ';
        html += '<span style="background: #eee; padding: 2px 5px;">Gray</span> = Locked</p>';
        html += '<p>• Tech organized by rarity/power (common → rare)</p>';
        html += '<p>• Must unlock tech from previous tier before buying higher tiers</p>';
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
