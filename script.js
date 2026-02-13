/* Version: #5 */

// === KONFIGURASJON ===
const GRID_SIZE = 30; 
const DOT_RADIUS = 7; 
const HIT_RADIUS = 0.6; 
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
        this.rotation = 0; 
        this.flipX = 1;    
        this.flipY = 1;    
        
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

    getPoints(globalN) {
        let points = [];
        const n = this.getEffectiveN(globalN);
        if (n <= 0) return []; 
        
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
            case 'rectangle': 
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n + 1; x++) {
                        points.push({x: x, y: y});
                    }
                }
                break;
            case 'triangle': 
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

        return points.map(p => {
            let tx = p.x * this.flipX;
            let ty = p.y * this.flipY;
            return rotatePoint(tx, ty, this.rotation);
        });
    }

    hitTest(globalN, gridX, gridY) {
        const points = this.getPoints(globalN);
        for (let p of points) {
            const wx = p.x + this.offsetX;
            const wy = p.y + this.offsetY;
            const dist = Math.sqrt((wx - gridX)**2 + (wy - gridY)**2);
            if (dist < HIT_RADIUS) return true;
        }
        return false;
    }

    getFormulaLatex() {
        // Enkel tekstversjon for popup (kan ikke rendre latex i canvas context menu lett)
        return this.getFormulaRaw();
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
        // For MathJax
        const c = this.color;
        let raw = this.getFormulaRaw();
        // Konverter til LaTeX syntaks
        let tex = raw.replace(/\^2/g, "^2");
        if (this.type === 'triangle') {
            tex = "\\frac{" + raw.replace("/2", "") + "}{2}";
        }
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

// === APPLIKASJON ===
const app = {
    canvas: null,
    ctx: null,
    marquee: null,
    
    n: 1,
    shapes: [],
    nextId: 1,
    
    cameraOffset: {x: 0, y: 0},
    
    selectedIDs: new Set(),
    isDragging: false,
    isBoxSelecting: false,
    
    dragStart: {x: 0, y: 0}, 
    boxStart: {x: 0, y: 0},  
    
    // UI State
    showSidebar: true,
    showFormula: true,

    init() {
        console.log("Starter Figurtall Pro v5...");
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
        
        // Context Menu (Right Click)
        container.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        window.addEventListener('click', () => {
            document.getElementById('context-menu').classList.add('hidden');
        });

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return; 
            if (e.key === 'g') this.groupSelected();
            if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
        });

        document.getElementById('n-slider').addEventListener('input', (e) => this.setN(parseInt(e.target.value)));
        
        const btnAdd = document.getElementById('btn-add-shape');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                document.getElementById('add-shape-modal').classList.remove('hidden');
            });
        }

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

    // === VISNINGSKONTROLL ===
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
        setTimeout(() => this.resizeCanvas(), 50); // Resize canvas after layout change
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

    // === INPUT HANDLING ===
    getGridPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX; 
        const clientY = e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const gridX = (x - this.cameraOffset.x) / GRID_SIZE;
        const gridY = (this.cameraOffset.y - y) / GRID_SIZE;
        
        return { x, y, gridX, gridY, clientX, clientY }; 
    },

    handleContextMenu(e) {
        e.preventDefault();
        const pos = this.getGridPos(e);
        
        // Sjekk treff
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
            
            // Set content
            title.innerText = this.getShapeName(hitShape.type) + (hitShape.groupName ? ` (${hitShape.groupName})` : '');
            title.style.color = hitShape.color;
            formula.innerText = hitShape.getFormulaRaw();
            
            // Position
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.classList.remove('hidden');
        } else {
            document.getElementById('context-menu').classList.add('hidden');
        }
    },

    handleMouseDown(e) {
        if(e.button === 2) return; // Ignore right click logic here
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
                this.shapes.forEach(s => {
                    if (s.groupName === hitShape.groupName) this.selectedIDs.add(s.id);
                });
            }

            this.isDragging = true;
            this.dragStart = { x: pos.gridX, y: pos.gridY };
            this.updateUI(); 
        } else {
            if (!e.shiftKey) {
                this.selectedIDs.clear();
                this.updateUI();
            }
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
                    s.offsetX += dx;
                    s.offsetY += dy;
                }
            });
            
            this.dragStart = { x: pos.gridX, y: pos.gridY };
            this.draw();
        } 
        else if (this.isBoxSelecting) {
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
            let hit = this.shapes.some(s => s.hitTest(this.n, pos.gridX, pos.gridY));
            this.canvas.style.cursor = hit ? "move" : "crosshair";
        }
    },

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            // Snap to grid (0.5 steps)
            this.shapes.forEach(s => {
                if (this.selectedIDs.has(s.id)) {
                    // Round to nearest 0.5
                    s.offsetX = Math.round(s.offsetX * 2) / 2;
                    s.offsetY = Math.round(s.offsetY * 2) / 2;
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
        
        if (this.shapes.length > 0) {
            s.offsetX = Math.round(((Math.random() * 4) - 2) * 2) / 2;
            s.offsetY = Math.round(((Math.random() * 4) - 2) * 2) / 2;
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

    updateSelectedProp(prop, val) {
        this.shapes.forEach(s => {
            if (this.selectedIDs.has(s.id)) {
                if (prop === 'color') s.color = val;
                if (prop === 'nOffset') s.nOffset = parseInt(val) || 0;
                if (prop === 'rotation') s.rotation = parseFloat(val) || 0;
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

        const usedColors = [...new Set(this.shapes.map(s => s.color))];
        const palette = document.getElementById('quick-palette');
        palette.innerHTML = '';
        
        const allColors = [...new Set([...usedColors, ...DEFAULT_COLORS])];

        allColors.forEach(c => {
            const btn = document.createElement('button');
            btn.className = "w-6 h-6 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition";
            btn.style.backgroundColor = c;
            btn.onclick = () => {
                this.updateSelectedProp('color', c);
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
            
            el.onclick = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                
                if (!e.shiftKey) this.selectedIDs.clear();
                if (this.selectedIDs.has(shape.id)) this.selectedIDs.delete(shape.id);
                else this.selectedIDs.add(shape.id);
                
                this.updateUI();
                this.draw();
            };

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

            const controls = document.createElement('div');
            controls.className = "grid grid-cols-2 gap-2 text-xs";
            
            // Lagt til input for rotasjon
            controls.innerHTML = `
                <div>
                    <label class="text-gray-400">Rotasjon</label>
                    <div class="flex items-center gap-1">
                        <input type="range" min="0" max="360" step="5" value="${shape.rotation}" 
                               class="w-full"
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

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#e5e7eb'; 
        this.ctx.lineWidth = 2;
        this.ctx.moveTo(0, cy); this.ctx.lineTo(w, cy);
        this.ctx.moveTo(cx, 0); this.ctx.lineTo(cx, h);
        this.ctx.stroke();

        this.shapes.forEach(shape => {
            const points = shape.getPoints(this.n);
            const isSelected = this.selectedIDs.has(shape.id);
            
            this.ctx.fillStyle = shape.color;
            this.ctx.strokeStyle = isSelected ? '#2563eb' : 'rgba(0,0,0,0.2)'; 
            this.ctx.lineWidth = isSelected ? 2 : 1;

            points.forEach(p => {
                const px = cx + (p.x + shape.offsetX) * GRID_SIZE;
                const py = cy - (p.y + shape.offsetY) * GRID_SIZE; 

                this.ctx.beginPath();
                this.ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            });
            
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
            parts.push(`${sign} ${s.getFormulaLatexStyled()}`);
            
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

    // === EXPORT & PRINT ===
    printApp(withFormula) {
        if (withFormula) {
            document.body.classList.remove('print-no-formula');
        } else {
            document.body.classList.add('print-no-formula');
        }
        window.print();
    },

    exportPNG(withFormula) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        // Hvis withFormula, legg til plass nederst
        const bottomPadding = withFormula ? 100 : 0;
        tempCanvas.height = this.canvas.height + bottomPadding;
        
        const tCtx = tempCanvas.getContext('2d');
        
        // Fyll hvit
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Tegn hovedcanvas
        tCtx.drawImage(this.canvas, 0, 0);
        
        // Tegn formeltekst hvis ønskelig
        if (withFormula) {
            tCtx.fillStyle = '#000000';
            tCtx.font = '20px sans-serif';
            tCtx.textAlign = 'center';
            
            // Generer en enkel tekststreng for formelen
            let txtFormula = "Fn = ";
            let txtCalc = "";
            let total = 0;
            
            this.shapes.forEach((s, i) => {
                const sign = i > 0 ? " + " : "";
                txtFormula += sign + s.getFormulaRaw();
                const v = s.getValue(this.n);
                total += v;
                txtCalc += sign + v;
            });
            
            txtCalc += " = " + total;
            
            tCtx.fillText("Figurnummer (n=" + this.n + ")", tempCanvas.width/2, this.canvas.height + 30);
            tCtx.fillText(txtFormula, tempCanvas.width/2, this.canvas.height + 60);
            tCtx.fillText(txtCalc, tempCanvas.width/2, this.canvas.height + 85);
        }
        
        const link = document.createElement('a');
        link.download = 'figurtall-analyse.png';
        link.href = tempCanvas.toDataURL();
        link.click();
    }
};

window.app = app;

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
