(() => {
  'use strict';

  const defaults = {
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

  let config = { ...defaults };
  const pendingImages = { background: defaults.backgroundImage, board: defaults.boardImage };
  const emptyPreview = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  let timer;
  let version = 0;
  let ready = false;
  let previewUrl = '';
  let templateFiles = null;
  const frame = document.getElementById('preview');
  const fields = [...document.querySelectorAll('[data-field]')];
  const status = document.getElementById('status');
  const dot = document.getElementById('dot');
  const toast = document.getElementById('toast');
  const applyMediaButton = document.getElementById('applyMedia');

  function fill() {
    fields.forEach(field => {
      const value = config[field.dataset.field];
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value;
    });
    pendingImages.background = config.backgroundImage;
    pendingImages.board = config.boardImage;
    updateThumb('background');
    updateThumb('board');
    applyMediaButton.classList.remove('pending');
  }

  function updateThumb(type) {
    const image = document.getElementById(`${type}Thumb`);
    const value = pendingImages[type];
    image.src = value || emptyPreview;
    image.alt = value ? `${type === 'background' ? '背景' : '棋盘'}图预览` : '';
    image.classList.toggle('empty', !value);
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} 加载失败 (${response.status})`);
    return response.text();
  }

  async function loadTemplates() {
    try {
      const [html, css, js] = await Promise.all([
        fetchText('./index.html'),
        fetchText('./style.css'),
        fetchText('./game.js')
      ]);
      templateFiles = { html, css, js };
      renderPreview();
    } catch (error) {
      console.error(error);
      setStatus('error', '模板加载失败，已切换普通预览');
      frame.src = `index.html?preview=${Date.now()}`;
    }
  }

  function composePreview() {
    const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
    const safeGame = templateFiles.js.replace(/<\/script/gi, '<\\/script');
    return templateFiles.html
      .replace(/<link rel="stylesheet" href="style\.css(?:\?[^"]*)?">/, `<style>\n${templateFiles.css}\n</style>`)
      .replace(/<script src="game\.js(?:\?[^"]*)?"><\/script>/, `<script>window.MERGE_CONFIG=${safeConfig};<\/script>\n<script>\n${safeGame}\n<\/script>`);
  }

  function renderPreview() {
    ready = false;
    setStatus('loading', '正在加载预览…');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!templateFiles) {
      frame.src = `index.html?preview=${Date.now()}`;
      return;
    }
    previewUrl = URL.createObjectURL(new Blob([composePreview()], { type: 'text/html;charset=utf-8' }));
    frame.src = previewUrl;
  }

  function send() {
    if (!ready) return;
    version++;
    frame.contentWindow.postMessage({ type: 'merge-editor-config', version, config }, '*');
    setStatus('loading', '正在更新预览…');
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(send, 80);
  }

  function setStatus(state, text) {
    dot.className = state;
    status.textContent = text;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function show(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  fields.forEach(field => {
    const update = () => {
      config[field.dataset.field] = field.type === 'checkbox'
        ? field.checked
        : field.tagName === 'SELECT'
          ? Number(field.value)
          : field.value;
      schedule();
    };
    field.addEventListener('input', update);
    field.addEventListener('change', update);
  });

  document.querySelectorAll('.section-title').forEach(button => button.addEventListener('click', () => {
    const section = button.closest('section');
    section.classList.toggle('open');
    button.querySelector('i').textContent = section.classList.contains('open') ? '⌃' : '⌄';
  }));

  ['background', 'board'].forEach(type => {
    document.getElementById(`${type}File`).addEventListener('change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) {
        show('图片请控制在 6MB 以内');
        return;
      }
      pendingImages[type] = await blobToDataUrl(file);
      updateThumb(type);
      applyMediaButton.classList.add('pending');
      show('图片已选择，点击应用后同步到预览');
    });
  });

  applyMediaButton.addEventListener('click', () => {
    config.backgroundImage = pendingImages.background;
    config.boardImage = pendingImages.board;
    applyMediaButton.classList.remove('pending');
    send();
    show('背景/棋盘图已应用到预览');
  });

  frame.addEventListener('load', () => {
    ready = true;
    send();
  });
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.data?.type !== 'merge-editor-applied' || event.data.version !== version) return;
    setStatus('', '实时手机预览 · 已更新');
  });

  document.getElementById('restart').addEventListener('click', renderPreview);
  document.getElementById('reset').addEventListener('click', () => {
    config = { ...defaults };
    fill();
    send();
    show('设置已恢复默认');
  });
  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'merge-ad-config.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    show('已导出配置文件');
  });

  fill();
  loadTemplates();
})();
