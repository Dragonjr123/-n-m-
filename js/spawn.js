//main object for spawning things in a level
const spawn = {
    pickList: ["starter", "starter"],
    fullPickList: [
        "hopper", "hopper", "hopper",
        "shooter", "shooter",
        "striker", "striker",
        "laser", "laser",
        "exploder", "exploder",
        "stabber", "stabber",
        "launcher", "launcher",
        "springer", "springer",
        "pulsar", "pulsar",
        "sucker",
        "chaser",
        "sniper",
        "spinner",
        "grower",
        "beamer",
        "focuser",
        "spawner",
        "ghoster",
        "sneaker",
        "angelicHexil", // Rare angelic mob that drops revive powerups
    ],
    allowedGroupList: ["chaser", "spinner", "striker", "springer", "laser", "focuser", "beamer", "exploder", "spawner", "shooter", "launcher", "stabber", "sniper", "pulsar"],
    setSpawnList() { //this is run at the start of each new level to determine the possible mobs for the level
        //each level has 2 mobs: one new mob and one from the last level
        spawn.pickList.splice(0, 1);
        // If multiplayer provided the next pick, use it; otherwise pick randomly
        let nextPick = null;
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && multiplayer.pendingNextSpawnPick) {
            nextPick = multiplayer.pendingNextSpawnPick;
            multiplayer.pendingNextSpawnPick = null;
        } else {
            nextPick = spawn.fullPickList[Math.floor(Math.random() * spawn.fullPickList.length)];
        }
        spawn.pickList.push(nextPick);
    },
    spawnChance(chance) {
        return Math.random() < chance + 0.07 * simulation.difficulty && mob.length < -1 + 16 * Math.log10(simulation.difficulty + 1)
    },
    randomMob(x, y, chance = 1) {
        // In multiplayer, ONLY the host spawns mobs (unless creating ghost mobs from network)
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && !multiplayer.isHost && !multiplayer.isSpawningGhostMob) {
            return; // Clients never spawn mobs
        }
        if (spawn.spawnChance(chance) || chance === Infinity) {
            const pick = this.pickList[Math.floor(Math.random() * this.pickList.length)];
            this[pick](x, y);
        }
    },
    randomSmallMob(x, y,
        num = Math.max(Math.min(Math.round(Math.random() * simulation.difficulty * 0.2), 4), 0),
        size = 16 + Math.ceil(Math.random() * 15),
        chance = 1) {
        // In multiplayer, ONLY the host spawns mobs (unless creating ghost mobs from network)
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && !multiplayer.isHost && !multiplayer.isSpawningGhostMob) {
            return; // Clients never spawn mobs
        }
        if (spawn.spawnChance(chance)) {
            for (let i = 0; i < num; ++i) {
                const pick = this.pickList[Math.floor(Math.random() * this.pickList.length)];
                this[pick](x + Math.round((Math.random() - 0.5) * 20) + i * size * 2.5, y + Math.round((Math.random() - 0.5) * 20), size);
            }
        }
    },
    randomGroup(x, y, chance = 1) {
        // In multiplayer, ONLY the host spawns mobs (unless creating ghost mobs from network)
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && !multiplayer.isHost && !multiplayer.isSpawningGhostMob) {
            return; // Clients never spawn mobs
        }
        if (spawn.spawnChance(chance) && simulation.difficulty > 2 || chance == Infinity) {
            //choose from the possible picklist
            let pick = spawn.pickList[Math.floor(Math.random() * spawn.pickList.length)];
            //is the pick able to be a group?
            let canBeGroup = false;
            for (let i = 0, len = spawn.allowedGroupList.length; i < len; ++i) {
                if (spawn.allowedGroupList[i] === pick) {
                    canBeGroup = true;
                    break;
                }
            }
            if (canBeGroup) {
                if (Math.random() < 0.55) {
                    spawn.nodeGroup(x, y, pick);
                } else {
                    spawn.lineGroup(x, y, pick);
                }
            } else {
                if (Math.random() < 0.07) {
                    spawn[pick](x, y, 90 + Math.random() * 40); //one extra large mob
                    spawn.spawnOrbitals(mob[mob.length - 1], mob[mob.length - 1].radius + 50 + 200 * Math.random(), 1)
                } else if (Math.random() < 0.35) {
                    spawn.blockGroup(x, y) //hidden grouping blocks
                } else {
                    pick = (Math.random() < 0.5) ? "randomList" : "random";
                    if (Math.random() < 0.55) {
                        spawn.nodeGroup(x, y, pick);
                    } else {
                        spawn.lineGroup(x, y, pick);
                    }
                }
            }
        }
    },
    randomLevelBoss(x, y, options = ["shieldingBoss", "orbitalBoss", "historyBoss", "shooterBoss", "cellBossCulture", "bomberBoss", "spiderBoss", "launcherBoss", "laserTargetingBoss", "powerUpBoss", "snakeBoss", "streamBoss", "pulsarBoss", "spawnerBossCulture"]) {
        // In multiplayer, ONLY the host spawns mobs (unless creating ghost mobs from network)
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && !multiplayer.isHost && !multiplayer.isSpawningGhostMob) {
            return; // Clients never spawn mobs
        }
        // other bosses: suckerBoss, laserBoss, tetherBoss,    //these need a particular level to work so they are not included in the random pool
        spawn[options[Math.floor(Math.random() * options.length)]](x, y)
    },
    //mob templates *********************************************************************************************
    //***********************************************************************************************************
    MACHO(x = m.pos.x, y = m.pos.y) { //immortal mob that follows player         //if you have the tech it spawns at start of every level at the player
        // In multiplayer, only the host spawns mobs (unless creating ghost mobs from network)
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && !multiplayer.isHost && !multiplayer.isSpawningGhostMob) {
            return; // Clients don't spawn mobs
        }
        mobs.spawn(x, y, 3, 0.1, "transparent");
        let me = mob[mob.length - 1];
        me.stroke = "transparent"
        me.isShielded = true; //makes it immune to damage
        me.leaveBody = false;
        me.isBadTarget = true;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.collisionFilter.category = 0;
        me.collisionFilter.mask = 0; //cat.player //| cat.body
        me.chaseSpeed = 3.3
        me.isMACHO = true;
        me.frictionAir = 0.006

        me.do = function() {
            const sine = Math.sin(simulation.cycle * 0.015)
            this.radius = 370 * (1 + 0.1 * sine)
            //chase player
            const sub = Vector.sub(player.position, this.position)
            const mag = Vector.magnitude(sub)
            // follow physics
            // Matter.Body.setVelocity(this, { x: 0, y: 0 });
            // const where = Vector.add(this.position, Vector.mult(Vector.normalise(sub), this.chaseSpeed))
            // if (mag > 10) Matter.Body.setPosition(this, { x: where.x, y: where.y });

            //realistic physics
            const force = Vector.mult(Vector.normalise(sub), 0.000000003)
            this.force.x += force.x
            this.force.y += force.y


            if (mag < this.radius) { //buff to player when inside radius
                tech.isHarmMACHO = true;
                //draw halo
                ctx.strokeStyle = "rgba(80,120,200,0.2)" //"rgba(255,255,0,0.2)" //ctx.strokeStyle = `rgba(0,0,255,${0.5+0.5*Math.random()})`
                ctx.beginPath();
                ctx.arc(m.pos.x, m.pos.y, 36, 0, 2 * Math.PI);
                ctx.lineWidth = 10;
                ctx.stroke();
                // ctx.strokeStyle = "rgba(255,255,0,0.17)" //ctx.strokeStyle = `rgba(0,0,255,${0.5+0.5*Math.random()})`
                // ctx.beginPath();
                // ctx.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI);
                // ctx.lineWidth = 30;
                // ctx.stroke();
            } else {
                tech.isHarmMACHO = false;
            }
            //draw outline
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, this.radius + 15, 0, 2 * Math.PI);
            ctx.strokeStyle = "#000"
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },
    WIMP(x = level.exit.x + 300 * (Math.random() - 0.5), y = level.exit.y + 300 * (Math.random() - 0.5)) { //immortal mob that follows player //if you have the tech it spawns at start of every level at the exit
        mobs.spawn(x, y, 3, 0.1, "transparent");
        let me = mob[mob.length - 1];
        me.stroke = "transparent"
        me.isShielded = true; //makes it immune to damage
        me.leaveBody = false;
        me.isBadTarget = true;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.collisionFilter.category = 0;
        me.collisionFilter.mask = 0; //cat.player //| cat.body
        me.chaseSpeed = 1 + 1.5 * Math.random()

        me.awake = function() {
            //chase player
            const sub = Vector.sub(player.position, this.position)
            const where = Vector.add(this.position, Vector.mult(Vector.normalise(sub), this.chaseSpeed))

            Matter.Body.setPosition(this, { //hold position
                x: where.x,
                y: where.y
            });
            Matter.Body.setVelocity(this, { x: 0, y: 0 });

            //aoe damage to player
            if (m.immuneCycle < m.cycle && Vector.magnitude(Vector.sub(player.position, this.position)) < this.radius && !tech.isNeutronImmune) {
                const DRAIN = 0.07
                if (m.energy > DRAIN) {
                    m.energy -= DRAIN
                } else {
                    m.energy = 0;
                    m.damage(0.007 * simulation.dmgScale)
                    simulation.drawList.push({ //add dmg to draw queue
                        x: this.position.x,
                        y: this.position.y,
                        radius: this.radius,
                        color: simulation.mobDmgColor,
                        time: simulation.drawTime
                    });
                }
            }

            //aoe damage to mobs
            // for (let i = 0, len = mob.length; i < len; i++) {
            //     if (!mob[i].isShielded && Vector.magnitude(Vector.sub(mob[i].position, this.position)) < this.radius) {
            //         let dmg = b.dmgScale * 0.082
            //         if (Matter.Query.ray(map, mob[i].position, this.position).length > 0) dmg *= 0.25 //reduce damage if a wall is in the way
            //         if (mob[i].shield) dmg *= 4 //x5 to make up for the /5 that shields normally take
            //         mob[i].damage(dmg);
            //         if (tech.isNeutronSlow) {
            //             Matter.Body.setVelocity(mob[i], {
            //                 x: mob[i].velocity.x * this.vacuumSlow,
            //                 y: mob[i].velocity.y * this.vacuumSlow
            //             });
            //         }
            //     }
            // }

            //draw
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI);
            // ctx.fillStyle = "hsla(160, 100%, 35%,0.75)" //"rgba(255,0,255,0.2)";
            // ctx.globalCompositeOperation = "lighter"
            ctx.fillStyle = `rgba(25,139,170,${0.2+0.12*Math.random()})`;
            ctx.fill();
            this.radius = 100 * (1 + 0.25 * Math.sin(simulation.cycle * 0.03))
            // ctx.fillStyle = "#fff";
            // ctx.globalCompositeOperation = "difference";
            // ctx.fill();
            // ctx.globalCompositeOperation = "source-over"
        }
        me.do = function() { //wake up 2 seconds after the player moves
            if (player.speed > 1 && !m.isCloak) {
                setTimeout(() => { this.do = this.awake; }, 2000);
            }
            this.checkStatus();
        };
    },
    finalBoss(x, y, radius = 300) {
        mobs.spawn(x, y, 6, radius, "rgb(150,150,255)");
        let me = mob[mob.length - 1];
        setTimeout(() => { //fix mob in place, but allow rotation
            me.constraint = Constraint.create({
                pointA: {
                    x: me.position.x,
                    y: me.position.y
                },
                bodyB: me,
                stiffness: 0.001,
                damping: 1
            });
            World.add(engine.world, me.constraint);
        }, 2000); //add in a delay in case the level gets flipped left right

        me.isBoss = true;
        me.frictionAir = 0.01;
        me.memory = Infinity;
        me.locatePlayer();
        const density = 0.25
        Matter.Body.setDensity(me, density); //extra dense //normal is 0.001 //makes effective life much larger
        // spawn.shield(me, x, y, 1);
        me.onDeath = function() {

            //make a block body to replace this one
            //this body is too big to leave behind in the normal way mobs.replace()
            const len = body.length;
            const v = Matter.Vertices.hull(Matter.Vertices.clockwiseSort(this.vertices)) //might help with vertex collision issue, not sure
            body[len] = Matter.Bodies.fromVertices(this.position.x, this.position.y, v);
            Matter.Body.setVelocity(body[len], { x: 0, y: -3 });
            Matter.Body.setAngularVelocity(body[len], this.angularVelocity);
            body[len].collisionFilter.category = cat.body;
            body[len].collisionFilter.mask = cat.player | cat.map | cat.body | cat.bullet | cat.mob | cat.mobBullet;
            body[len].classType = "body";
            World.add(engine.world, body[len]); //add to world
            const expand = function(that, massLimit) {
                const scale = 1.05;
                Matter.Body.scale(that, scale, scale);
                if (that.mass < massLimit) setTimeout(expand, 20, that, massLimit);
            };
            expand(body[len], 200)

            function unlockExit() {
                level.exit.x = 5500;
                level.exit.y = -330;
                Matter.World.remove(engine.world, map[map.length - 1]);
                map.splice(map.length - 1, 1);
                simulation.draw.setPaths(); //redraw map draw path
            }

            //add lore level as next level if player took lore tech earlier in the game
            if (lore.techCount > (lore.techGoal - 1) && !simulation.isCheating) {
                simulation.makeTextLog(`<span class="lore-text">undefined</span> <span class='color-symbol'>=</span> ${lore.techCount}/${lore.techGoal}<br>level.levels.push("<span class='lore-text'>null</span>")`);
                level.levels.push("null")
                //remove block map element so exit is clear
                unlockExit()
            } else { //reset game
                let count = 0

                function loop() {
                    if (!simulation.paused) {
                        count++
                        if (count < 600) {
                            if (count === 1) simulation.makeTextLog(`<em>//enter testing mode to set level.levels.length to <strong>Infinite</strong></em>`);
                            if (!(count % 60)) simulation.makeTextLog(`simulation.analysis <span class='color-symbol'>=</span> ${(count/60- Math.random()).toFixed(3)}`);
                        } else if (count === 600) {
                            simulation.makeTextLog(`simulation.analysis <span class='color-symbol'>=</span> 1 <em>//analysis complete</em>`);
                        } else if (count === 720) {
                            simulation.makeTextLog(`<span class="lore-text">undefined</span> <span class='color-symbol'>=</span> ${lore.techCount}/${lore.techGoal}`)
                        } else if (count === 900) {
                            simulation.makeTextLog(`World.clear(engine.world) <em>//simulation successful</em>`);
                        } else if (count === 1140) {
                            // tech.isImmortal = false;
                            // m.death()
                            // m.alive = false;
                            // simulation.paused = true;
                            // m.health = 0;
                            // m.displayHealth();
                            document.getElementById("health").style.display = "none"
                            document.getElementById("health-bg").style.display = "none"
                            document.getElementById("text-log").style.opacity = 0; //fade out any active text logs
                            document.getElementById("fade-out").style.opacity = 1; //slowly fades out
                            // build.shareURL(false)
                            setTimeout(function() {
                                simulation.paused = true;
                                World.clear(engine.world);
                                Engine.clear(engine);
                                simulation.splashReturn();
                            }, 6000);
                            return
                        }
                    }
                    if (simulation.testing) {
                        unlockExit()
                        setTimeout(function() {
                            simulation.makeTextLog(`level.levels.length <span class='color-symbol'>=</span> <strong>Infinite</strong>`);
                        }, 1500);
                    } else {
                        requestAnimationFrame(loop);
                    }
                }
                requestAnimationFrame(loop);
            }
            // for (let i = 0; i < 3; i++)
            level.difficultyIncrease(simulation.difficultyMode) //ramp up damage
            //remove power Ups,  to avoid spamming console
            function removeAll(array) {
                for (let i = 0; i < array.length; ++i) Matter.World.remove(engine.world, array[i]);
            }
            removeAll(powerUp);
            powerUp = [];

            //pull in particles
            for (let i = 0, len = body.length; i < len; ++i) {
                const velocity = Vector.mult(Vector.normalise(Vector.sub(this.position, body[i].position)), 65)
                const pushUp = Vector.add(velocity, { x: 0, y: -0.5 })
                Matter.Body.setVelocity(body[i], Vector.add(body[i].velocity, pushUp));
            }
            //damage all mobs
            for (let i = 0, len = mob.length; i < len; ++i) {
                if (mob[i] !== this) mob[i].damage(Infinity, true);
            }

            //draw stuff
            for (let i = 0, len = 22; i < len; i++) {
                simulation.drawList.push({ //add dmg to draw queue
                    x: this.position.x,
                    y: this.position.y,
                    radius: (i + 1) * 150,
                    color: `rgba(255,255,255,0.17)`,
                    time: 5 * (len - i + 1)
                });
            }
        };
        me.onDamage = function() {};
        me.cycle = 420;
        me.endCycle = 780;
        me.totalCycles = 0
        me.mode = 0;
        me.do = function() {
            // Matter.Body.setPosition(this, {
            //     x: x,
            //     y: y
            // });
            // Matter.Body.setVelocity(this, {
            //     x: 0,
            //     y: 0
            // });
            this.modeDo(); //this does different things based on the mode
            this.checkStatus();
            this.cycle++; //switch modes÷
            this.totalCycles++;
            // if (!m.isBodiesAsleep) {
            if (this.health > 0.25) {
                if (this.cycle > this.endCycle) {
                    this.cycle = 0;
                    this.mode++
                    if (this.mode > 2) {
                        this.mode = 0;
                        this.fill = "#50f";
                        this.rotateVelocity = Math.abs(this.rotateVelocity) * (player.position.x > this.position.x ? 1 : -1) //rotate so that the player can get away                    
                        this.modeDo = this.modeLasers
                        //push blocks and player away, since this is the end of suck, and suck causes blocks to fall on the boss and stun it
                        Matter.Body.scale(this, 10, 10);
                        Matter.Body.setDensity(me, density); //extra dense //normal is 0.001 //makes effective life much larger
                        if (!this.isShielded) spawn.shield(this, this.position.x, this.position.y, 1); // regen shield to also prevent stun
                        for (let i = 0, len = body.length; i < len; ++i) { //push blocks away horizontally
                            if (body[i].position.x > this.position.x) {
                                body[i].force.x = 0.5
                            } else {
                                body[i].force.x = -0.5
                            }
                        }
                    } else if (this.mode === 1) {
                        this.fill = "#50f"; // this.fill = "rgb(150,150,255)";
                        this.modeDo = this.modeSpawns
                    } else if (this.mode === 2) {
                        this.fill = "#000";
                        this.modeDo = this.modeSuck
                        Matter.Body.scale(this, 0.1, 0.1);
                        Matter.Body.setDensity(me, 100 * density); //extra dense //normal is 0.001 //makes effective life much larger
                    }
                }
            } else if (this.mode !== 3) { //all three modes at once
                this.cycle = 0;
                Matter.Body.setDensity(me, density); //extra dense //normal is 0.001 //makes effective life much larger
                if (this.mode === 2) {
                    Matter.Body.scale(this, 5, 5);
                } else {
                    Matter.Body.scale(this, 0.5, 0.5);
                }
                this.mode = 3
                this.fill = "#000";
                this.eventHorizon = 750
                this.spawnInterval = 600
                this.rotateVelocity = 0.001 * (player.position.x > this.position.x ? 1 : -1) //rotate so that the player can get away                    
                // if (!this.isShielded) spawn.shield(this, x, y, 1); //regen shield here ?
                this.modeDo = this.modeAll
            }
            // }
        };
        me.modeDo = function() {}
        me.modeAll = function() {
            this.modeSpawns()
            this.modeSuck()
            this.modeLasers()
        }
        me.spawnInterval = 395
        me.modeSpawns = function() {
            if (!(this.cycle % this.spawnInterval) && !m.isBodiesAsleep && mob.length < 40) {
                if (this.mode !== 3) Matter.Body.setAngularVelocity(this, 0.1)
                //fire a bullet from each vertex
                const whoSpawn = spawn.fullPickList[Math.floor(Math.random() * spawn.fullPickList.length)];
                for (let i = 0, len = 2 + this.totalCycles / 1000; i < len; i++) {
                    const vertex = this.vertices[i % 6]
                    spawn[whoSpawn](vertex.x + 50 * (Math.random() - 0.5), vertex.y + 50 * (Math.random() - 0.5));
                    const velocity = Vector.mult(Vector.perp(Vector.normalise(Vector.sub(this.position, vertex))), -18) //give the mob a rotational velocity as if they were attached to a vertex
                    Matter.Body.setVelocity(mob[mob.length - 1], {
                        x: this.velocity.x + velocity.x,
                        y: this.velocity.y + velocity.y
                    });
                }
                const len = (this.totalCycles / 400 + simulation.difficulty / 2 - 30) / 15
                for (let i = 0; i < len; i++) {
                    spawn.randomLevelBoss(3000 + 2000 * (Math.random() - 0.5), -1100 + 200 * (Math.random() - 0.5))
                }
            }
        }
        me.eventHorizon = 1300
        me.eventHorizonCycleRate = 4 * Math.PI / me.endCycle
        me.modeSuck = function() {
            //eventHorizon waves in and out
            const eventHorizon = this.eventHorizon * (1 - 0.25 * Math.cos(simulation.cycle * this.eventHorizonCycleRate)) //0.014
            //draw darkness
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, eventHorizon * 0.2, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(0,20,40,0.6)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, eventHorizon * 0.4, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(0,20,40,0.4)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, eventHorizon * 0.6, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(0,20,40,0.3)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, eventHorizon * 0.8, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(0,20,40,0.2)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, eventHorizon, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(0,0,0,0.05)";
            ctx.fill();
            //when player is inside event horizon
            if (Vector.magnitude(Vector.sub(this.position, player.position)) < eventHorizon) {
                if (m.energy > 0) m.energy -= 0.01
                if (m.energy < 0.15 && m.immuneCycle < m.cycle) {
                    m.damage(0.0004 * simulation.dmgScale);
                }
                const angle = Math.atan2(player.position.y - this.position.y, player.position.x - this.position.x);
                player.force.x -= 0.0017 * Math.cos(angle) * player.mass * (m.onGround ? 1.7 : 1);
                player.force.y -= 0.0017 * Math.sin(angle) * player.mass;
                //draw line to player
                ctx.beginPath();
                ctx.moveTo(this.position.x, this.position.y);
                ctx.lineTo(m.pos.x, m.pos.y);
                ctx.lineWidth = Math.min(60, this.radius * 2);
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(m.pos.x, m.pos.y, 40, 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fill();
            }
            this.curl(eventHorizon);
        }
        me.rotateVelocity = 0.0025
        me.rotateCount = 0;
        me.modeLasers = function() {
            if (!m.isBodiesAsleep && !this.isStunned) {
                let slowed = false //check if slowed
                for (let i = 0; i < this.status.length; i++) {
                    if (this.status[i].type === "slow") {
                        slowed = true
                        break
                    }
                }
                if (!slowed) {
                    this.rotateCount++
                    Matter.Body.setAngle(this, this.rotateCount * this.rotateVelocity)
                    Matter.Body.setAngularVelocity(this, 0)
                    Matter
                }
            }
            if (this.cycle < 240) { //damage scales up over 2 seconds to give player time to move
                const scale = this.cycle / 240
                const dmg = (this.cycle < 120) ? 0 : 0.14 * simulation.dmgScale * scale
                ctx.beginPath();
                this.laser(this.vertices[0], this.angle + Math.PI / 6, dmg);
                this.laser(this.vertices[1], this.angle + 3 * Math.PI / 6, dmg);
                this.laser(this.vertices[2], this.angle + 5 * Math.PI / 6, dmg);
                this.laser(this.vertices[3], this.angle + 7 * Math.PI / 6, dmg);
                this.laser(this.vertices[4], this.angle + 9 * Math.PI / 6, dmg);
                this.laser(this.vertices[5], this.angle + 11 * Math.PI / 6, dmg);
                ctx.strokeStyle = "#50f";
                ctx.lineWidth = 1.5 * scale;
                ctx.setLineDash([70 + 300 * Math.random(), 55 * Math.random()]);
                ctx.stroke(); // Draw it
                ctx.setLineDash([0, 0]);
                ctx.lineWidth = 20;
                ctx.strokeStyle = `rgba(80,0,255,${0.07*scale})`;
                ctx.stroke(); // Draw it
            } else {
                ctx.beginPath();
                this.laser(this.vertices[0], this.angle + Math.PI / 6);
                this.laser(this.vertices[1], this.angle + 3 * Math.PI / 6);
                this.laser(this.vertices[2], this.angle + 5 * Math.PI / 6);
                this.laser(this.vertices[3], this.angle + 7 * Math.PI / 6);
                this.laser(this.vertices[4], this.angle + 9 * Math.PI / 6);
                this.laser(this.vertices[5], this.angle + 11 * Math.PI / 6);
                ctx.strokeStyle = "#50f";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([70 + 300 * Math.random(), 55 * Math.random()]);
                ctx.stroke(); // Draw it
                ctx.setLineDash([0, 0]);
                ctx.lineWidth = 20;
                ctx.strokeStyle = "rgba(80,0,255,0.07)";
                ctx.stroke(); // Draw it
            }
            me.laser = function(where, angle, dmg = 0.14 * simulation.dmgScale) {
                const vertexCollision = function(v1, v1End, domain) {
                    for (let i = 0; i < domain.length; ++i) {
                        let vertices = domain[i].vertices;
                        const len = vertices.length - 1;
                        for (let j = 0; j < len; j++) {
                            results = simulation.checkLineIntersection(v1, v1End, vertices[j], vertices[j + 1]);
                            if (results.onLine1 && results.onLine2) {
                                const dx = v1.x - results.x;
                                const dy = v1.y - results.y;
                                const dist2 = dx * dx + dy * dy;
                                if (dist2 < best.dist2 && (!domain[i].mob || domain[i].alive)) best = {
                                    x: results.x,
                                    y: results.y,
                                    dist2: dist2,
                                    who: domain[i],
                                    v1: vertices[j],
                                    v2: vertices[j + 1]
                                };
                            }
                        }
                        results = simulation.checkLineIntersection(v1, v1End, vertices[0], vertices[len]);
                        if (results.onLine1 && results.onLine2) {
                            const dx = v1.x - results.x;
                            const dy = v1.y - results.y;
                            const dist2 = dx * dx + dy * dy;
                            if (dist2 < best.dist2) best = {
                                x: results.x,
                                y: results.y,
                                dist2: dist2,
                                who: domain[i],
                                v1: vertices[0],
                                v2: vertices[len]
                            };
                        }
                    }
                };

                const seeRange = 7000;
                best = {
                    x: null,
                    y: null,
                    dist2: Infinity,
                    who: null,
                    v1: null,
                    v2: null
                };
                const look = {
                    x: where.x + seeRange * Math.cos(angle),
                    y: where.y + seeRange * Math.sin(angle)
                };
                // vertexCollision(where, look, mob);
                vertexCollision(where, look, map);
                vertexCollision(where, look, body);
                if (!m.isCloak) vertexCollision(where, look, [player]);
                if (best.who && best.who === player && m.immuneCycle < m.cycle) {
                    if (m.immuneCycle < m.cycle + 60 + tech.collisionImmuneCycles) m.immuneCycle = m.cycle + 60 + tech.collisionImmuneCycles; //player is immune to damage extra time
                    m.damage(dmg);
                    simulation.drawList.push({ //add dmg to draw queue
                        x: best.x,
                        y: best.y,
                        radius: dmg * 1500,
                        color: "rgba(80,0,255,0.5)",
                        time: 20
                    });
                }
                //draw beam
                if (best.dist2 === Infinity) best = look;
                ctx.moveTo(where.x, where.y);
                ctx.lineTo(best.x, best.y);
            }
        }
    },
    blockGroup(x, y, num = 3 + Math.random() * 8) {
        for (let i = 0; i < num; i++) {
            const radius = 25 + Math.floor(Math.random() * 20)
            spawn.grouper(x + Math.random() * radius, y + Math.random() * radius, radius);
        }
    },
    grouper(x, y, radius = 25 + Math.floor(Math.random() * 20)) {
        mobs.spawn(x, y, 4, radius, "#777");
        let me = mob[mob.length - 1];
        me.mobType = 'grouper';
        me.g = 0.00015; //required if using 'gravity'
        me.accelMag = 0.0008 * simulation.accelScale;
        me.groupingRangeMax = 250000 + Math.random() * 100000;
        me.groupingRangeMin = (radius * 8) * (radius * 8);
        me.groupingStrength = 0.0005
        me.memory = 200;
        me.isGrouper = true;

        me.do = function() {
            this.gravity();
            this.checkStatus();
            if (this.seePlayer.recall) {
                this.seePlayerCheck();
                this.attraction();
                //tether to other blocks
                ctx.beginPath();
                for (let i = 0, len = mob.length; i < len; i++) {
                    if (mob[i].isGrouper && mob[i] != this && mob[i].isDropPowerUp) { //don't tether to self, bullets, shields, ...
                        const distance2 = Vector.magnitudeSquared(Vector.sub(this.position, mob[i].position))
                        if (distance2 < this.groupingRangeMax) {
                            if (!mob[i].seePlayer.recall) mob[i].seePlayerCheck(); //wake up sleepy mobs
                            if (distance2 > this.groupingRangeMin) {
                                const angle = Math.atan2(mob[i].position.y - this.position.y, mob[i].position.x - this.position.x);
                                const forceMag = this.groupingStrength * mob[i].mass;
                                mob[i].force.x -= forceMag * Math.cos(angle);
                                mob[i].force.y -= forceMag * Math.sin(angle);
                            }
                            ctx.moveTo(this.position.x, this.position.y);
                            ctx.lineTo(mob[i].position.x, mob[i].position.y);
                        }
                    }
                }
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    },
    starter(x, y, radius = Math.floor(20 + 20 * Math.random())) {
        //easy mob for on level 1
        mobs.spawn(x, y, 8, radius, "#9ccdc6");
        let me = mob[mob.length - 1];
        me.mobType = 'starter';
        // console.log(`mass=${me.mass}, radius = ${radius}`)
        me.accelMag = 0.0005 * simulation.accelScale;
        me.memory = 60;
        me.seeAtDistance2 = 1400000 //1200 vision range
        Matter.Body.setDensity(me, 0.0005) // normal density is 0.001 // this reduces life by half and decreases knockback

        me.do = function() {
            this.seePlayerByLookingAt();
            this.attraction();
            this.checkStatus();
        };
    },
    angelicHexil(x, y, radius = 40 + Math.floor(15 * Math.random())) {
        // Rare angelic mob that drops revive powerups - ONLY spawns in multiplayer
        // In multiplayer, ONLY the host spawns mobs (unless creating ghost mobs from network)
        if (typeof multiplayer !== 'undefined' && multiplayer.enabled && !multiplayer.isHost && !multiplayer.isSpawningGhostMob) {
            return; // Clients never spawn mobs
        }
        
        mobs.spawn(x, y, 6, radius, "#FFD700"); // 6 sides = hexagon, golden yellow color
        let me = mob[mob.length - 1];
        me.mobType = 'angelicHexil';
        me.stroke = "#FFA500"; // Orange stroke
        me.accelMag = 0.0003 * simulation.accelScale; // Slow movement
        me.memory = 180; // Long memory
        me.seeAtDistance2 = 2000000; // Good vision range
        me.frictionAir = 0.003; // Floaty movement
        me.isAngelicHexil = true;
        
        // High health - 5x normal
        Matter.Body.setDensity(me, 0.005); // 5x normal density = 5x health
        
        // Spin constantly
        me.spinSpeed = 0.015 + Math.random() * 0.01;
        me.spinDirection = Math.random() < 0.5 ? 1 : -1;
        
        // Override onDeath to ALWAYS drop revive powerup
        me.onDeath = function() {
            // Always drop revive powerup
            if (typeof powerUps !== 'undefined' && typeof powerUps.spawn === 'function') {
                powerUps.spawn(this.position.x, this.position.y, "revive", false);
                
                // Sync powerup spawn in multiplayer
                if (typeof multiplayer !== 'undefined' && multiplayer.enabled && multiplayer.isHost) {
                    // The powerup will be synced automatically via the normal powerup spawn mechanism
                    const lastPowerupIndex = powerUp.length - 1;
                    if (lastPowerupIndex >= 0) {
                        multiplayer.syncPowerupSpawn(lastPowerupIndex);
                    }
                }
            }
            
            // Visual effect
            if (typeof simulation !== 'undefined' && simulation.drawList) {
                for (let i = 0; i < 8; i++) {
                    simulation.drawList.push({
                        x: this.position.x + (Math.random() - 0.5) * 100,
                        y: this.position.y + (Math.random() - 0.5) * 100,
                        radius: 30 + Math.random() * 40,
                        color: "rgba(255, 215, 0, 0.6)",
                        time: 30 + Math.random() * 20
                    });
                }
            }
        };
        
        me.do = function() {
            // Constantly spin
            if (!this.isStunned) {
                Matter.Body.setAngularVelocity(this, this.spinSpeed * this.spinDirection);
            }
            
            // Glow effect - pulse between bright and dim
            const pulse = 0.7 + 0.3 * Math.sin(simulation.cycle * 0.05);
            this.fill = `rgba(255, 215, 0, ${pulse})`;
            
            // Draw halo effect
            if (typeof ctx !== 'undefined') {
                ctx.save();
                ctx.globalAlpha = 0.3 * pulse;
                ctx.beginPath();
                ctx.arc(this.position.x, this.position.y, this.radius * 1.5, 0, 2 * Math.PI);
                ctx.strokeStyle = "#FFD700";
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();
                
                // Draw spinning particles
                const particleCount = 6;
                for (let i = 0; i < particleCount; i++) {
                    const angle = (simulation.cycle * 0.02) + (i * Math.PI * 2 / particleCount);
                    const dist = this.radius * 1.3;
                    const px = this.position.x + Math.cos(angle) * dist;
                    const py = this.position.y + Math.sin(angle) * dist;
                    
                    ctx.beginPath();
                    ctx.arc(px, py, 3, 0, 2 * Math.PI);
                    ctx.fillStyle = "#FFFFFF";
                    ctx.fill();
                }
            }
            
            this.seePlayerCheck();
            this.attraction();
            this.checkStatus();
        };
    },
    cellBossCulture(x, y, radius = 20, num = 5) {
        const cellID = Math.random()
        for (let i = 0; i < num; i++) {
            spawn.cellBoss(x, y, radius, cellID)
        }
    },
    cellBoss(x, y, radius = 20, cellID) {
        mobs.spawn(x + Math.random(), y + Math.random(), 20, radius * (1 + 1.2 * Math.random()), "rgba(0,100,105,0.4)");
        let me = mob[mob.length - 1];
        me.mobType = 'cellBoss';
        me.stroke = "transparent"
        me.isBoss = true;
        me.isCell = true;
        me.cellID = cellID
        me.accelMag = 0.00016 * simulation.accelScale;
        me.memory = 40;
        me.isVerticesChange = true
        me.frictionAir = 0.012
        me.seePlayerFreq = Math.floor(11 + 7 * Math.random())
        me.seeAtDistance2 = 1400000;
        me.cellMassMax = 70
        me.collisionFilter.mask = cat.player | cat.bullet //| cat.body | cat.map
        Matter.Body.setDensity(me, 0.00035) // normal density is 0.001 // this reduces life by half and decreases knockback
        const k = 642 //k=r^2/m
        me.split = function() {
            Matter.Body.scale(this, 0.4, 0.4);
            this.radius = Math.sqrt(this.mass * k / Math.PI)
            spawn.cellBoss(this.position.x, this.position.y, this.radius, this.cellID);
            mob[mob.length - 1].health = this.health
        }
        me.onHit = function() { //run this function on hitting player
            this.health = 1;
            this.split();
        };
        me.onDamage = function(dmg) {
            if (Math.random() < 0.33 * dmg * Math.sqrt(this.mass) && this.health > dmg) this.split();
        }
        me.do = function() {
            if (!m.isBodiesAsleep) {
                this.seePlayerByDistOrLOS();
                this.checkStatus();
                this.attraction();

                if (this.seePlayer.recall && this.mass < this.cellMassMax) { //grow cell radius
                    const scale = 1 + 0.0002 * this.cellMassMax / this.mass;
                    Matter.Body.scale(this, scale, scale);
                    this.radius = Math.sqrt(this.mass * k / Math.PI)
                }
                if (!(simulation.cycle % this.seePlayerFreq)) { //move away from other mobs
                    const repelRange = 150
                    const attractRange = 700
                    for (let i = 0, len = mob.length; i < len; i++) {
                        if (mob[i].isCell && mob[i].id !== this.id) {
                            const sub = Vector.sub(this.position, mob[i].position)
                            const dist = Vector.magnitude(sub)
                            if (dist < repelRange) {
                                this.force = Vector.mult(Vector.normalise(sub), this.mass * 0.002)
                            } else if (dist > attractRange) {
                                this.force = Vector.mult(Vector.normalise(sub), -this.mass * 0.003)
                            }
                        }
                    }
                }
            }
        };
        me.onDeath = function() {
            this.isCell = false;
            let count = 0 //count other cells by id
            // console.log(this.cellID)
            for (let i = 0, len = mob.length; i < len; i++) {
                if (mob[i].isCell && mob[i].cellID === this.cellID) count++
            }
            if (count < 1) { //only drop a power up if this is the last cell
                powerUps.spawnBossPowerUp(this.position.x, this.position.y)
            } else {
                this.leaveBody = false;
                this.isDropPowerUp = false;
            }
        }
    },
    spawnerBossCulture(x, y, radius = 50, num = 8 + Math.min(20, simulation.difficulty * 0.4)) {
        tech.deathSpawnsFromBoss += 0.4
        const spawnID = Math.random()
        for (let i = 0; i < num; i++) spawn.spawnerBoss(x, y, radius, spawnID)
    },
    spawnerBoss(x, y, radius, spawnID) {
        mobs.spawn(x + Math.random(), y + Math.random(), 4, radius, "rgba(255,60,0,0.3)") //);
        let me = mob[mob.length - 1];
        me.mobType = 'spawnerBoss';
        me.isBoss = true;
        me.isSpawnBoss = true;
        me.spawnID = spawnID
        me.accelMag = 0.0002 * simulation.accelScale;
        me.memory = Infinity;
        me.showHealthBar = false;
        me.isVerticesChange = true
        me.frictionAir = 0.012
        me.seePlayerFreq = Math.floor(11 + 7 * Math.random())
        me.seeAtDistance2 = 200000 //1400000;
        me.cellMassMax = 70
        me.stroke = "transparent"
        me.collisionFilter.mask = cat.player | cat.bullet //| cat.body   //"rgba(255,60,0,0.3)"
        // Matter.Body.setDensity(me, 0.0014) // normal density is 0.001
        Matter.Body.setAngularVelocity(me, 0.12 * (Math.random() - 0.5))
        // spawn.shield(me, x, y, 1);

        me.onHit = function() { //run this function on hitting player
            this.explode();
        };
        me.doAwake = function() {
            if (!m.isBodiesAsleep) {
                this.alwaysSeePlayer();
                this.checkStatus();
                this.attraction();

                // if (this.seePlayer.recall && this.mass < this.cellMassMax) { //grow cell radius
                //     const scale = 1 + 0.0002 * this.cellMassMax / this.mass;
                //     Matter.Body.scale(this, scale, scale);
                //     this.radius = Math.sqrt(this.mass * k / Math.PI)
                // }
                if (!(simulation.cycle % this.seePlayerFreq)) { //move away from other mobs
                    const repelRange = 40
                    const attractRange = 240
                    for (let i = 0, len = mob.length; i < len; i++) {
                        if (mob[i].isSpawnBoss && mob[i].id !== this.id) {
                            const sub = Vector.sub(this.position, mob[i].position)
                            const dist = Vector.magnitude(sub)
                            if (dist < repelRange) {
                                this.force = Vector.mult(Vector.normalise(sub), this.mass * 0.002)
                            } else if (dist > attractRange) {
                                this.force = Vector.mult(Vector.normalise(sub), -this.mass * 0.002)
                            }
                        }
                    }
                }
            }
        }
        me.do = function() {
            this.checkStatus();
            if (this.seePlayer.recall) {
                this.do = this.doAwake
                //awaken other spawnBosses
                for (let i = 0, len = mob.length; i < len; i++) {
                    if (mob[i].isSpawnBoss && mob[i].spawnID === this.spawnID) mob[i].seePlayer.recall = 1
                }
            }
        };
        me.onDeath = function() {
            this.isSpawnBoss = false;
            let count = 0 //count other cells by id
            // console.log(this.spawnID)
            for (let i = 0, len = mob.length; i < len; i++) {
                if (mob[i].isSpawnBoss && mob[i].spawnID === this.spawnID) count++
            }
            if (count < 1) { //only drop a power up if this is the last cell
                powerUps.spawnBossPowerUp(this.position.x, this.position.y)
                tech.deathSpawnsFromBoss -= 0.4
            } else {
                this.leaveBody = false;
                this.isDropPowerUp = false;
            }

            const spawns = tech.deathSpawns + tech.deathSpawnsFromBoss
            const len = Math.min(12, spawns * Math.ceil(Math.random() * simulation.difficulty * spawns))
            for (let i = 0; i < len; i++) {
                spawn.spawns(this.position.x + (Math.random() - 0.5) * radius * 2.5, this.position.y + (Math.random() - 0.5) * radius * 2.5);
                Matter.Body.setVelocity(mob[mob.length - 1], {
                    x: this.velocity.x + (Math.random() - 0.5) * 10,
                    y: this.velocity.x + (Math.random() - 0.5) * 10
                });
            }

        }
    },
    powerUpBoss(x, y, vertices = 9, radius = 130) {
        mobs.spawn(x, y, vertices, radius, "transparent");
        let me = mob[mob.length - 1];
        me.mobType = 'powerUpBoss';
        me.isBoss = true;
        me.frictionAir = 0.01
        me.seeAtDistance2 = 1000000;
        me.accelMag = 0.0005 * simulation.accelScale;
        Matter.Body.setDensity(me, 0.00035); //normal is 0.001
        me.collisionFilter.mask = cat.bullet | cat.player //| cat.body
        me.memory = Infinity;
        me.seePlayerFreq = 30
        me.lockedOn = null;
        if (vertices === 9) {
            //on primary spawn
            powerUps.spawnBossPowerUp(me.position.x, me.position.y)
            powerUps.spawn(me.position.x, me.position.y, "heal");
            powerUps.spawn(me.position.x, me.position.y, "ammo");
        } else if (!m.isCloak) {
            me.foundPlayer();
        }
        me.onHit = function() { //run this function on hitting player
            powerUps.ejectTech()
            powerUps.spawn(m.pos.x + 60 * (Math.random() - 0.5), m.pos.y + 60 * (Math.random() - 0.5), "ammo");
            powerUps.spawn(m.pos.x + 60 * (Math.random() - 0.5), m.pos.y + 60 * (Math.random() - 0.5), "research");
        };
        me.onDeath = function() {
            this.leaveBody = false;
            if (vertices > 3) {
                this.isDropPowerUp = false;
                spawn.powerUpBoss(this.position.x, this.position.y, vertices - 1)
                Matter.Body.setVelocity(mob[mob.length - 1], {
                    x: this.velocity.x,
                    y: this.velocity.y
                })
            }
            for (let i = 0; i < powerUp.length; i++) powerUp[i].collisionFilter.mask = cat.map | cat.powerUp
        };
        me.do = function() {
            this.stroke = `hsl(0,0%,${80+25*Math.sin(simulation.cycle*0.01)}%)`

            //steal all power ups
            for (let i = 0; i < Math.min(powerUp.length, this.vertices.length); i++) {
                powerUp[i].collisionFilter.mask = 0
                Matter.Body.setPosition(powerUp[i], this.vertices[i])
                Matter.Body.setVelocity(powerUp[i], {
                    x: 0,
                    y: 0
                })
            }

            this.seePlayerCheckByDistance();
            this.attraction();
            this.checkStatus();
        };
    },
    chaser(x, y, radius = 35 + Math.ceil(Math.random() * 40)) {
        mobs.spawn(x, y, 8, radius, "rgb(255,150,100)"); //"#2c9790"
        let me = mob[mob.length - 1];
        me.mobType = 'chaser';
        // Matter.Body.setDensity(me, 0.0007); //extra dense //normal is 0.001 //makes effective life much lower
        me.friction = 0.1;
        me.frictionAir = 0;
        me.accelMag = 0.001 * Math.sqrt(simulation.accelScale);
        me.g = me.accelMag * 0.6; //required if using 'gravity'
        me.memory = 50;
        spawn.shield(me, x, y);
        me.do = function() {
            this.gravity();
            this.seePlayerCheck();
            this.checkStatus();
            this.attraction();
        };
    },
    grower(x, y, radius = 15) {
        mobs.spawn(x, y, 7, radius, "hsl(144, 15%, 50%)");
        let me = mob[mob.length - 1];
        me.mobType = 'grower';
        me.isVerticesChange = true
        me.big = false; //required for grow
        me.accelMag = 0.00045 * simulation.accelScale;
        me.collisionFilter.mask = cat.map | cat.body | cat.bullet | cat.player //can't touch other mobs
        // me.onDeath = function () { //helps collisions functions work better after vertex have been changed
        //   this.vertices = Matter.Vertices.hull(Matter.Vertices.clockwiseSort(this.vertices))
        // }
        me.do = function() {
            this.seePlayerByLookingAt();
            this.checkStatus();
            this.attraction();
            this.grow();
        };
    },
    springer(x, y, radius = 20 + Math.ceil(Math.random() * 35)) {
        mobs.spawn(x, y, 10, radius, "#b386e8");
        let me = mob[mob.length - 1];
        me.mobType = 'springer';
        me.friction = 0;
        me.frictionAir = 0.006;
        me.lookTorque = 0.0000008; //controls spin while looking for player
        me.g = 0.0002; //required if using 'gravity'
        me.seePlayerFreq = Math.round((40 + 25 * Math.random()) * simulation.lookFreqScale);
        const springStiffness = 0.00014;
        const springDampening = 0.0005;

        me.springTarget = {
            x: me.position.x,
            y: me.position.y
        };
        const len = cons.length;
        cons[len] = Constraint.create({
            pointA: me.springTarget,
            bodyB: me,
            stiffness: springStiffness,
            damping: springDampening
        });
        World.add(engine.world, cons[cons.length - 1]);

        cons[len].length = 100 + 1.5 * radius;
        me.cons = cons[len];

        me.springTarget2 = {
            x: me.position.x,
            y: me.position.y
        };
        const len2 = cons.length;
        cons[len2] = Constraint.create({
            pointA: me.springTarget2,
            bodyB: me,
            stiffness: springStiffness,
            damping: springDampening
        });
        World.add(engine.world, cons[cons.length - 1]);
        cons[len2].length = 100 + 1.5 * radius;
        me.cons2 = cons[len2];
        me.do = function() {
            this.gravity();
            this.searchSpring();
            this.checkStatus();
            this.springAttack();
        };

        me.onDeath = function() {
            this.removeCons();
        };
        spawn.shield(me, x, y);
    },
    hopper(x, y, radius = 30 + Math.ceil(Math.random() * 30)) {
        mobs.spawn(x, y, 5, radius, "rgb(0,200,180)");
        let me = mob[mob.length - 1];
        me.mobType = 'hopper';
        me.accelMag = 0.04;
        me.g = 0.0017; //required if using 'gravity'
        me.frictionAir = 0.01;
        me.restitution = 0;
        me.delay = 120 * simulation.CDScale;
        me.randomHopFrequency = 200 + Math.floor(Math.random() * 150);
        me.randomHopCD = simulation.cycle + me.randomHopFrequency;
        spawn.shield(me, x, y);
        me.do = function() {
            this.gravity();
            this.seePlayerCheck();
            this.checkStatus();
            if (this.seePlayer.recall) {
                if (this.cd < simulation.cycle && (Matter.Query.collides(this, map).length || Matter.Query.collides(this, body).length)) {
                    this.cd = simulation.cycle + this.delay;
                    const forceMag = (this.accelMag + this.accelMag * Math.random()) * this.mass;
                    const angle = Math.atan2(this.seePlayer.position.y - this.position.y, this.seePlayer.position.x - this.position.x);
                    this.force.x += forceMag * Math.cos(angle);
                    this.force.y += forceMag * Math.sin(angle) - (Math.random() * 0.07 + 0.02) * this.mass; //antigravity
                }
            } else {
                //randomly hob if not aware of player
                if (this.randomHopCD < simulation.cycle && (Matter.Query.collides(this, map).length || Matter.Query.collides(this, body).length)) {
                    this.randomHopCD = simulation.cycle + this.randomHopFrequency;
                    //slowly change randomHopFrequency after each hop
                    this.randomHopFrequency = Math.max(100, this.randomHopFrequency + (0.5 - Math.random()) * 200);
                    const forceMag = (this.accelMag + this.accelMag * Math.random()) * this.mass * (0.1 + Math.random() * 0.3);
                    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
                    this.force.x += forceMag * Math.cos(angle);
                    this.force.y += forceMag * Math.sin(angle) - 0.05 * this.mass; //antigravity
                }
            }
        };
    },
    launcher(x, y, radius = 14 + Math.ceil(Math.random() * 40)) {
        mobs.spawn(x, y, 6, radius, "#cc9");
        let me = mob[mob.length - 1];
        me.mobType = 'launcher';
        me.accelMag = 0.00004 * simulation.accelScale;
        me.fireFreq = Math.floor(420 + 90 * Math.random() * simulation.CDScale)
        me.frictionStatic = 0;
        me.friction = 0;
        me.frictionAir = 0.02;
        spawn.shield(me, x, y);
        me.onDamage = function() {};
        me.do = function() {
            this.seePlayerCheck();
            this.checkStatus();
            this.attraction();
            if (this.seePlayer.recall && !(simulation.cycle % this.fireFreq) && !m.isBodiesAsleep) {
                Matter.Body.setAngularVelocity(this, 0.14)
                //fire a bullet from each vertex
                for (let i = 0, len = this.vertices.length; i < len; i++) {
                    spawn.seeker(this.vertices[i].x, this.vertices[i].y, 7)
                    //give the bullet a rotational velocity as if they were attached to a vertex
                    const velocity = Vector.mult(Vector.perp(Vector.normalise(Vector.sub(this.position, this.vertices[i]))), -8)
                    Matter.Body.setVelocity(mob[mob.length - 1], {
                        x: this.velocity.x + velocity.x,
                        y: this.velocity.y + velocity.y
                    });
                }
            }
        };
    },
    launcherBoss(x, y, radius = 85) {
        mobs.spawn(x, y, 6, radius, "rgb(150,150,255)");
        let me = mob[mob.length - 1];
        me.isBoss = true;
        me.mobType = 'launcherBoss';
        me.accelMag = 0.00008 * simulation.accelScale;
        me.fireFreq = Math.floor(360 * simulation.CDScale)
        me.frictionStatic = 0;
        me.friction = 0;
        me.frictionAir = 0.02;
        me.memory = 420;
        me.repulsionRange = 1200000; //squared
        spawn.shield(me, x, y, 1);
        spawn.spawnOrbitals(me, radius + 50 + 200 * Math.random())

        Matter.Body.setDensity(me, 0.002 + 0.0002 * Math.sqrt(simulation.difficulty)); //extra dense //normal is 0.001 //makes effective life much larger
        me.onDeath = function() {
            powerUps.spawnBossPowerUp(this.position.x, this.position.y)
            // this.vertices = Matter.Vertices.hull(Matter.Vertices.clockwiseSort(this.vertices)) //helps collisions functions work better after vertex have been changed
        };
        me.onDamage = function() {};
        me.do = function() {
            this.seePlayerCheck();
            this.checkStatus();
            this.attraction();
            this.repulsion();
            if (this.seePlayer.recall && !(simulation.cycle % this.fireFreq) && !m.isBodiesAsleep) {
                Matter.Body.setAngularVelocity(this, 0.11)
                //fire a bullet from each vertex
                for (let i = 0, len = this.vertices.length; i < len; i++) {
                    spawn.seeker(this.vertices[i].x, this.vertices[i].y, 8)
                    //give the bullet a rotational velocity as if they were attached to a vertex
                    const velocity = Vector.mult(Vector.perp(Vector.normalise(Vector.sub(this.position, this.vertices[i]))), -10)
                    Matter.Body.setVelocity(mob[mob.length - 1], {
                        x: this.velocity.x + velocity.x,
                        y: this.velocity.y + velocity.y
                    });
                }
            }
        };
    },
    exploder(x, y, radius = 20 + Math.ceil(Math.random() * 30)) {
        mobs.spawn(x, y, 9, radius, "rgb(255,0,0)");
        let me = mob[mob.length - 1];
        me.mobType = 'exploder';
        me.onHit = function() {
            //run this function on hitting player
            this.explode();
        };
        me.g = 0.0004; //required if using 'gravity'
        me.do = function() {
            this.gravity();
            this.seePlayerCheck();
            this.checkStatus();
            this.attraction();
        };
    },
    snakeBoss(x, y, radius = 75) { //snake boss with a laser head
        mobs.spawn(x, y, 8, radius, "rgb(55,170,170)");
        let me = mob[mob.length - 1];
        me.isBoss = true;
        me.accelMag = 0.00075 * simulation.accelScale;
        me.memory = 250;
        me.laserRange = 500;
        Matter.Body.setDensity(me, 0.001 + 0.0001 * Math.sqrt(simulation.difficulty)); //extra dense //normal is 0.001 //makes effective life much larger
        me.onDeath = function() {
            powerUps.spawnBossPowerUp(this.position.x, this.position.y)
            for (let i = 0; i < mob.length; i++) { //wake up tail mobs
                if (mob[i].isSnakeTail && mob[i].alive) {
                    mob[i].isSnakeTail = false;
                    mob[i].do = mob[i].doActive
                    mob[i].removeConsBB();
                }
            }
        };
        me.do = function() {
            this.seePlayerCheck();
            this.checkStatus();
            this.attraction();
            this.laserBeam();
        };

        //snake tail
        const nodes = Math.min(8 + Math.ceil(0.5 * simulation.difficulty), 40)
        spawn.lineGroup(x + 105, y, "snakeBody", nodes);
        //constraint with first 3 mobs in line
        consBB[consBB.length] = Constraint.create({
            bodyA: mob[mob.length - nodes],
            bodyB: mob[mob.length - 1 - nodes],
            stiffness: 0.05
        });
        World.add(engine.world, consBB[consBB.length - 1]);
        consBB[consBB.length] = Constraint.create({
            bodyA: mob[mob.length - nodes + 1],
            bodyB: mob[mob.length - 1 - nodes],
            stiffness: 0.05
        });
        World.add(engine.world, consBB[consBB.length - 1]);
        consBB[consBB.length] = Constraint.create({
            bodyA: mob[mob.length - nodes + 2],
            bodyB: mob[mob.length - 1 - nodes],
            stiffness: 0.05
        });
        World.add(engine.world, consBB[consBB.length - 1]);
        spawn.shield(me, x, y, 1);
    },
    snakeBody(x, y, radius = 10) {
        mobs.spawn(x, y, 8, radius, "rgba(0,180,180,0.4)");
        let me = mob[mob.length - 1];
        // me.onHit = function() {
        //     //run this function on hitting player
        //     this.explode();
        // };
        me.collisionFilter.mask = cat.bullet | cat.player | cat.mob //| cat.body
        me.accelMag = 0.0004 * simulation.accelScale;
        me.leaveBody = false;
        me.frictionAir = 0.02;
        me.isSnakeTail = true;
        me.stroke = "transparent"

        me.onDeath = function() {
            if (this.isSnakeTail) { //wake up tail mobs
                for (let i = 0; i < mob.length; i++) {
                    if (mob[i].isSnakeTail && mob[i].alive) {
                        mob[i].isSnakeTail = false;
                        mob[i].do = mob[i].doActive
                        mob[i].removeConsBB();
                    }
                }
            }
        };
        me.do = function() {
            this.checkStatus();
        };
        me.doActive = function() {
            this.checkStatus();
            this.alwaysSeePlayer();
            this.attraction();
        };
    },
    tetherBoss(x, y, constraint, radius = 90) {
        // constrained mob boss for the towers level
        // often has a ring of mobs around it
        mobs.spawn(x, y, 8, radius, "rgb(0,60,80)");
        let me = mob[mob.length - 1];
        me.isBoss = true;
        me.g = 0.0001; //required if using 'gravity'
        me.accelMag = 0.002 * simulation.accelScale;
        me.memory = 20;
        Matter.Body.setDensity(me, 0.0005 + 0.0002 * Math.sqrt(simulation.difficulty)); //extra dense //normal is 0.001 //makes effective life much larger

        cons[cons.length] = Constraint.create({
            pointA: {
                x: constraint.x,
                y: constraint.y
            },
            bodyB: me,
            stiffness: 0.00012
        });
        World.add(engine.world, cons[cons.length - 1]);

        spawn.shield(me, x, y, 1);
        setTimeout(() => { spawn.spawnOrbitals(me, radius + 50 + 200 * Math.random()) }, 100); //have to wait a sec so the tether constraint doesn't attach to an orbital
        me.onDeath = function() {
            powerUps.spawnBossPowerUp(this.position.x, this.position.y)
            this.removeCons(); //remove constraint
        };
        me.do = function() {
            this.gravity();
            this.seePlayerCheck();
            this.checkStatus();
            this.attraction();
        };
    },
    shield(target, x, y, chance = Math.min(0.02 + simulation.difficulty * 0.005, 0.2), isExtraShield = false) {
        if (this.allowShields && Math.random() < chance) {
            mobs.spawn(x, y, 9, target.radius + 30, "rgba(220,220,255,0.9)");
            let me = mob[mob.length - 1];
            me.stroke = "rgb(220,220,255)";
            Matter.Body.setDensity(me, 0.00001) //very low density to not mess with the original mob's motion
            me.shield = true;
            me.isExtraShield = isExtraShield //this prevents spamming with tech.isShieldAmmo
            me.collisionFilter.category = cat.mobShield
            me.collisionFilter.mask = cat.bullet;
            consBB[consBB.length] = Constraint.create({
                bodyA: me,
                bodyB: target, //attach shield to target
                stiffness: 0.4,
                damping: 0.1
            });
            World.add(engine.world, consBB[consBB.length - 1]);

            me.onDamage = function() {
                //make sure the mob that owns the shield can tell when damage is done
                this.alertNearByMobs();
                this.fill = `rgba(220,220,255,${0.3 + 0.6 *this.health})`
            };
            me.leaveBody = false;
            me.isDropPowerUp = false;
            me.showHealthBar = false;

            me.shieldTargetID = target.id
            target.isShielded = true;
            me.onDeath = function() {
                //clear isShielded status from target
                for (let i = 0, len = mob.length; i < len; i++) {
                    if (mob[i].id === this.shieldTargetID) mob[i].isShielded = false;
                }
            };
            me.do = function() {
                this.checkStatus();
            };

            mob.unshift(me); //move shield to the front of the array, so that mob is behind shield graphically

            //swap order of shield and mob, so that mob is behind shield graphically
            // mob[mob.length - 1] = mob[mob.length - 2];
            // mob[mob.length - 2] = me;
        }
    },
    groupShield(targets, x, y, radius, stiffness = 0.4) {
        const nodes = targets.length
        mobs.spawn(x, y, 9, radius, "rgba(220,220,255,0.9)");
        let me = mob[mob.length - 1];
        me.stroke = "rgb(220,220,255)";
        Matter.Body.setDensity(me, 0.00001) //very low density to not mess with the original mob's motion
        me.frictionAir = 0;
        me.shield = true;
        me.collisionFilter.category = cat.mobShield
        me.collisionFilter.mask = cat.bullet;
        for (let i = 0; i < nodes; ++i) {
            mob[mob.length - i - 2].isShielded = true;
            //constrain to all mob nodes in group
            consBB[consBB.length] = Constraint.create({
                bodyA: me,
                bodyB: mob[mob.length - i - 2],
                stiffness: stiffness,
                damping: 0.1
            });
            World.add(engine.world, consBB[consBB.length - 1]);
        }
        me.onDamage = function() {
            this.alertNearByMobs(); //makes sure the mob that owns the shield can tell when damage is done
            this.fill = `rgba(220,220,255,${0.3 + 0.6 *this.health})`
        };
        me.onDeath = function() {
            //clear isShielded status from target
            for (let j = 0; j < targets.length; j++) {
                for (let i = 0, len = mob.length; i < len; i++) {
                    if (mob[i].id === targets[j]) mob[i].isShielded = false;
                }
            }
        };
        me.leaveBody = false;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        mob[mob.length - 1] = mob[mob.length - 1 - nodes];
        mob[mob.length - 1 - nodes] = me;
        me.do = function() {
            this.checkStatus();
        };
    },
    spawnOrbitals(who, radius, chance = Math.min(0.25 + simulation.difficulty * 0.005)) {
        if (Math.random() < chance) {
            // simulation.difficulty = 50
            const len = Math.floor(Math.min(15, 3 + Math.sqrt(simulation.difficulty))) // simulation.difficulty = 40 on hard mode level 10
            const speed = (0.007 + 0.003 * Math.random() + 0.004 * Math.sqrt(simulation.difficulty)) * ((Math.random() < 0.5) ? 1 : -1)
            for (let i = 0; i < len; i++) spawn.orbital(who, radius, i / len * 2 * Math.PI, speed)
        }
    },
    orbital(who, radius, phase, speed) {
        // for (let i = 0, len = 7; i < len; i++) spawn.orbital(me, radius + 250, 2 * Math.PI / len * i)
        mobs.spawn(who.position.x, who.position.y, 8, 12, "rgb(255,0,150)");
        let me = mob[mob.length - 1];
        me.stroke = "transparent";
        Matter.Body.setDensity(me, 0.1); //normal is 0.001
        me.leaveBody = false;
        me.isDropPowerUp = false;
        me.isBadTarget = true;
        me.showHealthBar = false;
        // me.isShielded = true
        me.collisionFilter.category = cat.mobBullet;
        me.collisionFilter.mask = cat.bullet; //cat.player | cat.map | cat.body
        me.do = function() {
            //if host is gone
            if (!who || !who.alive) {
                this.death();
                return
            }
            //set orbit
            const time = simulation.cycle * speed + phase
            const orbit = {
                x: Math.cos(time),
                y: Math.sin(time)
            }
            Matter.Body.setPosition(this, Vector.add(who.position, Vector.mult(orbit, radius))) //bullets move with player
            //damage player
            if (Matter.Query.collides(this, [player]).length > 0 && !(m.isCloak && tech.isIntangible) && m.immuneCycle < m.cycle) {
                m.immuneCycle = m.cycle + tech.collisionImmuneCycles; //player is immune to damage for 30 cycles
                const dmg = 0.035 * simulation.dmgScale
                m.damage(dmg);
                simulation.drawList.push({ //add dmg to draw queue
                    x: this.position.x,
                    y: this.position.y,
                    radius: dmg * 500,
                    color: simulation.mobDmgColor,
                    time: simulation.drawTime
                });
                this.death();
            }
        };
    },
    orbitalBoss(x, y, radius = 88) {
        const nodeBalance = Math.random()
        const nodes = Math.min(15, Math.floor(1 + 5 * nodeBalance + 0.75 * Math.sqrt(simulation.difficulty)))
        mobs.spawn(x, y, nodes, radius, "rgb(255,0,150)");
        let me = mob[mob.length - 1];
        me.isBoss = true;
        Matter.Body.setDensity(me, 0.002 + 0.00015 * Math.sqrt(simulation.difficulty)); //extra dense //normal is 0.001 //makes effective life much larger

        me.stroke = "transparent"; //used for drawGhost
        me.seeAtDistance2 = 2000000;
        me.memory = Infinity;
        me.frictionAir = 0.01;
        me.accelMag = 0.00003 * simulation.accelScale;
        me.collisionFilter.mask = cat.player | cat.bullet //| cat.body
        spawn.shield(me, x, y, 1);

        const rangeInnerVsOuter = Math.random()
        let speed = (0.003 + 0.0015 * Math.sqrt(simulation.difficulty)) * ((Math.random() < 0.5) ? 1 : -1)
        let range = radius + 150 + 200 * rangeInnerVsOuter + nodes * 5
        for (let i = 0; i < nodes; i++) spawn.orbital(me, range, i / nodes * 2 * Math.PI, speed)
        const orbitalIndexes = [] //find indexes for all the current nodes
        for (let i = 0; i < nodes; i++) orbitalIndexes.push(mob.length - 1 - i)
        // add orbitals for each orbital
        range = Math.max(60, 150 - nodes * 3 - rangeInnerVsOuter * 80)
        speed = speed * (1.25 + 2 * Math.random())
        const subNodes = Math.max(2, Math.floor(6 - 5 * nodeBalance + 0.5 * Math.sqrt(simulation.difficulty)))
        for (let j = 0; j < nodes; j++) {
            for (let i = 0, len = subNodes; i < len; i++) spawn.orbital(mob[orbitalIndexes[j]], range, i / len * 2 * Math.PI, speed)
        }
        me.onDeath = function() {
            powerUps.spawnBossPowerUp(this.position.x, this.position.y)
        };
        me.do = function() {
            this.seePlayerCheckByDistance();
            this.checkStatus();
            this.attraction();
        };
    },
    //complex constrained mob templates**********************************************************************
    //*******************************************************************************************************
    allowShields: true,
    nodeGroup(
        x,
        y,
        spawn = "striker",
        nodes = Math.min(2 + Math.ceil(Math.random() * (simulation.difficulty + 2)), 8),
        //Math.ceil(Math.random() * 3) + Math.min(4,Math.ceil(simulation.difficulty/2)),
        radius = Math.ceil(Math.random() * 10) + 17, // radius of each node mob
        sideLength = Math.ceil(Math.random() * 100) + 70, // distance between each node mob
        stiffness = Math.random() * 0.03 + 0.005
    ) {
        this.allowShields = false; //don't want shields on individual group mobs
        const angle = 2 * Math.PI / nodes
        let targets = []
        for (let i = 0; i < nodes; ++i) {
            let whoSpawn = spawn;
            if (spawn === "random") {
                whoSpawn = this.fullPickList[Math.floor(Math.random() * this.fullPickList.length)];
            } else if (spawn === "randomList") {
                whoSpawn = this.pickList[Math.floor(Math.random() * this.pickList.length)];
            }
            this[whoSpawn](x + sideLength * Math.sin(i * angle), y + sideLength * Math.cos(i * angle), radius);
            targets.push(mob[mob.length - 1].id) //track who is in the group, for shields
        }
        if (Math.random() < 0.3) {
            this.constrain2AdjacentMobs(nodes, stiffness * 2, true);
        } else {
            this.constrainAllMobCombos(nodes, stiffness);
        }
        //spawn shield for entire group
        if (nodes > 2 && Math.random() < 0.998) {
            this.groupShield(targets, x, y, sideLength + 2.5 * radius + nodes * 6 - 25);
        }
        this.allowShields = true;
    },
    lineGroup(
        x,
        y,
        spawn = "striker",
        nodes = Math.min(3 + Math.ceil(Math.random() * simulation.difficulty + 2), 8),
        //Math.ceil(Math.random() * 3) + Math.min(4,Math.ceil(simulation.difficulty/2)),
        radius = Math.ceil(Math.random() * 10) + 17,
        l = Math.ceil(Math.random() * 80) + 30,
        stiffness = Math.random() * 0.06 + 0.01
    ) {
        this.allowShields = false; //don't want shields on individual group mobs
        for (let i = 0; i < nodes; ++i) {
            let whoSpawn = spawn;
            if (spawn === "random") {
                whoSpawn = this.fullPickList[Math.floor(Math.random() * this.fullPickList.length)];
            } else if (spawn === "randomList") {
                whoSpawn = this.pickList[Math.floor(Math.random() * this.pickList.length)];
            }
            this[whoSpawn](x + i * radius + i * l, y, radius);
        }
        this.constrain2AdjacentMobs(nodes, stiffness);
        this.allowShields = true;
    },
    //constraints ************************************************************************************************
    //*************************************************************************************************************
    constrainAllMobCombos(nodes, stiffness) {
        //runs through every combination of last 'num' bodies and constrains them
        for (let i = 1; i < nodes + 1; ++i) {
            for (let j = i + 1; j < nodes + 1; ++j) {
                consBB[consBB.length] = Constraint.create({
                    bodyA: mob[mob.length - i],
                    bodyB: mob[mob.length - j],
                    stiffness: stiffness
                });
                World.add(engine.world, consBB[consBB.length - 1]);
            }
        }
    },
    constrain2AdjacentMobs(nodes, stiffness, loop = false) {
        //runs through every combination of last 'num' bodies and constrains them
        for (let i = 0; i < nodes - 1; ++i) {
            consBB[consBB.length] = Constraint.create({
                bodyA: mob[mob.length - i - 1],
                bodyB: mob[mob.length - i - 2],
                stiffness: stiffness
            });
            World.add(engine.world, consBB[consBB.length - 1]);
        }
        if (nodes > 2) {
            for (let i = 0; i < nodes - 2; ++i) {
                consBB[consBB.length] = Constraint.create({
                    bodyA: mob[mob.length - i - 1],
                    bodyB: mob[mob.length - i - 3],
                    stiffness: stiffness
                });
                World.add(engine.world, consBB[consBB.length - 1]);
            }
        }
        //optional connect the tail to head
        if (loop && nodes > 3) {
            consBB[consBB.length] = Constraint.create({
                bodyA: mob[mob.length - 1],
                bodyB: mob[mob.length - nodes],
                stiffness: stiffness
            });
            World.add(engine.world, consBB[consBB.length - 1]);
            consBB[consBB.length] = Constraint.create({
                bodyA: mob[mob.length - 2],
                bodyB: mob[mob.length - nodes],
                stiffness: stiffness
            });
            World.add(engine.world, consBB[consBB.length - 1]);
            consBB[consBB.length] = Constraint.create({
                bodyA: mob[mob.length - 1],
                bodyB: mob[mob.length - nodes + 1],
                stiffness: stiffness
            });
            World.add(engine.world, consBB[consBB.length - 1]);
        }
    },
    constraintPB(x, y, bodyIndex, stiffness) {
        cons[cons.length] = Constraint.create({
            pointA: {
                x: x,
                y: y
            },
            bodyB: body[bodyIndex],
            stiffness: stiffness
        });
        World.add(engine.world, cons[cons.length - 1]);
    },
    constraintBB(bodyIndexA, bodyIndexB, stiffness) {
        consBB[consBB.length] = Constraint.create({
            bodyA: body[bodyIndexA],
            bodyB: body[bodyIndexB],
            stiffness: stiffness
        });
        World.add(engine.world, consBB[consBB.length - 1]);
    },
    // body and map spawns ******************************************************************************
    //**********************************************************************************************
    wireHead() {
        //not a mob, just a graphic for level 1
        const breakingPoint = 1300
        mobs.spawn(breakingPoint, -100, 0, 7.5, "transparent");
        let me = mob[mob.length - 1];
        me.collisionFilter.category = cat.body;
        me.collisionFilter.mask = cat.map;
        me.inertia = Infinity;
        me.g = 0.0004; //required for gravity
        me.restitution = 0;
        me.stroke = "transparent"
        me.freeOfWires = false;
        me.frictionStatic = 1;
        me.friction = 1;
        me.frictionAir = 0.01;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.isBadTarget = true;

        me.do = function() {
            let wireX = -50;
            let wireY = -1000;
            if (this.freeOfWires) {
                this.gravity();
            } else {
                if (m.pos.x > breakingPoint) {
                    this.freeOfWires = true;
                    this.fill = "#000"
                    this.force.x += -0.003;
                    player.force.x += 0.06;
                    // player.force.y -= 0.15;
                }

                //player is extra heavy from wires
                Matter.Body.setVelocity(player, {
                    x: player.velocity.x,
                    y: player.velocity.y + 0.3
                })

                //player friction from the wires
                if (m.pos.x > 700 && player.velocity.x > -2) {
                    let wireFriction = 0.75 * Math.min(0.6, Math.max(0, 100 / (breakingPoint - m.pos.x)));
                    if (!m.onGround) wireFriction *= 3
                    Matter.Body.setVelocity(player, {
                        x: player.velocity.x - wireFriction,
                        y: player.velocity.y
                    })
                }
                //move to player
                Matter.Body.setPosition(this, {
                    x: m.pos.x + (42 * Math.cos(m.angle + Math.PI)),
                    y: m.pos.y + (42 * Math.sin(m.angle + Math.PI))
                })
            }
            //draw wire
            ctx.beginPath();
            ctx.moveTo(wireX, wireY);
            ctx.quadraticCurveTo(wireX, 0, this.position.x, this.position.y);
            if (!this.freeOfWires) ctx.lineTo(m.pos.x + (30 * Math.cos(m.angle + Math.PI)), m.pos.y + (30 * Math.sin(m.angle + Math.PI)));
            ctx.lineCap = "butt";
            ctx.lineWidth = 15;
            ctx.strokeStyle = "#000";
            ctx.stroke();
            ctx.lineCap = "round";
        };
    },
    wireKnee() {
        //not a mob, just a graphic for level 1
        const breakingPoint = 1425
        mobs.spawn(breakingPoint, -100, 0, 2, "transparent");
        let me = mob[mob.length - 1];
        //touch nothing
        me.collisionFilter.category = cat.body;
        me.collisionFilter.mask = cat.map;
        me.g = 0.0003; //required for gravity
        // me.restitution = 0;
        me.stroke = "transparent"
        // me.inertia = Infinity;
        me.restitution = 0;
        me.freeOfWires = false;
        me.frictionStatic = 1;
        me.friction = 1;
        me.frictionAir = 0.01;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.isBadTarget = true;

        me.do = function() {
            let wireX = -50 - 20;
            let wireY = -1000;

            if (this.freeOfWires) {
                this.gravity();
            } else {
                if (m.pos.x > breakingPoint) {
                    this.freeOfWires = true;
                    this.force.x -= 0.0004;
                    this.fill = "#222";
                }
                //move mob to player
                m.calcLeg(0, 0);
                Matter.Body.setPosition(this, {
                    x: m.pos.x + m.flipLegs * m.knee.x - 5,
                    y: m.pos.y + m.knee.y
                })
            }
            //draw wire
            ctx.beginPath();
            ctx.moveTo(wireX, wireY);
            ctx.quadraticCurveTo(wireX, 0, this.position.x, this.position.y);
            ctx.lineWidth = 5;
            ctx.strokeStyle = "#222";
            ctx.lineCap = "butt";
            ctx.stroke();
            ctx.lineCap = "round";
        };
    },
    wireKneeLeft() {
        //not a mob, just a graphic for level 1
        const breakingPoint = 1400
        mobs.spawn(breakingPoint, -100, 0, 2, "transparent");
        let me = mob[mob.length - 1];
        //touch nothing
        me.collisionFilter.category = cat.body;
        me.collisionFilter.mask = cat.map;
        me.g = 0.0003; //required for gravity
        // me.restitution = 0;
        me.stroke = "transparent"
        // me.inertia = Infinity;
        me.restitution = 0;
        me.freeOfWires = false;
        me.frictionStatic = 1;
        me.friction = 1;
        me.frictionAir = 0.01;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.isBadTarget = true;

        me.do = function() {
            let wireX = -50 - 35;
            let wireY = -1000;

            if (this.freeOfWires) {
                this.gravity();
            } else {
                if (m.pos.x > breakingPoint) {
                    this.freeOfWires = true;
                    this.force.x += -0.0003;
                    this.fill = "#333";
                }
                //move mob to player
                m.calcLeg(Math.PI, -3);
                Matter.Body.setPosition(this, {
                    x: m.pos.x + m.flipLegs * m.knee.x - 5,
                    y: m.pos.y + m.knee.y
                })
            }
            //draw wire
            ctx.beginPath();
            ctx.moveTo(wireX, wireY);
            ctx.quadraticCurveTo(wireX, 0, this.position.x, this.position.y);
            ctx.lineWidth = 5;
            ctx.lineCap = "butt";
            ctx.strokeStyle = "#333";
            ctx.stroke();
            ctx.lineCap = "round";
        };
    },
    wireFoot() {
        //not a mob, just a graphic for level 1
        const breakingPoint = 1350
        mobs.spawn(breakingPoint, -100, 0, 2, "transparent");
        let me = mob[mob.length - 1];
        //touch nothing
        me.collisionFilter.category = cat.body;
        me.collisionFilter.mask = cat.map;
        me.g = 0.0003; //required for gravity
        me.restitution = 0;
        me.stroke = "transparent"
        // me.inertia = Infinity;
        me.freeOfWires = false;
        // me.frictionStatic = 1;
        // me.friction = 1;
        me.frictionAir = 0.01;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.isBadTarget = true;

        me.do = function() {
            let wireX = -50 + 16;
            let wireY = -1000;

            if (this.freeOfWires) {
                this.gravity();
            } else {
                if (m.pos.x > breakingPoint) {
                    this.freeOfWires = true;
                    this.force.x += -0.0006;
                    this.fill = "#111";
                }
                //move mob to player
                m.calcLeg(0, 0);
                Matter.Body.setPosition(this, {
                    x: m.pos.x + m.flipLegs * m.foot.x - 5,
                    y: m.pos.y + m.foot.y - 1
                })
            }
            //draw wire
            ctx.beginPath();
            ctx.moveTo(wireX, wireY);
            ctx.quadraticCurveTo(wireX, 0, this.position.x, this.position.y);
            ctx.lineWidth = 5;
            ctx.lineCap = "butt";
            ctx.strokeStyle = "#111";
            ctx.stroke();
            ctx.lineCap = "round";
        };
    },
    wireFootLeft() {
        //not a mob, just a graphic for level 1
        const breakingPoint = 1325
        mobs.spawn(breakingPoint, -100, 0, 2, "transparent");
        let me = mob[mob.length - 1];
        //touch nothing
        me.collisionFilter.category = cat.body;
        me.collisionFilter.mask = cat.map;
        me.g = 0.0003; //required for gravity
        me.restitution = 0;
        me.stroke = "transparent"
        // me.inertia = Infinity;
        me.freeOfWires = false;
        // me.frictionStatic = 1;
        // me.friction = 1;
        me.frictionAir = 0.01;
        me.isDropPowerUp = false;
        me.showHealthBar = false;
        me.isBadTarget = true;

        me.do = function() {
            let wireX = -50 + 26;
            let wireY = -1000;

            if (this.freeOfWires) {
                this.gravity();
            } else {
                if (m.pos.x > breakingPoint) {
                    this.freeOfWires = true;
                    this.force.x += -0.0005;
                    this.fill = "#222";
                }
                //move mob to player
                m.calcLeg(Math.PI, -3);
                Matter.Body.setPosition(this, {
                    x: m.pos.x + m.flipLegs * m.foot.x - 5,
                    y: m.pos.y + m.foot.y - 1
                })
            }
            //draw wire
            ctx.beginPath();
            ctx.moveTo(wireX, wireY);
            ctx.quadraticCurveTo(wireX, 0, this.position.x, this.position.y);
            ctx.lineWidth = 5;
            ctx.strokeStyle = "#222";
            ctx.lineCap = "butt";
            ctx.stroke();
            ctx.lineCap = "round";
        };
    },
    boost(x, y, height = 1000) {
        spawn.mapVertex(x + 50, y + 35, "120 40 -120 40 -50 -40 50 -40");
        level.addQueryRegion(x, y - 20, 100, 20, "boost", [
            [player], body, mob, powerUp, bullet
        ], -1.21 * Math.sqrt(Math.abs(height)));
    },
    blockDoor(x, y, blockSize = 60) {
        spawn.mapRect(x, y - 290, 40, 60); // door lip
        spawn.mapRect(x, y, 40, 50); // door lip
        for (let i = 0; i < 4; ++i) {
            spawn.bodyRect(x + 5, y - 260 + i * blockSize + i * 3, 30, blockSize);
        }
    },
    debris(x, y, width, number = Math.floor(2 + Math.random() * 9)) {
        for (let i = 0; i < number; ++i) {
            if (Math.random() < 0.15) {
                powerUps.chooseRandomPowerUp(x + Math.random() * width, y);
            } else {
                const size = 18 + Math.random() * 25;
                spawn.bodyRect(x + Math.random() * width, y, size * (0.6 + Math.random()), size * (0.6 + Math.random()), 1);
                // body[body.length] = Bodies.rectangle(x + Math.random() * width, y, size * (0.6 + Math.random()), size * (0.6 + Math.random()));
            }
        }
    },
    bodyRect(x, y, width, height, chance = 1, properties = {
        friction: 0.05,
        frictionAir: 0.001,
    }) {
        if (Math.random() < chance) body[body.length] = Bodies.rectangle(x + width / 2, y + height / 2, width, height, properties);
    },
    bodyVertex(x, y, vector, properties) { //adds shape to body array
        body[body.length] = Matter.Bodies.fromVertices(x, y, Vertices.fromPath(vector), properties);
    },
    mapRect(x, y, width, height, properties) { //adds rectangle to map array
        map[map.length] = Bodies.rectangle(x + width / 2, y + height / 2, width, height, properties);
    },
    mapVertex(x, y, vector, properties) { //adds shape to map array
        map[map.length] = Matter.Bodies.fromVertices(x, y, Vertices.fromPath(vector), properties);
    },
    //complex map templates
    spawnBuilding(x, y, w, h, leftDoor, rightDoor, walledSide) {
        this.mapRect(x, y, w, 25); //roof
        this.mapRect(x, y + h, w, 35); //ground
        if (walledSide === "left") {
            this.mapRect(x, y, 25, h); //wall left
        } else {
            this.mapRect(x, y, 25, h - 150); //wall left
            if (leftDoor) {
                this.bodyRect(x + 5, y + h - 150, 15, 150, this.propsFriction); //door left
            }
        }
        if (walledSide === "right") {
            this.mapRect(x - 25 + w, y, 25, h); //wall right
        } else {
            this.mapRect(x - 25 + w, y, 25, h - 150); //wall right
            if (rightDoor) {
                this.bodyRect(x + w - 20, y + h - 150, 15, 150, this.propsFriction); //door right
            }
        }
    },
    spawnStairs(x, y, num, w, h, stepRight) {
        w += 50;
        if (stepRight) {
            for (let i = 0; i < num; i++) {
                this.mapRect(x - (w / num) * (1 + i), y - h + (i * h) / num, w / num + 50, h - (i * h) / num + 50);
            }
        } else {
            for (let i = 0; i < num; i++) {
                this.mapRect(x + (i * w) / num, y - h + (i * h) / num, w / num + 50, h - (i * h) / num + 50);
            }
        }
    },
    //pre-made property options*************************************************************************************
    //*************************************************************************************************************
    //Object.assign({}, propsHeavy, propsBouncy, propsNoRotation)      //will combine properties into a new object
    propsFriction: {
        friction: 0.5,
        frictionAir: 0.02,
        frictionStatic: 1
    },
    propsFrictionMedium: {
        friction: 0.15,
        frictionStatic: 1
    },
    propsBouncy: {
        friction: 0,
        frictionAir: 0,
        frictionStatic: 0,
        restitution: 1
    },
    propsSlide: {
        friction: 0.003,
        frictionStatic: 0.4,
        restitution: 0,
        density: 0.002
    },
    propsLight: {
        density: 0.001
    },
    propsOverBouncy: {
        friction: 0,
        frictionAir: 0,
        frictionStatic: 0,
        restitution: 1.05
    },
    propsHeavy: {
        density: 0.01 //default density is 0.001
    },
    propsIsNotHoldable: {
        isNotHoldable: true
    },
    propsNoRotation: {
        inertia: Infinity //prevents rotation
    },
    propsHoist: {
        inertia: Infinity, //prevents rotation
        frictionAir: 0.001,
        friction: 0.0001,
        frictionStatic: 0,
        restitution: 0,
        isNotHoldable: true
        // density: 0.0001
    },
    propsDoor: {
        density: 0.001, //default density is 0.001
        friction: 0,
        frictionAir: 0.03,
        frictionStatic: 0,
        restitution: 0
    },
    sandPaper: {
        friction: 1,
        frictionStatic: 1,
        restitution: 0
    }
};