/* Browser-only UI for Markdown Publish Bridge. Requires converter.js. */
(function () {
  'use strict';

  const converter = window.ArticleConverter;
  const githubSource = window.GithubSource;
  if (!converter || !githubSource) throw new Error('Required application modules failed to load');
  const $ = id => document.getElementById(id);
  const FIELDS = ['title', 'description', 'tags', 'series', 'canonicalUrl', 'coverImage'];
  const OPTIONS = ['removeDevHeading', 'removeHfHeading', 'convertAlerts', 'expandHfDetails'];
  const state = {
    target: 'devto', sourceKind: 'empty', sourceLabel: '', sourceFile: '',
    modifiedFields: new Set(), result: null, toastTimer: null, refreshTimer: null
  };

  function settings() {
    const current = {};
    for (const id of FIELDS) current[id] = $(id).value;
    for (const id of OPTIONS) current[id] = $(id).checked;
    current.sourceUrl = $('githubUrl').value;
    current.publicAssetBase = $('publicAssetBase').value;
    return current;
  }

  function deriveMetadata(force) {
    const defaults = converter.defaultMetadata($('sourceMarkdown').value, state.sourceFile);
    for (const field of FIELDS) {
      if (force || !state.modifiedFields.has(field)) $(field).value = defaults[field] || '';
    }
    if (force) state.modifiedFields.clear();
  }

  function toast(message, error) {
    const target = $('toast');
    target.textContent = message;
    target.classList.toggle('error', !!error);
    target.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => target.classList.remove('show'), 3400);
  }

  function updateSourceFooter() {
    const populated = $('sourceMarkdown').value.trim().length > 0;
    $('sourceStatus').textContent = populated ? (state.sourceLabel || 'Markdown pasted locally') : 'No article loaded';
    $('sourceWords').textContent = populated && state.result ? `${state.result.stats.words.toLocaleString('en-GB')} words` : '0 words';
  }

  function renderDiagnostics(findings, hasSource) {
    const display = $('diagnostics');
    display.replaceChildren();
    const badge = $('reviewBadge');
    if (!hasSource) {
      badge.textContent = 'Not checked';
      badge.className = 'review-badge neutral';
      const empty = document.createElement('div');
      empty.className = 'placeholder-check';
      empty.textContent = 'Load an article to run checks.';
      display.appendChild(empty);
      return;
    }
    const issues = findings.filter(finding => finding.level !== 'info');
    badge.textContent = issues.length ? `${issues.length} to review` : 'No issues detected';
    badge.className = issues.length ? 'review-badge warn' : 'review-badge ok';
    if (!findings.length) {
      const clear = document.createElement('div');
      clear.className = 'all-clear';
      clear.textContent = 'No issues detected by these limited checks. Review the source and rendered article before publishing.';
      display.appendChild(clear);
      return;
    }
    findings.forEach(finding => {
      const item = document.createElement('div');
      item.className = 'diagnostic ' + (finding.level === 'info' ? 'info' : 'warning');
      const icon = document.createElement('span');
      icon.className = 'diagnostic-icon';
      icon.textContent = finding.level === 'info' ? 'i' : '!';
      const paragraph = document.createElement('p');
      paragraph.textContent = finding.message;
      item.append(icon, paragraph);
      display.appendChild(item);
    });
  }

  function refresh() {
    const source = $('sourceMarkdown').value;
    const hasSource = !!source.trim();
    if (source.length > converter.MAX_MARKDOWN_CHARS) {
      state.result = null;
      $('metricRewritten').textContent = '0';
      $('metricCode').textContent = '0';
      $('metricWarnings').textContent = '1';
      updateSourceFooter();
      renderDiagnostics([{ level: 'warning', code: 'oversize', message: 'Markdown exceeds the 4 million character limit. Reduce the input before conversion.' }], true);
      renderTarget();
      return;
    }
    state.result = converter.convertArticle(source, settings());
    const result = state.result;
    $('metricRewritten').textContent = hasSource ? result.stats.rewritten : 0;
    $('metricCode').textContent = hasSource ? result.stats.fences : 0;
    $('metricWarnings').textContent = hasSource ? result.findings.filter(item => item.level !== 'info').length : 0;
    updateSourceFooter();
    renderDiagnostics(result.findings, hasSource);
    renderTarget();
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(refresh, 90);
  }

  function renderTarget() {
    const isDev = state.target === 'devto';
    const target = isDev ? 'devto' : 'huggingface';
    const result = state.result;
    const hasSource = !!$('sourceMarkdown').value.trim() && !!result;
    $('tabDev').classList.toggle('active', isDev);
    $('tabDev').setAttribute('aria-selected', String(isDev));
    $('tabDev').tabIndex = isDev ? 0 : -1;
    $('tabHf').classList.toggle('active', !isDev);
    $('tabHf').setAttribute('aria-selected', String(!isDev));
    $('tabHf').tabIndex = isDev ? -1 : 0;
    $('targetView').setAttribute('aria-labelledby', isDev ? 'tabDev' : 'tabHf');
    $('hfMetadata').hidden = isDev;
    $('targetTitle').textContent = isDev ? 'DEV Community Markdown' : 'Hugging Face article Markdown';
    $('targetDescription').textContent = isDev
      ? 'Includes YAML front matter for the DEV Basic Markdown editor. published: false keeps a draft.'
      : 'Paste the title into the editor, then paste the Markdown body. No DEV-specific YAML.';
    $('targetFormat').textContent = isDev ? 'YAML + MD' : 'MARKDOWN';
    $('codeName').textContent = isDev ? 'article.devto.md' : 'article.huggingface.md';
    $('outputMarkdown').value = hasSource && result ? result[target] : '';
    $('hfTitle').textContent = result && hasSource ? result.title : 'No article loaded';
    $('hfDescription').textContent = result && hasSource && result.description ? result.description : 'No description provided';
    $('copyOutputLabel').textContent = isDev ? 'Copy DEV Markdown' : 'Copy Hugging Face Markdown';
    $('editorLink').href = isDev ? 'https://dev.to/new' : 'https://huggingface.co/new-blog';
    $('copyOutput').disabled = !hasSource;
    $('downloadButton').disabled = !hasSource;
    $('copyHfTitle').disabled = !hasSource;
    $('copyHfDescription').disabled = !hasSource || !result.description;
  }

  async function copyText(value, success) {
    if (!value) { toast('Nothing to copy yet.', true); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const helper = document.createElement('textarea');
        helper.value = value;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const completed = document.execCommand('copy');
        helper.remove();
        if (!completed) throw new Error('Clipboard access denied');
      }
      toast(success);
    } catch (_) {
      $('outputMarkdown').focus();
      $('outputMarkdown').select();
      toast('Automatic copy was blocked. Select the text and use Ctrl/Cmd+C.', true);
    }
  }

  async function loadFromGitHub() {
    let ref;
    try { ref = converter.validateGithubUrl($('githubUrl').value); }
    catch (error) { toast(error.message, true); return; }
    $('loadGithub').disabled = true;
    $('loadLabel').textContent = 'Fetching...';
    $('sourceStatus').textContent = `Connecting to GitHub: ${ref.owner}/${ref.repo}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const raw = await githubSource.fetchMarkdown(ref.rawUrl, fetch, controller.signal);
      $('sourceMarkdown').value = raw;
      state.sourceKind = 'github';
      state.sourceLabel = `${ref.owner}/${ref.repo} / ${ref.file}`;
      state.sourceFile = ref.fileName;
      deriveMetadata(true);
      refresh();
      toast('Public GitHub Markdown loaded. Review the converted article.');
    } catch (error) {
      const message = error.name === 'AbortError' ? 'GitHub request timed out.' : error.message;
      toast(`${message} You can paste the Markdown instead.`, true);
      updateSourceFooter();
    } finally {
      clearTimeout(timer);
      $('loadGithub').disabled = false;
      $('loadLabel').textContent = 'Fetch';
    }
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.(md|markdown|mdx)$/i.test(file.name)) {
      toast('Choose a Markdown file (.md, .markdown or .mdx).', true);
      return;
    }
    if (file.size > 4_000_000) {
      toast('Markdown file exceeds the 4 MB safety limit.', true);
      return;
    }
    try {
      if (state.sourceKind === 'github' || state.sourceKind === 'example') $('githubUrl').value = '';
      $('sourceMarkdown').value = await file.text();
      state.sourceKind = 'file';
      state.sourceLabel = `Local file: ${file.name}`;
      state.sourceFile = file.name;
      deriveMetadata(true);
      refresh();
      toast(`Imported ${file.name}.`);
    } catch (_) {
      toast('The file could not be read.', true);
    }
  }

  function loadExample() {
    const sample = [
      '---',
      'title: "Securing Tier 0 Administration with a Bastion"',
      'description: "A practical approach to privilege isolation for one-device environments."',
      'tags: [security, devops, windows]',
      'series: "Practical Active Directory Hardening"',
      '---',
      '',
      '# Securing Tier 0 Administration with a Bastion',
      '',
      '> [!WARNING]',
      '> A bastion reduces credential exposure but cannot make a compromised daily device trustworthy.',
      '',
      '## Architecture',
      '',
      '![Network architecture](./assets/tier0-network.png)',
      '',
      'The detailed [hardening guide](../guides/hardening.md) lives in the same repository.',
      '',
      '```powershell',
      '# Example syntax must remain unchanged:',
      'Write-Output "![image](./relative.png)"',
      '```',
      '',
      '<details>',
      '<summary>Implementation notes</summary>',
      '',
      'Test logon restrictions using a non-production lab first.',
      '</details>'
    ].join('\n');
    $('sourceMarkdown').value = sample;
    $('githubUrl').value = 'https://github.com/example/docs/blob/main/articles/tier0-bastion.md';
    state.sourceKind = 'example';
    state.sourceLabel = 'Example (illustrative repository)';
    state.sourceFile = 'tier0-bastion.md';
    deriveMetadata(true);
    refresh();
    toast('Example loaded. GitHub URL is illustrative, not a live repository.');
  }

  function downloadOutput() {
    if (!state.result || !$('sourceMarkdown').value.trim()) return;
    const content = state.result[state.target];
    const name = state.result.title.toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'article';
    const fileName = `${name}.${state.target === 'devto' ? 'devto' : 'huggingface'}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Downloaded ${fileName}.`);
  }

  function wireEvents() {
    $('loadGithub').addEventListener('click', loadFromGitHub);
    $('githubUrl').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); loadFromGitHub(); }
    });
    $('githubUrl').addEventListener('input', scheduleRefresh);
    $('fileInput').addEventListener('change', event => {
      importFile(event.target.files[0]);
      event.target.value = '';
    });
    $('sourceMarkdown').addEventListener('input', () => {
      state.sourceKind = 'paste';
      state.sourceLabel = 'Markdown pasted / edited locally';
      deriveMetadata(false);
      scheduleRefresh();
    });
    for (const id of FIELDS) {
      $(id).addEventListener('input', () => { state.modifiedFields.add(id); scheduleRefresh(); });
    }
    for (const id of OPTIONS) $(id).addEventListener('change', scheduleRefresh);
    $('publicAssetBase').addEventListener('input', scheduleRefresh);
    $('resetMetadata').addEventListener('click', () => {
      deriveMetadata(true);
      refresh();
      toast('Publication metadata restored from source.');
    });
    $('demoButton').addEventListener('click', loadExample);
    $('clearButton').addEventListener('click', () => {
      $('sourceMarkdown').value = '';
      $('githubUrl').value = '';
      state.sourceKind = 'empty'; state.sourceLabel = ''; state.sourceFile = '';
      deriveMetadata(true);
      refresh();
      toast('Source cleared.');
    });
    for (const target of ['devto', 'huggingface']) {
      const button = target === 'devto' ? $('tabDev') : $('tabHf');
      button.addEventListener('click', () => { state.target = target; renderTarget(); });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'devto' : event.key === 'End' ? 'huggingface'
          : (state.target === 'devto' ? 'huggingface' : 'devto');
        state.target = next;
        (next === 'devto' ? $('tabDev') : $('tabHf')).focus();
        renderTarget();
      });
    }
    $('copyOutput').addEventListener('click', () => {
      if (state.result) copyText(state.result[state.target], 'Markdown copied to clipboard.');
    });
    $('copyHfTitle').addEventListener('click', () => {
      if (state.result) copyText(state.result.title, 'Title copied to clipboard.');
    });
    $('copyHfDescription').addEventListener('click', () => {
      if (state.result) copyText(state.result.description, 'Summary copied to clipboard.');
    });
    $('downloadButton').addEventListener('click', downloadOutput);
    const drop = $('fileDrop');
    ['dragenter', 'dragover'].forEach(name => drop.addEventListener(name, event => {
      event.preventDefault(); drop.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(name => drop.addEventListener(name, event => {
      event.preventDefault(); drop.classList.remove('dragging');
    }));
    drop.addEventListener('drop', event => importFile(event.dataTransfer.files[0]));
  }

  function main() {
    wireEvents();
    refresh();
  }

  main();
})();
