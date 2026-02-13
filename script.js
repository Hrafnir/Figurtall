/* Version: #6 */

const GRID_SIZE = 30; 
const DOT_RADIUS = 7; 
const HIT_RADIUS = 0.6; 
const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4'];

function degreesToRadians(deg) { return deg * (Math.PI / 180); }

function rotatePoint(x, y, degrees) {
    const rad = degreesToRadians(degrees);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// Parser enkle uttrykk som "n", "n+2", "n/2", "3"
function evaluateCoord(val, n) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    // Enkel sikker parsing
    let str = val.toString().toLowerCase().replace(/\s/g, '');
    
    // Erstatt 'n' med verdien av n
    // Vi må passe på rekkefølge, f.eks. "2n" -> "2*n"
    // For enkelhets skyld støtter vi standard JS matte men med n variabel
    try {
        // Bytt ut n med tallet
        const expr = str.replace(/n/g, `(${n})`);
        // Bruk Function constructor for å evaluere (sikrere enn eval, men fremdeles powerful)
        // Kun tillat tall og matteoperatorer
        if (/^[0-9+\-*/().]+$/.test(expr)) {
            return Function(`return ${expr}`)();
        }
    } catch (e) {
        return 0;
    }
    return parseFloat(val) || 0;
}

class Shape {
    constructor(id, type, colorHex) {
        this.id = id;
        this.type = type; 
        this.color = colorHex || '#000000';
        
        // Posisjon kan nå være dynamisk (formel-streng)
        this.posX = 0; // Kan være tall eller string "n+1"
        this.posY = 0; 
        
        this.rotation = 0; 
        this.flipX = 1;    
        this.flipY = 1;    
        
        this.nOffset = 0; 
        this.constantValue = 1; 
        this.groupName = ""; 
    }

    clone(newId) {
        const s = new Shape(newId, this.type, this.color);
        s.posX = this.posX;
        s.posY = this.posY;
        s.rotation = this.rotation;
        s.flipX = this.flipX;
        s.flipY = this.flipY;
        s.nOffset = this.nOffset;
        s.constantValue = this.constantValue;
        s.groupName = this.groupName;
        return s;
    }

    getEffectiveN(globalN) {
        if (this.type === 'constant') return this.constantValue;
        const eff = globalN + this.nOffset;
        return eff < 1 ? 0 : eff; 
    }

    // Returnerer kalkulert X/Y basert på n
    getCalculatedPos(globalN) {
        return {
            x: evaluateCoord(this.posX, globalN),
            y: evaluateCoord(this.posY, globalN)
        };
    }

    getPoints(globalN) {
        let points = [];
        const n = this.getEffectiveN(globalN);
        if (n <= 0) return []; 
        
        switch (this.type) {
            case 'line': for (let i = 0; i < n; i++) points.push({x: i, y: 0}); break;
            case 'square': for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) points.push({x: x, y: y}); break;
            case 'rectangle': for (let y = 0; y < n; y++) for (let x = 0; x < n + 1; x++) points.push({x: x, y: y}); break;
            case 'triangle': for (let y = 0; y < n; y++) for (let x = 0; x <= y; x++) points.push({x: x, y: y}); break;
            case 'constant': for (let i = 0; i < this.constantValue; i++) points.push({x: i, y: 0}); break;
        }

        return points.map(p => {
            let tx = p.x * this.flipX;
            let ty = p.y * this.flipY;
            return rotatePoint(tx, ty, this.rotation);
        });
    }

    hitTest(globalN, gridX, gridY) {
        const points = this.getPoints(globalN);
        const pos = this.getCalculatedPos(globalN);
        
        for (let p of points) {
            const wx = p.x + pos.x;
            const wy = p.y + pos.y;
            const dist = Math.sqrt((wx - gridX)**2 + (wy - gridY)**2);
            if (dist < HIT_RADIUS) return true;
        }
        return false;
    }

    getFormulaRaw() {
        let nStr = "n";
        if (this.nOffset > 0) nStr = `(n+${this.nOffset})`;
        else if (this.nOffset < 0) nStr = `(n-${Math.abs(this.nOffset)})`;

        switch (this.type) {
            case 'line': return nStr;
            case 'square': return `${nStr}^2`;
            case 'rectangle': return this.nOffset === 0 ? "n(n+1)" : `${nStr}(n+${this.nOffset+1})`;
            case 'triangle': return `${nStr}(${nStr}+1)/2`;
            case 'constant': return this.constantValue.toString();
        }
        return "";
    }

    getFormulaLatexStyled() {
        const c = this.color;
        let raw = this.getFormulaRaw();
        let tex = raw.replace(/\^2/g, "^2");
        if (this.type === 'triangle') tex = "\\frac{" + raw.replace("/2", "") + "}{2}";
        return `\\color{${c}}{${tex}}`;
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

const app = {
    canvas: null,
    ctx: null,
    marquee: null,
    
    n: 1,
    shapes: [],
    nextId: 1,
    clipboard: [], // For Copy/Paste
    
    cameraOffset: {x: 0, y: 0},
    selectedIDs: new Set(),
    isDragging: false,
    isBoxSelecting: false,
    dragStart: {x: 0, y: 0}, 
    boxStart: {x: 0, y: 0},  
    
    showSidebar: true,
    showFormula: true,

    init() {
        console.log("Starter Figurtall Pro v6...");
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        let m = document.querySelector('.selection-marquee');
        if (!m) {
            m = document.createElement('div');
            m.className = 'selection-marquee';
            document.getElementById('canvas-container').appendChild(m);
        }
        this.marquee = m;

        window.addEventListener('resize', () => this.resizeCanvas());
        
        const container = document.getElementById('canvas-container');
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        container.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        
        window.addEventListener('click', () => document.getElementById('context-menu').classList.add('hidden'));

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return; 
            
            if (e.key === 'g') this.groupSelected();
            if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
            
            // Copy / Paste
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') this.copySelection();
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') this.pasteSelection();
        });

        document.getElementById('n-slider').addEventListener('input', (e) => this.setN(parseInt(e.target.value)));
        
        const btnAdd = document.getElementById('btn-add-shape');
        if (btnAdd) btnAdd.addEventListener('click', () => document.getElementById('add-shape-modal').classList.remove('hidden'));

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

    // === COPY / PASTE ===
    copySelection() {
        if (this.selectedIDs.size === 0) return;
        this.clipboard = this.shapes.filter(s => this.selectedIDs.has(s.id));
        console.log("Kopierte " + this.clipboard.length + " elementer.");
    },

    pasteSelection() {
        if (this.clipboard.length === 0) return;
        this.selectedIDs.clear();
        
        this.clipboard.forEach(template => {
            const newShape = template.clone(this.nextId++);
            // Offset litt så man ser kopien
            // Hvis posisjonen er et tall, legg til 1. Hvis formel, la den være (kan ikke enkelt addere til string "n")
            if (typeof newShape.posX === 'number') newShape.posX += 1;
            if (typeof newShape.posY === 'number') newShape.posY -= 1;
            
            this.shapes.push(newShape);
            this.selectedIDs.add(newShape.id);
        });
        
        this.updateUI();
        this.draw();
    },

    // === VISNING ===
    toggleSidebar() {
        this.showSidebar = !this.showSidebar;
        const panel = document.getElementById('sidebar-panel');
        const btn = document.getElementById('btn-toggle-sidebar');
        
        if (this.showSidebar) {
            panel.classList.remove('hidden-layout');
            btn.classList.remove('opacity-50');
            btn.innerText = "Sidepanel";
        } else {
            panel.classList.add('hidden-layout');
            btn.classList.add('opacity-50');
            btn.innerText = "Vis Sidepanel";
        }
        setTimeout(() => this.resizeCanvas(), 50); 
    },

    toggleFormula() {
        this.showFormula = !this.showFormula;
        const bar = document.getElementById('formula-bar');
        const btn = document.getElementById('btn-toggle-formula');
        
        if (this.showFormula) {
            bar.classList.remove('hidden-layout');
            btn.classList.remove('opacity-50');
            btn.innerText = "Formler";
        } else {
            bar.classList.add('hidden-layout');
            btn.classList.add('opacity-50');
            btn.innerText = "Vis Formler";
        }
        setTimeout(() => this.resizeCanvas(), 50);
    },

    // === INPUT ===
    getGridPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const gridX = (x - this.cameraOffset.x) / GRID_SIZE;
        const gridY = (this.cameraOffset.y - y) / GRID_SIZE;
        return { x, y, gridX, gridY, clientX: e.clientX, clientY: e.clientY }; 
    },

    handleContextMenu(e) {
        e.preventDefault();
        const pos = this.getGridPos(e);
        let hitShape = null;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i].hitTest(this.n, pos.gridX, pos.gridY)) {
                hitShape = this.shapes[i];
                break;
            }
        }

        if (hitShape) {
            const menu = document.getElementById('context-menu');
            const title = document.getElementById('ctx-title');
            const formula = document.getElementById('ctx-formula');
            title.innerText = this.getShapeName(hitShape.type);
            title.style.color = hitShape.color;
            formula.innerText = hitShape.getFormulaRaw();
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.classList.remove('hidden');
        }
    },

    handleMouseDown(e) {
        if(e.button === 2) return;
        const pos = this.getGridPos(e);
        
        let hitShape = null;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i].hitTest(this.n, pos.gridX, pos.gridY)) {
                hitShape = this.shapes[i];
                break;
            }
        }

        if (hitShape) {
            const alreadySelected = this.selectedIDs.has(hitShape.id);
            if (e.shiftKey) {
                if (alreadySelected) this.selectedIDs.delete(hitShape.id);
                else this.selectedIDs.add(hitShape.id);
            } else {
                if (!alreadySelected) {
                    this.selectedIDs.clear();
                    this.selectedIDs.add(hitShape.id);
                }
            }
            if (!e.shiftKey && hitShape.groupName) {
                this.shapes.forEach(s => { if (s.groupName === hitShape.groupName) this.selectedIDs.add(s.id); });
            }

            this.isDragging = true;
            this.dragStart = { x: pos.gridX, y: pos.gridY };
            this.updateUI(); 
        } else {
            if (!e.shiftKey) { this.selectedIDs.clear(); this.updateUI(); }
            this.isBoxSelecting = true;
            this.boxStart = { x: pos.x, y: pos.y }; 
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
                    // Hvis posisjon er dynamisk (string), kan vi ikke dra den logisk.
                    // Vi konverterer til tall (static) når man drar.
                    if (typeof s.posX === 'string') s.posX = evaluateCoord(s.posX, this.n);
                    if (typeof s.posY === 'string') s.posY = evaluateCoord(s.posY, this.n);
                    
                    s.posX += dx;
                    s.posY += dy;
                }
            });
            this.dragStart = { x: pos.gridX, y: pos.gridY };
            this.draw();
            // Oppdater inputs i sanntid hvis mulig, men det kan bli tungt. Vi oppdaterer ved MouseUp.
        } else if (this.isBoxSelecting) {
            const x = Math.min(this.boxStart.x, pos.x);
            const y = Math.min(this.boxStart.y, pos.y);
            const w = Math.abs(pos.x - this.boxStart.x);
            const h = Math.abs(pos.y - this.boxStart.y);
            this.marquee.style.left = x + 'px';
            this.marquee.style.top = y + 'px';
            this.marquee.style.width = w + 'px';
            this.marquee.style.height = h + 'px';
        } else {
            let hit = this.shapes.some(s => s.hitTest(this.n, pos.gridX, pos.gridY));
            this.canvas.style.cursor = hit ? "move" : "crosshair";
        }
    },

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            // Snap
            this.shapes.forEach(s => {
                if (this.selectedIDs.has(s.id)) {
                    if (typeof s.posX === 'number') s.posX = Math.round(s.posX * 2) / 2;
                    if (typeof s.posY === 'number') s.posY = Math.round(s.posY * 2) / 2;
                }
            });
            this.draw();
            this.updateUI();
        }
        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.marquee.style.display = 'none';
            const pos = this.getGridPos(e);
            const bX1 = Math.min(this.boxStart.x, pos.x);
            const bX2 = Math.max(this.boxStart.x, pos.x);
            const bY1 = Math.min(this.boxStart.y, pos.y);
            const bY2 = Math.max(this.boxStart.y, pos.y);
            
            this.shapes.forEach(s => {
                const sp = s.getCalculatedPos(this.n);
                const px = this.cameraOffset.x + (sp.x * GRID_SIZE);
                const py = this.cameraOffset.y - (sp.y * GRID_SIZE);
                if (px >= bX1 && px <= bX2 && py >= bY1 && py <= bY2) this.selectedIDs.add(s.id);
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
        if (this.shapes.length > 0) {
            s.posX = Math.round(((Math.random() * 4) - 2) * 2) / 2;
            s.posY = Math.round(((Math.random() * 4) - 2) * 2) / 2;
        }
        if (type === 'constant') {
            const v = prompt("Verdi?", "1");
            s.constantValue = parseInt(v) || 1;
        }
        this.shapes.push(s);
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
        this.shapes.forEach(s => { if (this.selectedIDs.has(s.id)) s.groupName = name; });
        this.updateUI();
    },

    ungroupSelected() {
        this.shapes.forEach(s => { if (this.selectedIDs.has(s.id)) s.groupName = ""; });
        this.updateUI();
    },

    setN(val) {
        this.n = val;
        document.getElementById('n-display').innerText = val;
        this.draw();
        this.updateFormula();
    },

    updateSelectedProp(prop, val) {
        this.shapes.forEach(s => {
            if (this.selectedIDs.has(s.id)) {
                if (prop === 'color') s.color = val;
                if (prop === 'nOffset') s.nOffset = parseInt(val) || 0;
                if (prop === 'rotation') s.rotation = parseFloat(val) || 0;
                if (prop === 'posX') s.posX = isNaN(val) ? val : parseFloat(val);
                if (prop === 'posY') s.posY = isNaN(val) ? val : parseFloat(val);
            }
        });
        this.draw();
        this.updateFormula();
        if (prop === 'color') this.updateUI(); 
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

    updateUI() {
        this.renderLayersList();
        this.updateFormula();
        this.renderSelectionPanel();
    },

    renderSelectionPanel() {
        const panel = document.getElementById('selection-panel');
        if (this.selectedIDs.size === 0) { panel.classList.add('hidden'); return; }
        panel.classList.remove('hidden');
        const usedColors = [...new Set(this.shapes.map(s => s.color))];
        const palette = document.getElementById('quick-palette');
        palette.innerHTML = '';
        const allColors = [...new Set([...usedColors, ...DEFAULT_COLORS])];
        allColors.forEach(c => {
            const btn = document.createElement('button');
            btn.className = "w-6 h-6 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition";
            btn.style.backgroundColor = c;
            btn.onclick = () => { this.updateSelectedProp('color', c); this.renderLayersList(); };
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
            el.onclick = (e) => {
                if (['INPUT','BUTTON'].includes(e.target.tagName)) return;
                if (!e.shiftKey) this.selectedIDs.clear();
                if (this.selectedIDs.has(shape.id)) this.selectedIDs.delete(shape.id); else this.selectedIDs.add(shape.id);
                this.updateUI(); this.draw();
            };

            const header = document.createElement('div');
            header.className = "flex justify-between items-center mb-2";
            const groupBadge = shape.groupName ? `<span class="text-[10px] bg-gray-200 px-1 rounded ml-2 text-gray-600">📁 ${shape.groupName}</span>` : '';
            header.innerHTML = `
                <div class="flex items-center gap-2">
                    <input type="color" value="${shape.color}" class="w-5 h-5 rounded cursor-pointer border-0 p-0"
                           onchange="app.shapes.find(s=>s.id===${shape.id}).color=this.value; app.draw(); app.updateFormula();">
                    <span class="font-bold text-sm text-gray-700">${this.getShapeName(shape.type)}</span>
                    ${groupBadge}
                </div>
                <button onclick="app.shapes=app.shapes.filter(s=>s.id!==${shape.id}); app.selectedIDs.delete(${shape.id}); app.updateUI(); app.draw();" 
                        class="text-gray-400 hover:text-red-500 font-bold px-2">&times;</button>
            `;

            const controls = document.createElement('div');
            controls.className = "grid grid-cols-2 gap-2 text-xs";
            controls.innerHTML = `
                <div class="col-span-2 grid grid-cols-2 gap-2 mb-1">
                    <div>
                        <label class="text-gray-400">Pos X</label>
                        <input type="text" value="${shape.posX}" class="w-full border rounded px-1"
                               onchange="app.updateSelectedProp('posX', this.value)">
                    </div>
                    <div>
                        <label class="text-gray-400">Pos Y</label>
                        <input type="text" value="${shape.posY}" class="w-full border rounded px-1"
                               onchange="app.updateSelectedProp('posY', this.value)">
                    </div>
                </div>
                <div>
                    <label class="text-gray-400">Rotasjon</label>
                    <div class="flex items-center gap-1">
                        <input type="range" min="0" max="360" step="5" value="${shape.rotation}" class="w-full"
                               oninput="app.shapes.find(s=>s.id===${shape.id}).rotation=parseInt(this.value); this.nextElementSibling.value=this.value; app.draw();">
                        <input type="number" class="w-10 border rounded px-1 text-center" value="${shape.rotation}"
                               onchange="app.shapes.find(s=>s.id===${shape.id}).rotation=parseFloat(this.value); this.previousElementSibling.value=this.value; app.draw();">
                    </div>
                </div>
                <div>
                    <label class="text-gray-400">Offset ($n$)</label>
                    <input type="number" value="${shape.nOffset}" class="w-full border rounded px-1"
                           onchange="app.shapes.find(s=>s.id===${shape.id}).nOffset=parseInt(this.value); app.updateFormula(); app.draw();">
                </div>
            `;
            el.appendChild(header); el.appendChild(controls); list.appendChild(el);
        });
    },

    getShapeName(type) { return { 'line': 'Linje', 'square': 'Kvadrat', 'triangle': 'Trekant', 'rectangle': 'Rektangel', 'constant': 'Konst' }[type] || type; },

    draw() {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = this.cameraOffset.x;
        const cy = this.cameraOffset.y;
        this.ctx.clearRect(0, 0, w, h);

        this.ctx.beginPath(); this.ctx.strokeStyle = '#e5e7eb'; this.ctx.lineWidth = 2;
        this.ctx.moveTo(0, cy); this.ctx.lineTo(w, cy);
        this.ctx.moveTo(cx, 0); this.ctx.lineTo(cx, h);
        this.ctx.stroke();

        this.shapes.forEach(shape => {
            const points = shape.getPoints(this.n);
            const pos = shape.getCalculatedPos(this.n);
            const isSelected = this.selectedIDs.has(shape.id);
            
            this.ctx.fillStyle = shape.color;
            this.ctx.strokeStyle = isSelected ? '#2563eb' : 'rgba(0,0,0,0.2)'; 
            this.ctx.lineWidth = isSelected ? 2 : 1;

            points.forEach(p => {
                const px = cx + (p.x + pos.x) * GRID_SIZE;
                const py = cy - (p.y + pos.y) * GRID_SIZE; 
                this.ctx.beginPath(); this.ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
                this.ctx.fill(); this.ctx.stroke();
            });
            
            if (isSelected) {
                const ox = cx + pos.x * GRID_SIZE;
                const oy = cy - pos.y * GRID_SIZE;
                this.ctx.fillStyle = '#000'; this.ctx.fillRect(ox - 2, oy - 2, 4, 4);
            }
        });
    },

    updateFormula() {
        const div = document.getElementById('formula-display');
        const calcDiv = document.getElementById('calc-display');
        if (this.shapes.length === 0) { div.innerHTML = "$$ F_n = 0 $$"; calcDiv.innerText = "0 = 0"; if(window.MathJax) MathJax.typesetPromise([div]); return; }
        
        let parts = [], total = 0, cParts = [];
        this.shapes.forEach((s, i) => {
            const sign = i > 0 ? "+" : "";
            parts.push(`${sign} ${s.getFormulaLatexStyled()}`);
            const v = s.getValue(this.n);
            total += v; cParts.push(`${sign} ${v}`);
        });
        div.innerHTML = `$$ F_n = ${parts.join(' ')} $$`;
        let cStr = cParts.join(' ').trim(); if (cStr.startsWith('+')) cStr = cStr.substring(1).trim();
        calcDiv.innerHTML = `${cStr} = <b>${total}</b>`;
        if(window.MathJax) MathJax.typesetPromise([div]).catch(e => {});
    },

    printApp(withFormula) {
        if (withFormula) document.body.classList.remove('print-no-formula');
        else document.body.classList.add('print-no-formula');
        window.print();
    },

    exportScreenshot() {
        // Screenshot hele "capture-area" som inkluderer sidepanel, canvas og formelbar
        // For å få det til å se ut som programmet.
        // Hvis bruker vil skjule ting, bør de bruke "Visning"-knappene først.
        const el = document.getElementById('capture-area');
        html2canvas(el).then(canvas => {
            const link = document.createElement('a');
            link.download = 'figurtall-screenshot.png';
            link.href = canvas.toDataURL();
            link.click();
        });
    }
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
