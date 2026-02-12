/* Version: #4 */

// === KONFIGURASJON ===
const GRID_SIZE = 30; 
const DOT_RADIUS = 7; 
const HIT_RADIUS = 0.6; // Grid units (ca 18px)
const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4'];

// === HJELPEFUNKSJONER ===
function degreesToRadians(deg) {
    return deg * (Math.PI / 180);
}

function rotatePoint(x, y, degrees) {
    const rad = degreesToRadians(degrees);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos
    };
}

// === KLASSE: SHAPE ===
class Shape {
    constructor(id, type, colorHex) {
        this.id = id;
        this.type = type; 
        this.color = colorHex || '#000000';
        
        // Transformasjon
        this.offsetX = 0; 
        this.offsetY = 0; 
        this.rotation = 0; // 0-360
        this.flipX = 1;    // 1 eller -1
        this.flipY = 1;    // 1 eller -1
        
        // Egenskaper
        this.nOffset = 0; 
        this.constantValue = 1; 
        this.groupName = ""; 
    }

    getEffectiveN(globalN) {
        if (this.type === 'constant') return this.constantValue;
        const eff = globalN + this.nOffset;
        return eff < 1 ? 0 : eff; 
    }

    // Returnerer punkter relativt til figurens origo (0,0)
    getPoints(globalN) {
        let points = [];
        const n = this.getEffectiveN(globalN);
        if (n <= 0) return []; 
        
        // 1. Generer basispunkter
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
            case 'triangle': // Trapp
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

        // 2. Transformer punkter (Flip -> Rotate)
        return points.map(p => {
            // Flip (skjer før rotasjon for intuitiv oppførsel)
            let tx = p.x * this.flipX;
            let ty = p.y * this.flipY;
            
            // Rotate
            return rotatePoint(tx, ty, this.rotation);
        });
    }

    // Sjekker om et grid-punkt (x,y) treffer denne figuren
    hitTest(globalN, gridX, gridY) {
        // Vi sjekker avstand til hvert punkt i figuren
        const points = this.getPoints(globalN);
        // Konverter figurens punkter til verdens-koordinater
        for (let p of points) {
            const wx = p.x + this.offsetX;
            const wy = p.y + this.offsetY;
            
            // Enkel sirkel-kollisjon
            const dist = Math.sqrt((wx - gridX)**2 + (wy - gridY)**2);
            if (dist < HIT_RADIUS) return true;
        }
        return false;
    }

    getFormulaLatex() {
        const c = this.color;
        let nStr = "n";
        
        if (this.nOffset > 0) nStr = `(n+${this.nOffset})`;
        else if (this.nOffset < 0) nStr = `(n-${Math.abs(this.nOffset)})`;
        
        let term = "";
        switch (this.type) {
            case 'line': term = nStr; break;
            case 'square': term = `${nStr}^2`; break;
            case 'rectangle': 
                if (this.nOffset === 0) term = "n(n+1)";
                else {
                    const nPlusOne = this.nOffset + 1;
                    const nextStr = nPlusOne > 0 ? `(n+${nPlusOne})` : (nPlusOne === 0 ? "n" : `(n${nPlusOne})`);
                    term = `${nStr}${nextStr}`;
                }
                break;
            case 'triangle': 
                if (this.nOffset === 0) term = "\\frac{n(n+1)}{2}";
                else {
                    const nPlusOne = this.nOffset + 1;
                    const nextStr = nPlusOne > 0 ? `(n+${nPlusOne})` : (nPlusOne === 0 ? "n" : `(n${nPlusOne})`);
                    term = `\\frac{${nStr}${nextStr}}{2}`;
                }
                break;
            case 'constant': term = this.constantValue.toString(); break;
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

// === APPLIKASJON ===
const app = {
    canvas: null,
    ctx: null,
    marquee: null, // HTML element for selection box
    
    n: 1,
    shapes: [],
    nextId: 1,
    
    // Viewport
    cameraOffset: {x: 0, y: 0},
    
    // Selection & Interaction State
    selectedIDs: new Set(), // Set of shape IDs
    isDragging: false,
    isBoxSelecting: false,
    
    dragStart: {x: 0, y: 0}, // Grid coords
    boxStart: {x: 0, y: 0},  // Pixel coords for marquee
    
    init() {
        console.log("Starter Figurtall Pro v4...");
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Opprett selection marquee element dynamisk hvis det mangler i HTML
        let m = document.querySelector('.selection-marquee');
        if (!m) {
            m = document.createElement('div');
            m.className = 'selection-marquee';
            document.getElementById('canvas-container').appendChild(m);
        }
        this.marquee = m;

        // Listeners
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Mouse / Touch
        const container = document.getElementById('canvas-container');
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Keyboard (Group 'g', Delete)
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return; // Ignorer hvis man skriver i input
            if (e.key === 'g') this.groupSelected();
            if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
        });

        // UI Inputs
        document.getElementById('n-slider').addEventListener('input', (e) => this.setN(parseInt(e.target.value)));
        
        // === FIX: Koble til 'Legg til Figur' knappen ===
        const btnAdd = document.getElementById('btn-add-shape');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                document.getElementById('add-shape-modal').classList.remove('hidden');
            });
        } else {
            console.error("Fant ikke knapp: btn-add-shape");
        }

        this.resizeCanvas();
        this.updateUI();
    },

    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Sentrer kamera initielt
        this.cameraOffset.x = Math.floor(this.canvas.width / 2);
        this.cameraOffset.y = Math.floor(this.canvas.height / 2);
        this.draw();
    },

    // === INPUT HANDLING ===
    getGridPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX; 
        const clientY = e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Grid conversion (Y inverted)
        const gridX = (x - this.cameraOffset.x) / GRID_SIZE;
        const gridY = (this.cameraOffset.y - y) / GRID_SIZE;
        
        return { x, y, gridX, gridY, clientX, clientY }; // x,y are pixels relative to canvas
    },

    handleMouseDown(e) {
        const pos = this.getGridPos(e);
        
        // 1. Sjekk treff
        let hitShape = null;
        // Sjekk øverste lag først (omvendt loop)
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i].hitTest(this.n, pos.gridX, pos.gridY)) {
                hitShape = this.shapes[i];
                break;
            }
        }

        if (hitShape) {
            // Klikket på en figur
            const alreadySelected = this.selectedIDs.has(hitShape.id);
            
            if (e.shiftKey) {
                // Toggle selection
                if (alreadySelected) this.selectedIDs.delete(hitShape.id);
                else this.selectedIDs.add(hitShape.id);
            } else {
                // Hvis man klikker på en uvalgt figur uten shift, velg KUN den.
                // Hvis man klikker på en ALLEREDE valgt figur, behold utvalget (for å kunne dra gruppen)
                if (!alreadySelected) {
                    this.selectedIDs.clear();
                    this.selectedIDs.add(hitShape.id);
                }
            }
            
            // Hvis figuren er del av en gruppe, velg alle i gruppen (hvis ikke shift holdes)
            if (!e.shiftKey && hitShape.groupName) {
                this.shapes.forEach(s => {
                    if (s.groupName === hitShape.groupName) this.selectedIDs.add(s.id);
                });
            }

            this.isDragging = true;
            this.dragStart = { x: pos.gridX, y: pos.gridY };
            this.updateUI(); // Oppdater sidepanel
        } else {
            // Klikket i tomt rom -> Start Box Selection
            if (!e.shiftKey) {
                this.selectedIDs.clear();
                this.updateUI();
            }
            this.isBoxSelecting = true;
            this.boxStart = { x: pos.x, y: pos.y }; // Pixel coords
            
            // Reset marquee style
            this.marquee.style.display = 'block';
            this.marquee.style.left = pos.x + 'px';
            this.marquee.style.top = pos.y + 'px';
            this.marquee.style.width = '0px';
            this.marquee.style.height = '0px';
        }
        
        this.draw();
    },

    handleMouseMove(e) {
        const pos = this.getGridPos(e);

        if (this.isDragging) {
            const dx = pos.gridX - this.dragStart.x;
            const dy = pos.gridY - this.dragStart.y;
            
            this.shapes.forEach(s => {
                if (this.selectedIDs.has(s.id)) {
                    s.offsetX += dx;
                    s.offsetY += dy;
                }
            });
            
            this.dragStart = { x: pos.gridX, y: pos.gridY };
            this.draw();
        } 
        else if (this.isBoxSelecting) {
            // Oppdater visuell boks
            const currentX = pos.x;
            const currentY = pos.y;
            
            const x = Math.min(this.boxStart.x, currentX);
            const y = Math.min(this.boxStart.y, currentY);
            const w = Math.abs(currentX - this.boxStart.x);
            const h = Math.abs(currentY - this.boxStart.y);
            
            this.marquee.style.left = x + 'px';
            this.marquee.style.top = y + 'px';
            this.marquee.style.width = w + 'px';
            this.marquee.style.height = h + 'px';
        } 
        else {
            // Hover cursor logic
            let hit = this.shapes.some(s => s.hitTest(this.n, pos.gridX, pos.gridY));
            this.canvas.style.cursor = hit ? "move" : "crosshair";
        }
    },

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            // Snap to grid for alle flyttede
            this.shapes.forEach(s => {
                if (this.selectedIDs.has(s.id)) {
                    s.offsetX = Math.round(s.offsetX);
                    s.offsetY = Math.round(s.offsetY);
                }
            });
            this.draw();
        }
        
        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.marquee.style.display = 'none';
            
            // Beregn seleksjon
            const pos = this.getGridPos(e);
            
            // Boks grenser i Pixels (relativt til canvas)
            const bX1 = Math.min(this.boxStart.x, pos.x);
            const bX2 = Math.max(this.boxStart.x, pos.x);
            const bY1 = Math.min(this.boxStart.y, pos.y);
            const bY2 = Math.max(this.boxStart.y, pos.y);
            
            // Sjekk alle figurer om origo er inni boksen
            this.shapes.forEach(s => {
                const px = this.cameraOffset.x + (s.offsetX * GRID_SIZE);
                const py = this.cameraOffset.y - (s.offsetY * GRID_SIZE);
                
                if (px >= bX1 && px <= bX2 && py >= bY1 && py <= bY2) {
                    this.selectedIDs.add(s.id);
                }
            });
            this.updateUI();
            this.draw();
        }
    },

    // === LOGIKK ===
    addShape(type) {
        document.getElementById('add-shape-modal').classList.add('hidden');
        const color = DEFAULT_COLORS[this.shapes.length % DEFAULT_COLORS.length];
        const s = new Shape(this.nextId++, type, color);
        
        // Plasser litt tilfeldig rundt midten hvis det er fullt
        if (this.shapes.length > 0) {
            s.offsetX = (Math.random() * 4) - 2;
            s.offsetY = (Math.random() * 4) - 2;
            s.offsetX = Math.round(s.offsetX);
            s.offsetY = Math.round(s.offsetY);
        }
        
        if (type === 'constant') {
            const v = prompt("Verdi?", "1");
            s.constantValue = parseInt(v) || 1;
        }

        this.shapes.push(s);
        
        // Auto-select den nye
        this.selectedIDs.clear();
        this.selectedIDs.add(s.id);
        
        this.updateUI();
        this.draw();
    },

    deleteSelected() {
        if (this.selectedIDs.size === 0) return;
        this.shapes = this.shapes.filter(s => !this.selectedIDs.has(s.id));
        this.selectedIDs.clear();
        this.updateUI();
        this.draw();
    },

    groupSelected() {
        if (this.selectedIDs.size < 2) return;
        const name = prompt("Navn på gruppe?", "Gruppe " + Math.floor(Math.random()*1000));
        if (!name) return;
        
        this.shapes.forEach(s => {
            if (this.selectedIDs.has(s.id)) s.groupName = name;
        });
        this.updateUI();
    },

    ungroupSelected() {
        this.shapes.forEach(s => {
            if (this.selectedIDs.has(s.id)) s.groupName = "";
        });
        this.updateUI();
    },

    centerCamera() {
        this.cameraOffset.x = Math.floor(this.canvas.width / 2);
        this.cameraOffset.y = Math.floor(this.canvas.height / 2);
        this.draw();
    },

    setN(val) {
        this.n = val;
        document.getElementById('n-display').innerText = val;
        this.draw();
        this.updateFormula();
    },

    // Bulk updates fra UI
    updateSelectedProp(prop, val) {
        this.shapes.forEach(s => {
            if (this.selectedIDs.has(s.id)) {
                if (prop === 'color') s.color = val;
                if (prop === 'nOffset') s.nOffset = parseInt(val) || 0;
                if (prop === 'rotation') s.rotation = parseInt(val) || 0;
            }
        });
        this.draw();
        this.updateFormula();
        if (prop === 'color') this.updateUI(); // Refresh palette
    },
    
    flipSelected(axis) {
        this.shapes.forEach(s => {
            if (this.selectedIDs.has(s.id)) {
                if (axis === 'x') s.flipX *= -1;
                if (axis === 'y') s.flipY *= -1;
            }
        });
        this.draw();
    },

    // === UI RENDERING ===
    updateUI() {
        this.renderLayersList();
        this.updateFormula();
        this.renderSelectionPanel();
    },

    renderSelectionPanel() {
        const panel = document.getElementById('selection-panel');
        if (this.selectedIDs.size === 0) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');

        // Hurtigfarger: Finn alle unike farger som brukes nå
        const usedColors = [...new Set(this.shapes.map(s => s.color))];
        const palette = document.getElementById('quick-palette');
        palette.innerHTML = '';
        
        // Legg til standardfarger også
        const allColors = [...new Set([...usedColors, ...DEFAULT_COLORS])];

        allColors.forEach(c => {
            const btn = document.createElement('button');
            btn.className = "w-6 h-6 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition";
            btn.style.backgroundColor = c;
            btn.onclick = () => {
                this.updateSelectedProp('color', c);
                // Oppdater fargevelgere i listen manuelt eller refresh hele UI
                this.renderLayersList();
            };
            palette.appendChild(btn);
        });
    },

    renderLayersList() {
        const list = document.getElementById('layers-list');
        list.innerHTML = '';
        
        [...this.shapes].reverse().forEach(shape => {
            const isSelected = this.selectedIDs.has(shape.id);
            
            const el = document.createElement('div');
            el.className = `p-3 rounded border transition mb-2 ${isSelected ? 'bg-blue-50 border-blue-300 shadow-md ring-1 ring-blue-300' : 'bg-white border-gray-200 shadow-sm'}`;
            
            // Klikk på listen velger også
            el.onclick = (e) => {
                // Unngå loop hvis man klikker på inputs
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                
                if (!e.shiftKey) this.selectedIDs.clear();
                if (this.selectedIDs.has(shape.id)) this.selectedIDs.delete(shape.id);
                else this.selectedIDs.add(shape.id);
                
                this.updateUI();
                this.draw();
            };

            // Header
            const header = document.createElement('div');
            header.className = "flex justify-between items-center mb-2";
            
            const groupBadge = shape.groupName ? `<span class="text-[10px] bg-gray-200 px-1 rounded ml-2 text-gray-600">📁 ${shape.groupName}</span>` : '';
            
            header.innerHTML = `
                <div class="flex items-center gap-2">
                    <input type="color" value="${shape.color}" 
                           class="w-5 h-5 rounded cursor-pointer border-0 p-0"
                           onchange="app.shapes.find(s=>s.id===${shape.id}).color=this.value; app.draw(); app.updateFormula();">
                    <span class="font-bold text-sm text-gray-700">${this.getShapeName(shape.type)}</span>
                    ${groupBadge}
                </div>
                <button onclick="app.shapes=app.shapes.filter(s=>s.id!==${shape.id}); app.selectedIDs.delete(${shape.id}); app.updateUI(); app.draw();" 
                        class="text-gray-400 hover:text-red-500 font-bold px-2">&times;</button>
            `;

            // Controls (Offset & Rotation)
            const controls = document.createElement('div');
            controls.className = "grid grid-cols-2 gap-2 text-xs";
            
            controls.innerHTML = `
                <div>
                    <label class="text-gray-400">Rotasjon</label>
                    <div class="flex items-center gap-1">
                        <input type="range" min="0" max="360" value="${shape.rotation}" 
                               class="w-full"
                               oninput="app.shapes.find(s=>s.id===${shape.id}).rotation=parseInt(this.value); app.draw();">
                    </div>
                </div>
                <div>
                    <label class="text-gray-400">Offset ($n$)</label>
                    <input type="number" value="${shape.nOffset}" class="w-full border rounded px-1"
                           onchange="app.shapes.find(s=>s.id===${shape.id}).nOffset=parseInt(this.value); app.updateFormula(); app.draw();">
                </div>
            `;

            el.appendChild(header);
            el.appendChild(controls);
            list.appendChild(el);
        });
    },

    getShapeName(type) {
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

        // Tegn akser
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#e5e7eb'; // Veldig lys grå
        this.ctx.lineWidth = 2;
        this.ctx.moveTo(0, cy); this.ctx.lineTo(w, cy);
        this.ctx.moveTo(cx, 0); this.ctx.lineTo(cx, h);
        this.ctx.stroke();

        // Tegn figurer
        this.shapes.forEach(shape => {
            const points = shape.getPoints(this.n);
            const isSelected = this.selectedIDs.has(shape.id);
            
            this.ctx.fillStyle = shape.color;
            this.ctx.strokeStyle = isSelected ? '#2563eb' : 'rgba(0,0,0,0.2)'; // Blå outline hvis valgt
            this.ctx.lineWidth = isSelected ? 2 : 1;

            points.forEach(p => {
                // Grid til Pixel
                const px = cx + (p.x + shape.offsetX) * GRID_SIZE;
                const py = cy - (p.y + shape.offsetY) * GRID_SIZE; // Inverter Y

                this.ctx.beginPath();
                this.ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            });
            
            // Tegn origo-markør for figuren hvis den er valgt
            if (isSelected) {
                const ox = cx + shape.offsetX * GRID_SIZE;
                const oy = cy - shape.offsetY * GRID_SIZE;
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(ox - 2, oy - 2, 4, 4);
            }
        });
    },

    updateFormula() {
        const div = document.getElementById('formula-display');
        const calcDiv = document.getElementById('calc-display');
        
        if (this.shapes.length === 0) {
            div.innerHTML = "$$ F_n = 0 $$";
            calcDiv.innerText = "0 = 0";
            if(window.MathJax) MathJax.typesetPromise([div]);
            return;
        }

        let parts = [];
        let total = 0;
        let cParts = [];
        
        this.shapes.forEach((s, i) => {
            const sign = i > 0 ? "+" : "";
            parts.push(`${sign} ${s.getFormulaLatex()}`);
            
            const v = s.getValue(this.n);
            total += v;
            cParts.push(`${sign} ${v}`);
        });

        div.innerHTML = `$$ F_n = ${parts.join(' ')} $$`;
        
        let cStr = cParts.join(' ').trim();
        if (cStr.startsWith('+')) cStr = cStr.substring(1).trim();
        calcDiv.innerHTML = `${cStr} = <b>${total}</b>`;
        
        if(window.MathJax) MathJax.typesetPromise([div]).catch(e => {});
    },

    exportPNG() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(this.canvas, 0, 0);
        
        const link = document.createElement('a');
        link.download = 'figurtall-analyse.png';
        link.href = tempCanvas.toDataURL();
        link.click();
    }
};

// === GLOBAL ASSIGNMENT ===
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
