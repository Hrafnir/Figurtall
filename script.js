/* Version: #12 */

const GRID_SIZE = 30; 
const DOT_RADIUS = 7; 
const HIT_RADIUS = 0.6; 
const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4'];

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

function evaluateCoord(val, n) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    let str = val.toString().toLowerCase().replace(/\s/g, '');
    
    try {
        const expr = str.replace(/n/g, `(${n})`);
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
        
        this.posX = 0; 
        this.posY = 0; 
        this.rotation = 0; 
        this.flipX = 1;    
        this.flipY = 1;    
        
        this.nOffset = 0; 
        this.constantValue = 1; 
        this.groupName = ""; 
        
        this.attachedTo = null; 
        this.anchorType = 'center'; 
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
        s.attachedTo = null; 
        return s;
    }

    getEffectiveN(globalN) {
        if (this.type === 'constant') return this.constantValue;
        const eff = globalN + this.nOffset;
        return eff < 1 ? 0 : eff; 
    }

    getBounds(n) {
        let w = 0, h = 0;
        switch (this.type) {
            case 'line': w = n; h = 1; break; 
            case 'square': w = n; h = n; break;
            case 'rectangle': w = n+1; h = n; break;
            case 'triangle': w = n; h = n; break;
            case 'constant': w = this.constantValue; h = 1; break;
        }
        return { w, h };
    }

    getCalculatedPos(globalN, allShapes) {
        const localX = evaluateCoord(this.posX, globalN);
        const localY = evaluateCoord(this.posY, globalN);

        if (this.attachedTo) {
            const parent = allShapes.find(s => s.id === parseInt(this.attachedTo));
            
            if (parent && parent.id !== this.id) {
                const pPos = parent.getCalculatedPos(globalN, allShapes);
                const bounds = parent.getBounds(parent.getEffectiveN(globalN));
                
                let anchorX = 0; 
                let anchorY = 0;

                switch (this.anchorType) {
                    case 'top': anchorX = bounds.w / 2; anchorY = bounds.h; break;
                    case 'bottom': anchorX = bounds.w / 2; anchorY = 0; break;
                    case 'left': anchorX = 0; anchorY = bounds.h / 2; break;
                    case 'right': anchorX = bounds.w; anchorY = bounds.h / 2; break;
                    case 'center': anchorX = bounds.w / 2; anchorY = bounds.h / 2; break;
                }

                const rotatedAnchor = rotatePoint(anchorX, anchorY, parent.rotation);
                
                return {
                    x: pPos.x + rotatedAnchor.x + localX,
                    y: pPos.y + rotatedAnchor.y + localY
                };
            }
        }

        return { x: localX, y: localY };
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
                    for (let x = 0; x < n; x++) points.push({x: x, y: y});
                }
                break;
            case 'rectangle': 
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n + 1; x++) points.push({x: x, y: y});
                }
                break;
            case 'triangle': 
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x <= y; x++) points.push({x: x, y: y});
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

    hitTest(globalN, gridX, gridY, allShapes) {
        const points = this.getPoints(globalN);
        const pos = this.getCalculatedPos(globalN, allShapes);
        
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

const app = {
    canvas: null,
    ctx: null,
    marquee: null,
    
    n: 1,
    shapes: [],
    nextId: 1,
    clipboard: [],
    
    cameraOffset: {x: 0, y: 0},
    selectedIDs: new Set(),
    isDragging: false,
    isBoxSelecting: false,
    dragStart: {x: 0, y: 0},
    boxStart: {x: 0, y: 0},
    
    isRenderingFormula: false,
    showSidebar: true,
    showFormula: true,

    init() {
        console.log("Starter Figurtall Pro v12...");
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
        
        window.addEventListener('click', () => {
            document.getElementById('context-menu').classList.add('hidden');
        });

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; 
            
            if (e.key === 'g') this.groupSelected();
            if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') this.copySelection();
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') this.pasteSelection();
        });

        document.getElementById('n-slider').addEventListener('input', (e) => this.setN(parseInt(e.target.value)));
        
        const btnAdd = document.getElementById('btn-add-shape');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                document.getElementById('add-shape-modal').classList.remove('hidden');
            });
        }

        this.resizeCanvas();
        
        if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
            MathJax.startup.promise.then(() => this.updateUI());
        } else {
            this.updateUI();
        }
    },

    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.cameraOffset.x = Math.floor(this.canvas.width / 2);
        this.cameraOffset.y = Math.floor(this.canvas.height / 2);
        this.draw();
    },

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
            const pos = shape.getCalculatedPos(this.n, this.shapes);
            const isSelected = this.selectedIDs.has(shape.id);
            
            this.ctx.globalAlpha = 0.9;
            this.ctx.fillStyle = shape.color;
            this.ctx.strokeStyle = isSelected ? '#2563eb' : 'rgba(0,0,0,0.2)'; 
            this.ctx.lineWidth = isSelected ? 2 : 1;

            points.forEach(p => {
                const px = cx + (p.x + pos.x) * GRID_SIZE;
                const py = cy - (p.y + pos.y) * GRID_SIZE; 
                this.ctx.beginPath(); 
                this.ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
                this.ctx.fill(); 
                this.ctx.stroke();
            });
            this.ctx.globalAlpha = 1.0;
            
            if (isSelected) {
                const ox = cx + pos.x * GRID_SIZE;
                const oy = cy - pos.y * GRID_SIZE;
                this.ctx.fillStyle = '#000'; 
                this.ctx.fillRect(ox - 2, oy - 2, 4, 4);
            }
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
                if (['INPUT','BUTTON','SELECT'].includes(e.target.tagName)) return;
                if (!e.shiftKey) this.selectedIDs.clear();
                if (this.selectedIDs.has(shape.id)) this.selectedIDs.delete(shape.id); 
                else this.selectedIDs.add(shape.id);
                this.updateUI(); this.draw();
            };

            const header = document.createElement('div');
            header.className = "flex justify-between items-center mb-2";
            const groupBadge = shape.groupName ? `<span class="text-[10px] bg-gray-200 px-1 rounded ml-2 text-gray-600">📁 ${shape.groupName}</span>` : '';
            
            header.innerHTML = `
                <div class="flex items-center gap-2">
                    <input type="color" value="${shape.color}" class="w-5 h-5 rounded cursor-pointer border-0 p-0"
                           onchange="app.shapes.find(s=>s.id===${shape.id}).color=this.value; app.draw(); app.updateFormula();">
                    <span class="font-bold text-sm text-gray-700">${this.getShapeName(shape.type)} #${shape.id}</span>
                    ${groupBadge}
                </div>
                <button onclick="app.shapes=app.shapes.filter(s=>s.id!==${shape.id}); app.selectedIDs.delete(${shape.id}); app.updateUI(); app.draw();" 
                        class="text-gray-400 hover:text-red-500 font-bold px-2">&times;</button>
            `;

            let attachOptions = `<option value="">Ingen (Fri)</option>`;
            this.shapes.forEach(s => {
                if (s.id !== shape.id) { 
                    attachOptions += `<option value="${s.id}" ${shape.attachedTo == s.id ? 'selected' : ''}>Figur #${s.id} (${this.getShapeName(s.type)})</option>`;
                }
            });

            const controls = document.createElement('div');
            controls.className = "grid grid-cols-2 gap-2 text-xs";
            
            controls.innerHTML = `
                <div class="col-span-2 bg-slate-50 p-1 rounded border border-slate-200 mb-1">
                    <div class="flex gap-2 items-center mb-1">
                        <label class="text-gray-500 w-16">Fest til:</label>
                        <select class="w-full border rounded" onchange="app.updateSelectedProp('attachedTo', this.value, ${shape.id})">
                            ${attachOptions}
                        </select>
                    </div>
                    ${shape.attachedTo ? `
                    <div class="flex gap-2 items-center">
                        <label class="text-gray-500 w-16">Posisjon:</label>
                        <select class="w-full border rounded" onchange="app.updateSelectedProp('anchorType', this.value, ${shape.id})">
                            <option value="top" ${shape.anchorType=='top'?'selected':''}>Topp</option>
                            <option value="bottom" ${shape.anchorType=='bottom'?'selected':''}>Bunn</option>
                            <option value="left" ${shape.anchorType=='left'?'selected':''}>Venstre</option>
                            <option value="right" ${shape.anchorType=='right'?'selected':''}>Høyre</option>
                            <option value="center" ${shape.anchorType=='center'?'selected':''}>Senter</option>
                        </select>
                    </div>
                    ` : ''}
                </div>

                <div class="col-span-2 grid grid-cols-2 gap-2 mb-1">
                    <div>
                        <label class="text-gray-400">${shape.attachedTo ? 'Justering X' : 'Pos X'}</label>
                        <input type="text" value="${shape.posX}" class="w-full border rounded px-1" onchange="app.updateSelectedProp('posX', this.value)">
                    </div>
                    <div>
                        <label class="text-gray-400">${shape.attachedTo ? 'Justering Y' : 'Pos Y'}</label>
                        <input type="text" value="${shape.posY}" class="w-full border rounded px-1" onchange="app.updateSelectedProp('posY', this.value)">
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
            el.appendChild(header); 
            el.appendChild(controls); 
            list.appendChild(el);
        });
    },

    updateSelectedProp(prop, val, specificId = null) {
        const targetIds = specificId ? [specificId] : Array.from(this.selectedIDs);
        
        this.shapes.forEach(s => {
            if (targetIds.includes(s.id)) {
                if (prop === 'color') s.color = val;
                if (prop === 'nOffset') s.nOffset = parseInt(val) || 0;
                if (prop === 'rotation') s.rotation = parseFloat(val) || 0;
                if (prop === 'posX') s.posX = isNaN(val) ? val : parseFloat(val);
                if (prop === 'posY') s.posY = isNaN(val) ? val : parseFloat(val);
                if (prop === 'attachedTo') {
                    s.attachedTo = val === "" ? null : parseInt(val);
                    if (s.attachedTo) { s.posX = 0; s.posY = 0; }
                }
                if (prop === 'anchorType') s.anchorType = val;
            }
        });
        this.draw(); 
        this.updateFormula();
        if (prop === 'color' || prop === 'attachedTo') this.updateUI(); 
    },

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
        const bar = document.getElementById('bottom-panel');
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
    
    addShape(type) {
        document.getElementById('add-shape-modal').classList.add('hidden');
        const color = DEFAULT_COLORS[this.shapes.length % DEFAULT_COLORS.length];
        const s = new Shape(this.nextId++, type, color);
        
        if (this.selectedIDs.size === 1) {
            const parentId = [...this.selectedIDs][0];
            s.attachedTo = parentId;
            s.anchorType = 'top'; 
            s.posX = 0; 
            s.posY = 0;
        } else {
            if (this.shapes.length > 0) {
                s.posX = Math.round(((Math.random() * 4) - 2) * 2) / 2;
                s.posY = Math.round(((Math.random() * 4) - 2) * 2) / 2;
            }
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

    exportPNG(mode) {
        const staging = document.getElementById('export-staging');
        const canvasWrapper = document.getElementById('export-canvas-wrapper');
        const formulaWrapper = document.getElementById('export-formula-wrapper');
        
        staging.style.opacity = '1'; 
        staging.style.zIndex = '9999';
        
        canvasWrapper.innerHTML = '';
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1000; 
        tempCanvas.height = 600;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.fillStyle = '#ffffff'; 
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        const oldOffset = { ...this.cameraOffset };
        this.cameraOffset = { x: 500, y: 300 }; 
        
        const realCanvas = this.canvas; 
        const realCtx = this.ctx;
        
        this.canvas = tempCanvas; 
        this.ctx = tCtx;
        this.draw(); 
        
        this.canvas = realCanvas; 
        this.ctx = realCtx;
        this.cameraOffset = oldOffset;
        
        canvasWrapper.appendChild(tempCanvas);
        
        formulaWrapper.innerHTML = '';
        if (mode === 'formula') {
            formulaWrapper.style.display = 'block';
            let txtF = "Fn = "; 
            let txtC = ""; 
            let total = 0;
            
            this.shapes.forEach((s, i) => {
                const sign = i > 0 ? " + " : "";
                txtF += sign + s.getFormulaRaw();
                const v = s.getValue(this.n);
                total += v; 
                txtC += sign + v;
            });
            txtC += " = " + total;
            
            formulaWrapper.innerHTML = `
                <div class="font-bold text-lg mb-2">Figurnummer n = ${this.n}</div>
                <div class="text-xl font-mono">
                    <div>${txtF}</div>
                    <div class="mt-2 text-gray-600">${txtC}</div>
                </div>
            `;
        } else { 
            formulaWrapper.style.display = 'none'; 
        }
        
        html2canvas(staging, { backgroundColor: '#ffffff' }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'figurtall-export.png';
            link.href = canvas.toDataURL();
            link.click();
            
            staging.style.opacity = '0'; 
            staging.style.zIndex = '0'; 
            canvasWrapper.innerHTML = '';
        });
    },

    copySelection() { 
        if (this.selectedIDs.size === 0) return; 
        this.clipboard = this.shapes.filter(s => this.selectedIDs.has(s.id)); 
    },
    
    pasteSelection() { 
        if (this.clipboard.length === 0) return; 
        this.selectedIDs.clear(); 
        this.clipboard.forEach(template => { 
            const newShape = template.clone(this.nextId++); 
            if (typeof newShape.posX === 'number') newShape.posX += 1; 
            if (typeof newShape.posY === 'number') newShape.posY -= 1; 
            this.shapes.push(newShape); 
            this.selectedIDs.add(newShape.id); 
        }); 
        this.updateUI(); 
        this.draw(); 
    },
    
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
            if (this.shapes[i].hitTest(this.n, pos.gridX, pos.gridY, this.shapes)) { 
                hitShape = this.shapes[i]; 
                break; 
            } 
        } 
        if (hitShape) { 
            const menu = document.getElementById('context-menu'); 
            document.getElementById('ctx-title').innerText = this.getShapeName(hitShape.type); 
            document.getElementById('ctx-formula').innerText = hitShape.getFormulaRaw(); 
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
            if (this.shapes[i].hitTest(this.n, pos.gridX, pos.gridY, this.shapes)) { 
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
                    if (typeof s.posX === 'string') s.posX = evaluateCoord(s.posX, this.n); 
                    if (typeof s.posY === 'string') s.posY = evaluateCoord(s.posY, this.n); 
                    s.posX += dx; 
                    s.posY += dy; 
                } 
            }); 
            this.dragStart = { x: pos.gridX, y: pos.gridY }; 
            this.draw(); 
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
            let hit = this.shapes.some(s => s.hitTest(this.n, pos.gridX, pos.gridY, this.shapes)); 
            this.canvas.style.cursor = hit ? "move" : "crosshair"; 
        } 
    },
    
    handleMouseUp(e) { 
        if (this.isDragging) { 
            this.isDragging = false; 
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
                const sp = s.getCalculatedPos(this.n, this.shapes); 
                const px = this.cameraOffset.x + (sp.x * GRID_SIZE); 
                const py = this.cameraOffset.y - (sp.y * GRID_SIZE); 
                if (px >= bX1 && px <= bX2 && py >= bY1 && py <= bY2) this.selectedIDs.add(s.id); 
            }); 
            this.updateUI(); 
            this.draw(); 
        } 
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
    
    setN(val) { 
        this.n = val; 
        document.getElementById('n-display').innerText = val; 
        document.getElementById('n-val-display').innerText = val; 
        this.draw(); 
        this.updateFormula(); 
    },
    
    centerCamera() { 
        this.cameraOffset.x = Math.floor(this.canvas.width / 2); 
        this.cameraOffset.y = Math.floor(this.canvas.height / 2); 
        this.draw(); 
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
    
    getShapeName(type) { 
        return { 'line': 'Linje', 'square': 'Kvadrat', 'triangle': 'Trekant', 'rectangle': 'Rektangel', 'constant': 'Konst' }[type] || type; 
    },
    
    updateFormula() { 
        const div = document.getElementById('formula-display'); 
        const calcDiv = document.getElementById('calc-display'); 
        
        if (this.isRenderingFormula) return; 
        this.isRenderingFormula = true; 
        
        if (this.shapes.length === 0) { 
            div.innerHTML = "$$ F_n = 0 $$"; 
            calcDiv.innerText = "0 = 0"; 
            if(window.MathJax && MathJax.typesetPromise) { 
                MathJax.typesetPromise([div]).then(() => this.isRenderingFormula = false); 
            } else { 
                this.isRenderingFormula = false; 
            } 
            return; 
        } 
        
        let parts = [], total = 0, cParts = []; 
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
        
        if(window.MathJax && MathJax.typesetPromise) { 
            MathJax.typesetPromise([div])
                .then(() => this.isRenderingFormula = false)
                .catch(() => this.isRenderingFormula = false); 
        } else { 
            this.isRenderingFormula = false; 
        } 
    },
    
    printApp(withFormula) { 
        if (withFormula) document.body.classList.remove('print-no-formula'); 
        else document.body.classList.add('print-no-formula'); 
        window.print(); 
    }
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
