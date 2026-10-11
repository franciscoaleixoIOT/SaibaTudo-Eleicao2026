// Aplica o tema/tamanho de texto salvos ANTES da pintura (evita "flash" de tema). Arquivo externo por causa da CSP (sem scripts inline).
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('st26:prefs') || 'null');
    if (!p) return;
    var r = document.documentElement;
    if (p.tema === 'CLARO') r.setAttribute('data-theme', 'light');
    else if (p.tema === 'ESCURO') r.setAttribute('data-theme', 'dark');
    var f = { PEQUENA: 0.9, NORMAL: 1, GRANDE: 1.15, MUITO_GRANDE: 1.3 }[p.tamanhoFonte];
    if (f) r.style.setProperty('--fs', String(f));
  } catch (e) { /* sem armazenamento: usa o tema do sistema */ }
})();
