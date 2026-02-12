/* Version: #1 */

// === KONFIGURASJON ===
const GRID_SIZE = 30; // Må matche background-size i style.css
const DOT_RADIUS = 6;
const COLORS = [
    { name: 'Rød', hex: '#ef4444', border: '#b91c1c' },     // Tailwind red-500
    { name: 'Blå', hex: '#3b82f6', border: '#1d4ed8' },     // Tailwind blue-500
    { name: 'Grønn', hex: '#22c55e', border: '#15803d' },   // Tailwind green-500
    { name: 'Lilla', hex: '#a855f7', border: '#7e22ce' },   // Tailwind purple-500
    { name: 'Oransje', hex: '#f97316', border: '#c2410c' }, // Tailwind orange-500
    { name: 'Rosa', hex: '#ec4899', border: '#be185d' },    // Tailwind pink-500
    { name: 'Turkis', hex: '#06b6d4', border: '#0e7490' }   // Tailwind cyan-500
];

// === KLASSE: SHAPE (FIGUR) ===
class Shape {
    constructor(id, type, colorIndex) {
        this.id = id;
        this.type = type; // 'line', 'square', 'triangle', 'rectangle', 'constant'
        this.colorIdx = colorIndex % COLORS.length;
        this.offsetX = 0; // Grid enheter
        this.offsetY = 0; // Grid enheter
        this.rotation = 0; // 0, 90, 180, 270 grader
        this.constantValue = 1; // Kun for type 'constant'
    }

    getColor() {
        return COLORS[this.colorIdx];
    }

    // Returnerer array av punkter {x, y} relativt til figurens origo (0,0) basert på n
    getPoints(n) {
        let points = [];
        
        switch (this.type) {
            case 'line': // Linjetall: n punkter på rad
                for (let i = 0; i < n; i++) points.push({x: i, y: 0});
                break;
            
            case 'square': // Kvadrattall: n*n grid
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;

            case 'rectangle': // Rektangeltall: n * (n+1)
                // Høyde n, Bredde n+1
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n + 1; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;

            case 'triangle': // Trekanttall: n(n+1)/2
                // Vi bygger en rettvinklet trekant ("trapp") som er lett å stable.
                // Rad 0: 1 prikk. Rad 1: 2 prikker...
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x <= y; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;

            case 'constant': // Konstant: Alltid k punkter
                // Lager en enkel linje
                for (let i = 0; i < this.constantValue; i++) points.push({x: i, y: 0});
                break;
        }

        // Bruk rotasjon
        points = points.map(p => this.rotatePoint(p));

        return points;
    }

    rotatePoint(p) {
        // Roterer rundt (0,0) internt i figuren
        // 90 grader med klokka: (x, y) -> (y, -x) i matematisk grid, 
        // men la oss holde det enkelt:
        // 0 deg: x, y
        // 90 deg: -y, x
        // 180 deg: -x, -y
        // 270 deg: y, -x
        
        let x = p.x;
        let y = p.y;
        
        switch (this.rotation) {
            case 90: return {x: -y, y: x};
            case 180: return {x: -x, y: -y};
            case 270: return {x: y, y: -x};
            default: return {x: x, y: y};
        }
    }

    getFormulaLatex() {
        const c = this.getColor().hex;
        let term = "";
        
        switch (this.type) {
            case 'line': term = "n"; break;
            case 'square': term = "n^2"; break;
            case 'rectangle': term = "n(n+1)"; break;
            case 'triangle': term = "\\frac{n(n+1)}{2}"; break;
            case 'constant': term = this.constantValue.toString(); break;
        }

        // Returnerer LaTeX med farge
        return `\\color{${c}}{${term}}`;
    }

    getValue(n) {
        switch (this.type) {
            case 'line': return n;
            case 'square': return n * n;
            case 'rectangle': return n * (n + 1);
            case 'triangle': return (n * (n + 1)) / 2;
            case 'constant': return this.constantValue;
            default: return 0;
        }
    }
}

// === APPLIKASJONSLOGIKK ===
const app = {
    canvas: null,
    ctx: null,
    n: 1,
    shapes: [],
    nextId: 1,
    cameraOffset: {x: 0, y: 0}, // Brukes til å sentrere tegningen

    init() {
        console.log("Starter Figurtall Utforsker...");
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Håndter resizing av vindu
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // UI Event Listeners
        document.getElementById('n-slider').addEventListener('input', (e) => {
            this.setN(parseInt(e.target.value));
        });

        document.getElementById('btn-add-shape').addEventListener('click', () => {
            document.getElementById('add-shape-modal').classList.remove('hidden');
        });

        document.getElementById('btn-preset-house').addEventListener('click', () => this.loadPreset('house'));
        document.getElementById('btn-preset-boat').addEventListener('click', () => this.loadPreset('boat'));

        // Start opp
        this.resizeCanvas(); // Kaller også draw()
        this.updateUI();
        console.log("Initialisering ferdig.");
    },

    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Sentrer kamera (origo) midt i canvaset
        this.cameraOffset.x = Math.floor(this.canvas.width / 2);
        this.cameraOffset.y = Math.floor(this.canvas.height / 2);
        
        this.draw();
    },

    setN(val) {
        console.log(`Endrer n til: ${val}`);
        this.n = val;
        document.getElementById('n-display').innerText = val;
        this.draw();
        this.updateFormula();
    },

    addShape(type) {
        document.getElementById('add-shape-modal').classList.add('hidden');
        
        const shape = new Shape(this.nextId++, type, this.shapes.length);
        
        // Enkel logikk for å ikke legge alle oppå hverandre med en gang
        if (this.shapes.length > 0) {
            shape.offsetX = this.shapes.length * 2;
        }
        
        if (type === 'constant') {
            const val = prompt("Hvor mange prikker skal konstanten være?", "2");
            shape.constantValue = parseInt(val) || 1;
        }

        this.shapes.push(shape);
        console.log(`La til figur: ${type} (ID: ${shape.id})`);
        
        this.renderLayersList();
        this.draw();
        this.updateFormula();
    },

    removeShape(id) {
        console.log(`Fjerner figur ID: ${id}`);
        this.shapes = this.shapes.filter(s => s.id !== id);
        this.renderLayersList();
        this.draw();
        this.updateFormula();
    },

    moveShape(id, dx, dy) {
        const s = this.shapes.find(s => s.id === id);
        if (s) {
            s.offsetX += dx;
            s.offsetY += dy;
            console.log(`Flyttet figur ${id} til (${s.offsetX}, ${s.offsetY})`);
            this.draw();
        }
    },

    rotateShape(id) {
        const s = this.shapes.find(s => s.id === id);
        if (s) {
            s.rotation = (s.rotation + 90) % 360;
            console.log(`Roterte figur ${id} til ${s.rotation} grader`);
            this.draw();
            
            // Oppdater knapp-tekst i UI
            const btn = document.getElementById(`rot-btn-${id}`);
            if(btn) btn.innerText = `↻ ${s.rotation}°`;
        }
    },

    loadPreset(name) {
        console.log(`Laster preset: ${name}`);
        this.shapes = [];
        this.n = 3; // Reset N for demo, da ser figurene ofte best ut
        document.getElementById('n-slider').value = 3;
        document.getElementById('n-display').innerText = 3;

        if (name === 'house') {
            // Hus: Kvadrat (vegg) + Trekant (tak)
            
            // 1. Vegg (Rød firkant)
            const wall = new Shape(this.nextId++, 'square', 0); 
            wall.offsetX = -1; // Sentrer litt
            wall.offsetY = 0;
            
            // 2. Tak (Grønn trekant)
            // Vi må rotere og flytte den for å passe oppå
            const roof = new Shape(this.nextId++, 'triangle', 2); 
            roof.offsetX = -2; 
            roof.offsetY = 3; // Oppå veggen (hvis n=3, høyde er 3)
            // Merk: Siden offset er statisk og høyden på veggen er dynamisk (n),
            // vil taket "sveve" hvis n øker, eller kræsje hvis n minker.
            // Dette er en del av utforskningen ("Hvorfor passer ikke taket når n=5?").
            // For pedagogisk formål i denne appen lar vi offset være statisk.
            
            // Justering for å få taket til å se pent ut som en trapp oppå
            roof.rotation = 0; // Standard trapp
            // La oss prøve å rotere den for å lage en spiss? Nei, trappetak er kult.
            // La oss rotere den slik at den peker opp-høyre.
            
            this.shapes.push(wall, roof);

        } else if (name === 'boat') {
            // Båt: Rektangel (skrog) + Linje (mast) + Trekant (seil)
            
            // 1. Skrog (Blå)
            const hull = new Shape(this.nextId++, 'rectangle', 1); 
            hull.offsetX = -2; 
            hull.offsetY = -2; // Litt ned
            
            // 2. Mast (Oransje linje)
            const mast = new Shape(this.nextId++, 'line', 4); 
            mast.rotation = 90; // Vertikal
            mast.offsetX = 0; // Midt på (hvis n=3, bredde er 4)
            mast.offsetY = 1; // Opp fra skroget
            
            // 3. Seil (Rød trekant)
            const sail = new Shape(this.nextId++, 'triangle', 0); 
            sail.offsetX = 1;
            sail.offsetY = 1;

            this.shapes.push(hull, mast, sail);
        }

        this.renderLayersList();
        this.draw();
        this.updateFormula();
    },

    updateUI() {
        this.renderLayersList();
        this.updateFormula();
    },

    // === TEGNING (RENDERING) ===
    draw() {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Tøm canvas (grid ligger i CSS background)
        this.ctx.clearRect(0, 0, w, h);

        const cx = this.cameraOffset.x;
        const cy = this.cameraOffset.y;

        // Tegn akser (X og Y) for å vise origo
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#9ca3af'; // Gray-400
        this.ctx.lineWidth = 2;
        // X-akse
        this.ctx.moveTo(0, cy); 
        this.ctx.lineTo(w, cy); 
        // Y-akse
        this.ctx.moveTo(cx, 0); 
        this.ctx.lineTo(cx, h); 
        this.ctx.stroke();

        // Tegn figurer
        // Koordinatsystem:
        // Math: +Y er OPP. Canvas: +Y er NED.
        // Vi inverterer Y når vi tegner.
        
        this.shapes.forEach(shape => {
            const points = shape.getPoints(this.n);
            const color = shape.getColor();
            
            this.ctx.fillStyle = color.hex;
            this.ctx.strokeStyle = color.border;
            this.ctx.lineWidth = 1;

            points.forEach(p => {
                // 1. Legg til offset (hvor figuren er plassert i gridet)
                const gridX = p.x + shape.offsetX;
                const gridY = p.y + shape.offsetY; 
                
                // 2. Konverter til piksler
                // X: cx + (x * size)
                // Y: cy - (y * size)  <-- Minus for å invertere Y-aksen (Opp er positivt)
                const px = cx + (gridX * GRID_SIZE); 
                const py = cy - (gridY * GRID_SIZE); 

                // Vi sentrerer prikken midt i ruten (grid cellen)
                // Siden linjene går på piksel 0, 30, 60... vil midten være +15.
                // Men vent, i style.css er grid lines bakgrunn.
                // La oss tegne PÅ kryssene (intersections) eller I rutene?
                // Instruksen sa "rutenett... figurene består av prikker".
                // Det er vanligst å tegne prikker I rutene eller PÅ kryssene. 
                // La oss tegne PÅ kryssene (intersections) for enklere koordinatforståelse (0,0 er et kryss).
                
                // Tegn sirkel
                this.ctx.beginPath();
                this.ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            });
        });
    },

    // === UI LISTE OG FORMEL ===
    renderLayersList() {
        const list = document.getElementById('layers-list');
        list.innerHTML = '';
        
        if (this.shapes.length === 0) {
            list.innerHTML = '<div class="text-gray-400 text-center italic mt-4">Ingen figurer lagt til.</div>';
            return;
        }

        // Vi itererer baklengs eller forlengs? Listen bør matche rekkefølgen.
        this.shapes.forEach(shape => {
            const el = document.createElement('div');
            el.className = "bg-white p-3 rounded border border-gray-200 shadow-sm flex flex-col gap-2 transition hover:shadow-md";
            
            // Header: Navn og Farge
            const header = document.createElement('div');
            header.className = "flex justify-between items-center";
            header.innerHTML = `
                <div class="flex items-center gap-2 font-bold text-gray-700">
                    <div class="w-4 h-4 rounded-full border border-gray-300" style="background-color: ${shape.getColor().hex}"></div>
                    <span>${this.getShapeNameNorwegian(shape.type)}</span>
                </div>
                <button onclick="app.removeShape(${shape.id})" class="text-gray-400 hover:text-red-500 font-bold px-2 text-lg" title="Fjern">
                    &times;
                </button>
            `;
            
            // Kontroller: Flytt og Roter
            const controls = document.createElement('div');
            controls.className = "flex justify-between items-center text-xs mt-1 bg-gray-50 p-2 rounded";
            
            // Flytte-knapper (D-pad style flat)
            const moveDiv = document.createElement('div');
            moveDiv.className = "flex gap-1 items-center";
            moveDiv.innerHTML = `
                <span class="text-gray-400 mr-1 font-semibold">Pos:</span>
                <button onclick="app.moveShape(${shape.id}, -1, 0)" class="bg-white border border-gray-300 hover:bg-blue-50 px-2 py-1 rounded shadow-sm">←</button>
                <div class="flex flex-col gap-1">
                    <button onclick="app.moveShape(${shape.id}, 0, 1)" class="bg-white border border-gray-300 hover:bg-blue-50 px-2 py-0.5 rounded shadow-sm">↑</button>
                    <button onclick="app.moveShape(${shape.id}, 0, -1)" class="bg-white border border-gray-300 hover:bg-blue-50 px-2 py-0.5 rounded shadow-sm">↓</button>
                </div>
                <button onclick="app.moveShape(${shape.id}, 1, 0)" class="bg-white border border-gray-300 hover:bg-blue-50 px-2 py-1 rounded shadow-sm">→</button>
            `;

            // Roter-knapp
            const rotBtn = document.createElement('button');
            rotBtn.id = `rot-btn-${shape.id}`;
            rotBtn.className = "bg-white text-blue-600 px-3 py-1 rounded hover:bg-blue-50 border border-blue-200 shadow-sm font-medium transition";
            rotBtn.innerText = `↻ ${shape.rotation}°`;
            rotBtn.onclick = () => app.rotateShape(shape.id);

            controls.appendChild(moveDiv);
            controls.appendChild(rotBtn);
            
            el.appendChild(header);
            el.appendChild(controls);
            list.appendChild(el);
        });
    },

    getShapeNameNorwegian(type) {
        const map = {
            'line': 'Linjetall',
            'square': 'Kvadrattall',
            'triangle': 'Trekanttall',
            'rectangle': 'Rektangeltall',
            'constant': 'Konstant'
        };
        return map[type] || type;
    },

    updateFormula() {
        const formulaContainer = document.getElementById('formula-display');
        const calcContainer = document.getElementById('calc-display');

        if (this.shapes.length === 0) {
            formulaContainer.innerHTML = "$$ F_n = 0 $$";
            calcContainer.innerHTML = "0";
            if(window.MathJax) MathJax.typesetPromise([formulaContainer]);
            return;
        }

        // Bygg LaTeX streng
        let latexParts = [];
        let totalValue = 0;
        let calcParts = [];

        this.shapes.forEach((shape, index) => {
            const sign = index > 0 ? "+" : "";
            // Legg til formeldel (f.eks. n^2)
            latexParts.push(`${sign} ${shape.getFormulaLatex()}`);
            
            // Beregn verdi
            const val = shape.getValue(this.n);
            totalValue += val;
            
            // Legg til i utregningstekst
            calcParts.push(`${sign} ${val}`);
        });

        // Oppdater DOM
        const formulaStr = latexParts.join(' ');
        formulaContainer.innerHTML = `$$ F_n = ${formulaStr} $$`;
        
        // Rens opp utregningsstrengen (fjern ledende + tegn)
        let calcStr = calcParts.join(' ').trim();
        if (calcStr.startsWith('+')) calcStr = calcStr.substring(1).trim();
        
        calcContainer.innerHTML = `${calcStr} = <b>${totalValue}</b>`;

        // Kjør MathJax rendering
        if (window.MathJax) {
            MathJax.typesetPromise([formulaContainer])
                .then(() => {
                    // console.log("MathJax rendering complete");
                })
                .catch((err) => console.log('MathJax error:', err));
        }
    }
};

// Start appen når DOM er klar
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
