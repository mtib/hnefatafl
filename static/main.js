function randomInt(min, max) {
    if (!max) {
        max = min;
        min = 0;
    }

    return Math.floor(Math.random() * (max - min) + min);
}

let app = new PIXI.Application({ width: 600, height: 600 });

//Add the canvas that Pixi automatically created for you to the HTML document
document.getElementById('game').appendChild(app.view);
app.stage.interactive = true;

PIXI.Loader.shared.add("static/konge.png").add("static/hirdmann.png").add("static/aatakar.png").add("static/brett.png").add("static/brett_stor.png").load(setup);

let texes = {};

function texture(name) {
    if (!texes[name]) {
        console.log(`loading ${name}`);
        texes[name] = PIXI.Loader.shared.resources[`static/${name}.png`].texture;
    }

    return texes[name];
}

function Piece(x, y, tex) {
    this.x = x;
    this.y = y;
    this.sprite = new PIXI.Sprite(tex);
    Object.assign(this.sprite.position, this.toReal());

    app.stage.addChild(this.sprite);
}

Piece.prototype.move = function(dx, dy) {
    if (dx != undefined) {
        this.x += dx;
        this.y += dy;
        this.sprite.x += dx * 40;
        this.sprite.y += dy * 40;
    } else {
        Object.assign(this.sprite.position, this.toReal());
    }
}
Piece.prototype.at = function(x, y) {
    return this.x == x && this.y == y;
}
Piece.prototype.toReal = function() {
    return {x: 11 + this.x * 40, y: 11 + this.y * 40};
}
function fromReal(x, y) {
    return {x: Math.floor((x - 11)/40), y: Math.floor((y - 11)/40)}
}

function Board(stor) {
    const brett = new PIXI.Sprite(texture(stor ? 'brett_stor' : 'brett'));
    app.stage.addChild(brett);
    const aatakar = texture('aatakar');
    const hirdmann = texture('hirdmann');

    const dimensions = 11 + (stor ? 2 : 0);
    const last = dimensions-1;
    const mid = Math.floor(dimensions / 2);

    this.konge = new Piece(mid, mid, texture('konge'));
    this.aatakarar = [];
    this.hirdmenn = [];
    this.aatakTur = true;

    for (let i = -2; i <= 2; i++) {
        this.aatakarar.push(
            new Piece(mid+i, 0, aatakar),
            new Piece(mid+i, last, aatakar),
            new Piece(0, mid+i, aatakar),
            new Piece(last, mid+i, aatakar)
        );

        const k = 2 - Math.abs(i);

        for (let j = -k; j <= k; j++) {
            if (i == 0 && j == 0) {
                this.aatakarar.push(
                    new Piece(mid + i, 1, aatakar),
                    new Piece(mid + i, last-1, aatakar),
                    new Piece(1, mid + i, aatakar),
                    new Piece(last-1, mid + i, aatakar)
                );
            } else {
                this.hirdmenn.push(new Piece(i+mid, j+mid, hirdmann));
            }
        }
    }
}

Board.prototype.pickup = function(_x, _y) {
    const {x,y} = fromReal(_x, _y);

    return this.find(x, y, false);
}
Board.prototype.delete = function(x, y) {
    const [piece] = function() {
        for (let i = 0; i < this.aatakarar.length; i++) {
            if (this.aatakarar[i].at(x, y)) {
                return this.aatakarar.splice(i, 1);
            }
        }
        for (let i = 0; i < this.hirdmenn.length; i++) {
            if (this.hirdmenn[i].at(x, y)) {
                return this.hirdmenn.splice(i, 1);
            }
        }
        return [];
    }.bind(this)();
    if (piece != undefined) {
        app.stage.removeChild(piece.sprite);
    }
    return piece;
}
Board.prototype.find = function(x, y, ignoreTurn) {
    if (this.aatakTur || ignoreTurn) {
        for (let aatakar of this.aatakarar) {
            if (aatakar.at(x, y)) {
                return aatakar;
            }
        }
    }
    if (!this.aatakTur || ignoreTurn) {
        if (this.konge.at(x, y)) {
            return this.konge;
        }
        for (let hirdmann of this.hirdmenn) {
            if (hirdmann.at(x, y)) {
                return hirdmann;
            }
        }
    }
    return null;
}

let board;
let socket;

let code;

function setup() {
    board = new Board(false);
    socket = new WebSocket(`ws://${document.location.hostname}:2794`, "hnefatafl");
    socket.onmessage = onMessage;

    socket.onopen = function() {
        const get_code = new URLSearchParams(document.location.search).get('code');
        
        if (get_code == null) {
            socket.send(`HOST`)
        } else {
            code = get_code;
            socket.send(`JOIN ${code}`);
        }
    }

    app.renderer.plugins.interaction.on('pointerdown', onDown);
    app.renderer.plugins.interaction.on('pointermove', onMove);
    app.renderer.plugins.interaction.on('pointerup', onUp);

    app.ticker.add(mkGmLoop(consistentLogic));
}

function mkGmLoop(logic) {
    let time = 0;

    return function gameLoop(delta) {
        time += delta;

        for (let i = 0; time >= 1 && i < 5; i++) {
            time -= 1;
            logic();
        }
    }
}

let pickedUp = null;

function onMessage(event) {
    console.info(event);

    if (event.data.startsWith('HOST_OK ')) {
        code = event.data.substr(8);

        document.getElementById('code').innerHTML = `Gjev venen din denna koda so dei kann deltaka: ${code}`;
    } else if (event.data.startsWith('JOIN_OK ')) {
        if (code != event.data.substr(8)) {
            console.error(`Our code ${code} didn't match the code code in the response ${event.data}`);
        }
    } else if (event.data.startsWith('DELETE ')) {
        const args = event.data.substr(7).split(' ');

        const x = Number(args[0]);
        const y = Number(args[1]);

        console.log(`deleted ${board.delete(x, y)}`);
    } else if (event.data.startsWith('MOVE ')) {
        const args = event.data.substr(5).split(' ');

        const x = Number(args[0]);
        const y = Number(args[1]);
        const dx = Number(args[2]);
        const dy = Number(args[3]);

        board.find(x, y).move(dx, dy);
        board.aatakTur = !board.aatakTur;
    }
}
function onDown(event) {
    let piece = board.pickup(event.data.global.x, event.data.global.y);

    if (piece != null) {
        if (pickedUp != null) {
            app.stage.removeChild(pickedUp.sprite);
        }
        pickedUp = new Piece(piece.x, piece.y, piece.sprite.texture);
        pickedUp.sprite.alpha = 0.56;
        pickedUp.orig = {x: piece.x, y: piece.y};
    }
}
function onMove(event) {
    if (pickedUp != null) {
        const {x, y} = fromReal(event.data.global.x, event.data.global.y);
        pickedUp.x = x;
        pickedUp.y = y;
        pickedUp.move();
    }
}
function onUp(event) {
    onMove(event)
    if (pickedUp != null) {
        app.stage.removeChild(pickedUp.sprite);

        const dx = pickedUp.x - pickedUp.orig.x;
        const dy = pickedUp.y - pickedUp.orig.y;

        if (dx != dy && (dx + dy == dx || dx + dy == dy)) {
            board.find(pickedUp.orig.x, pickedUp.orig.y).move(dx, dy);
            socket.send(`MOVE ${pickedUp.orig.x} ${pickedUp.orig.y} ${dx} ${dy}`);
            board.aatakTur = !board.aatakTur;
        }

        pickedUp = null;
    }
}

function consistentLogic() {
}