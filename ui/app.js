
    /**
     * MindFlow 自由白板核心引擎
     */
    (function () {
      const tr = window.mindflowLanguage.translate;
      const STORAGE_KEY = 'mindflow_brainstorm_v1';
      const THEME_KEY = 'mindflow_theme_v1';

      // DOM 引用
      const viewportEl = document.getElementById('canvas-viewport');
      const worldLayerEl = document.getElementById('world-layer');
      const clustersLayerEl = document.getElementById('clusters-layer');
      const drawingsContainerEl = document.getElementById('drawings-container');
      const tempDrawingContainerEl = document.getElementById('temp-drawing-container');
      const edgesContainerEl = document.getElementById('edges-container');
      const edgeLabelsLayerEl = document.getElementById('edge-labels-layer');
      const tokensLayerEl = document.getElementById('tokens-layer');
      const tempEdgePathEl = document.getElementById('temp-edge-path');
      const marqueeBoxEl = document.getElementById('marquee-box');

      const quickInputBoxEl = document.getElementById('quick-input-box');
      const quickInputFieldEl = document.getElementById('quick-input-field');
      const quickInputConfirmEl = document.getElementById('quick-input-confirm');

      const floatingToolbarEl = document.getElementById('floating-toolbar');
      const boardTitleInputEl = document.getElementById('board-title-input');
      const zoomResetBtnEl = document.getElementById('btn-zoom-reset');

      // 核心应用状态
      let state = {
        title: tr('未命名白板'),
        tokens: [],   // { id, text, x, y, color }
        edges: [],    // { id, source, target, label }
        clusters: [], // { id, title, x, y, width, height, color }
        drawings: []  // { id, type: 'pen'|'rect'|'ellipse'|'line', color, points?, x?, y?, width?, height?, x1?, y1?, x2?, y2? }
      };

      // 当前工具、默认画笔颜色与粗细
      let activeTool = 'select'; // 'select' | 'pen' | 'eraser' | 'rect' | 'ellipse' | 'line'
      let activeStrokeColor = 'neutral';
      let activeStrokeWidth = 3.5;

      // 内部剪贴板与搜索状态
      let internalClipboard = null;
      let pasteStepCount = 0;
      let searchMatches = [];
      let searchActiveIndex = -1;
      let activeTouchPointers = new Map();
      let pinchStartDist = 0;
      let pinchStartScale = 1;
      let pinchStartCenter = null;

      // 语义颜色映射（供 SVG 画笔与图形使用）
      const STROKE_PALETTE = {
        neutral: { light: '#57534e', dark: '#a1a1aa', fillLight: 'rgba(120, 113, 108, 0.08)', fillDark: 'rgba(161, 161, 170, 0.1)' },
        yellow:  { light: '#eab308', dark: '#facc15', fillLight: 'rgba(250, 204, 21, 0.14)', fillDark: 'rgba(250, 204, 21, 0.14)' },
        blue:    { light: '#0284c7', dark: '#38bdf8', fillLight: 'rgba(56, 189, 248, 0.14)', fillDark: 'rgba(56, 189, 248, 0.14)' },
        green:   { light: '#16a34a', dark: '#4ade80', fillLight: 'rgba(74, 222, 128, 0.14)', fillDark: 'rgba(74, 222, 128, 0.14)' },
        purple:  { light: '#9333ea', dark: '#c084fc', fillLight: 'rgba(192, 132, 252, 0.14)', fillDark: 'rgba(192, 132, 252, 0.14)' },
        red:     { light: '#e11d48', dark: '#fb7185', fillLight: 'rgba(251, 113, 133, 0.14)', fillDark: 'rgba(251, 113, 133, 0.14)' }
      };

      // 视口变换状态
      let viewport = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        scale: 1
      };

      // 选中状态集合
      let selection = {
        tokens: new Set(),
        edges: new Set(),
        clusters: new Set(),
        drawings: new Set()
      };

      // 撤销/重做历史栈
      let historyPast = [];
      let historyFuture = [];
      const MAX_HISTORY = 40;

      // 交互状态机
      let interaction = {
        mode: 'idle', // 'idle' | 'pan' | 'marquee' | 'drag-items' | 'drag-cluster' | 'resize-cluster' | 'connect-edge' | 'drawing' | 'erasing'
        startClientX: 0,
        startClientY: 0,
        startWorldX: 0,
        startWorldY: 0,
        startViewportX: 0,
        startViewportY: 0,
        initialPositions: new Map(), // 记录拖拽前各元素坐标
        marqueeBaseTokens: new Set(),
        marqueeBaseClusters: new Set(),
        marqueeBaseDrawings: new Set(),
        pendingToggleItem: null, // { type: 'token'|'drawing', id }
        activeClusterId: null,
        initialClusterRect: null,
        connectSourceId: null,
        draftDrawing: null, // 正在绘制的临时图形/笔迹
        erasedInStroke: false,
        hasMoved: false,
        pendingCreateWorldPos: null,
        pendingParentTokenId: null
      };

      let isSpacePressed = false;
      let currentExportTab = 'md';

      function isMultiSelectModifier(e) {
        return Boolean(e.ctrlKey || e.metaKey || e.shiftKey);
      }

      function uid(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      }

      function cloneState(s) {
        return JSON.parse(JSON.stringify(s));
      }

      function screenToWorld(clientX, clientY) {
        return {
          x: (clientX - viewport.x) / viewport.scale,
          y: (clientY - viewport.y) / viewport.scale
        };
      }

      function worldToScreen(worldX, worldY) {
        return {
          x: worldX * viewport.scale + viewport.x,
          y: worldY * viewport.scale + viewport.y
        };
      }

      // 切换工具模式
      function setActiveTool(tool) {
        activeTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
          const isMatch = btn.dataset.tool === tool;
          if (isMatch) {
            btn.className = 'tool-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 transition shadow-xs';
          } else {
            btn.className = 'tool-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 transition';
          }
        });

        if (tool !== 'eraser') {
          tempDrawingContainerEl.innerHTML = '';
        }

        if (tool === 'select') {
          viewportEl.classList.remove('drawing-mode-active');
          viewportEl.style.cursor = isSpacePressed ? 'grab' : 'default';
        } else if (tool === 'eraser') {
          clearSelection();
          viewportEl.classList.add('drawing-mode-active');
          viewportEl.style.cursor = 'cell';
        } else {
          clearSelection();
          viewportEl.classList.add('drawing-mode-active');
          viewportEl.style.cursor = 'crosshair';
        }
      }

      // 轻量级 Toast 提示
      let toastTimer = null;
      function showToast(msg) {
        const el = document.getElementById('toast-msg');
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          el.classList.add('hidden');
        }, 2200);
      }

      // 自定义确认弹窗
      function showConfirm(title, desc, onConfirm) {
        const modal = document.getElementById('modal-confirm');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-desc').textContent = desc;
        modal.classList.remove('hidden');

        const okBtn = document.getElementById('btn-confirm-ok');
        const cancelBtn = document.getElementById('btn-confirm-cancel');

        const cleanup = () => {
          modal.classList.add('hidden');
          okBtn.onclick = null;
          cancelBtn.onclick = null;
        };

        okBtn.onclick = () => {
          cleanup();
          onConfirm();
        };
        cancelBtn.onclick = cleanup;
      }

      // 历史记录：推入快照
      function pushHistory() {
        historyPast.push(cloneState(state));
        if (historyPast.length > MAX_HISTORY) {
          historyPast.shift();
        }
        historyFuture = [];
        updateUndoRedoButtons();
      }

      function undo() {
        if (historyPast.length === 0) return;
        historyFuture.push(cloneState(state));
        state = historyPast.pop();
        clearSelection();
        renderAll();
        saveToLocalStorage();
        updateUndoRedoButtons();
        showToast(tr('已撤销上一步操作'));
      }

      function redo() {
        if (historyFuture.length === 0) return;
        historyPast.push(cloneState(state));
        state = historyFuture.pop();
        clearSelection();
        renderAll();
        saveToLocalStorage();
        updateUndoRedoButtons();
        showToast(tr('已重做操作'));
      }

      function updateUndoRedoButtons() {
        document.getElementById('btn-undo').disabled = historyPast.length === 0;
        document.getElementById('btn-redo').disabled = historyFuture.length === 0;
      }

      let documentMeta = null;
      let ready = false;
      let applying = false;
      let saving = null;
      let saveTimer = null;
      let lastSavedContent = '';
      let conflict = false;
      let polling = false;
      const keys = ['tokens', 'edges', 'clusters', 'drawings'];
      function snapshot() {
        const selected = Object.fromEntries(keys.map(k => [k, [...selection[k]].filter(id => state[k].some(i => i.id === id))]));
        return {...documentMeta, ...cloneState(state), viewport: {...viewport}, selection: selected};
      }
      function signature(doc) { return JSON.stringify([doc.title,doc.tokens,doc.edges,doc.clusters,doc.drawings,doc.viewport,doc.selection]); }
      function showSaved(revision) {
        const label = window.desktop.mode === 'browser' ? tr('浏览器已保存') : tr('已保存');
        status(label + ' · r' + revision);
      }
      function status(text) { document.getElementById('save-status').textContent = text; }
      function showFailure(error) {
        conflict = true;
        status(tr('未保存 · 请处理'));
        const banner = document.getElementById('sync-banner');
        banner.hidden = false;
        document.getElementById('sync-message').textContent = error.message.includes('REVISION_CONFLICT')
          ? tr('另有修改已保存。请先导出本地副本，再载入最新版本。')
          : tr('保存失败，本地编辑仍保留') + ' · ' + error.message;
      }
      function acceptDocument(doc) {
        applying = true;
        documentMeta = {format:doc.format,schemaVersion:doc.schemaVersion,boardId:doc.boardId,revision:doc.revision,updatedAt:doc.updatedAt};
        state = Object.fromEntries(['title', ...keys].map(k => [k,cloneState(doc[k])]));
        viewport = {...doc.viewport};
        selection = Object.fromEntries(keys.map(k => [k,new Set(doc.selection[k])]));
        historyPast=[]; historyFuture=[];
        renderAll(); updateUndoRedoButtons();
        lastSavedContent = signature(snapshot());
        applying = false;
        showSaved(doc.revision);
      }
      async function flushSave() {
        clearTimeout(saveTimer);
        if (!ready || applying || conflict) return false;
        if (saving) { await saving; if(conflict) return false; return flushSave(); }
        saving = (async () => {
          while (signature(snapshot()) !== lastSavedContent) {
            const doc = snapshot(); const sent = signature(doc);
            status(tr('保存中…'));
            const stored = await window.desktop.save({document:doc,expectedRevision:documentMeta.revision});
            documentMeta.revision=stored.revision; documentMeta.updatedAt=stored.updatedAt;
            lastSavedContent=sent; showSaved(stored.revision);
          }
        })();
        try { await saving; return true; } catch(error) { showFailure(error); return false; } finally { saving=null; }
      }
      function saveToLocalStorage() {
        if(!ready || applying || conflict) return;
        clearTimeout(saveTimer); status(tr('待保存…'));
        saveTimer=setTimeout(flushSave,200);
      }
      async function pollDocument() {
        if(!ready || conflict || saving || polling || interaction.mode!=='idle')return;
        const active=document.activeElement;
        if(active && ['INPUT','TEXTAREA'].includes(active.tagName))return;
        if(signature(snapshot())!==lastSavedContent){ saveToLocalStorage(); return; }
        polling=true;
        const before=signature(snapshot());
        try{
          const doc=await window.desktop.read();
          if(signature(snapshot())===before && !saving && (doc.boardId!==documentMeta.boardId || doc.revision!==documentMeta.revision)) {
            acceptDocument(doc); showToast(tr('已载入最新版本'));
          }
        }catch(error){ showFailure(error); }finally{polling=false;}
      }
      // 加载内置示例模板
      function loadDemoData() {
        state = structuredClone(window.mindflowExample);
        viewport = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          scale: 1
        };
        clearSelection();
        renderAll();
        saveToLocalStorage();
      }

      // 更新世界变换矩阵与网格背景偏移
      function applyViewportTransform() {
        worldLayerEl.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
        const gridSize = 24 * viewport.scale;
        viewportEl.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        viewportEl.style.backgroundPosition = `${viewport.x}px ${viewport.y}px`;
        zoomResetBtnEl.textContent = `${Math.round(viewport.scale * 100)}%`;
        updateFloatingToolbarPosition();
      }

      // 获取手绘/图形包围盒（用于多选框选与悬浮工具栏定位）
      function getDrawingBounds(d) {
        if (d.type === 'rect' || d.type === 'ellipse') {
          return { x: d.x, y: d.y, width: d.width, height: d.height };
        }
        if (d.type === 'line') {
          const minX = Math.min(d.x1, d.x2);
          const minY = Math.min(d.y1, d.y2);
          return { x: minX, y: minY, width: Math.abs(d.x2 - d.x1) || 10, height: Math.abs(d.y2 - d.y1) || 10 };
        }
        if (d.type === 'pen' && Array.isArray(d.points) && d.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          d.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });
          return { x: minX, y: minY, width: (maxX - minX) || 10, height: (maxY - minY) || 10 };
        }
        return { x: 0, y: 0, width: 10, height: 10 };
      }

      // 将画笔采样点拟合成平滑二次贝塞尔曲线路径
      function buildSmoothPenPath(points) {
        if (!points || points.length === 0) return '';
        if (points.length === 1) {
          const p = points[0];
          return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.5).toFixed(1)} ${(p.y + 0.5).toFixed(1)}`;
        }
        if (points.length === 2) {
          return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
        }
        let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
        for (let i = 1; i < points.length - 1; i++) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
        }
        const last = points[points.length - 1];
        d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
        return d;
      }

      // 点到线段的最短距离（供橡皮擦精确碰撞检测使用）
      function distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
      }

      // 检测橡皮擦世界坐标 (wx, wy) 是否命中某个手绘笔迹或图形
      function hitTestDrawingForEraser(d, wx, wy, radiusWorld) {
        const tol = radiusWorld + (d.strokeWidth || 3) / 2;
        if (d.type === 'pen' && Array.isArray(d.points) && d.points.length > 0) {
          if (d.points.length === 1) {
            return Math.hypot(wx - d.points[0].x, wy - d.points[0].y) <= tol;
          }
          for (let i = 0; i < d.points.length - 1; i++) {
            if (distToSegment(wx, wy, d.points[i].x, d.points[i].y, d.points[i + 1].x, d.points[i + 1].y) <= tol) {
              return true;
            }
          }
          return false;
        }
        if (d.type === 'line') {
          return distToSegment(wx, wy, d.x1, d.y1, d.x2, d.y2) <= tol;
        }
        if (d.type === 'rect') {
          const inX = wx >= d.x - tol && wx <= d.x + d.width + tol;
          const inY = wy >= d.y - tol && wy <= d.y + d.height + tol;
          return inX && inY;
        }
        if (d.type === 'ellipse') {
          const cx = d.x + d.width / 2;
          const cy = d.y + d.height / 2;
          const rx = Math.max(4, d.width / 2) + tol;
          const ry = Math.max(4, d.height / 2) + tol;
          const norm = ((wx - cx) * (wx - cx)) / (rx * rx) + ((wy - cy) * (wy - cy)) / (ry * ry);
          return norm <= 1;
        }
        return false;
      }

      // 渲染橡皮擦圆环指示器并执行擦除
      function updateEraserAt(wx, wy, shouldErase) {
        const radiusWorld = 14 / viewport.scale;
        tempDrawingContainerEl.innerHTML = '';
        const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        indicator.setAttribute('cx', wx);
        indicator.setAttribute('cy', wy);
        indicator.setAttribute('r', radiusWorld);
        indicator.setAttribute('fill', shouldErase ? 'rgba(244, 63, 94, 0.18)' : 'rgba(120, 113, 108, 0.12)');
        indicator.setAttribute('stroke', shouldErase ? '#f43f5e' : '#78716c');
        indicator.setAttribute('stroke-width', (1.5 / viewport.scale).toString());
        indicator.setAttribute('class', 'pointer-events-none');
        tempDrawingContainerEl.appendChild(indicator);

        const hitIds = new Set();
        state.drawings.forEach(d => {
          if (hitTestDrawingForEraser(d, wx, wy, radiusWorld)) {
            hitIds.add(d.id);
          }
        });

        if (shouldErase && hitIds.size > 0) {
          if (!interaction.erasedInStroke) {
            pushHistory();
            interaction.erasedInStroke = true;
          }
          state.drawings = state.drawings.filter(d => !hitIds.has(d.id));
          renderDrawings();
        } else {
          drawingsContainerEl.querySelectorAll('.drawing-group').forEach(g => {
            g.classList.toggle('eraser-hover', hitIds.has(g.dataset.id));
          });
        }
      }

      // 创建单个手绘/图形 SVG 节点
      function buildDrawingSvgElement(d, isDraft = false) {
        const isDark = document.documentElement.classList.contains('dark');
        const palette = STROKE_PALETTE[d.color || 'neutral'] || STROKE_PALETTE.neutral;
        const strokeColor = isDark ? palette.dark : palette.light;
        const fillColor = isDark ? palette.fillDark : palette.fillLight;
        const sw = d.strokeWidth || 3;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `drawing-group ${!isDraft && selection.drawings.has(d.id) ? 'selected' : ''}`);
        if (!isDraft) g.dataset.id = d.id;

        if (d.type === 'pen' && d.points && d.points.length > 0) {
          const pathData = buildSmoothPenPath(d.points);
          const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          visiblePath.setAttribute('d', pathData);
          visiblePath.setAttribute('fill', 'none');
          visiblePath.setAttribute('stroke', strokeColor);
          visiblePath.setAttribute('stroke-width', String(sw));
          visiblePath.setAttribute('stroke-linecap', 'round');
          visiblePath.setAttribute('stroke-linejoin', 'round');
          visiblePath.setAttribute('class', 'drawing-outline pointer-events-none');
          g.appendChild(visiblePath);

          if (!isDraft) {
            const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.setAttribute('d', pathData);
            hitPath.setAttribute('class', 'drawing-hit');
            g.appendChild(hitPath);
          }
        } else if (d.type === 'rect') {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', d.x);
          rect.setAttribute('y', d.y);
          rect.setAttribute('width', Math.max(2, d.width));
          rect.setAttribute('height', Math.max(2, d.height));
          rect.setAttribute('rx', '12');
          rect.setAttribute('fill', fillColor);
          rect.setAttribute('stroke', strokeColor);
          rect.setAttribute('stroke-width', String(d.strokeWidth || 2.5));
          rect.setAttribute('class', `drawing-outline ${isDraft ? 'pointer-events-none' : 'drawing-shape-fill'}`);
          g.appendChild(rect);
        } else if (d.type === 'ellipse') {
          const cx = d.x + d.width / 2;
          const cy = d.y + d.height / 2;
          const rx = Math.max(2, d.width / 2);
          const ry = Math.max(2, d.height / 2);
          const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          ellipse.setAttribute('cx', cx);
          ellipse.setAttribute('cy', cy);
          ellipse.setAttribute('rx', rx);
          ellipse.setAttribute('ry', ry);
          ellipse.setAttribute('fill', fillColor);
          ellipse.setAttribute('stroke', strokeColor);
          ellipse.setAttribute('stroke-width', String(d.strokeWidth || 2.5));
          ellipse.setAttribute('class', `drawing-outline ${isDraft ? 'pointer-events-none' : 'drawing-shape-fill'}`);
          g.appendChild(ellipse);
        } else if (d.type === 'line') {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', d.x1);
          line.setAttribute('y1', d.y1);
          line.setAttribute('x2', d.x2);
          line.setAttribute('y2', d.y2);
          line.setAttribute('stroke', strokeColor);
          line.setAttribute('stroke-width', String(sw));
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('class', 'drawing-outline pointer-events-none');
          g.appendChild(line);

          if (!isDraft) {
            const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hitLine.setAttribute('x1', d.x1);
            hitLine.setAttribute('y1', d.y1);
            hitLine.setAttribute('x2', d.x2);
            hitLine.setAttribute('y2', d.y2);
            hitLine.setAttribute('class', 'drawing-hit');
            g.appendChild(hitLine);
          }
        }

        // 选中虚线外框高亮
        if (!isDraft && selection.drawings.has(d.id)) {
          const b = getDrawingBounds(d);
          const selRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          selRect.setAttribute('x', b.x - 6);
          selRect.setAttribute('y', b.y - 6);
          selRect.setAttribute('width', b.width + 12);
          selRect.setAttribute('height', b.height + 12);
          selRect.setAttribute('rx', '8');
          selRect.setAttribute('fill', 'none');
          selRect.setAttribute('stroke', '#3b82f6');
          selRect.setAttribute('stroke-width', '1.5');
          selRect.setAttribute('stroke-dasharray', '4,3');
          selRect.setAttribute('class', 'pointer-events-none');
          g.appendChild(selRect);
        }

        // 绑定选中与拖拽移动事件
        if (!isDraft) {
          g.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || isSpacePressed || activeTool !== 'select') return;
            e.stopPropagation();

            const isMulti = isMultiSelectModifier(e);
            interaction.pendingToggleItem = null;

            if (isMulti) {
              if (selection.drawings.has(d.id)) {
                interaction.pendingToggleItem = { type: 'drawing', id: d.id };
              } else {
                selection.drawings.add(d.id);
                updateSelectionVisuals();
              }
            } else if (!selection.drawings.has(d.id)) {
              clearSelection();
              selection.drawings.add(d.id);
              updateSelectionVisuals();
            }

            beginDragSelectedItems(e);
          });
        }

        return g;
      }

      // 渲染所有手绘笔迹与图形
      function renderDrawings() {
        drawingsContainerEl.innerHTML = '';
        state.drawings.forEach(d => {
          drawingsContainerEl.appendChild(buildDrawingSvgElement(d, false));
        });
      }

      // 渲染群组容器 (Clusters)
      function renderClusters() {
        clustersLayerEl.innerHTML = '';
        state.clusters.forEach(cluster => {
          const box = document.createElement('div');
          const colorCls = cluster.color && cluster.color !== 'neutral' ? `cluster-theme-${cluster.color}` : '';
          box.className = `cluster-box ${colorCls} ${selection.clusters.has(cluster.id) ? 'selected' : ''}`;
          box.dataset.id = cluster.id;
          box.style.left = `${cluster.x}px`;
          box.style.top = `${cluster.y}px`;
          box.style.width = `${cluster.width}px`;
          box.style.height = `${cluster.height}px`;

          const header = document.createElement('div');
          header.className = 'px-4 py-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing';

          const titleInput = document.createElement('input');
          titleInput.type = 'text';
          titleInput.value = cluster.title;
          titleInput.readOnly = true;
          titleInput.className = 'bg-transparent text-xs font-bold tracking-wide text-stone-600 dark:text-zinc-300 outline-none focus:bg-white/60 dark:focus:bg-zinc-800/80 px-1.5 py-0.5 rounded-md w-full cursor-inherit';
          titleInput.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            titleInput.readOnly = false;
            titleInput.classList.remove('cursor-inherit');
            titleInput.focus();
            titleInput.select();
          });
          titleInput.addEventListener('pointerdown', (e) => {
            if (!titleInput.readOnly) e.stopPropagation();
          });
          titleInput.addEventListener('blur', () => {
            titleInput.readOnly = true;
            titleInput.classList.add('cursor-inherit');
          });
          titleInput.addEventListener('change', (e) => {
            pushHistory();
            cluster.title = e.target.value.trim() || tr('未命名群组');
            saveToLocalStorage();
          });
          titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') titleInput.blur();
          });

          header.appendChild(titleInput);
          box.appendChild(header);

          const resizeHandle = document.createElement('div');
          resizeHandle.className = 'absolute bottom-1.5 right-1.5 w-4 h-4 cursor-nwse-resize flex items-center justify-center text-stone-400 hover:text-blue-500';
          resizeHandle.innerHTML = `<svg class="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5L5 11M11 9L9 11"/></svg>`;
          resizeHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            pushHistory();
            interaction.mode = 'resize-cluster';
            interaction.activeClusterId = cluster.id;
            interaction.startClientX = e.clientX;
            interaction.startClientY = e.clientY;
            interaction.initialClusterRect = {
              x: cluster.x,
              y: cluster.y,
              width: cluster.width,
              height: cluster.height
            };
          });
          box.appendChild(resizeHandle);

          box.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || isSpacePressed || activeTool !== 'select') return;
            if (e.target.tagName === 'INPUT' && !e.target.readOnly) return;
            e.stopPropagation();

            const isMulti = isMultiSelectModifier(e);
            if (isMulti) {
              if (selection.clusters.has(cluster.id)) {
                selection.clusters.delete(cluster.id);
              } else {
                selection.clusters.add(cluster.id);
              }
              updateSelectionVisuals();
              if (!selection.clusters.has(cluster.id)) return;
            } else if (!selection.clusters.has(cluster.id)) {
              clearSelection();
              selection.clusters.add(cluster.id);
              updateSelectionVisuals();
            }

            interaction.mode = 'drag-cluster';
            interaction.activeClusterId = cluster.id;
            interaction.startClientX = e.clientX;
            interaction.startClientY = e.clientY;
            interaction.hasMoved = false;
            interaction.initialPositions.clear();
            interaction.initialPositions.set(cluster.id, { x: cluster.x, y: cluster.y });

            state.tokens.forEach(t => {
              const tCenterX = t.x + 60;
              const tCenterY = t.y + 20;
              if (
                tCenterX >= cluster.x &&
                tCenterX <= cluster.x + cluster.width &&
                tCenterY >= cluster.y &&
                tCenterY <= cluster.y + cluster.height
              ) {
                interaction.initialPositions.set(t.id, { x: t.x, y: t.y });
              }
            });
          });

          clustersLayerEl.appendChild(box);
        });
      }

      // 安全校验允许渲染的链接协议（支持 https/http/mailto 以及安全的 data: 附件或图片）
      function isSafeMarkdownUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        return /^(https?:\/\/|mailto:|data:[a-zA-Z0-9.+/-]+;base64,)/i.test(trimmed);
      }

      // 将 File 对象转换为 Markdown 链接语法：图片转为 ![name](data:image/...)，文件转为 [name](data:...)
      const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
      function fileToMarkdownLink(file) {
        return new Promise((resolve, reject) => {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            reject(new Error(tr('单个附件请勿超过 4 MiB')));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const isImg = (file.type && file.type.startsWith('image/')) || /^data:image\//i.test(dataUrl);
            const rawName = (file.name || (isImg ? `${tr('粘贴图片')}.png` : `${tr('附件')}.bin`)).replace(/[\[\]()]/g, '_');
            resolve(isImg ? `![${rawName}](${dataUrl})` : `[${rawName}](${dataUrl})`);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      }

      // 解析词块文本中的 Markdown 图片 ![alt](url) 与文件/网页链接 [label](url) 并构建安全 DOM
      function renderTokenMarkdownContent(container, text) {
        container.innerHTML = '';
        const raw = String(text || '');
        const mdRegex = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
        let lastIndex = 0;
        let match;

        while ((match = mdRegex.exec(raw)) !== null) {
          if (match.index > lastIndex) {
            container.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
          }
          const isImage = match[1] === '!';
          const label = match[2] || (isImage ? tr('粘贴图片') : tr('附件'));
          const url = match[3];

          if (isImage && /^data:image\//i.test(url)) {
            const wrap = document.createElement('div');
            wrap.className = 'my-1';
            const img = document.createElement('img');
            img.src = url;
            img.alt = label;
            img.className = 'token-md-img';
            img.addEventListener('load', () => renderEdges());
            wrap.appendChild(img);
            if (label) {
              const cap = document.createElement('span');
              cap.className = 'token-md-caption';
              cap.textContent = label;
              wrap.appendChild(cap);
            }
            container.appendChild(wrap);
          } else if (isSafeMarkdownUrl(url)) {
            const a = document.createElement('a');
            a.href = url;
            a.className = 'token-md-link';
            a.title = `${label} (${tr('点击下载或打开附件')})`;
            if (url.startsWith('data:')) {
              a.download = label;
            } else {
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
            }
            a.textContent = `📎 ${label}`;
            a.addEventListener('pointerdown', (e) => e.stopPropagation());
            a.addEventListener('click', (e) => e.stopPropagation());
            container.appendChild(a);
          } else {
            container.appendChild(document.createTextNode(match[0]));
          }

          lastIndex = mdRegex.lastIndex;
        }

        if (lastIndex < raw.length) {
          container.appendChild(document.createTextNode(raw.slice(lastIndex)));
        }
      }

      // 渲染词条卡片 (Tokens)
      function renderTokens() {
        tokensLayerEl.innerHTML = '';
        state.tokens.forEach(token => {
          const el = document.createElement('div');
          const themeClass = `theme-${token.color || 'neutral'}`;
          const isSelected = selection.tokens.has(token.id);
          el.className = `token-node ${themeClass} shadow-card hover:shadow-card-hover px-4 py-2.5 text-sm font-medium leading-snug break-words ${isSelected ? 'selected' : ''}`;
          el.dataset.id = token.id;
          el.style.left = `${token.x}px`;
          el.style.top = `${token.y}px`;

          const textSpan = document.createElement('div');
          textSpan.className = 'token-text pointer-events-none whitespace-pre-wrap';
          renderTokenMarkdownContent(textSpan, token.text);
          el.appendChild(textSpan);

          // 右侧快捷发散按钮 (+)
          const branchBtn = document.createElement('button');
          branchBtn.title = tr('添加相连的词块 (Tab)');
          branchBtn.className = 'quick-branch-btn absolute -right-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-sm hover:scale-110 transition cursor-pointer';
          branchBtn.textContent = '+';
          branchBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
          branchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerQuickBranch(token);
          });
          el.appendChild(branchBtn);

          // 边缘连接拖拽锚点
          const anchors = [
            { pos: 'top', cls: '-top-1.5 left-1/2 -translate-x-1/2' },
            { pos: 'bottom', cls: '-bottom-1.5 left-1/2 -translate-x-1/2' },
            { pos: 'left', cls: 'top-1/2 -left-1.5 -translate-y-1/2' },
            { pos: 'right', cls: 'top-1/2 -right-1.5 -translate-y-1/2' }
          ];
          anchors.forEach(a => {
            const dot = document.createElement('div');
            dot.title = tr('拖到另一个词块以连接');
            dot.className = `node-handle absolute ${a.cls} w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-zinc-900 shadow-xs cursor-crosshair hover:scale-125`;
            dot.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              startConnectEdge(token.id, e.clientX, e.clientY);
            });
            el.appendChild(dot);
          });

          // 单击选中与多选拖拽（支持 Ctrl/Cmd + 单击 与 Shift + 单击 多选切换）
          el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || isSpacePressed || activeTool !== 'select') return;
            e.stopPropagation();

            const isMulti = isMultiSelectModifier(e);
            interaction.pendingToggleItem = null;

            if (isMulti) {
              if (selection.tokens.has(token.id)) {
                interaction.pendingToggleItem = { type: 'token', id: token.id };
              } else {
                selection.tokens.add(token.id);
                updateSelectionVisuals();
              }
            } else if (!selection.tokens.has(token.id)) {
              clearSelection();
              selection.tokens.add(token.id);
              updateSelectionVisuals();
            }

            beginDragSelectedItems(e);
          });

          // 双击原地编辑词条内容
          el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openInlineTokenEditor(token, el);
          });

          tokensLayerEl.appendChild(el);
        });
      }

      // 启动选中元素（Tokens + Drawings）的统一拖拽
      function beginDragSelectedItems(e) {
        interaction.mode = 'drag-items';
        interaction.startClientX = e.clientX;
        interaction.startClientY = e.clientY;
        interaction.hasMoved = false;
        interaction.initialPositions.clear();

        selection.tokens.forEach(id => {
          const t = state.tokens.find(item => item.id === id);
          if (t) interaction.initialPositions.set(`token:${id}`, { x: t.x, y: t.y });
        });

        selection.drawings.forEach(id => {
          const d = state.drawings.find(item => item.id === id);
          if (d) {
            if (d.type === 'rect' || d.type === 'ellipse') {
              interaction.initialPositions.set(`drawing:${id}`, { x: d.x, y: d.y });
            } else if (d.type === 'line') {
              interaction.initialPositions.set(`drawing:${id}`, { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
            } else if (d.type === 'pen') {
              interaction.initialPositions.set(`drawing:${id}`, { points: d.points.map(p => ({ ...p })) });
            }
          }
        });
      }

      // 原地编辑 Token 文本
      function openInlineTokenEditor(token, nodeEl) {
        const textDiv = nodeEl.querySelector('.token-text');
        if (!textDiv) return;

        const input = document.createElement('textarea');
        input.value = token.text;
        input.rows = Math.max(1, Math.min(6, Math.ceil(token.text.length / 22)));
        input.className = 'w-full bg-transparent outline-none resize-none text-sm font-medium leading-snug text-inherit';
        textDiv.replaceWith(input);
        input.focus();
        input.select();

        let committed = false;
        const commitEdit = () => {
          if (committed) return;
          committed = true;
          const val = input.value.trim();
          if (val && val !== token.text) {
            pushHistory();
            token.text = val;
            saveToLocalStorage();
          }
          renderTokens();
          renderEdges();
        };

        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('blur', commitEdit);
        input.addEventListener('paste', async (e) => {
          const files = Array.from(e.clipboardData?.files || []);
          if (files.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          try {
            const mdLinks = await Promise.all(files.map(f => fileToMarkdownLink(f)));
            const insertText = mdLinks.join('\n');
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.value = input.value.slice(0, start) + (start > 0 ? '\n' : '') + insertText + input.value.slice(end);
            showToast(tr('已插入 Markdown 图片或文件链接'));
          } catch (err) {
            showToast(err.message);
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit();
          } else if (e.key === 'Escape') {
            committed = true;
            renderTokens();
          }
        });
      }

      // 计算两个 Token 之间的平滑贝塞尔曲线及锚点
      function computeEdgeGeometry(sourceToken, targetToken) {
        const sEl = tokensLayerEl.querySelector(`[data-id="${sourceToken.id}"]`);
        const tEl = tokensLayerEl.querySelector(`[data-id="${targetToken.id}"]`);
        const sW = sEl ? sEl.offsetWidth : 140;
        const sH = sEl ? sEl.offsetHeight : 42;
        const tW = tEl ? tEl.offsetWidth : 140;
        const tH = tEl ? tEl.offsetHeight : 42;

        const sCx = sourceToken.x + sW / 2;
        const sCy = sourceToken.y + sH / 2;
        const tCx = targetToken.x + tW / 2;
        const tCy = targetToken.y + tH / 2;

        const dx = tCx - sCx;
        const dy = tCy - sCy;

        let p1, p2, cp1, cp2;
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (dx >= 0) {
            p1 = { x: sourceToken.x + sW, y: sCy };
            p2 = { x: targetToken.x, y: tCy };
          } else {
            p1 = { x: sourceToken.x, y: sCy };
            p2 = { x: targetToken.x + tW, y: tCy };
          }
          const offset = Math.max(45, Math.abs(p2.x - p1.x) * 0.45);
          cp1 = { x: p1.x + (dx >= 0 ? offset : -offset), y: p1.y };
          cp2 = { x: p2.x + (dx >= 0 ? -offset : offset), y: p2.y };
        } else {
          if (dy >= 0) {
            p1 = { x: sCx, y: sourceToken.y + sH };
            p2 = { x: tCx, y: targetToken.y };
          } else {
            p1 = { x: sCx, y: sourceToken.y };
            p2 = { x: tCx, y: targetToken.y + tH };
          }
          const offset = Math.max(40, Math.abs(p2.y - p1.y) * 0.45);
          cp1 = { x: p1.x, y: p1.y + (dy >= 0 ? offset : -offset) };
          cp2 = { x: p2.x, y: p2.y + (dy >= 0 ? -offset : offset) };
        }

        const pathD = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
        const midX = 0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x;
        const midY = 0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y;

        return { pathD, midX, midY };
      }

      // 渲染连线 (Edges) 与关系标签
      function renderEdges() {
        edgesContainerEl.innerHTML = '';
        edgeLabelsLayerEl.innerHTML = '';
        const isDark = document.documentElement.classList.contains('dark');

        state.edges.forEach(edge => {
          const source = state.tokens.find(t => t.id === edge.source);
          const target = state.tokens.find(t => t.id === edge.target);
          if (!source || !target) return;

          const { pathD, midX, midY } = computeEdgeGeometry(source, target);
          const isSelected = selection.edges.has(edge.id);

          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', `edge-group ${isSelected ? 'selected' : ''}`);
          g.dataset.id = edge.id;

          const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          hitPath.setAttribute('d', pathD);
          hitPath.setAttribute('class', 'edge-path-hit');

          const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          visiblePath.setAttribute('d', pathD);
          visiblePath.setAttribute('class', 'edge-path-visible');
          const markerId = isSelected ? 'arrowhead-selected' : (isDark ? 'arrowhead-dark' : 'arrowhead');
          visiblePath.setAttribute('marker-end', `url(#${markerId})`);

          g.appendChild(hitPath);
          g.appendChild(visiblePath);

          const selectEdgeHandler = (e) => {
            if (activeTool !== 'select') return;
            e.stopPropagation();
            if (isMultiSelectModifier(e)) {
              if (selection.edges.has(edge.id)) {
                selection.edges.delete(edge.id);
              } else {
                selection.edges.add(edge.id);
              }
            } else {
              clearSelection();
              selection.edges.add(edge.id);
            }
            updateSelectionVisuals();
          };
          const editEdgeLabelHandler = (e) => {
            if (activeTool !== 'select') return;
            e.stopPropagation();
            openEdgeLabelEditor(edge, midX, midY);
          };

          hitPath.addEventListener('pointerdown', selectEdgeHandler);
          hitPath.addEventListener('dblclick', editEdgeLabelHandler);
          edgesContainerEl.appendChild(g);

          if (edge.label) {
            const labelBadge = document.createElement('div');
            labelBadge.className = `absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/95 dark:bg-zinc-800/95 border ${isSelected ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-stone-200 dark:border-zinc-700 text-stone-500 dark:text-zinc-400'} shadow-xs cursor-pointer hover:border-blue-400 transition`;
            labelBadge.style.left = `${midX}px`;
            labelBadge.style.top = `${midY}px`;
            labelBadge.textContent = edge.label;
            labelBadge.addEventListener('pointerdown', selectEdgeHandler);
            labelBadge.addEventListener('dblclick', editEdgeLabelHandler);
            edgeLabelsLayerEl.appendChild(labelBadge);
          }
        });
      }

      // 双击连线编辑关系标签
      function openEdgeLabelEditor(edge, worldX, worldY) {
        const screenPos = worldToScreen(worldX, worldY);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = edge.label || '';
        input.placeholder = tr('输入关系标签...');
        input.className = 'fixed z-50 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full text-xs bg-white dark:bg-zinc-800 border border-blue-500 shadow-float outline-none text-stone-800 dark:text-zinc-100 text-center min-w-[110px]';
        input.style.left = `${screenPos.x}px`;
        input.style.top = `${screenPos.y}px`;
        document.body.appendChild(input);
        input.focus();
        input.select();

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          const val = input.value.trim();
          if (val !== (edge.label || '')) {
            pushHistory();
            edge.label = val;
            saveToLocalStorage();
          }
          input.remove();
          renderEdges();
        };

        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish();
          if (e.key === 'Escape') {
            done = true;
            input.remove();
          }
        });
      }

      // 整体重绘
      function renderAll() {
        boardTitleInputEl.value = state.title;
        renderClusters();
        renderDrawings();
        renderTokens();
        renderEdges();
        applyViewportTransform();
        updateSelectionVisuals();
      }

      // 清空选中态
      function clearSelection() {
        selection.tokens.clear();
        selection.edges.clear();
        selection.clusters.clear();
        selection.drawings.clear();
        updateSelectionVisuals();
      }

      // 更新选中高亮与悬浮工具栏显隐
      function updateSelectionVisuals() {
        tokensLayerEl.querySelectorAll('.token-node').forEach(el => {
          el.classList.toggle('selected', selection.tokens.has(el.dataset.id));
        });
        clustersLayerEl.querySelectorAll('.cluster-box').forEach(el => {
          el.classList.toggle('selected', selection.clusters.has(el.dataset.id));
        });
        renderDrawings();
        renderEdges();

        const totalSelected = selection.tokens.size + selection.edges.size + selection.clusters.size + selection.drawings.size;
        if (totalSelected > 0) {
          floatingToolbarEl.classList.remove('hidden');
          const hasColorables = selection.tokens.size > 0 || selection.drawings.size > 0 || selection.clusters.size > 0;
          const canDuplicate = selection.tokens.size > 0 || selection.drawings.size > 0 || selection.clusters.size > 0;
          document.getElementById('toolbar-colors').classList.toggle('hidden', !hasColorables);
          document.getElementById('toolbar-divider-1').classList.toggle('hidden', !hasColorables);

          const edgeLabelBtn = document.getElementById('btn-toolbar-edge-label');
          if (edgeLabelBtn) {
            edgeLabelBtn.classList.toggle('hidden', selection.edges.size !== 1);
            edgeLabelBtn.classList.toggle('flex', selection.edges.size === 1);
          }

          document.getElementById('btn-toolbar-branch').classList.toggle('hidden', selection.tokens.size !== 1);
          const dupBtn = document.getElementById('btn-toolbar-duplicate');
          if (dupBtn) dupBtn.classList.toggle('hidden', !canDuplicate);

          const alignGroup = document.getElementById('toolbar-align-group');
          if (alignGroup) {
            alignGroup.classList.toggle('hidden', selection.tokens.size < 2);
            alignGroup.classList.toggle('flex', selection.tokens.size >= 2);
          }

          document.getElementById('btn-toolbar-group').classList.toggle('hidden', selection.tokens.size === 0);
          updateFloatingToolbarPosition();
        } else {
          floatingToolbarEl.classList.add('hidden');
        }
      }

      // 计算悬浮工具栏屏幕位置
      function updateFloatingToolbarPosition() {
        if (floatingToolbarEl.classList.contains('hidden')) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity;

        selection.tokens.forEach(id => {
          const t = state.tokens.find(item => item.id === id);
          if (t) {
            minX = Math.min(minX, t.x);
            minY = Math.min(minY, t.y);
            maxX = Math.max(maxX, t.x + 140);
          }
        });

        selection.clusters.forEach(id => {
          const c = state.clusters.find(item => item.id === id);
          if (c) {
            minX = Math.min(minX, c.x);
            minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x + c.width);
          }
        });

        selection.drawings.forEach(id => {
          const d = state.drawings.find(item => item.id === id);
          if (d) {
            const b = getDrawingBounds(d);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
          }
        });

        if (minX === Infinity && selection.edges.size > 0) {
          const edgeId = Array.from(selection.edges)[0];
          const edge = state.edges.find(e => e.id === edgeId);
          if (edge) {
            const s = state.tokens.find(t => t.id === edge.source);
            const t = state.tokens.find(t => t.id === edge.target);
            if (s && t) {
              minX = (s.x + t.x) / 2;
              maxX = minX + 100;
              minY = (s.y + t.y) / 2;
            }
          }
        }

        if (minX === Infinity) return;

        const screenTopLeft = worldToScreen(minX, minY);
        const screenTopRight = worldToScreen(maxX, minY);
        const centerX = (screenTopLeft.x + screenTopRight.x) / 2;

        const tbWidth = floatingToolbarEl.offsetWidth || 280;
        const left = Math.max(16, Math.min(window.innerWidth - tbWidth - 16, centerX - tbWidth / 2));
        const top = Math.max(72, screenTopLeft.y - 54);

        floatingToolbarEl.style.left = `${left}px`;
        floatingToolbarEl.style.top = `${top}px`;
      }

      // 打开双击快速创建词条输入框
      function openQuickInput(clientX, clientY, worldX, worldY, parentTokenId = null) {
        interaction.pendingCreateWorldPos = { x: worldX, y: worldY };
        interaction.pendingParentTokenId = parentTokenId;

        quickInputBoxEl.classList.remove('hidden');
        const boxW = 240;
        const left = Math.max(16, Math.min(window.innerWidth - boxW - 16, clientX - 24));
        const top = Math.max(70, Math.min(window.innerHeight - 80, clientY - 20));
        quickInputBoxEl.style.left = `${left}px`;
        quickInputBoxEl.style.top = `${top}px`;

        quickInputFieldEl.value = '';
        quickInputFieldEl.placeholder = parentTokenId ? tr('输入新词块内容，按回车连接') : tr('输入词块内容，按回车添加');
        setTimeout(() => quickInputFieldEl.focus(), 10);
      }

      function closeQuickInput() {
        quickInputBoxEl.classList.add('hidden');
        interaction.pendingCreateWorldPos = null;
        interaction.pendingParentTokenId = null;
      }

      // 确认新建 Token
      function commitQuickInput() {
        const text = quickInputFieldEl.value.trim();
        const pos = interaction.pendingCreateWorldPos;
        const parentId = interaction.pendingParentTokenId;
        closeQuickInput();

        if (!text || !pos) return;

        pushHistory();
        const newToken = {
          id: uid('tk'),
          text,
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          color: parentId ? (state.tokens.find(t => t.id === parentId)?.color || 'neutral') : 'neutral'
        };
        state.tokens.push(newToken);

        if (parentId) {
          state.edges.push({
            id: uid('ed'),
            source: parentId,
            target: newToken.id,
            label: ''
          });
        }

        clearSelection();
        selection.tokens.add(newToken.id);
        renderAll();
        saveToLocalStorage();
      }

      // 快捷向右侧发散子词条
      function triggerQuickBranch(parentToken) {
        const parentEl = tokensLayerEl.querySelector(`[data-id="${parentToken.id}"]`);
        const pW = parentEl ? parentEl.offsetWidth : 140;
        const siblingCount = state.edges.filter(e => e.source === parentToken.id).length;
        const targetWorldX = parentToken.x + pW + 90;
        const targetWorldY = parentToken.y + (siblingCount % 2 === 0 ? siblingCount * 36 : -siblingCount * 36);
        const screenPos = worldToScreen(targetWorldX, targetWorldY);

        openQuickInput(screenPos.x, screenPos.y, targetWorldX, targetWorldY, parentToken.id);
      }

      // 拖拽创建连线
      function startConnectEdge(sourceId, clientX, clientY) {
        interaction.mode = 'connect-edge';
        interaction.connectSourceId = sourceId;
        const worldPos = screenToWorld(clientX, clientY);
        const sourceToken = state.tokens.find(t => t.id === sourceId);
        if (!sourceToken) return;

        tempEdgePathEl.classList.remove('hidden');
        tempEdgePathEl.setAttribute('d', `M ${sourceToken.x + 60} ${sourceToken.y + 20} L ${worldPos.x} ${worldPos.y}`);
      }

      // 将选中的 Token 聚合成空间群组 Cluster
      function groupSelectedTokens() {
        if (selection.tokens.size === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selection.tokens.forEach(id => {
          const t = state.tokens.find(item => item.id === id);
          const el = tokensLayerEl.querySelector(`[data-id="${id}"]`);
          if (t) {
            const w = el ? el.offsetWidth : 140;
            const h = el ? el.offsetHeight : 44;
            minX = Math.min(minX, t.x);
            minY = Math.min(minY, t.y);
            maxX = Math.max(maxX, t.x + w);
            maxY = Math.max(maxY, t.y + h);
          }
        });

        if (minX === Infinity) return;

        pushHistory();
        const newCluster = {
          id: uid('cl'),
          title: `${tr('群组')} #${state.clusters.length + 1}`,
          x: minX - 28,
          y: minY - 46,
          width: Math.max(200, (maxX - minX) + 56),
          height: Math.max(140, (maxY - minY) + 74),
          color: 'neutral'
        };
        state.clusters.push(newCluster);

        clearSelection();
        selection.clusters.add(newCluster.id);
        renderAll();
        saveToLocalStorage();
        showToast(tr('已创建群组，双击标题可重命名'));
      }

      // 删除所有选中元素
      function deleteSelectedItems() {
        if (selection.tokens.size === 0 && selection.edges.size === 0 && selection.clusters.size === 0 && selection.drawings.size === 0) return;
        pushHistory();

        if (selection.tokens.size > 0) {
          state.tokens = state.tokens.filter(t => !selection.tokens.has(t.id));
          state.edges = state.edges.filter(e => !selection.tokens.has(e.source) && !selection.tokens.has(e.target));
        }
        if (selection.edges.size > 0) {
          state.edges = state.edges.filter(e => !selection.edges.has(e.id));
        }
        if (selection.clusters.size > 0) {
          state.clusters = state.clusters.filter(c => !selection.clusters.has(c.id));
        }
        if (selection.drawings.size > 0) {
          state.drawings = state.drawings.filter(d => !selection.drawings.has(d.id));
        }

        clearSelection();
        renderAll();
        saveToLocalStorage();
      }

      // ================= 复制 / 粘贴 / 复制副本 / 全选 =================
      function captureSelectionPayload() {
        const tokenIds = new Set(selection.tokens);
        const tokens = state.tokens.filter(t => tokenIds.has(t.id)).map(t => cloneState(t));
        const edges = state.edges.filter(e => tokenIds.has(e.source) && tokenIds.has(e.target)).map(e => cloneState(e));
        const clusters = state.clusters.filter(c => selection.clusters.has(c.id)).map(c => cloneState(c));
        const drawings = state.drawings.filter(d => selection.drawings.has(d.id)).map(d => cloneState(d));
        if (tokens.length === 0 && clusters.length === 0 && drawings.length === 0) return null;
        return { tokens, edges, clusters, drawings };
      }

      function copySelectedItems() {
        const payload = captureSelectionPayload();
        if (!payload) return false;
        internalClipboard = payload;
        pasteStepCount = 0;
        showToast(tr('已复制选区'));
        return true;
      }

      function insertClonedPayload(payload, offsetX = 28, offsetY = 28) {
        if (!payload) return false;
        pushHistory();
        const idMap = new Map();
        const newTokens = [];
        const newClusters = [];
        const newDrawings = [];

        payload.tokens.forEach(t => {
          const newId = uid('tk');
          idMap.set(t.id, newId);
          newTokens.push({ ...cloneState(t), id: newId, x: Math.round(t.x + offsetX), y: Math.round(t.y + offsetY) });
        });

        payload.edges.forEach(e => {
          const sId = idMap.get(e.source);
          const tId = idMap.get(e.target);
          if (sId && tId) {
            state.edges.push({ id: uid('ed'), source: sId, target: tId, label: e.label || '' });
          }
        });

        payload.clusters.forEach(c => {
          const newId = uid('cl');
          newClusters.push({ ...cloneState(c), id: newId, x: Math.round(c.x + offsetX), y: Math.round(c.y + offsetY) });
        });

        payload.drawings.forEach(d => {
          const newId = uid('dr');
          const copy = cloneState(d);
          copy.id = newId;
          if (copy.type === 'rect' || copy.type === 'ellipse') {
            copy.x = Math.round(copy.x + offsetX);
            copy.y = Math.round(copy.y + offsetY);
          } else if (copy.type === 'line') {
            copy.x1 = Math.round(copy.x1 + offsetX);
            copy.y1 = Math.round(copy.y1 + offsetY);
            copy.x2 = Math.round(copy.x2 + offsetX);
            copy.y2 = Math.round(copy.y2 + offsetY);
          } else if (copy.type === 'pen' && Array.isArray(copy.points)) {
            copy.points = copy.points.map(p => ({ x: Math.round(p.x + offsetX), y: Math.round(p.y + offsetY) }));
          }
          newDrawings.push(copy);
        });

        state.tokens.push(...newTokens);
        state.clusters.push(...newClusters);
        state.drawings.push(...newDrawings);

        clearSelection();
        newTokens.forEach(t => selection.tokens.add(t.id));
        newClusters.forEach(c => selection.clusters.add(c.id));
        newDrawings.forEach(d => selection.drawings.add(d.id));

        renderAll();
        saveToLocalStorage();
        return true;
      }

      function pasteClipboardItems() {
        if (!internalClipboard) return false;
        pasteStepCount += 1;
        const offset = 28 * pasteStepCount;
        if (insertClonedPayload(internalClipboard, offset, offset)) {
          showToast(tr('已粘贴选区'));
          return true;
        }
        return false;
      }

      function duplicateSelectedItems() {
        const payload = captureSelectionPayload();
        if (!payload) return false;
        if (insertClonedPayload(payload, 28, 28)) {
          showToast(tr('已创建副本'));
          return true;
        }
        return false;
      }

      function selectAllItems() {
        state.tokens.forEach(t => selection.tokens.add(t.id));
        state.edges.forEach(e => selection.edges.add(e.id));
        state.clusters.forEach(c => selection.clusters.add(c.id));
        state.drawings.forEach(d => selection.drawings.add(d.id));
        updateSelectionVisuals();
      }

      // ================= 自动整理布局与对齐排列 =================
      function alignSelectedTokens(direction = 'row') {
        if (selection.tokens.size < 2) return;
        pushHistory();
        const selectedTokens = state.tokens.filter(t => selection.tokens.has(t.id));
        if (direction === 'row') {
          selectedTokens.sort((a, b) => a.x - b.x);
          const avgY = Math.round(selectedTokens.reduce((acc, t) => acc + t.y, 0) / selectedTokens.length);
          let curX = selectedTokens[0].x;
          selectedTokens.forEach(t => {
            const el = tokensLayerEl.querySelector(`[data-id="${t.id}"]`);
            const w = el ? el.offsetWidth : 136;
            t.x = Math.round(curX);
            t.y = avgY;
            curX += w + 28;
          });
        } else {
          selectedTokens.sort((a, b) => a.y - b.y);
          const avgX = Math.round(selectedTokens.reduce((acc, t) => acc + t.x, 0) / selectedTokens.length);
          let curY = selectedTokens[0].y;
          selectedTokens.forEach(t => {
            const el = tokensLayerEl.querySelector(`[data-id="${t.id}"]`);
            const h = el ? el.offsetHeight : 44;
            t.x = avgX;
            t.y = Math.round(curY);
            curY += h + 22;
          });
        }
        renderAll();
        saveToLocalStorage();
        showToast(tr('已对齐选中词块'));
      }

      function autoLayoutBoard() {
        if (state.tokens.length === 0) return;
        pushHistory();

        const targetTokens = selection.tokens.size >= 2
          ? state.tokens.filter(t => selection.tokens.has(t.id))
          : state.tokens;
        const targetSet = new Set(targetTokens.map(t => t.id));

        const inDegree = new Map();
        const children = new Map();
        targetTokens.forEach(t => {
          inDegree.set(t.id, 0);
          children.set(t.id, []);
        });

        state.edges.forEach(e => {
          if (targetSet.has(e.source) && targetSet.has(e.target)) {
            children.get(e.source).push(e.target);
            inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
          }
        });

        const roots = targetTokens.filter(t => (inDegree.get(t.id) || 0) === 0);
        const startX = Math.min(...targetTokens.map(t => t.x), -220);
        const startY = Math.min(...targetTokens.map(t => t.y), -160);

        const visited = new Set();
        const levels = new Map();
        const queue = [];

        (roots.length > 0 ? roots : [targetTokens[0]]).forEach(r => {
          queue.push({ id: r.id, level: 0 });
          visited.add(r.id);
        });

        while (queue.length > 0) {
          const { id, level } = queue.shift();
          if (!levels.has(level)) levels.set(level, []);
          levels.get(level).push(id);
          (children.get(id) || []).forEach(chId => {
            if (!visited.has(chId)) {
              visited.add(chId);
              queue.push({ id: chId, level: level + 1 });
            }
          });
        }

        targetTokens.forEach(t => {
          if (!visited.has(t.id)) {
            visited.add(t.id);
            if (!levels.has(0)) levels.set(0, []);
            levels.get(0).push(t.id);
          }
        });

        const colGap = 240;
        const rowGap = 76;
        levels.forEach((ids, lvl) => {
          const totalH = (ids.length - 1) * rowGap;
          ids.forEach((id, idx) => {
            const tok = state.tokens.find(t => t.id === id);
            if (tok) {
              tok.x = Math.round(startX + lvl * colGap);
              tok.y = Math.round(startY + idx * rowGap - totalH / 2 + 120);
            }
          });
        });

        // 同步吸附包裹群组的边界
        if (selection.tokens.size < 2 && state.clusters.length > 0) {
          state.clusters.forEach((c, idx) => {
            c.x = Math.round(startX + idx * 320 - 30);
            c.y = Math.round(startY - 60);
          });
        }

        renderAll();
        fitViewToContent();
        saveToLocalStorage();
        showToast(tr('已自动整理白板布局'));
      }

      // ================= 画布内快速搜索与定位 (Ctrl/Cmd + F) =================
      const searchPanelEl = document.getElementById('search-panel');
      const searchInputEl = document.getElementById('search-input');
      const searchCountEl = document.getElementById('search-count');
      const searchResultsListEl = document.getElementById('search-results-list');

      function clearSearchHighlights() {
        tokensLayerEl.querySelectorAll('.token-node.search-focus').forEach(el => el.classList.remove('search-focus'));
      }

      function performSearch(query) {
        clearSearchHighlights();
        const q = (query || '').trim().toLowerCase();
        searchMatches = [];
        searchActiveIndex = -1;
        searchResultsListEl.innerHTML = '';

        if (!q) {
          searchCountEl.textContent = '0/0';
          return;
        }

        state.tokens.forEach(t => {
          if (t.text.toLowerCase().includes(q)) {
            searchMatches.push({ type: 'token', id: t.id, label: t.text, x: t.x, y: t.y });
          }
        });
        state.clusters.forEach(c => {
          if (c.title.toLowerCase().includes(q)) {
            searchMatches.push({ type: 'cluster', id: c.id, label: `📁 ${c.title}`, x: c.x + c.width / 2, y: c.y + c.height / 2 });
          }
        });
        state.edges.forEach(e => {
          if (e.label && e.label.toLowerCase().includes(q)) {
            const s = state.tokens.find(t => t.id === e.source);
            const t = state.tokens.find(tok => tok.id === e.target);
            const mx = s && t ? (s.x + t.x) / 2 : 0;
            const my = s && t ? (s.y + t.y) / 2 : 0;
            searchMatches.push({ type: 'edge', id: e.id, label: `🔗 ${e.label}`, x: mx, y: my });
          }
        });

        if (searchMatches.length === 0) {
          searchCountEl.textContent = '0/0';
          return;
        }

        searchMatches.forEach((m, idx) => {
          const itemBtn = document.createElement('button');
          itemBtn.className = 'w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 truncate block transition';
          itemBtn.textContent = m.label;
          itemBtn.addEventListener('click', () => {
            focusSearchMatch(idx);
          });
          searchResultsListEl.appendChild(itemBtn);
        });

        focusSearchMatch(0);
      }

      function focusSearchMatch(index) {
        if (searchMatches.length === 0) return;
        searchActiveIndex = (index + searchMatches.length) % searchMatches.length;
        searchCountEl.textContent = `${searchActiveIndex + 1}/${searchMatches.length}`;

        const match = searchMatches[searchActiveIndex];
        clearSelection();
        clearSearchHighlights();

        if (match.type === 'token') {
          selection.tokens.add(match.id);
        } else if (match.type === 'cluster') {
          selection.clusters.add(match.id);
        } else if (match.type === 'edge') {
          selection.edges.add(match.id);
        }

        viewport.x = window.innerWidth / 2 - (match.x + 60) * viewport.scale;
        viewport.y = window.innerHeight / 2 - (match.y + 20) * viewport.scale;
        applyViewportTransform();
        updateSelectionVisuals();

        if (match.type === 'token') {
          const el = tokensLayerEl.querySelector(`[data-id="${match.id}"]`);
          if (el) el.classList.add('search-focus');
        }

        Array.from(searchResultsListEl.children).forEach((child, i) => {
          child.classList.toggle('bg-blue-50', i === searchActiveIndex);
          child.classList.toggle('dark:bg-blue-950/50', i === searchActiveIndex);
          child.classList.toggle('font-semibold', i === searchActiveIndex);
        });
      }

      function openSearchPanel() {
        searchPanelEl.classList.remove('hidden');
        searchInputEl.focus();
        searchInputEl.select();
        if (searchInputEl.value.trim()) performSearch(searchInputEl.value);
      }

      function closeSearchPanel() {
        searchPanelEl.classList.add('hidden');
        clearSearchHighlights();
      }

      // 一键适应画布自适应视口
      function fitViewToContent() {
        const hasAny = state.tokens.length > 0 || state.clusters.length > 0 || state.drawings.length > 0;
        if (!hasAny) {
          viewport = { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 };
          applyViewportTransform();
          return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.tokens.forEach(t => {
          minX = Math.min(minX, t.x);
          minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x + 160);
          maxY = Math.max(maxY, t.y + 50);
        });
        state.clusters.forEach(c => {
          minX = Math.min(minX, c.x);
          minY = Math.min(minY, c.y);
          maxX = Math.max(maxX, c.x + c.width);
          maxY = Math.max(maxY, c.y + c.height);
        });
        state.drawings.forEach(d => {
          const b = getDrawingBounds(d);
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        });

        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const padding = 120;
        const scaleX = (window.innerWidth - padding * 2) / Math.max(200, contentW);
        const scaleY = (window.innerHeight - padding * 2) / Math.max(200, contentH);
        const newScale = Math.max(0.35, Math.min(1.2, Math.min(scaleX, scaleY)));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        viewport.scale = newScale;
        viewport.x = window.innerWidth / 2 - centerX * newScale;
        viewport.y = window.innerHeight / 2 - centerY * newScale;
        applyViewportTransform();
        saveToLocalStorage();
      }

      // 生成结构化 Markdown 大纲
      function generateMarkdownOutline() {
        const lines = [`# ${state.title || tr('白板大纲')}`, ''];
        const assignedTokenIds = new Set();

        const childrenMap = new Map();
        state.edges.forEach(e => {
          if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
          childrenMap.get(e.source).push({ targetId: e.target, label: e.label });
        });

        function formatBranch(token, depth = 0, visited = new Set()) {
          if (!token || visited.has(token.id)) return;
          visited.add(token.id);
          const indent = '  '.repeat(depth);
          lines.push(`${indent}- **${token.text}**`);
          const children = childrenMap.get(token.id) || [];
          children.forEach(ch => {
            const childToken = state.tokens.find(t => t.id === ch.targetId);
            if (childToken && !visited.has(childToken.id)) {
              const relTag = ch.label ? ` *[${ch.label}]*` : '';
              const subIndent = '  '.repeat(depth + 1);
              lines.push(`${subIndent}- ${childToken.text}${relTag}`);
              visited.add(childToken.id);
              const grandChildren = childrenMap.get(childToken.id) || [];
              grandChildren.forEach(gc => {
                const gcToken = state.tokens.find(t => t.id === gc.targetId);
                if (gcToken) formatBranch(gcToken, depth + 2, visited);
              });
            }
          });
        }

        if (state.clusters.length > 0) {
          state.clusters.forEach(cluster => {
            const members = state.tokens.filter(t => {
              const cx = t.x + 60;
              const cy = t.y + 20;
              return cx >= cluster.x && cx <= cluster.x + cluster.width && cy >= cluster.y && cy <= cluster.y + cluster.height;
            });
            lines.push(`## 📁 ${cluster.title}`);
            if (members.length === 0) {
              lines.push(tr('- *(暂无归类词条)*'));
            } else {
              members.forEach(m => {
                assignedTokenIds.add(m.id);
                formatBranch(m, 0, new Set());
              });
            }
            lines.push('');
          });
        }

        const unassigned = state.tokens.filter(t => !assignedTokenIds.has(t.id));
        if (unassigned.length > 0) {
          lines.push(state.clusters.length > 0 ? tr('## 💡 未分组词块') : tr('## 词块'));
          const hasIncoming = new Set(state.edges.map(e => e.target));
          const roots = unassigned.filter(t => !hasIncoming.has(t.id));
          const visited = new Set();

          (roots.length > 0 ? roots : unassigned).forEach(r => {
            if (!visited.has(r.id)) formatBranch(r, 0, visited);
          });
          unassigned.forEach(t => {
            if (!visited.has(t.id)) formatBranch(t, 0, visited);
          });
          lines.push('');
        }

        return lines.join('\n');
      }

      // ================= 生成独立 SVG 矢量图与 PNG 光栅图 =================
      function escapeXml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function generateBoardSvg() {
        const isDark = document.documentElement.classList.contains('dark');
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        state.tokens.forEach(t => {
          const el = tokensLayerEl.querySelector(`[data-id="${t.id}"]`);
          const w = el ? el.offsetWidth : 150;
          const h = el ? el.offsetHeight : 44;
          minX = Math.min(minX, t.x);
          minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x + w);
          maxY = Math.max(maxY, t.y + h);
        });
        state.clusters.forEach(c => {
          minX = Math.min(minX, c.x);
          minY = Math.min(minY, c.y);
          maxX = Math.max(maxX, c.x + c.width);
          maxY = Math.max(maxY, c.y + c.height);
        });
        state.drawings.forEach(d => {
          const b = getDrawingBounds(d);
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        });

        if (minX === Infinity) {
          minX = -300; minY = -200; maxX = 300; maxY = 200;
        }

        const pad = 64;
        const vx = Math.floor(minX - pad);
        const vy = Math.floor(minY - pad);
        const vw = Math.max(400, Math.ceil(maxX - minX + pad * 2));
        const vh = Math.max(280, Math.ceil(maxY - minY + pad * 2));
        const bg = isDark ? '#141416' : '#f8f8f7';
        const edgeStroke = isDark ? '#52525b' : '#a8a29e';

        const cardThemes = {
          neutral: isDark ? { bg: '#202024', border: '#34343b', text: '#f4f4f5' } : { bg: '#ffffff', border: '#e7e5e4', text: '#1c1917' },
          yellow:  isDark ? { bg: '#362f12', border: '#715e18', text: '#fef08a' } : { bg: '#fef9c3', border: '#fde047', text: '#713f12' },
          blue:    isDark ? { bg: '#122b3d', border: '#1e5378', text: '#bae6fd' } : { bg: '#e0f2fe', border: '#7dd3fc', text: '#0c4a6e' },
          green:   isDark ? { bg: '#123322', border: '#1e633e', text: '#bbf7d0' } : { bg: '#dcfce7', border: '#86efac', text: '#14532d' },
          red:     isDark ? { bg: '#381619', border: '#73262c', text: '#fecaca' } : { bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' },
          purple:  isDark ? { bg: '#2b183d', border: '#582d82', text: '#e9d5ff' } : { bg: '#f3e8ff', border: '#d8b4fe', text: '#581c87' }
        };

        const parts = [];
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" style="font-family: Inter, 'Noto Sans SC', system-ui, sans-serif;">`);
        parts.push(`<defs><marker id="export-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${edgeStroke}"/></marker></defs>`);
        parts.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${bg}"/>`);

        // 1. 群组层
        state.clusters.forEach(c => {
          const pal = STROKE_PALETTE[c.color || 'neutral'] || STROKE_PALETTE.neutral;
          const fill = isDark ? pal.fillDark : pal.fillLight;
          const stroke = isDark ? pal.dark : pal.light;
          parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="6,4"/>`);
          parts.push(`<text x="${c.x + 18}" y="${c.y + 26}" fill="${isDark ? '#d4d4d8' : '#57534e'}" font-size="12" font-weight="bold">${escapeXml(c.title)}</text>`);
        });

        // 2. 手绘与图形层
        state.drawings.forEach(d => {
          const pal = STROKE_PALETTE[d.color || 'neutral'] || STROKE_PALETTE.neutral;
          const stroke = isDark ? pal.dark : pal.light;
          const fill = isDark ? pal.fillDark : pal.fillLight;
          const sw = d.strokeWidth || 3;
          if (d.type === 'pen' && d.points?.length > 0) {
            parts.push(`<path d="${buildSmoothPenPath(d.points)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
          } else if (d.type === 'rect') {
            parts.push(`<rect x="${d.x}" y="${d.y}" width="${Math.max(2, d.width)}" height="${Math.max(2, d.height)}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${d.strokeWidth || 2.5}"/>`);
          } else if (d.type === 'ellipse') {
            parts.push(`<ellipse cx="${d.x + d.width / 2}" cy="${d.y + d.height / 2}" rx="${Math.max(2, d.width / 2)}" ry="${Math.max(2, d.height / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${d.strokeWidth || 2.5}"/>`);
          } else if (d.type === 'line') {
            parts.push(`<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`);
          }
        });

        // 3. 连线与标签层
        state.edges.forEach(edge => {
          const source = state.tokens.find(t => t.id === edge.source);
          const target = state.tokens.find(t => t.id === edge.target);
          if (!source || !target) return;
          const { pathD, midX, midY } = computeEdgeGeometry(source, target);
          parts.push(`<path d="${pathD}" fill="none" stroke="${edgeStroke}" stroke-width="2" marker-end="url(#export-arrow)"/>`);
          if (edge.label) {
            const lw = Math.max(48, edge.label.length * 11 + 18);
            parts.push(`<rect x="${midX - lw / 2}" y="${midY - 11}" width="${lw}" height="22" rx="11" fill="${isDark ? '#27272a' : '#ffffff'}" stroke="${edgeStroke}" stroke-width="1"/>`);
            parts.push(`<text x="${midX}" y="${midY + 4}" text-anchor="middle" fill="${isDark ? '#a1a1aa' : '#78716c'}" font-size="11">${escapeXml(edge.label)}</text>`);
          }
        });

        // 4. 词块层
        state.tokens.forEach(t => {
          const el = tokensLayerEl.querySelector(`[data-id="${t.id}"]`);
          const w = el ? el.offsetWidth : Math.max(96, Math.min(280, t.text.length * 14 + 32));
          const h = el ? el.offsetHeight : 42;
          const th = cardThemes[t.color || 'neutral'] || cardThemes.neutral;
          parts.push(`<rect x="${t.x}" y="${t.y}" width="${w}" height="${h}" rx="14" fill="${th.bg}" stroke="${th.border}" stroke-width="1.5"/>`);
          parts.push(`<text x="${t.x + 16}" y="${t.y + h / 2 + 5}" fill="${th.text}" font-size="14" font-weight="500">${escapeXml(t.text)}</text>`);
        });

        parts.push('</svg>');
        return { svg: parts.join('\n'), width: vw, height: vh };
      }

      async function exportBoardAsPng() {
        try {
          const { svg, width, height } = generateBoardSvg();
          const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
          });
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);

          const dataUrl = canvas.toDataURL('image/png');
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          if (await window.desktop.export({ blob, dataUrl, text: '', extension: 'png', filename: `${state.title || 'MindFlow'}.png` })) {
            showToast(tr('已导出 PNG 图片'));
          }
        } catch (err) {
          showToast(err.message);
        }
      }

      // ================= 多白板与历史版本管理弹窗 =================
      const modalBoardsEl = document.getElementById('modal-boards');
      const boardsListContainerEl = document.getElementById('boards-list-container');
      const backupsListContainerEl = document.getElementById('backups-list-container');

      async function openBoardsModal() {
        await flushSave();
        await refreshBoardsModalList();
        modalBoardsEl.classList.remove('hidden');
      }

      async function refreshBoardsModalList() {
        if (!window.desktop.listBoards) return;
        const info = await window.desktop.listBoards();
        boardsListContainerEl.innerHTML = '';
        backupsListContainerEl.innerHTML = '';

        info.boards.forEach(b => {
          const isCurrent = b.boardId === info.activeBoardId;
          const row = document.createElement('div');
          row.className = `flex items-center justify-between px-3.5 py-2.5 rounded-2xl border ${isCurrent ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30' : 'border-stone-200 dark:border-zinc-800 bg-stone-50/60 dark:bg-zinc-800/50'}`;

          const left = document.createElement('div');
          left.className = 'min-w-0 flex-1 pr-2';
          const titleDiv = document.createElement('div');
          titleDiv.className = 'text-xs font-semibold text-stone-800 dark:text-zinc-100 truncate';
          titleDiv.textContent = b.title || tr('未命名白板');
          const metaDiv = document.createElement('div');
          metaDiv.className = 'text-[11px] text-stone-400 dark:text-zinc-500 mt-0.5';
          const timeStr = b.updatedAt ? new Date(b.updatedAt).toLocaleString() : '';
          metaDiv.textContent = `r${b.revision} · ${b.tokenCount ?? 0} ${tr('词块')} · ${timeStr}`;
          left.append(titleDiv, metaDiv);

          const actions = document.createElement('div');
          actions.className = 'flex items-center gap-1.5 shrink-0';
          if (isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'px-2 py-0.5 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400';
            badge.textContent = tr('当前使用中');
            actions.appendChild(badge);
          } else {
            const switchBtn = document.createElement('button');
            switchBtn.className = 'px-2.5 py-1 rounded-xl text-xs font-medium bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition';
            switchBtn.textContent = tr('切换');
            switchBtn.addEventListener('click', async () => {
              const doc = await window.desktop.switchBoard(b.boardId);
              acceptDocument(doc);
              await refreshBoardsModalList();
              showToast(tr('已切换白板'));
            });
            actions.appendChild(switchBtn);
          }

          if (info.boards.length > 1) {
            const delBtn = document.createElement('button');
            delBtn.className = 'px-2 py-1 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition';
            delBtn.textContent = tr('删除');
            delBtn.addEventListener('click', () => {
              showConfirm(tr('删除白板'), tr('确定要删除这张白板吗？此操作无法撤销。'), async () => {
                const doc = await window.desktop.deleteBoard(b.boardId);
                acceptDocument(doc);
                await refreshBoardsModalList();
                showToast(tr('已删除白板'));
              });
            });
            actions.appendChild(delBtn);
          }

          row.append(left, actions);
          boardsListContainerEl.appendChild(row);
        });

        if (!info.backups || info.backups.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'text-xs text-stone-400 dark:text-zinc-500 py-3 text-center';
          empty.textContent = tr('暂无历史修订快照');
          backupsListContainerEl.appendChild(empty);
        } else {
          info.backups.forEach(bk => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between px-3 py-2 rounded-xl border border-stone-200/80 dark:border-zinc-800 text-xs';
            const meta = document.createElement('span');
            meta.className = 'text-stone-600 dark:text-zinc-300 truncate pr-2';
            const timeStr = bk.updatedAt ? new Date(bk.updatedAt).toLocaleTimeString() : '';
            meta.textContent = `r${bk.revision} · ${bk.title} (${bk.tokenCount} ${tr('词块')}) · ${timeStr}`;
            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-medium border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 transition shrink-0';
            restoreBtn.textContent = tr('恢复此版本');
            restoreBtn.addEventListener('click', async () => {
              const doc = await window.desktop.restoreBackup(bk.revision);
              acceptDocument(doc);
              await refreshBoardsModalList();
              showToast(tr('已恢复到历史版本'));
            });
            row.append(meta, restoreBtn);
            backupsListContainerEl.appendChild(row);
          });
        }
      }

      // ================= 事件绑定 =================

      // 禁用画布右键默认菜单以支持右键平滑拖拽画布
      viewportEl.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.fixed, dialog')) e.preventDefault();
      });

      // 1. 双击画布空白处快速添加词块
      viewportEl.addEventListener('dblclick', (e) => {
        if (e.target !== viewportEl && e.target !== worldLayerEl && e.target.id !== 'edges-svg' && e.target.id !== 'drawings-svg') return;
        if (activeTool !== 'select') setActiveTool('select');
        const worldPos = screenToWorld(e.clientX, e.clientY);
        openQuickInput(e.clientX, e.clientY, worldPos.x - 55, worldPos.y - 20, null);
      });

      // 2. 画布 PointerDown（平移 / 双指缩放 / 橡皮擦 / 框选 / 自由画笔与图形绘制）
      viewportEl.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.fixed, dialog')) return;
        if (!quickInputBoxEl.classList.contains('hidden')) {
          commitQuickInput();
        }

        // 记录触控点，支持双指捏合缩放与双指平移
        if (e.pointerType === 'touch') {
          activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (activeTouchPointers.size === 2) {
            const pts = Array.from(activeTouchPointers.values());
            pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            pinchStartScale = viewport.scale;
            pinchStartCenter = screenToWorld((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
            interaction.mode = 'pinch';
            marqueeBoxEl.classList.add('hidden');
            return;
          }
        }

        if (e.button === 1 || e.button === 2 || (e.button === 0 && isSpacePressed)) {
          interaction.mode = 'pan';
          interaction.startClientX = e.clientX;
          interaction.startClientY = e.clientY;
          interaction.startViewportX = viewport.x;
          interaction.startViewportY = viewport.y;
          viewportEl.style.cursor = 'grabbing';
          return;
        }

        if (e.button === 0) {
          const worldPos = screenToWorld(e.clientX, e.clientY);

          // 橡皮擦模式：按下即开始擦除沿途笔迹与图形
          if (activeTool === 'eraser') {
            interaction.mode = 'erasing';
            interaction.erasedInStroke = false;
            updateEraserAt(worldPos.x, worldPos.y, true);
            return;
          }

          // 若当前为绘图工具模式（画笔 / 矩形 / 圆形 / 直线）
          if (activeTool !== 'select') {
            interaction.mode = 'drawing';
            interaction.startWorldX = worldPos.x;
            interaction.startWorldY = worldPos.y;
            interaction.hasMoved = false;

            if (activeTool === 'pen') {
              interaction.draftDrawing = {
                id: uid('dr'),
                type: 'pen',
                color: activeStrokeColor,
                strokeWidth: activeStrokeWidth,
                points: [{ x: worldPos.x, y: worldPos.y }]
              };
            } else if (activeTool === 'rect' || activeTool === 'ellipse') {
              interaction.draftDrawing = {
                id: uid('dr'),
                type: activeTool,
                color: activeStrokeColor,
                strokeWidth: activeStrokeWidth,
                x: worldPos.x,
                y: worldPos.y,
                width: 1,
                height: 1
              };
            } else if (activeTool === 'line') {
              interaction.draftDrawing = {
                id: uid('dr'),
                type: 'line',
                color: activeStrokeColor,
                strokeWidth: activeStrokeWidth,
                x1: worldPos.x,
                y1: worldPos.y,
                x2: worldPos.x,
                y2: worldPos.y
              };
            }

            tempDrawingContainerEl.innerHTML = '';
            tempDrawingContainerEl.appendChild(buildDrawingSvgElement(interaction.draftDrawing, true));
            return;
          }

          // 默认选择模式下启动框选
          const isAdditive = isMultiSelectModifier(e);
          if (!isAdditive) {
            clearSelection();
            interaction.marqueeBaseTokens.clear();
            interaction.marqueeBaseClusters.clear();
            interaction.marqueeBaseDrawings.clear();
          } else {
            interaction.marqueeBaseTokens = new Set(selection.tokens);
            interaction.marqueeBaseClusters = new Set(selection.clusters);
            interaction.marqueeBaseDrawings = new Set(selection.drawings);
          }
          interaction.mode = 'marquee';
          interaction.startClientX = e.clientX;
          interaction.startClientY = e.clientY;
          marqueeBoxEl.style.left = `${e.clientX}px`;
          marqueeBoxEl.style.top = `${e.clientY}px`;
          marqueeBoxEl.style.width = '0px';
          marqueeBoxEl.style.height = '0px';
          marqueeBoxEl.classList.remove('hidden');
        }
      });

      // 3. 全局 PointerMove
      window.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' && activeTouchPointers.has(e.pointerId)) {
          activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (interaction.mode === 'pinch' && activeTouchPointers.size === 2) {
            const pts = Array.from(activeTouchPointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            const newScale = Math.max(0.25, Math.min(2.5, pinchStartScale * (dist / pinchStartDist)));
            viewport.scale = newScale;
            if (pinchStartCenter) {
              viewport.x = midX - pinchStartCenter.x * newScale;
              viewport.y = midY - pinchStartCenter.y * newScale;
            }
            applyViewportTransform();
            return;
          }
        }

        // 橡皮擦悬停或拖拽擦除
        if (activeTool === 'eraser' && (interaction.mode === 'idle' || interaction.mode === 'erasing')) {
          const wp = screenToWorld(e.clientX, e.clientY);
          updateEraserAt(wp.x, wp.y, interaction.mode === 'erasing');
          if (interaction.mode === 'erasing') return;
        }

        if (interaction.mode === 'idle') return;

        if (interaction.mode === 'pan') {
          viewport.x = interaction.startViewportX + (e.clientX - interaction.startClientX);
          viewport.y = interaction.startViewportY + (e.clientY - interaction.startClientY);
          applyViewportTransform();
          return;
        }

        if (interaction.mode === 'drawing' && interaction.draftDrawing) {
          const wp = screenToWorld(e.clientX, e.clientY);
          const dist = Math.hypot(wp.x - interaction.startWorldX, wp.y - interaction.startWorldY);
          if (dist > 1.5 / viewport.scale) interaction.hasMoved = true;

          const d = interaction.draftDrawing;
          if (d.type === 'pen') {
            const lastPt = d.points[d.points.length - 1];
            if (Math.hypot(wp.x - lastPt.x, wp.y - lastPt.y) > 1.8 / viewport.scale) {
              d.points.push({ x: wp.x, y: wp.y });
            }
          } else if (d.type === 'rect' || d.type === 'ellipse') {
            d.x = Math.min(interaction.startWorldX, wp.x);
            d.y = Math.min(interaction.startWorldY, wp.y);
            d.width = Math.abs(wp.x - interaction.startWorldX);
            d.height = Math.abs(wp.y - interaction.startWorldY);
          } else if (d.type === 'line') {
            let x2 = wp.x;
            let y2 = wp.y;
            // 按住 Shift 自动吸附 45° 水平/垂直/对角线
            if (e.shiftKey) {
              const dx = x2 - d.x1;
              const dy = y2 - d.y1;
              const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
              const len = Math.hypot(dx, dy);
              x2 = d.x1 + Math.cos(angle) * len;
              y2 = d.y1 + Math.sin(angle) * len;
            }
            d.x2 = x2;
            d.y2 = y2;
          }

          tempDrawingContainerEl.innerHTML = '';
          tempDrawingContainerEl.appendChild(buildDrawingSvgElement(d, true));
          return;
        }

        if (interaction.mode === 'marquee') {
          const left = Math.min(interaction.startClientX, e.clientX);
          const top = Math.min(interaction.startClientY, e.clientY);
          const width = Math.abs(e.clientX - interaction.startClientX);
          const height = Math.abs(e.clientY - interaction.startClientY);

          marqueeBoxEl.style.left = `${left}px`;
          marqueeBoxEl.style.top = `${top}px`;
          marqueeBoxEl.style.width = `${width}px`;
          marqueeBoxEl.style.height = `${height}px`;

          const wTopLeft = screenToWorld(left, top);
          const wBottomRight = screenToWorld(left + width, top + height);

          selection.tokens = new Set(interaction.marqueeBaseTokens);
          state.tokens.forEach(t => {
            if (t.x + 120 >= wTopLeft.x && t.x <= wBottomRight.x && t.y + 40 >= wTopLeft.y && t.y <= wBottomRight.y) {
              selection.tokens.add(t.id);
            }
          });

          selection.clusters = new Set(interaction.marqueeBaseClusters);
          state.clusters.forEach(c => {
            if (c.x + c.width >= wTopLeft.x && c.x <= wBottomRight.x && c.y + c.height >= wTopLeft.y && c.y <= wBottomRight.y) {
              selection.clusters.add(c.id);
            }
          });

          selection.drawings = new Set(interaction.marqueeBaseDrawings);
          state.drawings.forEach(d => {
            const b = getDrawingBounds(d);
            if (b.x + b.width >= wTopLeft.x && b.x <= wBottomRight.x && b.y + b.height >= wTopLeft.y && b.y <= wBottomRight.y) {
              selection.drawings.add(d.id);
            }
          });

          updateSelectionVisuals();
          return;
        }

        if (interaction.mode === 'drag-items') {
          const dx = (e.clientX - interaction.startClientX) / viewport.scale;
          const dy = (e.clientY - interaction.startClientY) / viewport.scale;
          if (!interaction.hasMoved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
            interaction.hasMoved = true;
            interaction.pendingToggleItem = null;
            pushHistory();
          }
          if (interaction.hasMoved) {
            selection.tokens.forEach(id => {
              const initPos = interaction.initialPositions.get(`token:${id}`);
              const token = state.tokens.find(t => t.id === id);
              if (initPos && token) {
                token.x = Math.round(initPos.x + dx);
                token.y = Math.round(initPos.y + dy);
                const el = tokensLayerEl.querySelector(`[data-id="${id}"]`);
                if (el) {
                  el.style.left = `${token.x}px`;
                  el.style.top = `${token.y}px`;
                }
              }
            });

            if (selection.drawings.size > 0) {
              selection.drawings.forEach(id => {
                const initPos = interaction.initialPositions.get(`drawing:${id}`);
                const d = state.drawings.find(item => item.id === id);
                if (initPos && d) {
                  if (d.type === 'rect' || d.type === 'ellipse') {
                    d.x = Math.round(initPos.x + dx);
                    d.y = Math.round(initPos.y + dy);
                  } else if (d.type === 'line') {
                    d.x1 = Math.round(initPos.x1 + dx);
                    d.y1 = Math.round(initPos.y1 + dy);
                    d.x2 = Math.round(initPos.x2 + dx);
                    d.y2 = Math.round(initPos.y2 + dy);
                  } else if (d.type === 'pen') {
                    d.points = initPos.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                  }
                }
              });
              renderDrawings();
            }

            renderEdges();
            updateFloatingToolbarPosition();
          }
          return;
        }

        if (interaction.mode === 'drag-cluster') {
          const dx = (e.clientX - interaction.startClientX) / viewport.scale;
          const dy = (e.clientY - interaction.startClientY) / viewport.scale;
          if (!interaction.hasMoved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
            interaction.hasMoved = true;
            pushHistory();
          }
          if (interaction.hasMoved) {
            const cluster = state.clusters.find(c => c.id === interaction.activeClusterId);
            const cInit = interaction.initialPositions.get(interaction.activeClusterId);
            if (cluster && cInit) {
              cluster.x = Math.round(cInit.x + dx);
              cluster.y = Math.round(cInit.y + dy);
              const cEl = clustersLayerEl.querySelector(`[data-id="${cluster.id}"]`);
              if (cEl) {
                cEl.style.left = `${cluster.x}px`;
                cEl.style.top = `${cluster.y}px`;
              }
            }
            interaction.initialPositions.forEach((initPos, id) => {
              if (id === interaction.activeClusterId) return;
              const token = state.tokens.find(t => t.id === id);
              if (token) {
                token.x = Math.round(initPos.x + dx);
                token.y = Math.round(initPos.y + dy);
                const tEl = tokensLayerEl.querySelector(`[data-id="${id}"]`);
                if (tEl) {
                  tEl.style.left = `${token.x}px`;
                  tEl.style.top = `${token.y}px`;
                }
              }
            });
            renderEdges();
            updateFloatingToolbarPosition();
          }
          return;
        }

        if (interaction.mode === 'resize-cluster') {
          const dx = (e.clientX - interaction.startClientX) / viewport.scale;
          const dy = (e.clientY - interaction.startClientY) / viewport.scale;
          const cluster = state.clusters.find(c => c.id === interaction.activeClusterId);
          if (cluster && interaction.initialClusterRect) {
            cluster.width = Math.max(180, Math.round(interaction.initialClusterRect.width + dx));
            cluster.height = Math.max(120, Math.round(interaction.initialClusterRect.height + dy));
            const cEl = clustersLayerEl.querySelector(`[data-id="${cluster.id}"]`);
            if (cEl) {
              cEl.style.width = `${cluster.width}px`;
              cEl.style.height = `${cluster.height}px`;
            }
            updateFloatingToolbarPosition();
          }
          return;
        }

        if (interaction.mode === 'connect-edge') {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          const sourceToken = state.tokens.find(t => t.id === interaction.connectSourceId);
          if (sourceToken) {
            const sX = sourceToken.x + 60;
            const sY = sourceToken.y + 20;
            tempEdgePathEl.setAttribute('d', `M ${sX} ${sY} C ${(sX + worldPos.x) / 2} ${sY}, ${(sX + worldPos.x) / 2} ${worldPos.y}, ${worldPos.x} ${worldPos.y}`);
          }
        }
      });

      // 4. 全局 PointerUp
      window.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'touch') {
          activeTouchPointers.delete(e.pointerId);
          if (interaction.mode === 'pinch') {
            if (activeTouchPointers.size < 2) interaction.mode = 'idle';
            return;
          }
        }

        if (interaction.mode === 'pan') {
          viewportEl.style.cursor = isSpacePressed ? 'grab' : (activeTool === 'select' ? 'default' : (activeTool === 'eraser' ? 'cell' : 'crosshair'));
        } else if (interaction.mode === 'erasing') {
          if (interaction.erasedInStroke) {
            saveToLocalStorage();
          }
          interaction.erasedInStroke = false;
        } else if (interaction.mode === 'drawing') {
          tempDrawingContainerEl.innerHTML = '';
          const d = interaction.draftDrawing;
          // 画笔允许单点点击落墨或连续涂鸦；几何图形要求有一定拖拽位移
          const validStroke = d && (d.type === 'pen' ? d.points.length >= 1 && (interaction.hasMoved || d.points.length === 1) : interaction.hasMoved);
          if (validStroke && (d.type !== 'pen' || interaction.hasMoved)) {
            pushHistory();
            state.drawings.push(d);
            renderDrawings();
            saveToLocalStorage();
            // 矩形、圆形、直线绘制完成后自动切回选择指针，方便立即调整位置；画笔保持连续涂鸦体验
            if (d.type !== 'pen') {
              setActiveTool('select');
              selection.drawings.add(d.id);
              updateSelectionVisuals();
            }
          }
          interaction.draftDrawing = null;
        } else if (interaction.mode === 'marquee') {
          marqueeBoxEl.classList.add('hidden');
        } else if (interaction.mode === 'drag-items') {
          if (interaction.pendingToggleItem && !interaction.hasMoved) {
            if (interaction.pendingToggleItem.type === 'token') {
              selection.tokens.delete(interaction.pendingToggleItem.id);
            } else if (interaction.pendingToggleItem.type === 'drawing') {
              selection.drawings.delete(interaction.pendingToggleItem.id);
            }
            updateSelectionVisuals();
          } else if (interaction.hasMoved) {
            saveToLocalStorage();
          }
          interaction.pendingToggleItem = null;
        } else if (interaction.mode === 'drag-cluster' || interaction.mode === 'resize-cluster') {
          saveToLocalStorage();
        } else if (interaction.mode === 'connect-edge') {
          tempEdgePathEl.classList.add('hidden');
          const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.token-node');
          const targetId = targetEl?.dataset?.id;
          if (targetId && targetId !== interaction.connectSourceId) {
            const exists = state.edges.some(ed => ed.source === interaction.connectSourceId && ed.target === targetId);
            if (!exists) {
              pushHistory();
              state.edges.push({
                id: uid('ed'),
                source: interaction.connectSourceId,
                target: targetId,
                label: ''
              });
              renderEdges();
              saveToLocalStorage();
            }
          }
        }
        interaction.mode = 'idle';
      });

      // 5. 滚轮缩放与平移
      viewportEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
          const newScale = Math.max(0.25, Math.min(2.5, viewport.scale * zoomFactor));
          const worldBefore = screenToWorld(e.clientX, e.clientY);
          viewport.scale = newScale;
          viewport.x = e.clientX - worldBefore.x * newScale;
          viewport.y = e.clientY - worldBefore.y * newScale;
        } else {
          viewport.x -= e.deltaX;
          viewport.y -= e.deltaY;
        }
        applyViewportTransform();
      }, { passive: false });

      // 6. 键盘快捷键与空格平移状态
      window.addEventListener('keydown', (e) => {
        if(document.querySelector('dialog[open]') || ['modal-export','modal-shortcuts','modal-confirm','modal-boards'].some(id=>!document.getElementById(id)?.classList.contains('hidden'))) return;

        // 全局支持 Ctrl/Cmd + F 唤起搜索面板，Ctrl/Cmd + B 打开白板列表
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          openSearchPanel();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          openBoardsModal();
          return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.code === 'Space' && !isSpacePressed) {
          e.preventDefault();
          isSpacePressed = true;
          viewportEl.style.cursor = 'grab';
          return;
        }

        // 工具切换快捷键
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'v') { setActiveTool('select'); return; }
          if (k === 'p') { setActiveTool('pen'); return; }
          if (k === 'e') { setActiveTool('eraser'); return; }
          if (k === 'r') { setActiveTool('rect'); return; }
          if (k === 'o') { setActiveTool('ellipse'); return; }
          if (k === 'l') { setActiveTool('line'); return; }
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          if (copySelectedItems()) e.preventDefault();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          if (pasteClipboardItems()) e.preventDefault();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicateSelectedItems();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          selectAllItems();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
          e.preventDefault();
          groupSelectedTokens();
          return;
        }

        if (e.key === 'Tab' && selection.tokens.size === 1) {
          e.preventDefault();
          const id = Array.from(selection.tokens)[0];
          const token = state.tokens.find(t => t.id === id);
          if (token) triggerQuickBranch(token);
          return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteSelectedItems();
          return;
        }

        if (e.key === 'Escape') {
          if (!searchPanelEl.classList.contains('hidden')) {
            closeSearchPanel();
            return;
          }
          if (activeTool !== 'select') setActiveTool('select');
          clearSelection();
          closeQuickInput();
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          isSpacePressed = false;
          viewportEl.style.cursor = activeTool === 'select' ? 'default' : (activeTool === 'eraser' ? 'cell' : 'crosshair');
        }
      });

      // 7. 底部绘图工具坞事件绑定
      document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setActiveTool(btn.dataset.tool);
        });
      });

      document.querySelectorAll('.dock-width-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          activeStrokeWidth = Number(btn.dataset.strokeWidth) || 3.5;
          document.querySelectorAll('.dock-width-btn').forEach(b => {
            b.className = 'dock-width-btn w-5 h-5 rounded-lg flex items-center justify-center hover:bg-stone-100 dark:hover:bg-zinc-800 transition';
          });
          btn.className = 'dock-width-btn w-5 h-5 rounded-lg flex items-center justify-center bg-stone-200/80 dark:bg-zinc-700 transition';
        });
      });

      document.querySelectorAll('.dock-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          activeStrokeColor = btn.dataset.strokeColor;
          document.querySelectorAll('.dock-color-btn').forEach(b => {
            b.classList.remove('ring-2', 'ring-offset-1', 'ring-blue-500');
          });
          btn.classList.add('ring-2', 'ring-offset-1', 'ring-blue-500');
        });
      });

      // 8. 快速输入框、图片/文件粘贴与拖拽转化为 Markdown 链接
      async function insertFilesAsMarkdown(files, worldPos = null) {
        const list = Array.from(files || []);
        if (list.length === 0) return false;
        try {
          const mdLinks = await Promise.all(list.map(f => fileToMarkdownLink(f)));
          pushHistory();

          // 如果当前恰好选中了单个词块且没有显式指定拖拽落点，则追加到该选中词块中
          if (!worldPos && selection.tokens.size === 1) {
            const targetId = Array.from(selection.tokens)[0];
            const targetToken = state.tokens.find(t => t.id === targetId);
            if (targetToken) {
              targetToken.text = targetToken.text
                ? `${targetToken.text}\n${mdLinks.join('\n')}`
                : mdLinks.join('\n');
              renderAll();
              saveToLocalStorage();
              showToast(tr('已插入 Markdown 图片或文件链接'));
              return true;
            }
          }

          // 否则在目标位置或视口中心创建新的 Markdown 链接词块
          const baseWorld = worldPos || screenToWorld(window.innerWidth / 2 - 70, window.innerHeight / 2 - 30);
          clearSelection();
          mdLinks.forEach((md, idx) => {
            const newToken = {
              id: uid('tk'),
              text: md,
              x: Math.round(baseWorld.x + idx * 32),
              y: Math.round(baseWorld.y + idx * 32),
              color: 'neutral'
            };
            state.tokens.push(newToken);
            selection.tokens.add(newToken.id);
          });
          renderAll();
          saveToLocalStorage();
          showToast(tr('已插入 Markdown 图片或文件链接'));
          return true;
        } catch (err) {
          showToast(err.message);
          return false;
        }
      }

      quickInputFieldEl.addEventListener('paste', async (e) => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          const mdLinks = await Promise.all(files.map(f => fileToMarkdownLink(f)));
          const insertText = mdLinks.join(' ');
          const start = quickInputFieldEl.selectionStart ?? quickInputFieldEl.value.length;
          const end = quickInputFieldEl.selectionEnd ?? quickInputFieldEl.value.length;
          quickInputFieldEl.value = quickInputFieldEl.value.slice(0, start) + insertText + quickInputFieldEl.value.slice(end);
          showToast(tr('已插入 Markdown 图片或文件链接'));
        } catch (err) {
          showToast(err.message);
        }
      });

      // 全局粘贴图片、文件、网页 URL 或内部复制选区
      window.addEventListener('paste', async (e) => {
        if (document.querySelector('dialog[open]') || ['modal-export', 'modal-shortcuts', 'modal-confirm', 'modal-boards'].some(id => !document.getElementById(id)?.classList.contains('hidden'))) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

        const files = Array.from(e.clipboardData?.files || []);
        if (files.length > 0) {
          e.preventDefault();
          await insertFilesAsMarkdown(files);
          return;
        }

        const plain = (e.clipboardData?.getData('text/plain') || '').trim();
        if (plain) {
          const isSingleUrl = /^https?:\/\/[^\s)]+$/i.test(plain);
          const isMdLink = /^!?\[[^\]]*\]\([^)\s]+\)$/.test(plain);
          if (isSingleUrl || isMdLink) {
            e.preventDefault();
            const mdText = isMdLink
              ? plain
              : (/\.(png|jpe?g|gif|webp|svg)(\?[^\s]*)?$/i.test(plain) ? `![image](${plain})` : `[${plain}](${plain})`);
            pushHistory();
            if (selection.tokens.size === 1) {
              const targetId = Array.from(selection.tokens)[0];
              const targetToken = state.tokens.find(t => t.id === targetId);
              if (targetToken) {
                targetToken.text = `${targetToken.text}\n${mdText}`;
              }
            } else {
              const center = screenToWorld(window.innerWidth / 2 - 70, window.innerHeight / 2 - 25);
              const newToken = { id: uid('tk'), text: mdText, x: Math.round(center.x), y: Math.round(center.y), color: 'neutral' };
              state.tokens.push(newToken);
              clearSelection();
              selection.tokens.add(newToken.id);
            }
            renderAll();
            saveToLocalStorage();
            showToast(tr('已插入 Markdown 图片或文件链接'));
            return;
          }
        }

        if (internalClipboard) {
          e.preventDefault();
          pasteClipboardItems();
        }
      });

      // 支持从桌面拖拽图片或文件到白板画布，自动在落点生成 Markdown 链接词块
      viewportEl.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      });
      viewportEl.addEventListener('drop', async (e) => {
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length === 0) return;
        e.preventDefault();
        const dropWorld = screenToWorld(e.clientX - 60, e.clientY - 24);
        await insertFilesAsMarkdown(files, dropWorld);
      });

      document.getElementById('input-attach-file')?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        await insertFilesAsMarkdown(files);
      });

      quickInputFieldEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitQuickInput();
        } else if (e.key === 'Escape') {
          closeQuickInput();
        }
      });
      quickInputConfirmEl.addEventListener('click', commitQuickInput);

      floatingToolbarEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });

      document.querySelectorAll('#toolbar-colors button').forEach(btn => {
        btn.addEventListener('click', () => {
          const color = btn.dataset.color;
          if (!color) return;
          if (selection.tokens.size === 0 && selection.drawings.size === 0 && selection.clusters.size === 0) return;

          pushHistory();
          selection.tokens.forEach(id => {
            const t = state.tokens.find(item => item.id === id);
            if (t) t.color = color;
          });
          selection.drawings.forEach(id => {
            const d = state.drawings.find(item => item.id === id);
            if (d) d.color = color;
          });
          selection.clusters.forEach(id => {
            const c = state.clusters.find(item => item.id === id);
            if (c) c.color = color;
          });

          renderClusters();
          renderTokens();
          renderDrawings();
          saveToLocalStorage();
        });
      });

      document.getElementById('btn-toolbar-edge-label')?.addEventListener('click', () => {
        if (selection.edges.size === 1) {
          const edgeId = Array.from(selection.edges)[0];
          const edge = state.edges.find(e => e.id === edgeId);
          if (edge) {
            const s = state.tokens.find(t => t.id === edge.source);
            const t = state.tokens.find(tok => tok.id === edge.target);
            if (s && t) {
              const { midX, midY } = computeEdgeGeometry(s, t);
              openEdgeLabelEditor(edge, midX, midY);
            }
          }
        }
      });

      document.getElementById('btn-toolbar-branch').addEventListener('click', () => {
        if (selection.tokens.size === 1) {
          const id = Array.from(selection.tokens)[0];
          const token = state.tokens.find(t => t.id === id);
          if (token) triggerQuickBranch(token);
        }
      });

      document.getElementById('btn-toolbar-duplicate')?.addEventListener('click', duplicateSelectedItems);
      document.getElementById('btn-align-row')?.addEventListener('click', () => alignSelectedTokens('row'));
      document.getElementById('btn-align-col')?.addEventListener('click', () => alignSelectedTokens('col'));
      document.getElementById('btn-toolbar-group').addEventListener('click', groupSelectedTokens);
      document.getElementById('btn-toolbar-delete').addEventListener('click', deleteSelectedItems);

      // 8.5 搜索面板与多白板弹窗事件
      document.getElementById('btn-search-toggle')?.addEventListener('click', () => {
        if (searchPanelEl.classList.contains('hidden')) openSearchPanel();
        else closeSearchPanel();
      });
      document.getElementById('btn-search-close')?.addEventListener('click', closeSearchPanel);
      document.getElementById('btn-search-next')?.addEventListener('click', () => focusSearchMatch(searchActiveIndex + 1));
      document.getElementById('btn-search-prev')?.addEventListener('click', () => focusSearchMatch(searchActiveIndex - 1));
      searchInputEl?.addEventListener('input', (e) => performSearch(e.target.value));
      searchInputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          focusSearchMatch(e.shiftKey ? searchActiveIndex - 1 : searchActiveIndex + 1);
        } else if (e.key === 'Escape') {
          closeSearchPanel();
        }
      });

      document.getElementById('btn-auto-layout')?.addEventListener('click', autoLayoutBoard);

      document.getElementById('btn-boards-modal')?.addEventListener('click', openBoardsModal);
      document.getElementById('btn-close-boards')?.addEventListener('click', () => modalBoardsEl.classList.add('hidden'));
      modalBoardsEl?.addEventListener('click', (e) => {
        if (e.target === modalBoardsEl) modalBoardsEl.classList.add('hidden');
      });
      document.getElementById('btn-new-blank-board')?.addEventListener('click', async () => {
        await flushSave();
        const doc = await window.desktop.createBoard({ title: tr('未命名白板'), fromExample: false });
        acceptDocument(doc);
        await refreshBoardsModalList();
        modalBoardsEl.classList.add('hidden');
        showToast(tr('已新建白板'));
      });
      document.getElementById('btn-new-example-board')?.addEventListener('click', async () => {
        await flushSave();
        const doc = await window.desktop.createBoard({ fromExample: true });
        acceptDocument(doc);
        fitViewToContent();
        await refreshBoardsModalList();
        modalBoardsEl.classList.add('hidden');
        showToast(tr('已新建白板'));
      });

      // 9. 顶部栏按钮事件
      boardTitleInputEl.addEventListener('change', (e) => {
        state.title = e.target.value.trim() || tr('未命名白板');
        saveToLocalStorage();
      });
      boardTitleInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') boardTitleInputEl.blur();
      });

      document.getElementById('btn-undo').addEventListener('click', undo);
      document.getElementById('btn-redo').addEventListener('click', redo);

      document.getElementById('btn-load-demo').addEventListener('click', () => {
        showConfirm(tr('加载示例白板'), tr('用示例替换当前白板？可以撤销此操作。'), () => {
          pushHistory();
          loadDemoData();
          fitViewToContent();
          showToast(tr('已加载示例白板'));
        });
      });

      document.getElementById('btn-clear-board').addEventListener('click', () => {
        showConfirm(tr('清空当前画布'), tr('清除白板上的所有内容？可以撤销此操作。'), () => {
          pushHistory();
          state.tokens = [];
          state.edges = [];
          state.clusters = [];
          state.drawings = [];
          clearSelection();
          renderAll();
          saveToLocalStorage();
          showToast(tr('白板已清空'));
        });
      });

      const themeToggleBtn = document.getElementById('btn-theme-toggle');
      function setTheme(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
        renderDrawings();
        renderEdges();
      }
      themeToggleBtn.addEventListener('click', () => {
        setTheme(!document.documentElement.classList.contains('dark'));
      });

      // 10. 视口控制按钮
      document.getElementById('btn-zoom-in').addEventListener('click', () => {
        viewport.scale = Math.min(2.5, viewport.scale * 1.15);
        applyViewportTransform();
      });
      document.getElementById('btn-zoom-out').addEventListener('click', () => {
        viewport.scale = Math.max(0.25, viewport.scale * 0.85);
        applyViewportTransform();
      });
      zoomResetBtnEl.addEventListener('click', () => {
        viewport.scale = 1;
        applyViewportTransform();
      });
      document.getElementById('btn-fit-view').addEventListener('click', fitViewToContent);

      // 11. 快捷键弹窗
      const modalShortcuts = document.getElementById('modal-shortcuts');
      document.getElementById('btn-shortcuts-help').addEventListener('click', () => modalShortcuts.classList.remove('hidden'));
      document.getElementById('btn-close-shortcuts').addEventListener('click', () => modalShortcuts.classList.add('hidden'));
      modalShortcuts.addEventListener('click', (e) => {
        if (e.target === modalShortcuts) modalShortcuts.classList.add('hidden');
      });

      // 12. 导出与导入弹窗逻辑
      const modalExport = document.getElementById('modal-export');
      const exportPreviewArea = document.getElementById('export-preview-area');
      const tabMdBtn = document.getElementById('tab-export-md');
      const tabJsonBtn = document.getElementById('tab-export-json');
      const tabSvgBtn = document.getElementById('tab-export-svg');

      function refreshExportPreview() {
        const activeCls = 'px-3 py-1 rounded-lg text-xs font-medium bg-white dark:bg-zinc-700 text-stone-800 dark:text-zinc-100 shadow-xs transition';
        const inactiveCls = 'px-3 py-1 rounded-lg text-xs font-medium text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 transition';
        tabMdBtn.className = currentExportTab === 'md' ? activeCls : inactiveCls;
        tabJsonBtn.className = currentExportTab === 'json' ? activeCls : inactiveCls;
        if (tabSvgBtn) tabSvgBtn.className = currentExportTab === 'svg' ? activeCls : inactiveCls;

        if (currentExportTab === 'md') {
          exportPreviewArea.value = generateMarkdownOutline();
        } else if (currentExportTab === 'svg') {
          exportPreviewArea.value = generateBoardSvg().svg;
        } else {
          exportPreviewArea.value = JSON.stringify(snapshot(), null, 2);
        }
      }

      document.getElementById('btn-export-modal').addEventListener('click', () => {
        refreshExportPreview();
        modalExport.classList.remove('hidden');
      });
      document.getElementById('btn-close-export').addEventListener('click', () => modalExport.classList.add('hidden'));
      modalExport.addEventListener('click', (e) => {
        if (e.target === modalExport) modalExport.classList.add('hidden');
      });

      tabMdBtn.addEventListener('click', () => {
        currentExportTab = 'md';
        refreshExportPreview();
      });
      tabJsonBtn.addEventListener('click', () => {
        currentExportTab = 'json';
        refreshExportPreview();
      });
      tabSvgBtn?.addEventListener('click', () => {
        currentExportTab = 'svg';
        refreshExportPreview();
      });

      document.getElementById('btn-export-png')?.addEventListener('click', exportBoardAsPng);

      document.getElementById('btn-copy-export').addEventListener('click', async () => {
        try { await window.desktop.copy(exportPreviewArea.value); showToast(tr('已复制')); } catch(e) { showToast(e.message); }
      });
      document.getElementById('btn-download-export').addEventListener('click', async () => {
        const ext = currentExportTab === 'md' ? 'md' : (currentExportTab === 'svg' ? 'svg' : 'json');
        try { if(await window.desktop.export({text:exportPreviewArea.value,extension:ext})) showToast(tr('已导出文件')); }
        catch(e) { showToast(e.message); }
      });
      async function importDocument(doc) {
        pushHistory();
        state=Object.fromEntries(['title',...keys].map(k=>[k,cloneState(doc[k])]));
        viewport={...doc.viewport};
        selection=Object.fromEntries(keys.map(k=>[k,new Set(doc.selection[k])]));
        renderAll();
        if(await flushSave()){modalExport.classList.add('hidden');showToast(tr('已导入白板'));}
      }
      document.getElementById('input-import-json').addEventListener('change', async e => {
        const file=e.target.files?.[0];e.target.value='';if(!file)return;
        try{
          if(file.size>16*1024*1024)throw new Error(tr('文件超过 16 MiB'));
          const doc=await window.desktop.validate(JSON.parse(await file.text()));
          showConfirm(tr('导入白板'),tr('替换当前白板？当前版本会自动备份。'),()=>importDocument(doc));
        }catch(error){showToast(error.message);}
      });
      async function openNative() {
        if(!await flushSave())return;
        if(window.desktop.mode==='browser'){document.getElementById('input-import-json').click();return;}
        try {const doc=await window.desktop.open();if(doc)await importDocument(doc);}catch(e){showToast(e.message);}
      }
      async function exportSnapshot() {
        try {return await window.desktop.export({text:JSON.stringify(snapshot(),null,2),extension:'json'});}catch(e){showToast(e.message);return false;}
      }
      async function showMcp() {
        try {
          const info=await window.desktop.info({readOnly:document.getElementById('mcp-readonly').checked});
          document.getElementById('mcp-path').textContent=info.config ? info.file : tr(info.file);
          document.getElementById('mcp-config').value=info.config ? JSON.stringify(info.config,null,2) : '';
          const dialog=document.getElementById('mcp-dialog');if(!dialog.open)dialog.showModal();
        }catch(e){showToast(e.message);}
      }
      document.getElementById('btn-open-native').onclick=openNative;
      document.getElementById('btn-mcp').onclick=showMcp;
      document.getElementById('mcp-readonly').onchange=showMcp;
      document.getElementById('mcp-close').onclick=()=>document.getElementById('mcp-dialog').close();
      document.getElementById('mcp-copy').onclick=async()=>{await window.desktop.copy(document.getElementById('mcp-config').value);showToast(tr('已复制 MCP 配置'));};
      document.getElementById('mcp-reveal').onclick=()=>window.desktop.reveal();
      document.getElementById('sync-export').onclick=exportSnapshot;
      document.getElementById('sync-retry').onclick=()=>{conflict=false;document.getElementById('sync-banner').hidden=true;flushSave();};
      document.getElementById('sync-reload').onclick=()=>showConfirm(tr('读取最新版本'),tr('载入后将替换本地编辑。可以先导出副本。'),async()=>{
        try{acceptDocument(await window.desktop.read());conflict=false;document.getElementById('sync-banner').hidden=true;}catch(e){showFailure(e);}
      });
      document.getElementById('btn-export-context').onclick=async()=>{
        try {
          const scope=document.getElementById('context-scope').value;
          const context=await window.desktop.context({document:snapshot(),scope});
          await window.desktop.export({text:JSON.stringify(context,null,2),extension:'json'});
        }catch(e){showToast(e.message);}
      };
      const copyCtxBtn = document.getElementById('btn-copy-context');
      if (copyCtxBtn) {
        copyCtxBtn.onclick = async () => {
          try {
            const scope = document.getElementById('context-scope').value;
            const context = await window.desktop.context({ document: snapshot(), scope });
            await window.desktop.copy(JSON.stringify(context, null, 2));
            showToast(tr('已复制内容 JSON'));
          } catch (e) {
            showToast(e.message);
          }
        };
      }
      const copySkillPromptBtn = document.getElementById('btn-copy-skill-prompt');
      if (copySkillPromptBtn) {
        copySkillPromptBtn.onclick = async () => {
          try {
            const scope = document.getElementById('context-scope').value;
            const lang = document.documentElement.lang === 'en' ? 'en' : 'zh';
            const [guide, context] = await Promise.all([
              window.desktop.skillGuide ? window.desktop.skillGuide(lang) : '',
              window.desktop.context({ document: snapshot(), scope })
            ]);
            const payload = `${guide}\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
            await window.desktop.copy(payload);
            showToast(tr('已复制 AI 技能与白板上下文'));
          } catch (e) {
            showToast(e.message);
          }
        };
      }
      const downloadSkillBtn = document.getElementById('btn-download-skill');
      if (downloadSkillBtn) {
        downloadSkillBtn.onclick = async () => {
          try {
            const [zhGuide, enGuide] = await Promise.all([
              window.desktop.skillGuide ? window.desktop.skillGuide('zh') : '',
              window.desktop.skillGuide ? window.desktop.skillGuide('en') : ''
            ]);
            const skillMd = `---\nname: mindflow-whiteboard\ndescription: Built-in AI skill for MindFlow (自由白板) — understand, organize, expand, and generate MindFlow spatial whiteboards via MCP tools or canonical JSON interchange.\n---\n\n${zhGuide}\n\n---\n\n${enGuide}\n`;
            if (await window.desktop.export({ text: skillMd, extension: 'md', filename: 'SKILL.md' })) {
              showToast(tr('已导出 SKILL.md'));
            }
          } catch (e) {
            showToast(e.message);
          }
        };
      }
      window.desktop.onMenu(async action=>{
        if(action==='open')await openNative();
        if(action==='export')await exportSnapshot();
        if(action==='save'){if(await flushSave())showToast(tr('已保存'));}
        if(action==='mcp')await showMcp();
      });
      window.addEventListener('beforeunload', e=>{
        if(window.desktop.mode==='browser'&&ready&&signature(snapshot())!==lastSavedContent){e.preventDefault();e.returnValue='';flushSave();}
      });
      window.desktop.onClose(async()=>{
        document.activeElement?.blur();
        if(!quickInputBoxEl.classList.contains('hidden'))commitQuickInput();
        if(await flushSave())window.desktop.closeReady();
        else showToast(tr('尚有未保存的编辑，请先处理保存提示'));
      });
      // 初始化应用：磁盘是唯一权威来源，浏览器存储仅保留主题。
      async function init() {
        const savedTheme=localStorage.getItem(THEME_KEY);
        if(savedTheme==='dark'||(!savedTheme&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');
        try {
          acceptDocument(await window.desktop.read()); ready=true;
          setInterval(()=>{
            if(ready&&!applying&&!conflict&&!saving&&interaction.mode==='idle'&&signature(snapshot())!==lastSavedContent)saveToLocalStorage();
          },600);
          setInterval(pollDocument,1400);
        }catch(error){showFailure(error);}
      }
      window.addEventListener('mindflow-language-change', () => {
        if (!ready) return;
        renderAll();
        if (!modalBoardsEl.classList.contains('hidden')) refreshBoardsModalList();
        if (conflict) status(tr('未保存 · 请处理'));
        else if (signature(snapshot()) === lastSavedContent) showSaved(documentMeta.revision);
      });
      init();
    })();
