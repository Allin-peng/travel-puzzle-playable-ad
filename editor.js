(() => {
  'use strict';

  const defaults = {
    pageTitle: '旅途拼图', brand: '旅途拼图', primaryColor: '#ff9c3f', secondaryColor: '#4e9c74',
    transitionDuration: 1100, showFinger: true, level1Size: 2, level2Size: 5,
    level1Badge: '轻松热身', level1Title: '拼好动物房车', level1Subtitle: '拖动拼图，交换它们的位置',
    level1Tip: '拼出完整矩形后，图块自动合成', level2Badge: '高能挑战', level2Title: '还原旅行风景',
    level2Subtitle: '25 块拼图，挑战你的观察力', level2Tip: '只有完整矩形才能合成并整体拖动',
    difficultyKicker: 'LEVEL UP', difficultyTitle: '难度飙升', difficultySubtitle: '真正的挑战，现在开始！',
    finishBadge: '挑战成功', finishTitle: '太棒了！', finishSubtitle: '两幅拼图都完成啦', replayText: '再玩一次',
    level1Complete: '完美！第一关完成', level1Image: './assets/level-1.jpg', level2Image: './assets/level-2.jpg'
  };
  let config = { ...defaults };
  let templateFiles;
  let previewTimer;

  const fields = [...document.querySelectorAll('[data-field]')];
  const frame = document.getElementById('previewFrame');
  const toast = document.getElementById('editorToast');

  async function loadTemplates() {
    const [html, css, js, image1, image2] = await Promise.all([
      fetch('./index.html').then(r => r.text()), fetch('./style.css').then(r => r.text()), fetch('./game.js').then(r => r.text()),
      fetch('./assets/level-1.jpg').then(r => r.blob()).then(blobToDataUrl), fetch('./assets/level-2.jpg').then(r => r.blob()).then(blobToDataUrl)
    ]);
    templateFiles = { html, css, js };
    config.level1Image = image1;
    config.level2Image = image2;
    document.getElementById('level1Thumb').src = image1;
    document.getElementById('level2Thumb').src = image2;
    fillFields();
    updatePreview();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function fillFields() {
    fields.forEach(field => {
      const value = config[field.dataset.field];
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value;
    });
  }

  function readField(field) {
    const key = field.dataset.field;
    config[key] = field.type === 'checkbox' ? field.checked : field.type === 'select-one' ? (/Size|Duration/.test(key) ? Number(field.value) : field.value) : field.value;
    schedulePreview();
  }

  function composePlayable() {
    const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
    const safeGame = templateFiles.js.replace(/<\/script/gi, '<\\/script');
    let html = templateFiles.html
      .replace(/\s*<link rel="preload"[^>]+>/g, '')
      .replace('<link rel="stylesheet" href="style.css">', `<style>\n${templateFiles.css}\n</style>`)
      .replace('<script src="game.js"></script>', `<script>window.PUZZLE_CONFIG=${safeConfig};<\/script>\n<script>\n${safeGame}\n<\/script>`);
    return html;
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 220);
  }

  function updatePreview() {
    if (!templateFiles) return;
    frame.srcdoc = composePlayable();
  }

  function exportPlayable() {
    if (!templateFiles) return;
    const blob = new Blob([composePlayable()], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    const cleanName = (config.pageTitle || 'puzzle-playable').replace(/[\\/:*?"<>|]/g, '-');
    link.href = URL.createObjectURL(blob);
    link.download = `${cleanName}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('已导出单文件 HTML，可直接发布');
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  fields.forEach(field => {
    field.addEventListener(field.type === 'text' ? 'input' : 'change', () => readField(field));
  });
  document.querySelectorAll('.section-title').forEach(button => button.addEventListener('click', () => {
    const section = button.closest('.control-section');
    section.classList.toggle('open');
    button.querySelector('b').textContent = section.classList.contains('open') ? '⌃' : '⌄';
  }));
  ['level1', 'level2'].forEach(level => {
    document.getElementById(`${level}File`).addEventListener('change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) return showToast('图片请控制在 6MB 以内');
      config[`${level}Image`] = await blobToDataUrl(file);
      document.getElementById(`${level}Thumb`).src = config[`${level}Image`];
      updatePreview();
    });
  });
  document.getElementById('refreshPreview').addEventListener('click', updatePreview);
  document.getElementById('exportButton').addEventListener('click', exportPlayable);
  document.getElementById('resetButton').addEventListener('click', () => {
    config = { ...defaults, level1Image: config.level1Image, level2Image: config.level2Image };
    fillFields(); updatePreview(); showToast('设置已恢复默认');
  });

  loadTemplates().catch(error => {
    console.error(error);
    showToast('模板加载失败，请通过在线地址打开编辑器');
  });
})();
