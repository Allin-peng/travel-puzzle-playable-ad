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
      this.bonds = new Set();
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
      const droppedRect = piece.getBoundingClientRect();
      groupPieces.forEach(item => {
        item.classList.remove('dragging-group');
        item.style.transform = '';
      });
      piece.removeEventListener('pointermove', this.moveHandler);
      piece.removeEventListener('pointerup', this.upHandler);
      piece.removeEventListener('pointercancel', this.upHandler);

      const rect = this.board.getBoundingClientRect();
      const cellWidth = rect.width / this.size;
      const cellHeight = rect.height / this.size;
      const col = Math.round((droppedRect.left - rect.left) / cellWidth);
      const row = Math.round((droppedRect.top - rect.top) / cellHeight);
      const targetLeft = rect.left + col * cellWidth;
      const targetTop = rect.top + row * cellHeight;
      const aligned =
        row >= 0 && row < this.size && col >= 0 && col < this.size &&
        Math.abs(droppedRect.left - targetLeft) <= cellWidth * .16 &&
        Math.abs(droppedRect.top - targetTop) <= cellHeight * .16 &&
        Math.abs(droppedRect.right - (targetLeft + cellWidth)) <= cellWidth * .16 &&
        Math.abs(droppedRect.bottom - (targetTop + cellHeight)) <= cellHeight * .16;

      if (aligned) {
        const targetSlot = row * this.size + col;
        if (targetSlot !== startSlot) {
          const moveSlots = this.translatedSlots(sourceSlots, row - Math.floor(startSlot / this.size), col - startSlot % this.size);
          if (moveSlots) this.moveGroup(groupIds, sourceSlots, moveSlots);
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

    moveGroup(groupIds, sourceSlots, targetSlots) {
      const oldOrder = this.order.slice();
      const groupSet = new Set(groupIds);
      const targetSet = new Set(targetSlots);
      const blockedByPermanentGroup = targetSlots.some(slot => {
        const occupantId = oldOrder[slot];
        if (groupSet.has(occupantId)) return false;
        const occupantGroup = this.pieces.filter(piece => piece.dataset.group === this.pieces[occupantId].dataset.group);
        return occupantGroup.length > 1;
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
      this.renderOrder();
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

      this.pieces.forEach(piece => {
        piece.classList.remove('bond-top', 'bond-right', 'bond-bottom', 'bond-left', 'grouped', 'merge-pop');
      });

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
        if (b === a + 1) {
          this.pieces[a].classList.add('bond-right');
          this.pieces[b].classList.add('bond-left');
        } else {
          this.pieces[a].classList.add('bond-bottom');
          this.pieces[b].classList.add('bond-top');
        }
      });

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
