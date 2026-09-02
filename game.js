const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const stats = document.getElementById("stats");
const lengthText = document.getElementById("length");
const leaderboard = document.getElementById("leaderboard");

const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOver");
const gameOverText = document.getElementById("gameOverText");

const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

let W = window.innerWidth;
let H = window.innerHeight;

canvas.width = W;
canvas.height = H;

window.addEventListener("resize", () => {
    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = W;
    canvas.height = H;
});


// ============================================================
// WORLD
// ============================================================

const WORLD_WIDTH = 12000;
const WORLD_HEIGHT = 12000;

const TILE_SIZE = 40;

const TERRITORY_W = WORLD_WIDTH / TILE_SIZE;
const TERRITORY_H = WORLD_HEIGHT / TILE_SIZE;

const territory = new Uint16Array(
    TERRITORY_W * TERRITORY_H
);

const UNCLAIMED = 0;


// ============================================================
// COLORS
// ============================================================

const COLORS = [
    "#ffe600",
    "#ff4d4d",
    "#4da6ff",
    "#b84dff",
    "#ff8c42",
    "#43d17a",
    "#ff55c8",
    "#49e6d3",
    "#d4ff4d"
];


// ============================================================
// GAME STATE
// ============================================================

let gameRunning = false;
let lastTime = 0;

let players = [];
let orbs = [];

let player;
let camera = {
    x: 0,
    y: 0
};

let mouse = {
    x: W / 2,
    y: H / 2
};

let boosting = false;

let territoryCount = new Array(20).fill(0);


// ============================================================
// INPUT
// ============================================================

window.addEventListener("mousemove", e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener("mousedown", () => {
    boosting = true;
});

window.addEventListener("mouseup", () => {
    boosting = false;
});

window.addEventListener("keydown", e => {

    if (e.code === "Space") {
        boosting = true;
    }

    if (e.key.toLowerCase() === "r") {
        camera.x = player.x;
        camera.y = player.y;
    }
});

window.addEventListener("keyup", e => {

    if (e.code === "Space") {
        boosting = false;
    }
});


// ============================================================
// HELPERS
// ============================================================

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function worldToScreen(x, y) {
    return {
        x: x - camera.x + W / 2,
        y: y - camera.y + H / 2
    };
}

function screenToWorld(x, y) {
    return {
        x: x + camera.x - W / 2,
        y: y + camera.y - H / 2
    };
}


// ============================================================
// TERRITORY
// ============================================================

function tileIndex(tx, ty) {
    return ty * TERRITORY_W + tx;
}

function getTile(x, y) {

    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);

    if (
        tx < 0 ||
        ty < 0 ||
        tx >= TERRITORY_W ||
        ty >= TERRITORY_H
    ) {
        return UNCLAIMED;
    }

    return territory[tileIndex(tx, ty)];
}

function setTile(x, y, owner) {

    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);

    if (
        tx < 0 ||
        ty < 0 ||
        tx >= TERRITORY_W ||
        ty >= TERRITORY_H
    ) {
        return;
    }

    territory[tileIndex(tx, ty)] = owner;
}

function fillCircleTerritory(x, y, radius, owner) {

    const minX = Math.floor((x - radius) / TILE_SIZE);
    const maxX = Math.floor((x + radius) / TILE_SIZE);

    const minY = Math.floor((y - radius) / TILE_SIZE);
    const maxY = Math.floor((y + radius) / TILE_SIZE);

    for (let ty = minY; ty <= maxY; ty++) {

        for (let tx = minX; tx <= maxX; tx++) {

            if (
                tx < 0 ||
                ty < 0 ||
                tx >= TERRITORY_W ||
                ty >= TERRITORY_H
            ) continue;

            const cx = tx * TILE_SIZE + TILE_SIZE / 2;
            const cy = ty * TILE_SIZE + TILE_SIZE / 2;

            if (
                Math.hypot(cx - x, cy - y) <= radius
            ) {
                territory[tileIndex(tx, ty)] = owner;
            }
        }
    }
}


// ============================================================
// SNAKE CLASS
// ============================================================

class Snake {

    constructor(id, x, y, color, isAI = false) {

        this.id = id;
        this.x = x;
        this.y = y;

        this.color = color;
        this.isAI = isAI;

        this.angle = random(0, Math.PI * 2);

        this.speed = 130;
        this.boostSpeed = 225;

        this.radius = 11;

        this.length = 35;

        this.body = [];

        this.alive = true;

        this.inOwnTerritory = true;

        this.currentTrail = [];

        this.aiTimer = 0;
        this.targetAngle = this.angle;

        for (let i = 0; i < this.length; i++) {

            this.body.push({
                x: this.x - Math.cos(this.angle) * i * 5,
                y: this.y - Math.sin(this.angle) * i * 5
            });
        }
    }

    update(dt) {

        if (!this.alive) return;

        if (this.isAI) {
            this.updateAI(dt);
        } else {
            this.updatePlayer();
        }

        let speed = boosting && !this.isAI
            ? this.boostSpeed
            : this.speed;

        this.x += Math.cos(this.angle) * speed * dt;
        this.y += Math.sin(this.angle) * speed * dt;

        this.x = clamp(this.x, 5, WORLD_WIDTH - 5);
        this.y = clamp(this.y, 5, WORLD_HEIGHT - 5);

        this.body.unshift({
            x: this.x,
            y: this.y
        });

        while (this.body.length > this.length) {
            this.body.pop();
        }

        this.handleTerritory();

        this.collectOrbs();
    }

    updatePlayer() {

        const target = screenToWorld(mouse.x, mouse.y);

        const dx = target.x - this.x;
        const dy = target.y - this.y;

        if (Math.hypot(dx, dy) > 5) {

            const targetAngle = Math.atan2(dy, dx);

            let difference =
                Math.atan2(
                    Math.sin(targetAngle - this.angle),
                    Math.cos(targetAngle - this.angle)
                );

            const turnSpeed = 4.5;

            this.angle +=
                clamp(
                    difference,
                    -turnSpeed * 0.016,
                    turnSpeed * 0.016
                );
        }
    }

    updateAI(dt) {

        this.aiTimer -= dt;

        if (this.aiTimer <= 0) {

            this.aiTimer = random(1, 3);

            const options = [
                this.angle,
                this.angle + random(-1.5, 1.5),
                random(0, Math.PI * 2)
            ];

            this.targetAngle =
                options[Math.floor(Math.random() * options.length)];
        }

        let difference =
            Math.atan2(
                Math.sin(this.targetAngle - this.angle),
                Math.cos(this.targetAngle - this.angle)
            );

        this.angle +=
            clamp(
                difference,
                -3 * dt,
                3 * dt
            );

        // AI tries to stay near its territory
        if (Math.random() < 0.002) {

            const center = findOwnTerritoryCenter(this.id);

            if (center) {

                this.targetAngle =
                    Math.atan2(
                        center.y - this.y,
                        center.x - this.x
                    );
            }
        }
    }

    handleTerritory() {

        const tile = getTile(this.x, this.y);

        const insideOwn = tile === this.id;

        if (insideOwn) {

            if (
                !this.inOwnTerritory &&
                this.currentTrail.length > 3
            ) {

                claimTrail(this);

                this.currentTrail = [];
            }

            this.inOwnTerritory = true;

        } else {

            if (this.inOwnTerritory) {
                this.currentTrail = [];
            }

            this.inOwnTerritory = false;

            this.currentTrail.push({
                x: this.x,
                y: this.y
            });

            // Trail DOES NOT damage players.
            // It only records the area being traveled.
        }
    }

    collectOrbs() {

        for (let i = orbs.length - 1; i >= 0; i--) {

            if (
                Math.hypot(
                    this.x - orbs[i].x,
                    this.y - orbs[i].y
                ) < 22
            ) {

                this.length += 2;

                orbs.splice(i, 1);

                spawnOrb();
            }
        }
    }
}


// ============================================================
// TERRITORY CAPTURE
// ============================================================

function claimTrail(snake) {

    if (snake.currentTrail.length < 3) return;

    const points = snake.currentTrail;

    let minX = WORLD_WIDTH;
    let maxX = 0;
    let minY = WORLD_HEIGHT;
    let maxY = 0;

    for (const p of points) {

        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);

        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }

    minX = Math.max(0, Math.floor(minX / TILE_SIZE) - 1);
    maxX = Math.min(
        TERRITORY_W - 1,
        Math.floor(maxX / TILE_SIZE) + 1
    );

    minY = Math.max(0, Math.floor(minY / TILE_SIZE) - 1);
    maxY = Math.min(
        TERRITORY_H - 1,
        Math.floor(maxY / TILE_SIZE) + 1
    );

    // Create a polygon from the trail.
    const polygon = points.map(p => ({
        x: p.x,
        y: p.y
    }));

    // Fill the polygon using point-in-polygon.
    for (let ty = minY; ty <= maxY; ty++) {

        for (let tx = minX; tx <= maxX; tx++) {

            const x = tx * TILE_SIZE + TILE_SIZE / 2;
            const y = ty * TILE_SIZE + TILE_SIZE / 2;

            if (pointInPolygon(x, y, polygon)) {

                territory[tileIndex(tx, ty)] =
                    snake.id;
            }
        }
    }
}

function pointInPolygon(x, y, polygon) {

    let inside = false;

    for (
        let i = 0, j = polygon.length - 1;
        i < polygon.length;
        j = i++
    ) {

        const xi = polygon[i].x;
        const yi = polygon[i].y;

        const xj = polygon[j].x;
        const yj = polygon[j].y;

        const intersect =
            ((yi > y) !== (yj > y)) &&
            (
                x <
                (xj - xi) *
                (y - yi) /
                (yj - yi) +
                xi
            );

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}


// ============================================================
// ORBS
// ============================================================

function spawnOrb() {

    orbs.push({
        x: random(100, WORLD_WIDTH - 100),
        y: random(100, WORLD_HEIGHT - 100),
        radius: random(4, 8)
    });
}

function createOrbs() {

    orbs = [];

    for (let i = 0; i < 500; i++) {
        spawnOrb();
    }
}


// ============================================================
// AI
// ============================================================

function createAI() {

    players = [player];

    for (let i = 0; i < 24; i++) {

        const id = i + 2;

        const ai = new Snake(
            id,
            random(300, WORLD_WIDTH - 300),
            random(300, WORLD_HEIGHT - 300),
            COLORS[i % COLORS.length],
            true
        );

        players.push(ai);

        fillCircleTerritory(
            ai.x,
            ai.y,
            240,
            ai.id
        );
    }
}


// ============================================================
// PLAYER
// ============================================================

function createPlayer() {

    player = new Snake(
        1,
        WORLD_WIDTH / 2,
        WORLD_HEIGHT / 2,
        "#ffe600",
        false
    );

    fillCircleTerritory(
        player.x,
        player.y,
        300,
        player.id
    );

    camera.x = player.x;
    camera.y = player.y;
}


// ============================================================
// COLLISIONS
// ============================================================

function checkCollisions() {

    for (const p of players) {

        if (!p.alive) continue;

        // World border
        if (
            p.x <= 8 ||
            p.y <= 8 ||
            p.x >= WORLD_WIDTH - 8 ||
            p.y >= WORLD_HEIGHT - 8
        ) {
            eliminate(p);
            continue;
        }

        // Head hits another snake's body
        for (const other of players) {

            if (!other.alive || other.id === p.id)
                continue;

            // Skip the first few segments because they
            // are near the other player's head.
            for (
                let i = 8;
                i < other.body.length;
                i += 3
            ) {

                const segment = other.body[i];

                if (
                    Math.hypot(
                        p.x - segment.x,
                        p.y - segment.y
                    ) <
                    p.radius + other.radius
                ) {

                    eliminate(p);
                    break;
                }
            }

            if (!p.alive) break;
        }
    }
}

function eliminate(snake) {

    if (!snake.alive) return;

    snake.alive = false;

    // Turn the snake's territory back into neutral land.
    for (let i = 0; i < territory.length; i++) {

        if (territory[i] === snake.id) {
            territory[i] = UNCLAIMED;
        }
    }

    // Turn body segments into collectible orbs.
    for (
        let i = 0;
        i < snake.body.length;
        i += 5
    ) {

        orbs.push({
            x: snake.body[i].x,
            y: snake.body[i].y,
            radius: 6
        });
    }

    if (snake === player) {
        endGame();
    }
}


// ============================================================
// TERRITORY STATISTICS
// ============================================================

function calculateTerritory() {

    territoryCount.fill(0);

    for (let i = 0; i < territory.length; i++) {

        const owner = territory[i];

        if (owner > 0) {
            territoryCount[owner]++;
        }
    }
}

function getTerritoryPercent(id) {

    calculateTerritory();

    return (
        territoryCount[id] /
        territory.length *
        100
    );
}

function findOwnTerritoryCenter(id) {

    let x = 0;
    let y = 0;
    let count = 0;

    for (let ty = 0; ty < TERRITORY_H; ty += 8) {

        for (let tx = 0; tx < TERRITORY_W; tx += 8) {

            if (
                territory[tileIndex(tx, ty)] === id
            ) {

                x += tx * TILE_SIZE;
                y += ty * TILE_SIZE;
                count++;
            }
        }
    }

    if (!count) return null;

    return {
        x: x / count,
        y: y / count
    };
}


// ============================================================
// DRAW WORLD
// ============================================================

function drawWorld() {

    ctx.fillStyle = "#20252a";
    ctx.fillRect(0, 0, W, H);

    const startX =
        Math.floor(
            (camera.x - W / 2) / TILE_SIZE
        ) - 1;

    const endX =
        Math.ceil(
            (camera.x + W / 2) / TILE_SIZE
        ) + 1;

    const startY =
        Math.floor(
            (camera.y - H / 2) / TILE_SIZE
        ) - 1;

    const endY =
        Math.ceil(
            (camera.y + H / 2) / TILE_SIZE
        ) + 1;

    // Territory
    for (
        let ty = Math.max(0, startY);
        ty < Math.min(TERRITORY_H, endY);
        ty++
    ) {

        for (
            let tx = Math.max(0, startX);
            tx < Math.min(TERRITORY_W, endX);
            tx++
        ) {

            const owner =
                territory[tileIndex(tx, ty)];

            if (owner === 0) continue;

            const p = worldToScreen(
                tx * TILE_SIZE,
                ty * TILE_SIZE
            );

            const ownerPlayer =
                players.find(
                    p => p.id === owner
                );

            if (ownerPlayer) {

                ctx.globalAlpha = 0.65;

                ctx.fillStyle =
                    ownerPlayer.color;

                ctx.fillRect(
                    p.x,
                    p.y,
                    TILE_SIZE + 1,
                    TILE_SIZE + 1
                );

                ctx.globalAlpha = 1;
            }
        }
    }

    // Grid
    ctx.strokeStyle =
        "rgba(255,255,255,0.035)";

    ctx.lineWidth = 1;

    for (
        let x = startX * TILE_SIZE;
        x <= endX * TILE_SIZE;
        x += TILE_SIZE
    ) {

        const sx =
            x - camera.x + W / 2;

        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
        ctx.stroke();
    }

    for (
        let y = startY * TILE_SIZE;
        y <= endY * TILE_SIZE;
        y += TILE_SIZE
    ) {

        const sy =
            y - camera.y + H / 2;

        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
        ctx.stroke();
    }
}


// ============================================================
// DRAW ORBS
// ============================================================

function drawOrbs() {

    for (const orb of orbs) {

        const p =
            worldToScreen(orb.x, orb.y);

        if (
            p.x < -20 ||
            p.x > W + 20 ||
            p.y < -20 ||
            p.y > H + 20
        ) continue;

        ctx.beginPath();

        ctx.arc(
            p.x,
            p.y,
            orb.radius,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = "#ffffff";
        ctx.fill();
    }
}


// ============================================================
// DRAW SNAKES
// ============================================================

function drawSnakes() {

    for (const snake of players) {

        if (!snake.alive) continue;

        // Trail
        if (snake.currentTrail.length > 1) {

            ctx.beginPath();

            const first =
                worldToScreen(
                    snake.currentTrail[0].x,
                    snake.currentTrail[0].y
                );

            ctx.moveTo(first.x, first.y);

            for (
                let i = 1;
                i < snake.currentTrail.length;
                i++
            ) {

                const p =
                    worldToScreen(
                        snake.currentTrail[i].x,
                        snake.currentTrail[i].y
                    );

                ctx.lineTo(p.x, p.y);
            }

            ctx.lineWidth = 7;
            ctx.strokeStyle = snake.color;
            ctx.globalAlpha = 0.7;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Body
        for (
            let i = snake.body.length - 1;
            i >= 0;
            i--
        ) {

            const segment = snake.body[i];

            const p =
                worldToScreen(
                    segment.x,
                    segment.y
                );

            const size =
                snake.radius *
                (1 - i / snake.body.length * 0.15);

            ctx.beginPath();

            ctx.arc(
                p.x,
                p.y,
                size,
                0,
                Math.PI * 2
            );

            ctx.fillStyle = snake.color;

            ctx.fill();
        }

        // Head
        const head =
            worldToScreen(
                snake.x,
                snake.y
            );

        ctx.beginPath();

        ctx.arc(
            head.x,
            head.y,
            snake.radius + 2,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = snake.color;
        ctx.fill();

        // Eyes
        const eyeOffset = 5;

        for (const side of [-1, 1]) {

            const ex =
                head.x +
                Math.cos(
                    snake.angle +
                    side * 0.45
                ) * eyeOffset;

            const ey =
                head.y +
                Math.sin(
                    snake.angle +
                    side * 0.45
                ) * eyeOffset;

            ctx.beginPath();

            ctx.arc(
                ex,
                ey,
                2.5,
                0,
                Math.PI * 2
            );

            ctx.fillStyle = "#111";
            ctx.fill();
        }
    }
}


// ============================================================
// CAMERA
// ============================================================

function updateCamera(dt) {

    if (!player) return;

    camera.x +=
        (player.x - camera.x) *
        Math.min(1, dt * 7);

    camera.y +=
        (player.y - camera.y) *
        Math.min(1, dt * 7);
}


// ============================================================
// HUD
// ============================================================

function updateHUD() {

    if (!player) return;

    const percent =
        getTerritoryPercent(player.id);

    stats.textContent =
        `Territory: ${percent.toFixed(2)}%`;

    lengthText.textContent =
        `Length: ${player.length}`;

    const alivePlayers =
        players
            .filter(p => p.alive)
            .map(p => ({
                name: p === player
                    ? "YOU"
                    : `PLAYER ${p.id}`,
                percent:
                    getTerritoryPercent(p.id)
            }))
            .sort(
                (a, b) =>
                    b.percent - a.percent
            )
            .slice(0, 8);

    leaderboard.innerHTML = "";

    alivePlayers.forEach((p, index) => {

        const row =
            document.createElement("div");

        row.className = "leaderRow";

        row.innerHTML =
            `<span>${index + 1}. ${p.name}</span>
             <span>${p.percent.toFixed(1)}%</span>`;

        leaderboard.appendChild(row);
    });
}


// ============================================================
// WIN CONDITION
// ============================================================

function checkWin() {

    const percent =
        getTerritoryPercent(player.id);

    if (percent >= 99.9) {

        gameRunning = false;

        gameOverScreen.style.display =
            "flex";

        document.getElementById(
            "gameOverTitle"
        ).textContent = "YOU CONQUERED THE WORLD!";

        gameOverText.textContent =
            "100% of the world belongs to you.";
    }
}


// ============================================================
// START / GAME OVER
// ============================================================

function startGame() {

    territory.fill(0);

    createPlayer();

    createAI();

    createOrbs();

    player.alive = true;

    gameRunning = true;

    startScreen.style.display =
        "none";

    gameOverScreen.style.display =
        "none";

    lastTime =
        performance.now();

    requestAnimationFrame(gameLoop);
}

function endGame() {

    gameRunning = false;

    gameOverScreen.style.display =
        "flex";

    document.getElementById(
        "gameOverTitle"
    ).textContent = "GAME OVER";

    gameOverText.textContent =
        "You were eliminated. Try conquering more territory!";
}

startButton.addEventListener(
    "click",
    startGame
);

restartButton.addEventListener(
    "click",
    startGame
);


// ============================================================
// MAIN LOOP
// ============================================================

function gameLoop(timestamp) {

    if (!gameRunning) return;

    let dt =
        (timestamp - lastTime) / 1000;

    dt = Math.min(dt, 0.04);

    lastTime = timestamp;

    for (const p of players) {
        p.update(dt);
    }

    checkCollisions();

    updateCamera(dt);

    drawWorld();

    drawOrbs();

    drawSnakes();

    updateHUD();

    checkWin();

    requestAnimationFrame(gameLoop);
}
