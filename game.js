(() => {
  'use strict';

  const DEFAULTS = {
    pageTitle: '数字二合',
    brand: '数字二合',
    primaryColor: '#ff7a45',
    secondaryColor: '#7357ff',
    backgroundImage: '',
    boardImage: '',
    level1Badge: '轻松教学',
    level1Title: '拖动合成数字 4',
    level1Subtitle: '棋盘初始包含两个 1 级、一个 2 级、一个 3 级元素',
    level1Hint: '拖动相同元素叠到一起，依次合成 2、3、4',
    level2Badge: '篮筐挑战',
    level2Title: '消耗能量发射元素',
    level2Subtitle: '篮筐每次发射消耗 1 能量，合成高级元素补充能量',
    level2Hint: '拖动同级元素合成，能量不足时先通过合成补能',
    transitionKicker: 'LEVEL UP',
    transitionTitle: '进入篮筐关',
    transitionSubtitle: '数字链和字母链会同时出现',
    transitionDuration: 1250,
    finishBadge: '合成大师',
    finishTitle: '挑战成功！',
    finishSubtitle: '你完成了两关二合目标',
    replayText: '再玩一次',
    showGuide: true
  };

  const CHAINS = {
    number: { label: '数字', values: ['1', '2', '3', '4', '5'] },
    letter: { label: '字母', values: ['a', 'b', 'c', 'd', 'e', 'f'] }
  };
  const ENERGY_MAX = 20;
  const FIRE_COST = 1;
  const ENERGY_REWARD = { 2: 1, 3: 2, 4: 4, 5: 8, 6: 10 };

  const config = Object.assign({}, DEFAULTS, window.MERGE_CONFIG || {});
  const $ = id => document.getElementById(id);
  const board = $('board');
  const basket = $('basket');
  const finger = $('finger');
  const hint = $('hint');
  const transition = $('transition');
  const finish = $('finish');
  const goalList = $('goalList');
  const energyCard = $('energyCard');
  const energyText = $('energyText');
  const energyBar = $('energyBar');

  let level = 1;
  let values = [];
  let achieved = new Set();
  let drag = null;
  let energy = ENERGY_MAX;

  const levels = {
    1: {
      size: 2,
      values: [
        tile('number', 1),
        tile('number', 1),
        tile('number', 2),
        tile('number', 3)
      ],
      goals: [{ chain: 'number', rank: 4 }]
    },
    2: {
      size: 5,
      basketIndex: 12,
      values: Array.from({ length: 25 }, () => null),
      goals: [
        { chain: 'number', rank: 3 },
        { chain: 'letter', rank: 6 }
      ]
    }
  };

  function tile(chain, rank) {
    return { chain, rank };
  }

  function cloneTile(value) {
    return value ? { ...value } : null;
  }

  function tileKey(value) {
    return value ? `${value.chain}:${value.rank}` : '';
  }

  function chainFor(value) {
    return CHAINS[value.chain] || CHAINS.number;
  }

  function displayValue(value) {
    return chainFor(value).values[value.rank - 1] || '';
  }

  function describeGoal(goal) {
    const chain = CHAINS[goal.chain] || CHAINS.number;
    return `${chain.label}${chain.values[goal.rank - 1] || goal.rank}`;
  }

  function cssImage(value) {
    return value ? `url("${String(value).replace(/"/g, '\\"')}")` : 'none';
  }

  function applyConfig(next = {}) {
    Object.assign(config, next);
    document.title = config.pageTitle || config.brand;
    document.documentElement.style.setProperty('--primary', config.primaryColor);
    document.documentElement.style.setProperty('--secondary', config.secondaryColor);
    document.documentElement.style.setProperty('--scene-image', cssImage(config.backgroundImage));
    document.documentElement.style.setProperty('--board-image', cssImage(config.boardImage));
    document.querySelectorAll('[data-config]').forEach(el => {
      if (config[el.dataset.config] !== undefined) el.textContent = config[el.dataset.config];
    });
    document.querySelector('[data-config="brand"]').textContent = config.brand;
    updateCopy();
    render();
  }

  function updateCopy() {
    const prefix = level === 1 ? 'level1' : 'level2';
    $('levelNumber').textContent = level;
    $('levelBadge').textContent = config[`${prefix}Badge`];
    $('levelTitle').textContent = config[`${prefix}Title`];
    $('levelSubtitle').textContent = config[`${prefix}Subtitle`];
    hint.querySelector('span').textContent = config[`${prefix}Hint`];
    finger.style.display = level === 1 && config.showGuide ? '' : 'none';
    basket.classList.toggle('show', level === 2);
    energyCard.classList.toggle('show', level === 2);
  }

  function startLevel(nextLevel) {
    level = nextLevel;
    achieved = new Set();
    values = levels[level].values.map(cloneTile);
    energy = ENERGY_MAX;
    board.style.setProperty('--size', levels[level].size);
    updateCopy();
    render();
  }

  function render(mergedIndex = -1) {
    renderGoals();
    renderEnergy();
    board.innerHTML = '';
    values.forEach((value, index) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = index;
      if (index === levels[level].basketIndex) {
        cell.classList.add('basket-slot');
        cell.disabled = true;
      }
      if (index === mergedIndex) cell.classList.add('merged');
      if (value) {
        const label = displayValue(value);
        cell.innerHTML = `<span class="tile" data-chain="${value.chain}" data-rank="${value.rank}">${label}</span>`;
        cell.addEventListener('pointerdown', event => startDrag(event, index));
      }
      board.appendChild(cell);
    });
  }

  function renderGoals() {
    goalList.innerHTML = '';
    levels[level].goals.forEach(goal => {
      const value = tile(goal.chain, goal.rank);
      const item = document.createElement('div');
      item.className = 'goal-item';
      if (achieved.has(tileKey(value))) item.classList.add('done');
      item.innerHTML = `<span>合成</span><b class="goal-token">${displayValue(value)}</b><span>${describeGoal(goal)}</span>`;
      goalList.appendChild(item);
    });
  }

  function renderEnergy() {
    energyText.textContent = `${energy}/${ENERGY_MAX}`;
    energyBar.style.width = `${Math.max(0, Math.min(100, energy / ENERGY_MAX * 100))}%`;
    basket.disabled = level === 2 && energy < FIRE_COST;
    basket.classList.toggle('disabled', level === 2 && energy < FIRE_COST);
  }

  function startDrag(event, index) {
    if (event.button > 0 || !values[index]) return;
    event.preventDefault();
    if (level === 1) finger.style.display = 'none';
    const cell = board.children[index];
    const tileEl = cell.querySelector('.tile');
    const rect = tileEl.getBoundingClientRect();
    drag = {
      index,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      ghost: tileEl.cloneNode(true)
    };
    drag.ghost.classList.add('drag-ghost');
    drag.ghost.style.width = `${rect.width}px`;
    drag.ghost.style.height = `${rect.height}px`;
    document.body.appendChild(drag.ghost);
    cell.classList.add('dragging');
    moveGhost(event.clientX, event.clientY);
    cell.setPointerCapture(event.pointerId);
    cell.addEventListener('pointermove', dragMove);
    cell.addEventListener('pointerup', dragEnd);
    cell.addEventListener('pointercancel', dragCancel);
  }

  function dragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    moveGhost(event.clientX, event.clientY);
  }

  function dragEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const sourceIndex = drag.index;
    cleanupDrag();
    const targetIndex = indexFromPoint(event.clientX, event.clientY);
    if (targetIndex === null || targetIndex === sourceIndex || !canMerge(values[sourceIndex], values[targetIndex])) {
      render();
      if (targetIndex !== null && targetIndex !== sourceIndex) board.children[targetIndex]?.classList.add('wrong');
      return;
    }
    mergeAt(sourceIndex, targetIndex);
  }

  function dragCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    cleanupDrag();
    render();
  }

  function moveGhost(x, y) {
    drag.ghost.style.left = `${x - drag.offsetX}px`;
    drag.ghost.style.top = `${y - drag.offsetY}px`;
  }

  function cleanupDrag() {
    const cell = board.children[drag.index];
    cell?.removeEventListener('pointermove', dragMove);
    cell?.removeEventListener('pointerup', dragEnd);
    cell?.removeEventListener('pointercancel', dragCancel);
    cell?.classList.remove('dragging');
    drag.ghost.remove();
    drag = null;
  }

  function indexFromPoint(x, y) {
    const element = document.elementFromPoint(x, y)?.closest?.('.cell');
    if (!element || !board.contains(element) || element.classList.contains('basket-slot')) return null;
    return Number(element.dataset.index);
  }

  function canMerge(a, b) {
    return a && b && a.chain === b.chain && a.rank === b.rank && a.rank < chainFor(a).values.length;
  }

  function mergeAt(sourceIndex, targetIndex) {
    const next = tile(values[targetIndex].chain, values[targetIndex].rank + 1);
    values[sourceIndex] = null;
    values[targetIndex] = next;
    awardEnergy(next.rank);
    markAchieved(next);
    render(targetIndex);
    if (isLevelComplete()) setTimeout(completeLevel, 460);
  }

  function awardEnergy(rank) {
    if (level !== 2 || !ENERGY_REWARD[rank]) return;
    energy = Math.min(ENERGY_MAX, energy + ENERGY_REWARD[rank]);
  }

  function markAchieved(value) {
    levels[level].goals.forEach(goal => {
      if (goal.chain === value.chain && goal.rank === value.rank) achieved.add(tileKey(value));
    });
  }

  function isLevelComplete() {
    return levels[level].goals.every(goal => achieved.has(tileKey(goal)));
  }

  function fireBasket() {
    if (level !== 2) return;
    if (energy < FIRE_COST) {
      basket.classList.add('blocked');
      setTimeout(() => basket.classList.remove('blocked'), 320);
      return;
    }
    const empty = values
      .map((value, index) => value || index === levels[level].basketIndex ? -1 : index)
      .filter(index => index >= 0);
    if (!empty.length) {
      basket.classList.add('blocked');
      setTimeout(() => basket.classList.remove('blocked'), 320);
      return;
    }
    energy -= FIRE_COST;
    const target = empty[Math.floor(Math.random() * empty.length)];
    const chain = Math.random() < 0.5 ? 'number' : 'letter';
    values[target] = tile(chain, 1);
    basket.classList.add('fire');
    render(target);
    setTimeout(() => basket.classList.remove('fire'), 260);
  }

  function completeLevel() {
    if (level === 1) {
      transition.classList.add('show');
      transition.setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        startLevel(2);
        transition.classList.remove('show');
        transition.setAttribute('aria-hidden', 'true');
      }, Number(config.transitionDuration) || 1250);
    } else {
      finish.classList.add('show');
      finish.setAttribute('aria-hidden', 'false');
      confetti();
    }
  }

  function confetti() {
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    const colors = [config.primaryColor, config.secondaryColor, '#ffd54f', '#43c99a'];
    const bits = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.clientWidth,
      y: -20 - Math.random() * 300,
      vx: (Math.random() - .5) * 3,
      vy: 2 + Math.random() * 4,
      s: 4 + Math.random() * 7,
      c: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    (function draw(now) {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      bits.forEach(bit => {
        bit.x += bit.vx;
        bit.y += bit.vy;
        bit.vy += .025;
        ctx.fillStyle = bit.c;
        ctx.fillRect(bit.x, bit.y, bit.s, bit.s * .6);
      });
      if (now - start < 3200) requestAnimationFrame(draw);
    })(start);
  }

  basket.addEventListener('click', fireBasket);
  $('replay').addEventListener('click', () => {
    finish.classList.remove('show');
    finish.setAttribute('aria-hidden', 'true');
    startLevel(1);
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'merge-editor-config') return;
    applyConfig(event.data.config);
    window.parent.postMessage({ type: 'merge-editor-applied', version: event.data.version }, '*');
  });
  applyConfig();
  startLevel(1);
})();
