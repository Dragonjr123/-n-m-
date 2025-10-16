// Progressive Mode - PolyTree System
const polyTree = {
    techTree: [],
    ownedTech: [],
    
    // Generate tech tree from ALL available game tech
    generateTechTree() {
        if (!tech || !tech.tech) return;
        
        this.techTree = [];
        const techPerRow = 10;
        
        // Get all non-lore, non-junk tech
        const availableTech = tech.tech.filter(t => !t.isLore && !t.isJunk && !t.isNonRefundable);
        
        // Sort WEAK to STRONG: high frequency = weak (comes first)
        availableTech.sort((a, b) => {
            const freqA = a.frequency || 2;
            const freqB = b.frequency || 2;
            const maxA = a.maxCount || 1;
            const maxB = b.maxCount || 1;
            
            if (freqA !== freqB) return freqB - freqA; // Higher freq first = weaker
            return maxB - maxA; // Higher maxCount = weaker (stackable)
        });
        
        // Build tree structure
        availableTech.forEach((t, index) => {
            const row = Math.floor(index / techPerRow);
            const col = index % techPerRow;
            const baseCost = 15 + (col * 3);
            const cost = Math.floor(baseCost * Math.pow(1.4, row));
            const techId = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            
            // Dependencies from previous row
            const dependencies = [];
            if (row > 0) {
                const prevRowStart = (row - 1) * techPerRow;
                const prevRowEnd = Math.min(prevRowStart + techPerRow, index);
                if (prevRowEnd > prevRowStart) {
                    const depIndex = prevRowStart + Math.floor(Math.random() * (prevRowEnd - prevRowStart));
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
                row: row,
                col: col,
                dependencies: dependencies
            });
        });
    },
    
    init() {
        this.generateTechTree();
        simulation.polys = 0;
        simulation.firstPowerUpSpawned = false;
        this.ownedTech = [];
        this.updatePolyDisplay();
    },
    
    addPolys(amount) {
        simulation.polys += amount;
        this.updatePolyDisplay();
    },
    
    updatePolyDisplay() {
        const polyElement = document.getElementById('poly-count');
        if (polyElement) {
            polyElement.textContent = simulation.polys;
        }
    },
    
    canBuy(techId) {
        const techNode = this.techTree.find(t => t.id === techId);
        if (!techNode) return false;
        if (this.ownedTech.includes(techId)) return false;
        if (simulation.polys < techNode.cost) return false;
        
        for (let dep of techNode.dependencies) {
            if (!this.ownedTech.includes(dep)) return false;
        }
        return true;
    },
    
    buyTech(techId) {
        if (!this.canBuy(techId)) return false;
        
        const techNode = this.techTree.find(t => t.id === techId);
        simulation.polys -= techNode.cost;
        this.ownedTech.push(techId);
        
        this.updatePolyDisplay();
        this.renderTree();
        return true;
    },
    
    getRandomOwnedTech() {
        if (this.ownedTech.length === 0) return null;
        return this.ownedTech[Math.floor(Math.random() * this.ownedTech.length)];
    },
    
    // Visual tech tree renderer
    renderTree() {
        const container = document.getElementById('polytree-content');
        if (!container) return;
        
        if (this.techTree.length === 0) {
            this.generateTechTree();
        }
        
        const nodeW = 140;
        const nodeH = 50;
        const gapX = 20;
        const gapY = 80;
        const maxRow = Math.max(...this.techTree.map(t => t.row));
        const svgWidth = 10 * (nodeW + gapX) + 100;
        const svgHeight = (maxRow + 1) * (nodeH + gapY) + 100;
        
        let html = `<svg width="${svgWidth}" height="${svgHeight}" style="background: #f9f9f9; border: 2px solid #333;">`;
        
        // Draw dependency lines
        this.techTree.forEach(tech => {
            const x = 50 + tech.col * (nodeW + gapX);
            const y = 50 + tech.row * (nodeH + gapY);
            
            tech.dependencies.forEach(depId => {
                const depTech = this.techTree.find(t => t.id === depId);
                if (depTech) {
                    const depX = 50 + depTech.col * (nodeW + gapX);
                    const depY = 50 + depTech.row * (nodeH + gapY);
                    const isPathOwned = this.ownedTech.includes(tech.id) && this.ownedTech.includes(depId);
                    const lineColor = isPathOwned ? '#0a0' : '#ccc';
                    html += `<line x1="${depX + nodeW/2}" y1="${depY + nodeH}" x2="${x + nodeW/2}" y2="${y}" stroke="${lineColor}" stroke-width="2"/>`;
                }
            });
        });
        
        // Draw nodes
        this.techTree.forEach(tech => {
            const x = 50 + tech.col * (nodeW + gapX);
            const y = 50 + tech.row * (nodeH + gapY);
            const isOwned = this.ownedTech.includes(tech.id);
            const canBuy = this.canBuy(tech.id);
            
            let fillColor, strokeColor, textColor;
            if (isOwned) {
                fillColor = '#c8ffc8';
                strokeColor = '#0a0';
                textColor = '#000';
            } else if (canBuy) {
                fillColor = '#fff8c8';
                strokeColor = '#fa0';
                textColor = '#000';
            } else {
                fillColor = '#fff';
                strokeColor = '#999';
                textColor = '#666';
            }
            
            html += `<g onclick="polyTree.buyTech('${tech.id}')" style="cursor: pointer;">`;
            html += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="8" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2.5"/>`;
            
            const displayName = tech.name.length > 18 ? tech.name.substring(0, 16) + '...' : tech.name;
            html += `<text x="${x + nodeW/2}" y="${y + 22}" text-anchor="middle" fill="${textColor}" font-size="11" font-weight="bold" font-family="Arial">${displayName}</text>`;
            
            if (isOwned) {
                html += `<text x="${x + nodeW/2}" y="${y + 38}" text-anchor="middle" fill="#0a0" font-size="10" font-weight="bold" font-family="Arial">✓ OWNED</text>`;
            } else {
                // Poly diamond logo
                const px = x + nodeW/2 - 25;
                const py = y + 37;
                html += `<polygon points="${px},${py-5} ${px+6},${py} ${px},${py+5} ${px-6},${py}" fill="#a8f" stroke="#66f" stroke-width="1.5"/>`;
                html += `<text x="${x + nodeW/2 - 14}" y="${y + 39}" text-anchor="start" fill="${textColor}" font-size="11" font-family="Arial">${tech.cost}</text>`;
            }
            
            html += `</g>`;
        });
        
        html += '</svg>';
        
        // Legend
        html += '<div style="margin: 20px; padding: 15px; border: 2px solid #333; background: #fff; border-radius: 8px;">';
        html += '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">';
        html += '<svg width="30" height="30"><polygon points="15,8 22,15 15,22 8,15" fill="#a8f" stroke="#66f" stroke-width="2"/></svg>';
        html += '<strong style="font-size: 18px;">Poly Currency</strong></div>';
        html += `<p><strong>${this.techTree.length} Tech Available</strong> | Organized WEAK → STRONG (top to bottom)</p>`;
        html += '<p>• <span style="background: #c8ffc8; padding: 3px 8px; border: 2px solid #0a0; border-radius: 4px;">Green</span> = Owned (appears in powerups)</p>';
        html += '<p>• <span style="background: #fff8c8; padding: 3px 8px; border: 2px solid #fa0; border-radius: 4px;">Yellow</span> = Can purchase now</p>';
        html += '<p>• <span style="background: #fff; padding: 3px 8px; border: 2px solid #999; border-radius: 4px;">Gray</span> = Locked (need previous row)</p>';
        html += '<p style="margin-top: 12px; font-weight: bold;">Click yellow node to unlock with polys</p>';
        html += '</div>';
        
        container.innerHTML = html;
    },
    
    awardPolyForKill(mob) {
        if (simulation.gameMode !== 'progressive') return;
        let polyReward = Math.floor(mob.maxHealth / 100);
        polyReward = Math.max(1, polyReward);
        this.addPolys(polyReward);
    },
    
    awardPolyForLevel() {
        if (simulation.gameMode !== 'progressive') return;
        const levelReward = 50 + (level.levelsCleared * 10);
        this.addPolys(levelReward);
        simulation.makeTextLog(`<span class='color-text'>Level complete! +${levelReward} polys</span>`);
    }
};
