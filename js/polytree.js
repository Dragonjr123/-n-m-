// Progressive Mode - PolyTree System
const polyTree = {
    techTree: [],
    ownedTech: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    
    // Poly Miners
    minerLevel: 0,
    maxMinerLevel: 100,
    polyPerSecond: 0,
    lastMinerTick: Date.now(),
    
    // Generate tech tree from ALL available game tech
    generateTechTree() {
        if (!tech || !tech.tech) return;
        
        this.techTree = [];
        const branchWidth = 3; // Nodes per branch
        
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
        
        // Build TREE structure with branching - MUCH CHEAPER COSTS
        availableTech.forEach((t, index) => {
            const row = Math.floor(index / branchWidth);
            const col = index % branchWidth;
            const baseCost = 5 + (row * 2);
            const cost = Math.floor(baseCost * Math.pow(1.15, row)); // Reduced from 1.3 to 1.15
            const techId = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            
            // Tree-like dependencies: each node connects to 1-2 parents
            const dependencies = [];
            if (row > 0) {
                const prevRowStart = (row - 1) * branchWidth;
                const prevRowEnd = Math.min(prevRowStart + branchWidth, index);
                
                // Connect to parent in same column
                const sameColParent = prevRowStart + col;
                if (sameColParent < index && sameColParent >= prevRowStart) {
                    const depTech = availableTech[sameColParent];
                    if (depTech) {
                        dependencies.push(depTech.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                    }
                }
                
                // Sometimes add a second parent for branching effect
                if (Math.random() > 0.5 && prevRowEnd > prevRowStart) {
                    const altCol = (col + 1) % branchWidth;
                    const altParent = prevRowStart + altCol;
                    if (altParent < index && altParent >= prevRowStart) {
                        const depTech = availableTech[altParent];
                        if (depTech && !dependencies.includes(depTech.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'))) {
                            dependencies.push(depTech.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                        }
                    }
                }
            }
            
            this.techTree.push({
                id: techId,
                name: t.name,
                description: t.description || 'No description available',
                cost: cost,
                row: row,
                col: col,
                dependencies: dependencies
            });
        });
    },
    
    init() {
        this.generateTechTree();
        this.loadProgress(); // Load saved progress
        if (simulation.polys === undefined) simulation.polys = 0;
        simulation.firstPowerUpSpawned = false;
        this.updatePolyDisplay();
    },
    
    // Save/Load functionality
    saveProgress() {
        const saveData = {
            polys: simulation.polys || 0,
            ownedTech: this.ownedTech,
            minerLevel: this.minerLevel,
            version: 2
        };
        localStorage.setItem('polytree_save', JSON.stringify(saveData));
    },
    
    loadProgress() {
        const saved = localStorage.getItem('polytree_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (!simulation.polys || simulation.polys === 0) {
                    simulation.polys = data.polys || 0;
                }
                this.ownedTech = data.ownedTech || [];
                this.minerLevel = data.minerLevel || 0;
                this.updateMinerStats();
                console.log('Loaded polytree progress:', simulation.polys, 'polys,', this.ownedTech.length, 'tech owned, miner level', this.minerLevel);
            } catch (e) {
                console.error('Failed to load polytree save:', e);
                if (!simulation.polys) simulation.polys = 0;
                this.ownedTech = [];
                this.minerLevel = 0;
            }
        } else {
            if (!simulation.polys) simulation.polys = 0;
            this.ownedTech = [];
            this.minerLevel = 0;
            console.log('No saved polytree progress found');
        }
    },
    
    resetProgress() {
        if (confirm('Reset all poly progress? This cannot be undone!')) {
            simulation.polys = 0;
            this.ownedTech = [];
            this.minerLevel = 0;
            this.polyPerSecond = 0;
            localStorage.removeItem('polytree_save');
            this.updatePolyDisplay();
            this.renderTree();
        }
    },
    
    // Poly Miner System
    getMinerCost() {
        if (this.minerLevel >= this.maxMinerLevel) return Infinity;
        return Math.floor(10 * Math.pow(1.12, this.minerLevel));
    },
    
    updateMinerStats() {
        // Each level gives exponentially more polys/sec
        this.polyPerSecond = this.minerLevel > 0 ? Math.floor(this.minerLevel * Math.pow(1.05, this.minerLevel * 0.5)) : 0;
        const display = document.getElementById('poly-per-sec');
        if (display) {
            display.textContent = `+${this.polyPerSecond}/sec`;
        }
    },
    
    upgradeMiner() {
        const cost = this.getMinerCost();
        if (simulation.polys >= cost && this.minerLevel < this.maxMinerLevel) {
            simulation.polys -= cost;
            this.minerLevel++;
            this.updateMinerStats();
            this.updatePolyDisplay();
            this.saveProgress();
            this.renderTree();
            return true;
        }
        return false;
    },
    
    tickMiners() {
        if (this.minerLevel === 0) return;
        
        const now = Date.now();
        const deltaTime = (now - this.lastMinerTick) / 1000; // seconds
        this.lastMinerTick = now;
        
        const polysEarned = this.polyPerSecond * deltaTime;
        if (polysEarned > 0) {
            simulation.polys += polysEarned;
            this.updatePolyDisplay();
            
            // Auto-save every 5 seconds
            if (Math.random() < 0.1) {
                this.saveProgress();
            }
        }
    },
    
    addPolys(amount) {
        simulation.polys += amount;
        this.updatePolyDisplay();
        this.saveProgress();
    },
    
    updatePolyDisplay() {
        const polyElement = document.getElementById('poly-count');
        if (polyElement) {
            polyElement.textContent = Math.floor(simulation.polys || 0);
        }
        const perSecElement = document.getElementById('poly-per-sec');
        if (perSecElement) {
            perSecElement.textContent = `+${this.polyPerSecond}/sec`;
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
        this.saveProgress();
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
        
        const nodeW = 180;
        const nodeH = 60;
        const gapX = 100;
        const gapY = 120;
        const maxRow = Math.max(...this.techTree.map(t => t.row));
        const maxCol = Math.max(...this.techTree.map(t => t.col));
        const baseWidth = (maxCol + 1) * (nodeW + gapX) + 200;
        const baseHeight = (maxRow + 1) * (nodeH + gapY) + 200;
        const svgWidth = baseWidth * this.zoom;
        const svgHeight = baseHeight * this.zoom;
        
        let html = `<svg id="polytree-svg" width="${svgWidth}" height="${svgHeight}" style="background: #f9f9f9; border: 2px solid #333; cursor: grab;">
            <g id="tree-group" transform="translate(${this.panX}, ${this.panY}) scale(${this.zoom})">`;
        
        // Draw dependency lines with curves
        this.techTree.forEach(tech => {
            const x = 100 + tech.col * (nodeW + gapX);
            const y = 100 + tech.row * (nodeH + gapY);
            
            tech.dependencies.forEach(depId => {
                const depTech = this.techTree.find(t => t.id === depId);
                if (depTech) {
                    const depX = 100 + depTech.col * (nodeW + gapX);
                    const depY = 100 + depTech.row * (nodeH + gapY);
                    const isPathOwned = this.ownedTech.includes(tech.id) && this.ownedTech.includes(depId);
                    const lineColor = isPathOwned ? '#0a0' : '#ccc';
                    const midY = (depY + nodeH + y) / 2;
                    // Curved path for tree-like appearance
                    html += `<path d="M${depX + nodeW/2},${depY + nodeH} Q${depX + nodeW/2},${midY} ${x + nodeW/2},${y}" stroke="${lineColor}" stroke-width="3" fill="none"/>`;
                }
            });
        });
        
        // Draw nodes with hover tooltips
        this.techTree.forEach(tech => {
            const x = 100 + tech.col * (nodeW + gapX);
            const y = 100 + tech.row * (nodeH + gapY);
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
            
            // Clean description for tooltip
            const cleanDesc = tech.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
            
            html += `<g class="tech-node" data-tech-id="${tech.id}" data-description="${cleanDesc.replace(/"/g, '&quot;')}" onclick="polyTree.buyTech('${tech.id}')" style="cursor: pointer;">`;
            html += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="10" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3"/>`;
            
            const displayName = tech.name.length > 20 ? tech.name.substring(0, 18) + '...' : tech.name;
            html += `<text x="${x + nodeW/2}" y="${y + 28}" text-anchor="middle" fill="${textColor}" font-size="13" font-weight="bold" font-family="Arial">${displayName}</text>`;
            
            if (isOwned) {
                html += `<text x="${x + nodeW/2}" y="${y + 48}" text-anchor="middle" fill="#0a0" font-size="12" font-weight="bold" font-family="Arial">✓ OWNED</text>`;
            } else {
                // Poly diamond logo
                const px = x + nodeW/2 - 30;
                const py = y + 47;
                html += `<polygon points="${px},${py-6} ${px+7},${py} ${px},${py+6} ${px-7},${py}" fill="#a8f" stroke="#66f" stroke-width="2"/>`;
                html += `<text x="${x + nodeW/2 - 18}" y="${y + 50}" text-anchor="start" fill="${textColor}" font-size="13" font-family="Arial">${tech.cost}</text>`;
            }
            
            html += `</g>`;
        });
        
        html += '</g></svg>';
        
        // Tooltip container
        html += '<div id="tech-tooltip" style="display: none; position: fixed; background: rgba(0,0,0,0.9); color: #fff; padding: 12px 16px; border-radius: 8px; max-width: 350px; pointer-events: none; z-index: 1000; border: 2px solid #66f; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>';
        
        // Poly Miner Upgrade Section
        const minerCost = this.getMinerCost();
        const canUpgradeMiner = simulation.polys >= minerCost && this.minerLevel < this.maxMinerLevel;
        html += '<div style="margin: 20px; padding: 20px; border: 3px solid #a8f; background: linear-gradient(135deg, #f0f0ff 0%, #fff 100%); border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">';
        html += '<h2 style="margin: 0 0 15px 0; color: #66f; display: flex; align-items: center; gap: 10px;"><svg width="30" height="30"><polygon points="15,5 25,15 15,25 5,15" fill="#a8f" stroke="#66f" stroke-width="2"/></svg> POLY MINER</h2>';
        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">`;
        html += `<div><strong style="font-size: 18px;">Level: ${this.minerLevel} / ${this.maxMinerLevel}</strong><br><span style="color: #0a0; font-size: 16px;">Earning: ${this.polyPerSecond} polys/sec</span></div>`;
        if (this.minerLevel < this.maxMinerLevel) {
            const btnColor = canUpgradeMiner ? '#0a0' : '#999';
            const btnText = canUpgradeMiner ? `Upgrade (${minerCost} polys)` : `Need ${minerCost} polys`;
            html += `<button onclick="polyTree.upgradeMiner()" style="padding: 12px 24px; font-size: 18px; cursor: ${canUpgradeMiner ? 'pointer' : 'not-allowed'}; background: ${btnColor}; color: #fff; border: none; border-radius: 8px; font-weight: bold;">${btnText}</button>`;
        } else {
            html += `<div style="padding: 12px 24px; font-size: 18px; background: #fa0; color: #fff; border-radius: 8px; font-weight: bold;">MAX LEVEL! 🎉</div>`;
        }
        html += '</div>';
        if (this.minerLevel < this.maxMinerLevel) {
            const nextLevelProduction = Math.floor((this.minerLevel + 1) * Math.pow(1.05, (this.minerLevel + 1) * 0.5));
            html += `<p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Next level: +${nextLevelProduction} polys/sec</p>`;
        }
        html += '</div>';
        
        // Controls
        html += '<div style="margin: 20px; padding: 15px; border: 2px solid #333; background: #fff; border-radius: 8px;">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">';
        html += '<div style="display: flex; gap: 10px;">';
        html += '<button onclick="polyTree.zoomIn()" style="padding: 8px 16px; font-size: 16px; cursor: pointer; background: #333; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Zoom +</button>';
        html += '<button onclick="polyTree.zoomOut()" style="padding: 8px 16px; font-size: 16px; cursor: pointer; background: #333; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Zoom -</button>';
        html += '<button onclick="polyTree.centerTree()" style="padding: 8px 16px; font-size: 16px; cursor: pointer; background: #0a0; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Center</button>';
        html += '</div>';
        html += '<button onclick="polyTree.resetProgress()" style="padding: 8px 16px; font-size: 16px; cursor: pointer; background: #f44; color: #fff; border: none; border-radius: 5px; font-weight: bold;">Reset Progress</button>';
        html += '</div>';
        html += '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">';
        html += '<svg width="30" height="30"><polygon points="15,8 22,15 15,22 8,15" fill="#a8f" stroke="#66f" stroke-width="2"/></svg>';
        html += '<strong style="font-size: 18px;">Poly Currency</strong></div>';
        html += `<p><strong>${this.techTree.length} Tech Available</strong> | Tree structure: WEAK → STRONG (top to bottom)</p>`;
        html += '<p>• <span style="background: #c8ffc8; padding: 3px 8px; border: 2px solid #0a0; border-radius: 4px;">Green</span> = Owned (appears in powerups)</p>';
        html += '<p>• <span style="background: #fff8c8; padding: 3px 8px; border: 2px solid #fa0; border-radius: 4px;">Yellow</span> = Can purchase now</p>';
        html += '<p>• <span style="background: #fff; padding: 3px 8px; border: 2px solid #999; border-radius: 4px;">Gray</span> = Locked (need parent tech)</p>';
        html += '<p style="margin-top: 12px; font-weight: bold;">Click yellow node to unlock • Hover for description • Drag to pan</p>';
        html += '</div>';
        
        container.innerHTML = html;
        this.setupEventListeners();
    },
    
    setupEventListeners() {
        const svg = document.getElementById('polytree-svg');
        const tooltip = document.getElementById('tech-tooltip');
        if (!svg || !tooltip) return;
        
        // Pan functionality
        svg.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'svg' || e.target.id === 'tree-group') {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                svg.style.cursor = 'grabbing';
            }
        });
        
        svg.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.panX += dx;
                this.panY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                
                const group = document.getElementById('tree-group');
                if (group) {
                    group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
                }
            }
        });
        
        svg.addEventListener('mouseup', () => {
            this.isDragging = false;
            svg.style.cursor = 'grab';
        });
        
        svg.addEventListener('mouseleave', () => {
            this.isDragging = false;
            svg.style.cursor = 'grab';
            tooltip.style.display = 'none';
        });
        
        // Tooltip functionality
        const nodes = document.querySelectorAll('.tech-node');
        nodes.forEach(node => {
            node.addEventListener('mouseenter', (e) => {
                const desc = node.getAttribute('data-description');
                const techId = node.getAttribute('data-tech-id');
                const techData = this.techTree.find(t => t.id === techId);
                
                if (techData) {
                    tooltip.innerHTML = `<strong style="font-size: 16px; color: #a8f;">${techData.name}</strong><br><br>${desc}<br><br><em style="color: #fa0;">Cost: ${techData.cost} polys</em>`;
                    tooltip.style.display = 'block';
                }
            });
            
            node.addEventListener('mousemove', (e) => {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });
            
            node.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        });
        
        // Zoom with mouse wheel
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        });
    },
    
    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, 3);
        const group = document.getElementById('tree-group');
        if (group) {
            group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        }
    },
    
    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, 0.3);
        const group = document.getElementById('tree-group');
        if (group) {
            group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        }
    },
    
    centerTree() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.renderTree();
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
