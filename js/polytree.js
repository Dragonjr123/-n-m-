// PolyTree - Upgrade Tree System for {n/m}
const polyTree = {
    currency: 0, // Tesseracts
    unlocked: {}, // {techName: true/false}
    purchased: {}, // {techName: number} - tracks how many times bought
    gameMode: 'adventure', // 'progressive' or 'adventure'
    
    init() {
        const saved = localStorage.getItem('polyTreeData');
        if (saved) {
            const data = JSON.parse(saved);
            this.currency = data.currency || 0;
            this.unlocked = data.unlocked || {};
            this.purchased = data.purchased || {};
        } else {
            this.unlocked = {};
            this.purchased = {};
        }
    },
    
    save() {
        localStorage.setItem('polyTreeData', JSON.stringify({
            currency: this.currency,
            unlocked: this.unlocked,
            purchased: this.purchased
        }));
    },
    
    reset() {
        if (confirm('Reset PolyTree? This will erase all progress!')) {
            this.currency = 0;
            this.unlocked = {};
            this.purchased = {};
            this.save();
            this.showPolyTree();
        }
    },
    
    addCurrency(amount) {
        this.currency += amount;
        this.save();
        const display = document.getElementById('tesseract-count');
        if (display) display.textContent = this.currency;
    },
    
    // Smart cost calculation based on actual tech power
    getCost(techIndex) {
        if (typeof tech === 'undefined' || !tech.tech || !tech.tech[techIndex]) return 10;
        const t = tech.tech[techIndex];
        let cost = 5; // Base cost
        
        const desc = t.description.toLowerCase();
        const name = t.name.toLowerCase();
        
        // Analyze actual power level
        // Super powerful techs (100+)
        if (name.includes('lore') || t.isLore) cost += 150;
        if (desc.includes('100%') || desc.includes('triple') || desc.includes('quadruple')) cost += 100;
        if (name.includes('annihilation') || name.includes('explosion')) cost += 80;
        if (desc.includes('bot') && desc.includes('damage')) cost += 70;
        
        // Very powerful (50-100)
        if (desc.includes('50%') || desc.includes('double')) cost += 50;
        if (desc.includes('bot')) cost += 45;
        if (desc.includes('immune') || desc.includes('invincible')) cost += 60;
        if (desc.includes('80%') || desc.includes('90%')) cost += 55;
        
        // Powerful (30-50)
        if (desc.includes('40%') || desc.includes('35%')) cost += 30;
        if (desc.includes('stun') || desc.includes('freeze')) cost += 25;
        if (desc.includes('explosion') || desc.includes('aoe')) cost += 35;
        if (t.isGunTech || name.includes('gun')) cost += 20;
        
        // Medium power (15-30)
        if (desc.includes('25%') || desc.includes('22%') || desc.includes('20%')) cost += 15;
        if (desc.includes('damage')) cost += 12;
        if (desc.includes('fire')) cost += 10;
        if (t.isFieldTech) cost += 18;
        
        // Defense scaling
        if (desc.includes('harm')) cost += 20;
        if (desc.includes('health') || desc.includes('armor')) cost += 15;
        if (desc.includes('shield')) cost += 25;
        
        // Stack penalty
        if (t.maxCount > 1) cost = Math.floor(cost * 0.6);
        
        return Math.max(5, cost);
    },
    
    canAfford(techIndex) {
        return this.currency >= this.getCost(techIndex);
    },
    
    isUnlocked(techIndex) {
        if (typeof tech === 'undefined' || !tech.tech || !tech.tech[techIndex]) return false;
        const techName = tech.tech[techIndex].name;
        return this.unlocked[techName] === true;
    },
    
    // Check if tech can be purchased (prerequisites met)
    canPurchase(techIndex) {
        if (typeof tech === 'undefined' || !tech.tech || !tech.tech[techIndex]) return false;
        
        // Get the sorted tech list by cost
        const techList = [];
        for (let i = 0; i < tech.tech.length; i++) {
            const t = tech.tech[i];
            if (t.isNonRefundable || t.isExperimentHide) continue;
            techList.push({index: i, cost: this.getCost(i)});
        }
        techList.sort((a, b) => a.cost - b.cost);
        
        // Find position of this tech in sorted list
        let position = -1;
        for (let i = 0; i < techList.length; i++) {
            if (techList[i].index === techIndex) {
                position = i;
                break;
            }
        }
        
        if (position === -1) return false;
        
        // First tech is always available
        if (position === 0) return true;
        
        // For all other techs, the previous tech in the sorted list must be purchased
        const previousTechIndex = techList[position - 1].index;
        return this.isPurchased(previousTechIndex);
    },
    
    isPurchased(techIndex) {
        if (typeof tech === 'undefined' || !tech.tech || !tech.tech[techIndex]) return false;
        const techName = tech.tech[techIndex].name;
        return (this.purchased[techName] || 0) > 0;
    },
    
    getPurchaseCount(techIndex) {
        if (typeof tech === 'undefined' || !tech.tech || !tech.tech[techIndex]) return 0;
        const techName = tech.tech[techIndex].name;
        return this.purchased[techName] || 0;
    },
    
    unlock(techIndex) {
        if (typeof tech === 'undefined' || !tech.tech || !tech.tech[techIndex]) return false;
        
        // Check prerequisites
        if (!this.canPurchase(techIndex)) {
            alert("You must purchase cheaper techs first to unlock this!");
            return false;
        }
        
        const cost = this.getCost(techIndex);
        if (!this.canAfford(techIndex)) {
            alert("Not enough Tesseracts!");
            return false;
        }
        
        const techName = tech.tech[techIndex].name;
        this.currency -= cost;
        this.unlocked[techName] = true;
        this.purchased[techName] = (this.purchased[techName] || 0) + 1;
        this.save();
        this.showPolyTree(); // Rebuild UI
        return true;
    },
    
    // Calculate difficulty scaling based on purchased tech
    getDifficultyScaling() {
        if (typeof tech === 'undefined' || !tech.tech) return 0;
        let scaling = 0;
        for (let i = 0; i < tech.tech.length; i++) {
            const count = this.getPurchaseCount(i);
            if (count > 0) {
                const cost = this.getCost(i);
                scaling += cost * count * 0.01; // 1% difficulty per cost
            }
        }
        return scaling;
    },
    
    showPolyTree() {
        if (typeof tech === 'undefined' || !tech.tech) {
            console.error('Tech not loaded yet!');
            return;
        }
        
        document.getElementById('splash').style.display = 'none';
        document.getElementById('info').style.display = 'none';
        document.getElementById('experiment-button').style.display = 'none';
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('gamemode-select').style.display = 'none';
        document.getElementById('settings-menu').style.display = 'none';
        document.getElementById('choose-grid').style.display = 'none';
        document.getElementById('choose-background').style.display = 'none';
        
        const container = document.getElementById('polytree-container');
        container.style.display = 'block';
        document.body.style.cursor = 'auto';
        
        let html = `
            <div style="position: fixed; top: 0; left: 0; right: 0; background: #444; color: #fff; padding: 15px 20px; z-index: 100; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333;">
                <div>
                    <span style="font-size: 1.8em; font-weight: bold;">PolyTree</span>
                    <span style="margin-left: 20px; color:#0cf; font-size:1.3em;">◆</span>
                    <span id="tesseract-count" style="color:#0cf; font-weight:bold; font-size:1.3em;">${this.currency}</span>
                    <span style="color:#aaa; font-size:1.1em;"> Tesseracts</span>
                </div>
                <button onclick="menuSystem.showMainMenu()" class="SVG-button" style="padding: 10px 30px; font-size: 1.1em; background:#666; color:#fff;">Back</button>
            </div>
            <div style="padding-top: 70px; overflow: auto; height: 100vh;">
                <div style="padding: 30px; max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px;">
        `;
        
        // Organize by tier/cost for tree structure
        const techList = [];
        for (let i = 0; i < tech.tech.length; i++) {
            const t = tech.tech[i];
            if (t.isNonRefundable || t.isExperimentHide) continue;
            techList.push({index: i, cost: this.getCost(i), tech: t});
        }
        
        // Sort by cost (cheaper = earlier in tree)
        techList.sort((a, b) => a.cost - b.cost);
        
        // Generate nodes
        techList.forEach(item => {
            const i = item.index;
            const t = item.tech;
            const cost = item.cost;
            const unlocked = this.isUnlocked(i);
            const purchased = this.isPurchased(i);
            const canAfford = this.canAfford(i);
            const canPurchase = this.canPurchase(i);
            const count = this.getPurchaseCount(i);
            const maxCount = t.maxCount || 1;
            const isMaxed = count >= maxCount;
            
            let statusClass = '';
            let bgColor = '#fff';
            let statusText = '';
            let borderColor = '#333';
            
            if (isMaxed) {
                statusClass = 'build-tech-selected';
                bgColor = 'hsl(253, 100%, 84%)';
                statusText = `✓ MAXED (${count}/${maxCount})`;
                borderColor = 'hsl(253, 100%, 50%)';
            } else if (purchased) {
                statusClass = 'build-tech-selected';
                bgColor = 'hsl(253, 100%, 90%)';
                statusText = `◆ ${cost} (${count}/${maxCount})`;
                borderColor = 'hsl(253, 100%, 60%)';
            } else if (!canPurchase) {
                bgColor = '#888';
                statusText = `🔒 LOCKED - Buy previous tech first`;
                borderColor = '#555';
            } else if (canAfford) {
                statusText = `◆ ${cost} Tesseracts`;
                bgColor = '#efe';
                borderColor = '#0a0';
            } else {
                bgColor = '#ddd';
                statusText = `◆ ${cost} Tesseracts (need more ◆)`;
            }
            
            const isCount = count > 0 ? `(${count}x)` : '';
            const clickable = !isMaxed && canAfford && canPurchase;
            
            html += `
                <div ${clickable ? `onclick="polyTree.unlock(${i})"` : ''} 
                     style="background: ${bgColor}; padding: 12px; border: 3px solid ${borderColor}; border-radius: 6px; cursor: ${clickable ? 'pointer' : 'not-allowed'}; transition: all 0.2s;"
                     onmouseover="if(${clickable}) this.style.background='#dfd'"
                     onmouseout="this.style.background='${bgColor}'">
                    <div style="font-weight: bold; font-size: 1.2em; margin-bottom: 6px; display: flex; align-items: center;">
                        <div class="circle-grid tech" style="display: inline-block; margin-right: 8px;"></div>
                        ${t.name} ${isCount}
                    </div>
                    <div style="font-size: 0.85em; color: #555; margin-bottom: 8px; line-height: 1.4;">
                        ${t.description}
                    </div>
                    <div style="padding: 6px; background: rgba(0,0,0,0.08); border-radius: 4px; font-weight: bold; font-size: 0.9em; text-align: center;">
                        ${statusText}
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    },
    
    hidePolyTree() {
        document.getElementById('polytree-container').style.display = 'none';
    }
};

// Don't initialize here - wait for all scripts to load
// polyTree.init() will be called from index.js
