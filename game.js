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
    level1Tip: '将图块完整放入格子，拼对后自动合成',
    level2Badge: '高能挑战',
    level2Title: '还原旅行风景',
    level2Subtitle: '25 块拼图，挑战你的观察力',
    level2Tip: '完整落格后检测，合成大块整体拖动',
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
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(this.board);
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
      const aligned =
        row >= 0 && row < this.size && col >= 0 && col < this.size &&
        Math.abs(dx - (col - startCol) * cellWidth) <= cellWidth * .16 &&
        Math.abs(dy - (row - startRow) * cellHeight) <= cellHeight * .16;

      if (aligned) {
        const targetSlot = row * this.size + col;
        if (targetSlot !== startSlot) {
          const moveSlots = this.translatedSlots(sourceSlots, row - startRow, col - startCol);
          if (moveSlots) this.moveGroup(groupIds, sourceSlots, moveSlots);
        }
      }
      this.drag = null;
      this.draw();
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
      const targetSet = new Set(targetSlots);
      const blockedByPermanentGroup = targetSlots.some(slot => {
        const occupantId = oldOrder[slot];
        if (groupSet.has(occupantId)) return false;
        return this.groups.get(this.groupById[occupantId]).length > 1;
      });
      // Never displace only part of a previously merged group. The attempted
      // move is cancelled so a permanent group can never be torn apart.
      if (blockedByPermanentGroup) return false;

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

      // Discover new correct edge contacts. Bonds are append-only: after two
      // pieces merge, their connection is permanent for the rest of the level.
      for (let id = 0; id < count; id++) {
        const slot = slots[id];
        const currentRow = Math.floor(slot / this.size);
        if (id % this.size < this.size - 1 && slots[id + 1] === slot + 1 && Math.floor(slots[id + 1] / this.size) === currentRow) {
          this.bonds.add(`${id}:${id + 1}`);
        }
        if (id + this.size < count && slots[id + this.size] === slot + this.size) {
          this.bonds.add(`${id}:${id + this.size}`);
        }
      }

      this.bonds.forEach(bond => {
        const [a, b] = bond.split(':').map(Number);
        unite(a, b);
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
