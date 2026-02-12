/* Version: #2 */

// === KONFIGURASJON ===
const GRID_SIZE = 30; // Må matche background-size i style.css
const DOT_RADIUS = 8; // Litt større radius for lettere klikking
const HIT_RADIUS = 15; // Hvor nærme man må klikke for å treffe en prikk

// Standardfarger for nye figurer (roteres)
const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'];

// === KLASSE: SHAPE (FIGUR) ===
class Shape {
    constructor(id, type, colorHex) {
        this.id = id;
        this.type = type; // 'line', 'square', 'triangle', 'rectangle', 'constant'
        this.color = colorHex || '#000000';
        
        // Posisjon
        this.offsetX = 0; 
        this.offsetY = 0; 
        this.rotation = 0; 
        
        // Egenskaper
        this.nOffset = 0; // Tillegg til global n (f.eks. n+2)
        this.constantValue = 1; // Kun for 'constant'
        this.groupName = ""; // Gruppering av figurer
    }

    // Beregner effektiv n for denne figuren
    getEffectiveN(globalN) {
        if (this.type === 'constant') return this.constantValue;
        const eff = globalN + this.nOffset;
        return eff < 1 ? 0 : eff; // Ingen negative figurtall
    }

    // Returnerer array av punkter {x, y} relativt til figurens origo
    getPoints(globalN) {
        let points = [];
        const n = this.getEffectiveN(globalN);

        if (n <= 0) return []; // Tegn ingenting hvis n blir 0 eller mindre
        
        switch (this.type) {
            case 'line': 
                for (let i = 0; i < n; i++) points.push({x: i, y: 0});
                break;
            
            case 'square': 
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;

            case 'rectangle': // n * (n+1)
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n + 1; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;

            case 'triangle': // n(n+1)/2 (Trapp)
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x <= y; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;

            case 'constant': 
                for (let i = 0; i < this.constantValue; i++) points.push({x: i, y: 0});
                break;
        }

        // Roter punktene
        points = points.map(p => this.rotatePoint(p));
        return points;
    }

    rotatePoint(p) {
        let x = p.x;
        let y = p.y;
        switch (this.rotation) {
            case 90: return {x: -y, y: x};
            case 180: return {x: -x, y: -y};
            case 270: return {x: y, y: -x};
            default: return {x: x, y: y};
        }
    }

    // Returnerer true hvis punktet (gridX, gridY) treffer en av prikkene i figuren
    hitTest(globalN, gridX, gridY) {
        const points = this.getPoints(globalN);
        // Sjekk avstand til hvert punkt
        // Vi bruker en enkel avstandssjekk i grid-enheter. 
        // 0.5 grid units radius (ca 15px) er greit.
        const threshold = 0.5; 

        for (let p of points) {
            const px = p.x + this.offsetX;
            const py = p.y + this.offsetY;
            const dist = Math.sqrt((px - gridX)**2 + (py - gridY)**2);
            if (dist < threshold) return true;
        }
        return false;
    }

    getFormulaLatex() {
        const c = this.color;
        let nStr = "n";
        
        // Håndter n offset visning
        if (this.nOffset > 0) nStr = `(n+${this.nOffset})`;
        else if (this.nOffset < 0) nStr = `(n-${Math.abs(this.nOffset)})`;
        
        // Hvis nOffset er 0, trenger vi av og til parenteser avhengig av kontekst,
        // men n^2 er greit. n(n+1) krever litt omtanke.

        let term = "";
        switch (this.type) {
            case 'line': 
                term = nStr; 
                break;
            case 'square': 
                term = `${nStr}^2`; 
                break;
            case 'rectangle': 
                // n(n+1) logic
                if (this.nOffset === 0) term = "n(n+1)";
                else {
                    // (n+1)(n+2)
                    const nPlusOne = this.nOffset + 1;
                    const nextStr = nPlusOne > 0 ? `(n+${nPlusOne})` : (nPlusOne === 0 ? "n" : `(n${nPlusOne})`);
                    term = `${nStr}${nextStr}`;
                }
                break;
            case 'triangle': 
                // n(n+1)/2 logic
                if (this.nOffset === 0) term = "\\frac{n(n+1)}{2}";
                else {
                    const nPlusOne = this.nOffset + 1;
                    const nextStr = nPlusOne > 0 ? `(n+${nPlusOne})` : (nPlusOne === 0 ? "n" : `(n${nPlusOne})`);
                    term = `\\frac{${nStr}${nextStr}}{2}`;
                }
                break;
            case 'constant': 
                term = this.constantValue.toString(); 
                break;
        }

        return `\\color{${c}}{${term}}`;
    }

    getValue(globalN) {
        const n = this.getEffectiveN(globalN);
        if (n <= 0) return 0;

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
    cameraOffset: {x: 0, y: 0},
    
    // Drag & Drop state
    isDragging: false,
    draggedShapes: [], // Array av IDer som flyttes (pga gruppering)
    lastMousePos: {x: 0, y: 0},

    init() {
        console.log("Starter Figurtall Utforsker v2...");
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Event Listeners
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Mouse Events for Canvas (Drag & Drop)
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());

        // UI Controls
        document.getElementById('n-slider').addEventListener('input', (e) => this.setN(parseInt(e.target.value)));
        document.getElementById('btn-add-shape').addEventListener('click', () => {
            document.getElementById('add-shape-modal').classList.remove('hidden');
        });

        document.getElementById('btn-preset-house').addEventListener('click', () => this.loadPreset('house'));
        document.getElementById('btn-preset-boat').addEventListener('click', () => this.loadPreset('boat'));

        this.resizeCanvas();
        this.updateUI();
    },

    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.cameraOffset.x = Math.floor(this.canvas.width / 2);
        this.cameraOffset.y = Math.floor(this.canvas.height / 2);
        this.draw();
    },

    // === MOUSE HANDLING ===
    getGridCoordinates(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = evt.clientX - rect.left;
        const mouseY = evt.clientY - rect.top;

        // Konverter piksel til grid (husk invertert Y)
        // px = cx + gridX * size  =>  gridX = (px - cx) / size
        // py = cy - gridY * size  =>  gridY = (cy - py) / size
        const gridX = (mouseX - this.cameraOffset.x) / GRID_SIZE;
        const gridY = (this.cameraOffset.y - mouseY) / GRID_SIZE;
        
        return { gridX, gridY, clientX: evt.clientX, clientY: evt.clientY };
    },

    handleMouseDown(e) {
        const coords = this.getGridCoordinates(e);
        
        // Sjekk om vi treffer en figur (sjekk øverste lag først -> baklengs loop)
        let hitShape = null;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i].hitTest(this.n, coords.gridX, coords.gridY)) {
                hitShape = this.shapes[i];
                break;
            }
        }

        if (hitShape) {
            this.isDragging = true;
            this.lastMousePos = { x: coords.gridX, y: coords.gridY };
            
            // Finn alle figurer som skal flyttes (Gruppering)
            if (hitShape.groupName && hitShape.groupName.trim() !== "") {
                this.draggedShapes = this.shapes.filter(s => s.groupName === hitShape.groupName);
            } else {
                this.draggedShapes = [hitShape];
            }
            
            this.canvas.style.cursor = "grabbing";
        }
    },

    handleMouseMove(e) {
        if (!this.isDragging) {
            // Hover effekt: Endre cursor hvis over figur
            const coords = this.getGridCoordinates(e);
            let hit = false;
            for (let s of this.shapes) {
                if (s.hitTest(this.n, coords.gridX, coords.gridY)) {
                    hit = true; break;
                }
            }
            this.canvas.style.cursor = hit ? "grab" : "crosshair";
            return;
        }

        const coords = this.getGridCoordinates(e);
        const dx = coords.gridX - this.lastMousePos.x;
        const dy = coords.gridY - this.lastMousePos.y;

        // Oppdater posisjon på alle valgte figurer
        this.draggedShapes.forEach(s => {
            s.offsetX += dx;
            s.offsetY += dy;
        });

        this.lastMousePos = { x: coords.gridX, y: coords.gridY };
        this.draw();
    },

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.draggedShapes = [];
            this.canvas.style.cursor = "grab";
            
            // Snap to grid (rund av til nærmeste heltall)
            this.shapes.forEach(s => {
                s.offsetX = Math.round(s.offsetX);
                s.offsetY = Math.round(s.offsetY);
            });
            this.draw();
            this.updateUI(); // Oppdater koordinat-knapper i listen hvis vi vil vise dem
        }
    },

    // === STATE MANAGEMENT ===
    setN(val) {
        this.n = val;
        document.getElementById('n-display').innerText = val;
        this.draw();
        this.updateFormula();
    },

    addShape(type) {
        document.getElementById('add-shape-modal').classList.add('hidden');
        
        // Velg en farge fra standardpaletten
        const color = DEFAULT_COLORS[this.shapes.length % DEFAULT_COLORS.length];
        const shape = new Shape(this.nextId++, type, color);
        
        // Plasser litt smart
        if (this.shapes.length > 0) {
            shape.offsetX = 2; // Litt til siden for origo
        }
        
        if (type === 'constant') {
            const val = prompt("Verdi for konstant?", "1");
            shape.constantValue = parseInt(val) || 1;
        }

        this.shapes.push(shape);
        this.renderLayersList();
        this.draw();
        this.updateFormula();
    },

    updateShapeProp(id, prop, value) {
        const s = this.shapes.find(s => s.id === id);
        if (!s) return;

        if (prop === 'nOffset') s.nOffset = parseInt(value) || 0;
        if (prop === 'color') s.color = value;
        if (prop === 'groupName') s.groupName = value;

        this.draw();
        this.updateFormula();
    },

    rotateShape(id) {
        const s = this.shapes.find(s => s.id === id);
        if (s) {
            s.rotation = (s.rotation + 90) % 360;
            this.draw();
            // Oppdater UI knapp tekst
            const btn = document.getElementById(`rot-btn-${id}`);
            if(btn) btn.innerText = `↻ ${s.rotation}°`;
        }
    },

    removeShape(id) {
        this.shapes = this.shapes.filter(s => s.id !== id);
        this.renderLayersList();
        this.draw();
        this.updateFormula();
    },

    loadPreset(name) {
        this.shapes = [];
        this.n = 3;
        document.getElementById('n-slider').value = 3;
        document.getElementById('n-display').innerText = 3;

        if (name === 'house') {
            // Hus: Kvadrat vegg, Trekant tak. Samme gruppe.
            const wall = new Shape(this.nextId++, 'square', '#ef4444'); 
            wall.groupName = "Hus";
            wall.offsetX = -1; wall.offsetY = 0;

            const roof = new Shape(this.nextId++, 'triangle', '#22c55e');
            roof.groupName = "Hus";
            roof.offsetX = -2; roof.offsetY = 3; 
            // La oss si taket er litt større? n+1?
            roof.nOffset = 1; // Prøver offset funksjonaliteten

            this.shapes.push(wall, roof);
        } else if (name === 'boat') {
            // Båt: Skrog (Rekt), Mast (Linje), Seil (Trekant)
            const hull = new Shape(this.nextId++, 'rectangle', '#3b82f6');
            hull.groupName = "Båt";
            hull.offsetX = -2; hull.offsetY = -2;

            const mast = new Shape(this.nextId++, 'line', '#f97316');
            mast.groupName = "Båt";
            mast.rotation = 90;
            mast.offsetX = 0; mast.offsetY = 1;
            mast.nOffset = 2; // Masten er høyere enn n

            const sail = new Shape(this.nextId++, 'triangle', '#ef4444');
            sail.groupName = "Båt";
            sail.offsetX = 1; sail.offsetY = 1;
            
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

    // === RENDERING UI ===
    renderLayersList() {
        const list = document.getElementById('layers-list');
        list.innerHTML = '';
        
        if (this.shapes.length === 0) {
            list.innerHTML = '<div class="text-gray-400 text-center italic mt-4">Ingen figurer.</div>';
            return;
        }

        this.shapes.forEach(shape => {
            const el = document.createElement('div');
            el.className = "bg-white p-3 rounded border border-gray-200 shadow-sm flex flex-col gap-2 mb-2";
            
            // Topplinje: Type, Fargevelger, Slett
            const topRow = document.createElement('div');
            topRow.className = "flex justify-between items-center";
            
            const typeLabel = this.getShapeNameNorwegian(shape.type);
            
            topRow.innerHTML = `
                <div class="flex items-center gap-2">
                    <input type="color" value="${shape.color}" 
                           onchange="app.updateShapeProp(${shape.id}, 'color', this.value)"
                           class="w-6 h-6 p-0 border-0 rounded cursor-pointer">
                    <span class="font-bold text-sm text-gray-700">${typeLabel}</span>
                </div>
                <button onclick="app.removeShape(${shape.id})" class="text-gray-400 hover:text-red-500 font-bold px-2 text-lg">&times;</button>
            `;

            // Kontrollpanel: Offset, Gruppe, Rotasjon
            const controls = document.createElement('div');
            controls.className = "grid grid-cols-2 gap-2 text-xs mt-1";

            // N-offset input
            const offsetDiv = document.createElement('div');
            offsetDiv.className = "flex flex-col";
            offsetDiv.innerHTML = `
                <label class="text-gray-500">Justering (n)</label>
                <input type="number" value="${shape.nOffset}" 
                       onchange="app.updateShapeProp(${shape.id}, 'nOffset', this.value)"
                       class="border rounded px-1 py-0.5 w-full">
            `;

            // Gruppe input
            const groupDiv = document.createElement('div');
            groupDiv.className = "flex flex-col";
            groupDiv.innerHTML = `
                <label class="text-gray-500">Gruppe</label>
                <input type="text" value="${shape.groupName}" placeholder="Navn..."
                       onchange="app.updateShapeProp(${shape.id}, 'groupName', this.value)"
                       class="border rounded px-1 py-0.5 w-full">
            `;

            // Rotasjon knapp
            const rotDiv = document.createElement('div');
            rotDiv.className = "col-span-2 flex justify-end mt-1";
            rotDiv.innerHTML = `
                 <button id="rot-btn-${shape.id}" onclick="app.rotateShape(${shape.id})" 
                         class="bg-gray-100 text-gray-600 px-2 py-1 rounded border hover:bg-gray-200 w-full">
                     ↻ Roter (${shape.rotation}°)
                 </button>
            `;

            controls.appendChild(offsetDiv);
            controls.appendChild(groupDiv);
            controls.appendChild(rotDiv);
            
            el.appendChild(topRow);
            el.appendChild(controls);
            list.appendChild(el);
        });
    },

    getShapeNameNorwegian(type) {
        const map = { 'line': 'Linje', 'square': 'Kvadrat', 'triangle': 'Trekant', 'rectangle': 'Rektangel', 'constant': 'Konst' };
        return map[type] || type;
    },

    // === CANVAS TEGNING ===
    draw() {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = this.cameraOffset.x;
        const cy = this.cameraOffset.y;

        this.ctx.clearRect(0, 0, w, h);

        // Akser
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#9ca3af';
        this.ctx.lineWidth = 2;
        this.ctx.moveTo(0, cy); this.ctx.lineTo(w, cy);
        this.ctx.moveTo(cx, 0); this.ctx.lineTo(cx, h);
        this.ctx.stroke();

        // Tegn figurer
        this.shapes.forEach(shape => {
            const points = shape.getPoints(this.n);
            
            // Fyll og strek
            this.ctx.fillStyle = shape.color;
            // Lager en mørkere variant for border
            this.ctx.strokeStyle = '#00000033'; 
            this.ctx.lineWidth = 1;

            points.forEach(p => {
                const gridX = p.x + shape.offsetX;
                const gridY = p.y + shape.offsetY; 
                
                // Inverter Y (Opp er positivt)
                const px = cx + (gridX * GRID_SIZE); 
                const py = cy - (gridY * GRID_SIZE); 

                this.ctx.beginPath();
                this.ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            });
        });
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

        let latexParts = [];
        let totalValue = 0;
        let calcParts = [];

        this.shapes.forEach((shape, index) => {
            const sign = index > 0 ? "+" : "";
            latexParts.push(`${sign} ${shape.getFormulaLatex()}`);
            
            const val = shape.getValue(this.n);
            totalValue += val;
            calcParts.push(`${sign} ${val}`);
        });

        const formulaStr = latexParts.join(' ');
        formulaContainer.innerHTML = `$$ F_n = ${formulaStr} $$`;
        
        let calcStr = calcParts.join(' ').trim();
        if (calcStr.startsWith('+')) calcStr = calcStr.substring(1).trim();
        calcContainer.innerHTML = `${calcStr} = <b>${totalValue}</b>`;

        if (window.MathJax) {
            MathJax.typesetPromise([formulaContainer]).catch(err => console.log(err));
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
