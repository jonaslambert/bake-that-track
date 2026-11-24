// Page de suivi client : un numéro, trois étapes, une alerte quand c'est prêt.
import { CONFIG } from './config.js';
{
  const $ = s => document.querySelector(s);
  const token = location.hash.slice(1).replace(/[^A-Za-z0-9]/g, '');
  const TXT = {
    attente: ['Bien reçue.', 'Elle part bientôt au four.'],
    four: ['Au four.', 'Encore quelques minutes. Le son continue.'],
    prete: ["C'est prêt !", 'Viens la chercher au comptoir avec ce numéro.'],
    servie: ['Bon appétit.', 'Merci d\'être passé.'],
    annulee: ['Commande annulée.', 'Passe au comptoir, on regarde ça ensemble.']
  };
  let actx = null, alerteOn = false, dernier = '', verrou = null, clign = null;

  function bip() {
    if (!actx) return;
    try {
      const t = actx.currentTime;
      [[988, 0], [740, .22], [988, .6], [740, .82]].forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.4, t + d + .02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + .5);
        o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + .6);
      });
    } catch (e) {}
  }

  async function prevenir(num) {
    bip();
    try { navigator.vibrate && navigator.vibrate([300, 120, 300, 120, 700]); } catch (e) {}
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const r = await navigator.serviceWorker?.getRegistration();
        const opts = { body: 'Viens la chercher au comptoir.', icon: 'icons/icon-192.png', tag: 'btt-suivi', vibrate: [300, 120, 300], data: { url: location.href } };
        if (r) r.showNotification('Commande ' + num + ' prête !', opts); else new Notification('Commande ' + num + ' prête !', opts);
      }
    } catch (e) {}
    const base = document.title; let k = 0;
    clearInterval(clign);
    clign = setInterval(() => { document.title = (k++ % 2) ? base : 'PRÊTE · ' + num; if (k > 30) { clearInterval(clign); document.title = base; } }, 800);
  }

  function render(d) {
    if (!d) { $('#num').textContent = '?'; $('#etat').textContent = 'Ticket introuvable.'; $('#sous').textContent = 'Vérifie le lien ou demande au comptoir.'; return; }
    const st = TXT[d.statut] ? d.statut : 'attente';
    $('#num').textContent = String(d.num ?? '');
    $('#etat').textContent = TXT[st][0];
    $('#sous').textContent = TXT[st][1];
    $('#contenu').textContent = d.lignes ? String(d.lignes) : '';
    const ordre = ['attente', 'four', 'prete'];
    const idx = st === 'servie' ? 3 : ordre.indexOf(st);
    document.querySelectorAll('.steps li').forEach((li, i) => li.classList.toggle('on', i <= idx && st !== 'annulee'));
    document.body.classList.toggle('pret', st === 'prete');
    if (st === 'prete' && dernier && dernier !== 'prete') prevenir(d.num);
    if (st === 'servie' || st === 'annulee') { $('#alerte').hidden = true; $('#note').textContent = ''; }
    dernier = st;
  }

  $('#alerte').onclick = async () => {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); await actx.resume(); } catch (e) {}
    try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch (e) {}
    try { verrou = await navigator.wakeLock?.request('screen'); } catch (e) {}
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    alerteOn = true;
    $('#alerte').setAttribute('aria-pressed', 'true');
    $('#alerte').textContent = 'Alerte activée';
    $('#note').textContent = 'Laisse cette page ouverte, écran allumé : on sonne et on vibre dès que c\'est prêt.';
    bip();
  };
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && alerteOn && (!verrou || verrou.released)) { try { verrou = await navigator.wakeLock?.request('screen'); } catch (e) {} }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  async function go() {
    if (!token) { render(null); return; }
    if (!CONFIG.apiKey) { render({ num: 27, statut: 'four', lignes: 'Face B part ×2 (exemple)' }); $('#note').textContent = 'Exemple : la base n\'est pas encore branchée.'; return; }
    try {
      const V = '10.12.2';
      const [A, F] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
      ]);
      const app = A.initializeApp(CONFIG);
      const fs = F.getFirestore(app);
      F.onSnapshot(F.doc(fs, 'suivi/' + token), s => render(s.exists() ? s.data() : null), () => render(null));
    } catch (e) {
      $('#etat').textContent = 'Pas de réseau.';
      $('#sous').textContent = 'Réessaie dans un instant, ou écoute le micro.';
    }
  }
  go();
}
