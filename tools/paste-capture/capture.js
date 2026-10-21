'use strict';
// Records clipboard data from paste events and posts each capture to the local server.
// All pasted content is shown with textContent only, never as HTML.
const $ = (id) => document.getElementById(id);
const box = $('box');
const captures = [];

// Pre-select the browser and OS from the user agent. The user can correct either.
const ua = navigator.userAgent;
$('browser').value = /Firefox\//.test(ua) ? 'firefox'
  : /Chrome\/|Edg\//.test(ua) ? 'chromium'
  : /Safari\//.test(ua) ? 'safari' : 'other';
$('os').value = /Windows/.test(ua) ? 'windows' : /Mac OS X/.test(ua) ? 'macos' : /Linux/.test(ua) ? 'linux' : 'other';

const readFile = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
  reader.onerror = () => resolve({ name: file.name, type: file.type, size: file.size, error: 'unreadable' });
  reader.readAsDataURL(file);
});

box.addEventListener('paste', (event) => {
  const data = event.clipboardData;
  if (!data) return;
  // getData must be called synchronously inside the event.
  const payloads = {};
  for (const type of data.types) if (type !== 'Files') payloads[type] = data.getData(type);
  const items = [...data.items].map((item) => ({ kind: item.kind, type: item.type }));
  const fileReads = [...data.files].map(readFile);

  // Let the browser insert the content, then record what it produced for comparison.
  setTimeout(async () => {
    const inserted = box.innerHTML;
    box.textContent = '';
    const capture = {
      version: 1,
      meta: {
        app: $('app').value, sample: $('sample').value.trim(), browser: $('browser').value, os: $('os').value,
        notes: $('notes').value.trim(), userAgent: ua, language: navigator.language,
        capturedAt: new Date().toISOString(),
      },
      types: Object.keys(payloads),
      items,
      payloads,
      files: await Promise.all(fileReads),
      browserInserted: inserted,
    };
    captures.push(capture);
    render();
    await save(capture, captures.length - 1);
  }, 0);
});

async function save(capture, index) {
  const status = $('status');
  try {
    const response = await fetch('/save', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(capture),
    });
    if (!response.ok) throw new Error(`server said ${response.status}`);
    const { file } = await response.json();
    capture.savedAs = file;
    status.className = '';
    status.textContent = `Saved ${file}`;
  } catch (error) {
    status.className = 'bad';
    status.textContent = `Not saved (${error.message}). Use the Download button on capture ${index + 1}.`;
  }
  render();
}

function download(capture, index) {
  const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `capture-${index + 1}-${capture.meta.app}-${capture.meta.browser}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function render() {
  const list = $('list');
  list.textContent = '';
  captures.forEach((capture, index) => {
    const li = document.createElement('li');
    const m = capture.meta;
    li.append(`${m.app} / ${m.browser} / ${m.sample || 'no sample name'}`);
    const types = document.createElement('div');
    types.className = 'types';
    types.textContent = capture.types.map((t) => `${t} (${capture.payloads[t].length} chars)`).join(', ')
      + (capture.files.length ? `, ${capture.files.length} file(s)` : '')
      + (capture.savedAs ? `, saved as ${capture.savedAs}` : ', not saved');
    li.append(types);
    const view = document.createElement('button');
    view.textContent = 'View';
    view.addEventListener('click', () => {
      const detail = $('detail');
      detail.hidden = false;
      detail.textContent = JSON.stringify({ ...capture, files: capture.files.map(({ dataUrl, ...rest }) => rest) }, null, 2);
    });
    const dl = document.createElement('button');
    dl.textContent = 'Download';
    dl.addEventListener('click', () => download(capture, index));
    li.append(view, dl);
    list.append(li);
  });
}
