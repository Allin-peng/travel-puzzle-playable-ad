(() => {
  'use strict';

  const ASSETS = {
    level1: './assets/level-1.jpg',
    level2: './assets/level-2.jpg'
  };

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
      this.groupSignature = '';
      this.build();
    }

    build() {
      this.board.innerHTML = '';
      this.board.classList.remove('is-complete');
      this.board.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
      this.pieces = [];
      const count = this.size * this.size;
      for (let id = 0; id < count; id++) {
        const piece = document.createElement('div');
        const col = id % this.size;
        const row = Math.floor(id / this.size);
        piece.className = 'puzzle-piece';
        piece.dataset.id = String(id);
        piece.setAttribute('role', 'button');
        piece.setAttribute('aria-label', `拼图块 ${id + 1}`);
        piece.style.backgroundImage = `url("${this.image}")`;
        piece.style.backgroundSize = `${this.size * 100}% ${this.size * 100}%`;
        piece.style.backgroundPosition = `${this.size === 1 ? 0 : col / (this.size - 1) * 100}% ${this.size === 1 ? 0 : row / (this.size - 1) * 100}%`;
        piece.addEventListener('pointerdown', event => this.pointerDown(event, piece));
        this.board.appendChild(piece);
        this.pieces.push(piece);
      }
      this.renderOrder();
      this.updateGroups(false);
    }

    renderOrder() {
      this.order.forEach((id, slot) => { this.pieces[id].style.order = slot; });
    }

    pointerDown(event, piece) {
      if (this.locked || event.button > 0) return;
      event.preventDefault();
      if (!this.moved) {
        this.moved = true;
        if (this.onFirstMove) this.onFirstMove();
      }
      const startSlot = this.order.indexOf(Number(piece.dataset.id));
      const groupId = piece.dataset.group;
      const groupPieces = this.pieces.filter(item => item.dataset.group === groupId);
      const groupIds = groupPieces.map(item => Number(item.dataset.id));
      const sourceSlots = groupIds.map(id => this.order.indexOf(id));
      this.drag = { piece, groupPieces, groupIds, sourceSlots, startSlot, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      groupPieces.forEach(item => item.classList.add('dragging-group'));
      piece.setPointerCapture(event.pointerId);
      piece.addEventListener('pointermove', this.moveHandler = e => this.pointerMove(e));
      piece.addEventListener('pointerup', this.upHandler = e => this.pointerUp(e));
      piece.addEventListener('pointercancel', this.upHandler);
    }

    pointerMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag.groupPieces.forEach(item => {
        item.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      });
    }

    pointerUp(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { piece, groupPieces, groupIds, sourceSlots, startSlot } = this.drag;
      groupPieces.forEach(item => {
        item.classList.remove('dragging-group');
        item.style.transform = '';
      });
      piece.removeEventListener('pointermove', this.moveHandler);
      piece.removeEventListener('pointerup', this.upHandler);
      piece.removeEventListener('pointercancel', this.upHandler);

      const rect = this.board.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (inside) {
        const col = Math.min(this.size - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * this.size)));
        const row = Math.min(this.size - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * this.size)));
        const targetSlot = row * this.size + col;
        if (targetSlot !== startSlot) {
          const targetId = this.order[targetSlot];
          const targetGroup = this.pieces
            .filter(item => item.dataset.group === this.pieces[targetId].dataset.group)
            .map(item => Number(item.dataset.id));
          const snapPlan = targetGroup.some(id => groupIds.includes(id))
            ? null
            : this.findSnapPlan(groupIds, sourceSlots, targetGroup);
          if (snapPlan) {
            this.moveGroup(snapPlan.ids, snapPlan.sourceSlots, snapPlan.targetSlots);
          } else {
            const moveSlots = this.translatedSlots(sourceSlots, row - Math.floor(startSlot / this.size), col - startSlot % this.size);
            if (moveSlots) this.moveGroup(groupIds, sourceSlots, moveSlots);
          }
        }
      }
      this.drag = null;
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

    findSnapPlan(groupIds, sourceSlots, targetGroup) {
      const slotById = Array(this.size * this.size);
      this.order.forEach((id, slot) => { slotById[id] = slot; });

      for (const movingId of groupIds) {
        const movingOriginalRow = Math.floor(movingId / this.size);
        const movingOriginalCol = movingId % this.size;
        for (const fixedId of targetGroup) {
          const fixedOriginalRow = Math.floor(fixedId / this.size);
          const fixedOriginalCol = fixedId % this.size;
          const originalRowDelta = movingOriginalRow - fixedOriginalRow;
          const originalColDelta = movingOriginalCol - fixedOriginalCol;
          if (Math.abs(originalRowDelta) + Math.abs(originalColDelta) !== 1) continue;

          const fixedSlot = slotById[fixedId];
          const desiredRow = Math.floor(fixedSlot / this.size) + originalRowDelta;
          const desiredCol = fixedSlot % this.size + originalColDelta;
          if (desiredRow < 0 || desiredRow >= this.size || desiredCol < 0 || desiredCol >= this.size) continue;

          const movingSlot = slotById[movingId];
          const deltaRow = desiredRow - Math.floor(movingSlot / this.size);
          const deltaCol = desiredCol - movingSlot % this.size;
          const targetSlots = this.translatedSlots(sourceSlots, deltaRow, deltaCol);
          if (targetSlots) return { ids: groupIds, sourceSlots, targetSlots };

          // The correct side is outside the board. Reposition both connected
          // groups together inside the board while preserving their true
          // relative arrangement in the source image.
          const combinedIds = [...groupIds, ...targetGroup];
          const minOriginalRow = Math.min(...combinedIds.map(id => Math.floor(id / this.size)));
          const maxOriginalRow = Math.max(...combinedIds.map(id => Math.floor(id / this.size)));
          const minOriginalCol = Math.min(...combinedIds.map(id => id % this.size));
          const maxOriginalCol = Math.max(...combinedIds.map(id => id % this.size));
          const height = maxOriginalRow - minOriginalRow + 1;
          const width = maxOriginalCol - minOriginalCol + 1;
          const preferredTop = Math.floor(fixedSlot / this.size) - (fixedOriginalRow - minOriginalRow);
          const preferredLeft = fixedSlot % this.size - (fixedOriginalCol - minOriginalCol);
          const top = Math.max(0, Math.min(this.size - height, preferredTop));
          const left = Math.max(0, Math.min(this.size - width, preferredLeft));
          const combinedSourceSlots = combinedIds.map(id => slotById[id]);
          const combinedTargetSlots = combinedIds.map(id => {
            const relativeRow = Math.floor(id / this.size) - minOriginalRow;
            const relativeCol = id % this.size - minOriginalCol;
            return (top + relativeRow) * this.size + left + relativeCol;
          });
          return { ids: combinedIds, sourceSlots: combinedSourceSlots, targetSlots: combinedTargetSlots };
        }
      }
      return null;
    }

    moveGroup(groupIds, sourceSlots, targetSlots) {
      const oldOrder = this.order.slice();
      const groupSet = new Set(groupIds);
      const targetSet = new Set(targetSlots);
      const vacated = sourceSlots.filter(slot => !targetSet.has(slot)).sort((a, b) => a - b);
      const displaced = targetSlots
        .map(slot => oldOrder[slot])
        .filter(id => !groupSet.has(id));

      sourceSlots.forEach((slot, index) => { this.order[targetSlots[index]] = groupIds[index]; });
      vacated.forEach((slot, index) => { this.order[slot] = displaced[index]; });
      this.renderOrder();
      this.updateGroups(true);
      this.checkComplete();
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

      this.pieces.forEach(piece => {
        piece.classList.remove('bond-top', 'bond-right', 'bond-bottom', 'bond-left', 'grouped', 'merge-pop');
      });

      for (let id = 0; id < count; id++) {
        const slot = slots[id];
        const currentRow = Math.floor(slot / this.size);
        if (id % this.size < this.size - 1 && slots[id + 1] === slot + 1 && Math.floor(slots[id + 1] / this.size) === currentRow) {
          unite(id, id + 1);
          this.pieces[id].classList.add('bond-right');
          this.pieces[id + 1].classList.add('bond-left');
        }
        if (id + this.size < count && slots[id + this.size] === slot + this.size) {
          unite(id, id + this.size);
          this.pieces[id].classList.add('bond-bottom');
          this.pieces[id + this.size].classList.add('bond-top');
        }
      }

      const groups = new Map();
      for (let id = 0; id < count; id++) {
        const root = find(id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(id);
      }
      const signature = [...groups.values()].filter(group => group.length > 1).map(group => group.join('-')).sort().join('|');
      groups.forEach((ids, root) => {
        ids.forEach(id => {
          this.pieces[id].dataset.group = String(root);
          if (ids.length > 1) this.pieces[id].classList.add('grouped');
        });
      });
      if (animateNewMerge && signature !== this.groupSignature) {
        [...groups.values()].filter(group => group.length > 1).forEach(ids => {
          ids.forEach(id => this.pieces[id].classList.add('merge-pop'));
        });
      }
      this.groupSignature = signature;
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
      this.groupSignature = '';
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

  let firstOrder = shuffledOrder(2);

  const puzzle1 = new SwapPuzzle(
    document.getElementById('board1'), 2, ASSETS.level1, firstOrder,
    completeFirstLevel,
    () => finger.classList.add('hide')
  );

  const puzzle2 = new SwapPuzzle(
    document.getElementById('board2'), 5, ASSETS.level2, shuffledOrder(5),
    completeSecondLevel
  );

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
      }, 1100);
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
    firstOrder = shuffledOrder(2);
    puzzle1.reset(firstOrder);
    puzzle2.reset(shuffledOrder(5));
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
