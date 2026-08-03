(() => {
  'use strict';

  const DEFAULT_CONFIG = {
    brand: '旅途拼图',
    pageTitle: '旅途拼图',
    level1Image: './assets/level-1.jpg',
    level2Image: './assets/level-2.jpg',
    level1Size: 2,
    level2Size: 5,
    level1Badge: '轻松热身',
    level1Title: '拼好动物房车',
    level1Subtitle: '拖动拼图，交换它们的位置',
    level1Tip: '拼出完整矩形后，图块自动合成',
    level2Badge: '高能挑战',
    level2Title: '还原旅行风景',
    level2Subtitle: '25 块拼图，挑战你的观察力',
    level2Tip: '等面积区域可以整体交换位置',
    difficultyKicker: 'LEVEL UP',
    difficultyTitle: '难度飙升',
    difficultySubtitle: '真正的挑战，现在开始！',
    finishBadge: '挑战成功',
    finishTitle: '太棒了！',
    finishSubtitle: '两幅拼图都完成啦',
    replayText: '再玩一次',
    level1Complete: '完美！第一关完成',
    primaryColor: '#ff9c3f',
    secondaryColor: '#4e9c74',
    transitionDuration: 1100,
    showFinger: true
  };
  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.PUZZLE_CONFIG || {});
  CONFIG.level1Size = Math.max(2, Math.min(6, Number(CONFIG.level1Size) || 2));
  CONFIG.level2Size = Math.max(2, Math.min(6, Number(CONFIG.level2Size) || 5));
  document.title = CONFIG.pageTitle || CONFIG.brand;
  document.documentElement.style.setProperty('--orange', CONFIG.primaryColor);
  document.documentElement.style.setProperty('--green', CONFIG.secondaryColor);
  document.querySelectorAll('[data-config]').forEach(element => {
    const key = element.dataset.config;
    if (CONFIG[key] !== undefined) element.textContent = CONFIG[key];
  });

  const ASSETS = { level1: CONFIG.level1Image, level2: CONFIG.level2Image };

  class SwapPuzzle {
    constructor(board, size, image, initialOrder, onComplete, onFirstMove) {
      this.board = board;
      this.size = size;
      this.image = image;
      this.onComplete = onComplete;
      this.onFirstMove = onFirstMove;
      this.order = initialOrder.slice();
      this.drag = null;
      this.moved = false;
      this.locked = false;
      this.bonds = new Set();
      this.build();
    }

    build() {
      this.board.innerHTML = '';
      this.board.classList.remove('is-complete');
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'puzzle-canvas';
      this.canvas.setAttribute('aria-label', `${this.size}×${this.size} 拼图区域`);
      this.board.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
      this.imageElement = new Image();
      this.imageElement.decoding = 'async';
      this.imageElement.onload = () => this.resizeCanvas();
      this.imageElement.src = this.image;
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this.resizeObserver.observe(this.board);
      } else {
        // Android 6/7 and older System WebView versions do not provide
        // ResizeObserver. Keep the canvas responsive with the resize event.
        if (!this.legacyResizeHandler) {
          this.legacyResizeHandler = () => this.resizeCanvas();
          window.addEventListener('resize', this.legacyResizeHandler);
          window.addEventListener('orientationchange', this.legacyResizeHandler);
        }
        setTimeout(() => this.resizeCanvas(), 0);
      }
      this.updateGroups(false);
    }

    resizeCanvas() {
      const rect = this.board.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      this.pixelRatio = ratio;
      this.canvas.width = Math.round(rect.width * ratio);
      this.canvas.height = Math.round(rect.height * ratio);
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.draw();
    }

    pointerDown(event) {
      if (this.locked || event.button > 0) return;
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const col = Math.min(this.size - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * this.size)));
      const row = Math.min(this.size - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * this.size)));
      const startSlot = row * this.size + col;
      const id = this.order[startSlot];
      if (!this.moved) {
        this.moved = true;
        if (this.onFirstMove) this.onFirstMove();
      }
      const groupId = this.groupById[id];
      const groupIds = this.groups.get(groupId).slice();
      const sourceSlots = groupIds.map(id => this.order.indexOf(id));
      this.drag = { id, groupIds, sourceSlots, startSlot, x: event.clientX, y: event.clientY, dx: 0, dy: 0, pointerId: event.pointerId };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.addEventListener('pointermove', this.moveHandler = e => this.pointerMove(e));
      this.canvas.addEventListener('pointerup', this.upHandler = e => this.pointerUp(e));
      this.canvas.addEventListener('pointercancel', this.upHandler);
    }

    pointerMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag.dx = Math.round(dx * this.pixelRatio) / this.pixelRatio;
      this.drag.dy = Math.round(dy * this.pixelRatio) / this.pixelRatio;
      this.draw();
    }

    pointerUp(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { groupIds, sourceSlots, startSlot, dx, dy } = this.drag;
      this.canvas.removeEventListener('pointermove', this.moveHandler);
      this.canvas.removeEventListener('pointerup', this.upHandler);
      this.canvas.removeEventListener('pointercancel', this.upHandler);

      const rect = this.board.getBoundingClientRect();
      const cellWidth = rect.width / this.size;
      const cellHeight = rect.height / this.size;
      const startCol = startSlot % this.size;
      const startRow = Math.floor(startSlot / this.size);
      const col = Math.round(startCol + dx / cellWidth);
      const row = Math.round(startRow + dy / cellHeight);
      const sourceRect = this.rectangleForSlots(sourceSlots);
      const clickedOffsetRow = startRow - sourceRect.top;
      const clickedOffsetCol = startCol - sourceRect.left;
      const targetTop = row - clickedOffsetRow;
      const targetLeft = col - clickedOffsetCol;
      const landedOnCell =
        row >= 0 && row < this.size && col >= 0 && col < this.size &&
        Math.abs(dx - (col - startCol) * cellWidth) <= cellWidth * .46 &&
        Math.abs(dy - (row - startRow) * cellHeight) <= cellHeight * .46;
      let reorderedBand = false;

      // Band exchanges use the actual release cell first. The dragged block
      // may temporarily project beyond the board (e.g. dragging a 2x3 block
      // onto the last 1x3 row of a 3x3 board), which must not cancel the swap.
      if (landedOnCell) {
        const targetSlot = row * this.size + col;
        const targetId = this.order[targetSlot];
        if (!groupIds.includes(targetId)) {
          const targetBandSlots = this.findAdjacentTargetBand(sourceSlots, targetSlot);
          if (targetBandSlots) reorderedBand = this.exchangeAdjacentRectangles(sourceSlots, targetBandSlots);
        }
      }

      const aligned = landedOnCell &&
        targetTop >= 0 && targetLeft >= 0 &&
        targetTop + sourceRect.height <= this.size && targetLeft + sourceRect.width <= this.size;

      if (!reorderedBand && aligned) {
        const targetSlot = row * this.size + col;
        const targetId = this.order[targetSlot];
        const targetGroupIds = this.groups.get(this.groupById[targetId]);
        const targetGroupSlots = targetGroupIds.map(id => this.order.indexOf(id));
        const reorderedGroup = !groupIds.includes(targetId) && this.exchangeAdjacentRectangles(sourceSlots, targetGroupSlots);
        if (!reorderedGroup) {
          const targetSlots = this.slotsForRectangle(targetTop, targetLeft, sourceRect.height, sourceRect.width);
          if (!targetSlots.every(slot => sourceSlots.includes(slot))) this.exchangeRectangles(sourceSlots, targetSlots);
        }
      }
      this.drag = null;
      this.draw();
    }

    rectangleForSlots(slots) {
      const rows = slots.map(slot => Math.floor(slot / this.size));
      const cols = slots.map(slot => slot % this.size);
      const top = Math.min(...rows);
      const bottom = Math.max(...rows);
      const left = Math.min(...cols);
      const right = Math.max(...cols);
      return { top, left, height: bottom - top + 1, width: right - left + 1 };
    }

    slotsForRectangle(top, left, height, width) {
      const slots = [];
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) slots.push((top + row) * this.size + left + col);
      }
      return slots;
    }

    findAdjacentTargetBand(sourceSlots, targetSlot) {
      const sourceRect = this.rectangleForSlots(sourceSlots);
      if (sourceSlots.length !== sourceRect.height * sourceRect.width) return null;
      const targetRow = Math.floor(targetSlot / this.size);
      const targetCol = targetSlot % this.size;
      const candidates = [];
      const addCandidate = (top, left, height, width) => {
        if (top < 0 || left < 0 || top + height > this.size || left + width > this.size) return;
        if (targetRow < top || targetRow >= top + height || targetCol < left || targetCol >= left + width) return;
        const slots = this.slotsForRectangle(top, left, height, width);
        const slotSet = new Set(slots);
        const roots = new Set(slots.map(slot => this.groupById[this.order[slot]]));
        const containsCompleteGroups = [...roots].every(root =>
          this.groups.get(root).every(id => slotSet.has(this.order.indexOf(id)))
        );
        if (containsCompleteGroups) candidates.push(slots);
      };

      // Search a complete strip sharing the full top/bottom edge.
      if (targetRow >= sourceRect.top + sourceRect.height) {
        for (let height = 1; sourceRect.top + sourceRect.height + height <= this.size; height++)
          addCandidate(sourceRect.top + sourceRect.height, sourceRect.left, height, sourceRect.width);
      } else if (targetRow < sourceRect.top) {
        for (let height = 1; sourceRect.top - height >= 0; height++)
          addCandidate(sourceRect.top - height, sourceRect.left, height, sourceRect.width);
      }

      // Search a complete strip sharing the full left/right edge.
      if (targetCol >= sourceRect.left + sourceRect.width) {
        for (let width = 1; sourceRect.left + sourceRect.width + width <= this.size; width++)
          addCandidate(sourceRect.top, sourceRect.left + sourceRect.width, sourceRect.height, width);
      } else if (targetCol < sourceRect.left) {
        for (let width = 1; sourceRect.left - width >= 0; width++)
          addCandidate(sourceRect.top, sourceRect.left - width, sourceRect.height, width);
      }

      // Prefer the smallest complete band containing the release point.
      candidates.sort((a, b) => a.length - b.length);
      return candidates[0] || null;
    }

    exchangeAdjacentRectangles(sourceSlots, targetSlots) {
      const sourceRect = this.rectangleForSlots(sourceSlots);
      const targetRect = this.rectangleForSlots(targetSlots);
      if (sourceSlots.length !== sourceRect.height * sourceRect.width || targetSlots.length !== targetRect.height * targetRect.width) return false;
      const oldOrder = this.order.slice();

      const horizontal =
        sourceRect.top === targetRect.top && sourceRect.height === targetRect.height &&
        (sourceRect.left + sourceRect.width === targetRect.left || targetRect.left + targetRect.width === sourceRect.left);
      const vertical =
        sourceRect.left === targetRect.left && sourceRect.width === targetRect.width &&
        (sourceRect.top + sourceRect.height === targetRect.top || targetRect.top + targetRect.height === sourceRect.top);
      if (!horizontal && !vertical) return false;

      const copyRectangle = (fromRect, toTop, toLeft) => {
        for (let row = 0; row < fromRect.height; row++) {
          for (let col = 0; col < fromRect.width; col++) {
            const fromSlot = (fromRect.top + row) * this.size + fromRect.left + col;
            const toSlot = (toTop + row) * this.size + toLeft + col;
            this.order[toSlot] = oldOrder[fromSlot];
          }
        }
      };

      if (horizontal) {
        const leftRect = sourceRect.left < targetRect.left ? sourceRect : targetRect;
        const rightRect = leftRect === sourceRect ? targetRect : sourceRect;
        copyRectangle(rightRect, leftRect.top, leftRect.left);
        copyRectangle(leftRect, leftRect.top, leftRect.left + rightRect.width);
      } else {
        const topRect = sourceRect.top < targetRect.top ? sourceRect : targetRect;
        const bottomRect = topRect === sourceRect ? targetRect : sourceRect;
        copyRectangle(bottomRect, topRect.top, topRect.left);
        copyRectangle(topRect, topRect.top + bottomRect.height, topRect.left);
      }

      this.updateGroups(true);
      this.checkComplete();
      return true;
    }

    exchangeRectangles(sourceSlots, targetSlots) {
      if (sourceSlots.length !== targetSlots.length) return false;
      const oldOrder = this.order.slice();
      const sourceSet = new Set(sourceSlots);
      const targetSet = new Set(targetSlots);
      if ([...sourceSet].some(slot => targetSet.has(slot))) return false;

      // Both rectangles must contain complete groups. A target rectangle may
      // freely contain 3 singles, a 2-piece group + 1 single, or any other
      // combination whose total area exactly fills the rectangle.
      for (const slots of [sourceSlots, targetSlots]) {
        const slotSet = new Set(slots);
        const roots = new Set(slots.map(slot => this.groupById[oldOrder[slot]]));
        for (const root of roots) {
          const complete = this.groups.get(root).every(id => slotSet.has(oldOrder.indexOf(id)));
          if (!complete) return false;
        }
      }

      const sourceRect = this.rectangleForSlots(sourceSlots);
      const targetRect = this.rectangleForSlots(targetSlots);
      if (sourceRect.height !== targetRect.height || sourceRect.width !== targetRect.width) return false;
      const orderedSource = this.slotsForRectangle(sourceRect.top, sourceRect.left, sourceRect.height, sourceRect.width);
      const orderedTarget = this.slotsForRectangle(targetRect.top, targetRect.left, targetRect.height, targetRect.width);
      const nextOrder = oldOrder.slice();
      orderedSource.forEach((slot, index) => { nextOrder[slot] = oldOrder[orderedTarget[index]]; });
      orderedTarget.forEach((slot, index) => { nextOrder[slot] = oldOrder[orderedSource[index]]; });
      this.order = nextOrder;
      this.updateGroups(true);
      this.checkComplete();
      return true;
    }

    translatedSlots(sourceSlots, deltaRow, deltaCol) {
      const targetSlots = [];
      for (const slot of sourceSlots) {
        const nextRow = Math.floor(slot / this.size) + deltaRow;
        const nextCol = slot % this.size + deltaCol;
        if (nextRow < 0 || nextRow >= this.size || nextCol < 0 || nextCol >= this.size) return null;
        targetSlots.push(nextRow * this.size + nextCol);
      }
      return targetSlots;
    }

    moveGroup(groupIds, sourceSlots, targetSlots) {
      const oldOrder = this.order.slice();
      const groupSet = new Set(groupIds);
      const sourceSet = new Set(sourceSlots);
      const targetSet = new Set(targetSlots);
      const displacedGroupRoots = new Set();
      targetSlots.forEach(slot => {
        const occupantId = oldOrder[slot];
        if (!groupSet.has(occupantId)) displacedGroupRoots.add(this.groupById[occupantId]);
      });

      // The destination may contain several groups (for example a 2-piece
      // rectangle plus one single piece). They can be exchanged together as
      // long as the destination covers every member of every affected group.
      // Partial coverage is rejected so a permanent group is never split.
      for (const root of displacedGroupRoots) {
        const ids = this.groups.get(root);
        const fullyCovered = ids.every(id => targetSet.has(oldOrder.indexOf(id)));
        if (!fullyCovered) return false;
      }

      const overlaps = targetSlots.some(slot => sourceSet.has(slot));
      if (!overlaps) {
        const nextOrder = oldOrder.slice();
        sourceSlots.forEach((slot, index) => { nextOrder[slot] = oldOrder[targetSlots[index]]; });
        targetSlots.forEach((slot, index) => { nextOrder[slot] = groupIds[index]; });
        this.order = nextOrder;
        this.updateGroups(true);
        this.checkComplete();
        return true;
      }

      // Overlapping translations have fewer vacated cells than the group
      // area. Allow them only when all displaced pieces are singles; merged
      // rectangles must use a clean equal-area exchange to preserve shape.
      const containsDisplacedGroup = [...displacedGroupRoots]
        .some(root => this.groups.get(root).length > 1);
      if (containsDisplacedGroup) return false;

      const vacated = sourceSlots.filter(slot => !targetSet.has(slot)).sort((a, b) => a - b);
      const displaced = targetSlots
        .map(slot => oldOrder[slot])
        .filter(id => !groupSet.has(id));

      sourceSlots.forEach((slot, index) => { this.order[targetSlots[index]] = groupIds[index]; });
      vacated.forEach((slot, index) => { this.order[slot] = displaced[index]; });
      this.updateGroups(true);
      this.checkComplete();
      return true;
    }

    updateGroups(animateNewMerge) {
      const count = this.size * this.size;
      const parent = Array.from({ length: count }, (_, index) => index);
      const find = value => {
        while (parent[value] !== value) {
          parent[value] = parent[parent[value]];
          value = parent[value];
        }
        return value;
      };
      const unite = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent[rootB] = rootA;
      };
      const slots = Array(count);
      this.order.forEach((id, slot) => { slots[id] = slot; });

      // Restore permanent groups first. Existing bonds are never removed.
      this.bonds.forEach(bond => {
        const [a, b] = bond.split(':').map(Number);
        unite(a, b);
      });

      const contacts = [];
      for (let id = 0; id < count; id++) {
        const slot = slots[id];
        const currentRow = Math.floor(slot / this.size);
        if (id % this.size < this.size - 1 && slots[id + 1] === slot + 1 && Math.floor(slots[id + 1] / this.size) === currentRow) {
          contacts.push([id, id + 1]);
        }
        if (id + this.size < count && slots[id + this.size] === slot + this.size) {
          contacts.push([id, id + this.size]);
        }
      }

      const membersOf = root => {
        const members = [];
        for (let id = 0; id < count; id++) if (find(id) === root) members.push(id);
        return members;
      };
      const formsCompleteRectangle = ids => {
        const rows = ids.map(id => Math.floor(id / this.size));
        const cols = ids.map(id => id % this.size);
        const minRow = Math.min(...rows);
        const maxRow = Math.max(...rows);
        const minCol = Math.min(...cols);
        const maxCol = Math.max(...cols);
        if ((maxRow - minRow + 1) * (maxCol - minCol + 1) !== ids.length) return false;
        const set = new Set(ids);
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            if (!set.has(row * this.size + col)) return false;
          }
        }
        return true;
      };

      // A correct edge contact is not enough on its own. Two groups become
      // permanent only when their union fully fills a rectangle in the source
      // image. L, T and any shape with a missing corner remain separate.
      let merged;
      do {
        merged = false;
        for (const [a, b] of contacts) {
          const rootA = find(a);
          const rootB = find(b);
          if (rootA === rootB) continue;
          const combined = [...membersOf(rootA), ...membersOf(rootB)];
          if (!formsCompleteRectangle(combined)) continue;
          unite(rootA, rootB);
          merged = true;
          break;
        }
      } while (merged);

      // Remove every seam inside each newly completed rectangle.
      contacts.forEach(([a, b]) => {
        if (find(a) === find(b)) this.bonds.add(`${a}:${b}`);
      });

      const groups = new Map();
      this.groupById = Array(count);
      for (let id = 0; id < count; id++) {
        const root = find(id);
        this.groupById[id] = root;
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(id);
      }
      this.groups = groups;
      if (this.ctx) this.draw();
    }

    hasBond(a, b) {
      return this.bonds.has(`${Math.min(a, b)}:${Math.max(a, b)}`);
    }

    draw() {
      if (!this.ctx || !this.canvas.width || !this.imageElement?.complete || !this.imageElement.naturalWidth) return;
      const width = this.canvas.width / this.pixelRatio;
      const height = this.canvas.height / this.pixelRatio;
      const cellWidth = width / this.size;
      const cellHeight = height / this.size;
      const dragged = new Set(this.drag?.groupIds || []);
      this.ctx.fillStyle = '#d9dfd8';
      this.ctx.fillRect(0, 0, width, height);

      const drawIds = (ids, offsetX = 0, offsetY = 0) => {
        ids.forEach(id => {
          const slot = this.order.indexOf(id);
          const x = (slot % this.size) * cellWidth + offsetX;
          const y = Math.floor(slot / this.size) * cellHeight + offsetY;
          const sourceWidth = this.imageElement.naturalWidth / this.size;
          const sourceHeight = this.imageElement.naturalHeight / this.size;
          const sourceX = (id % this.size) * sourceWidth;
          const sourceY = Math.floor(id / this.size) * sourceHeight;
          const overlap = .45;
          const left = id % this.size > 0 && this.hasBond(id - 1, id) ? overlap : 0;
          const right = id % this.size < this.size - 1 && this.hasBond(id, id + 1) ? overlap : 0;
          const top = id >= this.size && this.hasBond(id - this.size, id) ? overlap : 0;
          const bottom = id + this.size < this.size * this.size && this.hasBond(id, id + this.size) ? overlap : 0;
          this.ctx.drawImage(
            this.imageElement,
            sourceX - left * sourceWidth / cellWidth, sourceY - top * sourceHeight / cellHeight,
            sourceWidth + (left + right) * sourceWidth / cellWidth, sourceHeight + (top + bottom) * sourceHeight / cellHeight,
            x - left, y - top, cellWidth + left + right, cellHeight + top + bottom
          );
        });

        this.ctx.strokeStyle = 'rgba(255,255,255,.86)';
        this.ctx.lineWidth = this.size === 2 ? 2 : 1;
        this.ctx.beginPath();
        ids.forEach(id => {
          const slot = this.order.indexOf(id);
          const x = (slot % this.size) * cellWidth + offsetX;
          const y = Math.floor(slot / this.size) * cellHeight + offsetY;
          if (!(id >= this.size && this.hasBond(id - this.size, id))) { this.ctx.moveTo(x, y); this.ctx.lineTo(x + cellWidth, y); }
          if (!(id % this.size < this.size - 1 && this.hasBond(id, id + 1))) { this.ctx.moveTo(x + cellWidth, y); this.ctx.lineTo(x + cellWidth, y + cellHeight); }
          if (!(id + this.size < this.size * this.size && this.hasBond(id, id + this.size))) { this.ctx.moveTo(x, y + cellHeight); this.ctx.lineTo(x + cellWidth, y + cellHeight); }
          if (!(id % this.size > 0 && this.hasBond(id - 1, id))) { this.ctx.moveTo(x, y); this.ctx.lineTo(x, y + cellHeight); }
        });
        this.ctx.stroke();
      };

      drawIds(this.order.filter(id => !dragged.has(id)));
      if (this.drag) drawIds(this.drag.groupIds, this.drag.dx, this.drag.dy);
    }

    checkComplete() {
      const complete = this.order.every((id, index) => id === index);
      if (!complete) return;
      this.locked = true;
      this.board.classList.add('is-complete');
      setTimeout(() => this.onComplete(), 350);
    }

    reset(order) {
      this.order = order.slice();
      this.locked = false;
      this.moved = false;
      this.bonds = new Set();
      this.build();
    }
  }

  const levelTrack = document.getElementById('levelTrack');
  const difficulty = document.getElementById('difficultyOverlay');
  const finish = document.getElementById('finishOverlay');
  const finger = document.getElementById('fingerGuide');
  const toast = document.getElementById('toast');
  const replayButton = document.getElementById('replayButton');

  function hasCorrectNeighbors(order, size) {
    const slots = Array(order.length);
    order.forEach((id, slot) => { slots[id] = slot; });
    for (let id = 0; id < order.length; id++) {
      const slot = slots[id];
      if (id % size < size - 1 && slots[id + 1] === slot + 1 && Math.floor(slots[id + 1] / size) === Math.floor(slot / size)) return true;
      if (id + size < order.length && slots[id + size] === slot + size) return true;
    }
    return false;
  }

  function shuffledOrder(size) {
    const count = size * size;
    let values;
    do {
      values = Array.from({ length: count }, (_, index) => index);
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
    } while (hasCorrectNeighbors(values, size));
    return values;
  }

  let firstOrder = shuffledOrder(CONFIG.level1Size);

  const puzzle1 = new SwapPuzzle(
    document.getElementById('board1'), CONFIG.level1Size, ASSETS.level1, firstOrder,
    completeFirstLevel,
    () => finger.classList.add('hide')
  );

  const puzzle2 = new SwapPuzzle(
    document.getElementById('board2'), CONFIG.level2Size, ASSETS.level2, shuffledOrder(CONFIG.level2Size),
    completeSecondLevel
  );

  if (!CONFIG.showFinger) finger.style.display = 'none';

  function completeFirstLevel() {
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => {
      levelTrack.classList.add('show-level-two');
      difficulty.classList.add('show');
      difficulty.setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        difficulty.classList.remove('show');
        difficulty.setAttribute('aria-hidden', 'true');
      }, Number(CONFIG.transitionDuration) || 1100);
    }, 420);
  }

  function completeSecondLevel() {
    setTimeout(() => {
      finish.classList.add('show');
      finish.setAttribute('aria-hidden', 'false');
      launchConfetti();
    }, 250);
  }

  replayButton.addEventListener('click', () => {
    finish.classList.remove('show');
    finish.setAttribute('aria-hidden', 'true');
    levelTrack.classList.remove('show-level-two');
    finger.classList.remove('hide');
    firstOrder = shuffledOrder(CONFIG.level1Size);
    puzzle1.reset(firstOrder);
    puzzle2.reset(shuffledOrder(CONFIG.level2Size));
  });

  function launchConfetti() {
    const canvas = document.getElementById('confetti');
    const ctx = canvas.getContext('2d');
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    const colors = ['#ffad4b', '#72d6ad', '#ff6f61', '#63b6e8', '#ffe067'];
    const bits = Array.from({ length: 85 }, () => ({
      x: Math.random() * canvas.clientWidth,
      y: -20 - Math.random() * canvas.clientHeight * .45,
      vx: (Math.random() - .5) * 3.5,
      vy: 2.5 + Math.random() * 4,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - .5) * .2,
      w: 5 + Math.random() * 7,
      h: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    function frame(now) {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      bits.forEach(bit => {
        bit.x += bit.vx; bit.y += bit.vy; bit.vy += .025; bit.rotation += bit.spin;
        ctx.save(); ctx.translate(bit.x, bit.y); ctx.rotate(bit.rotation); ctx.fillStyle = bit.color;
        ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h); ctx.restore();
      });
      if (now - start < 3600) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
