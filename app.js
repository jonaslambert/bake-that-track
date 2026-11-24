import { connect, configured } from './fb.js';

{
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)?n:d};
const E0=new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const E2=new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
const eur=n=>{const r=Math.round(n*100)/100;return (Number.isInteger(r)?E0:E2).format(r)};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const MOIS=['JANV','FÉVR','MARS','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
const JOURS=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
const STAT={piste:'Piste',option:'Option',confirme:'Confirmé',passe:'Passé',annule:'Annulé'};
const CST={attente:'À faire',four:'Au four',prete:'Prête',servie:'Servie',annulee:'Annulée'};
const PAY={cash:'Cash',carte:'Carte',offert:'Offert'};
const ETAPES=[
 ['Accord avec le lieu',['Date et horaires validés par écrit','Contraintes notées : fours, électricité ou gaz, froid, espace','Contact du lieu pour le jour J']],
 ['Format, prix, objectif',['Formule et cachet fixés','Prix de la part annoncé','Objectif net partagé avec l\'équipe']],
 ['Menu et quantités',['Menu court arrêté','Nombre de pâtons fixé dans l\'appli','Courses faites']],
 ['Pâte',['Pâte pétrie','Pousse et froid prévus','Pâtons comptés']],
 ['Matériel',['Four, pierre, pelles, bacs','Son : contrôleur, platines, câbles, micro','Van chargé et vérifié']],
 ['Postes',['Qui fait quoi, et qui tourne quand','Plan B si quelqu\'un manque']],
 ['Circulation',['Caisse, tickets, monnaie','File et sortie des pizzas']],
 ['Annonces et set',['Phrases d\'appel relues','Écran d\'appel branché sur la table','Rituel ou interaction prévu']],
 ['Après',['Nettoyage et retour du matériel','Bilan relu dans les 48 h']]];
const PHRASES=['Commande {n}. Elle refroidit en t\'attendant.','Le {n} est sorti du four.','Commande {n}, face A terminée.','Numéro {n}. On la garde au chaud, pas longtemps.','{n}. Le four a parlé.'];

let db=null,conn=null,me='',canWrite=true,live=false;
const S={soirees:new Map(),cmds:new Map(),config:{soireeActive:'',phrases:PHRASES}};
let view='caisse',sel='',ticket={lignes:[],nom:'',paiement:'cash'};
let son=false,voix=false,actx=null,unsubCmd=null,cmdFor='';
const annonces=new Set(),flashIds=new Set();const T0=Date.now();
const dirty=new Map(),busy=new Set(),timers={};
const bilans=new Map();

/* ---------- utilitaires ---------- */
const active=()=>S.soirees.get(S.config.soireeActive)||null;
const P=s=>Math.max(1,num(s&&s.parts,4));
const partsOf=(c,s)=>(c.lignes||[]).reduce((a,l)=>a+num(l.qte)*(l.unite==='entiere'?P(s):1),0);
const cmdsActive=()=>[...S.cmds.values()].filter(c=>c.soiree===S.config.soireeActive);
function stock(s,list){const tot=num(s&&s.patons)*P(s);const used=(list||cmdsActive()).filter(c=>c.statut!=='annulee').reduce((a,c)=>a+partsOf(c,s),0);const rest=Math.max(0,tot-used);return {tot,used,rest,piz:Math.floor(rest/P(s)),pa:rest%P(s)}}
function dateParts(d){if(!d)return null;const x=new Date(d+'T12:00:00');if(isNaN(x))return null;return {j:x.getDate(),m:MOIS[x.getMonth()],w:JOURS[x.getDay()],y:x.getFullYear()}}
const hm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
function age(t){const s=Math.max(0,Math.floor((Date.now()-t)/1000));if(s>5400)return hm(t);const m=Math.floor(s/60);return m+' min '+String(s%60).padStart(2,'0')}
function toast(msg,cls,act){const el=document.createElement('div');el.className='toast '+(cls||'');const sp=document.createElement('span');sp.textContent=msg;el.append(sp);if(act){const b=document.createElement('button');b.type='button';b.textContent=act[0];b.onclick=()=>{act[1]();el.remove()};el.append(b)}$('#toasts').append(el);setTimeout(()=>el.remove(),act?7000:4200)}
function setEtat(cls,txt){const e=$('#etat');e.className='etat '+cls;e.lastElementChild.textContent=txt}
function banner(txt){const b=$('#banner');b.textContent=txt||'';b.classList.toggle('on',!!txt)}
let dlgCb=null;
function ask(t,p,yes,cb){$('#dlgT').textContent=t;$('#dlgP').textContent=p;$('#dlgYes').textContent=yes;dlgCb=cb;$('#dlg').classList.add('on');$('#dlgNo').focus()}
$('#dlgNo').onclick=()=>{$('#dlg').classList.remove('on');dlgCb=null};
$('#dlgYes').onclick=()=>{$('#dlg').classList.remove('on');const c=dlgCb;dlgCb=null;if(c)c()};

/* ---------- écriture ---------- */
async function put(path,data){if(!db)return true;try{await db.doc(path).set(data);return true}catch(e){fail(e);return false}}
async function del(path){if(!db)return true;try{await db.doc(path).delete();return true}catch(e){fail(e);return false}}
async function upd(path,data){if(!db)return true;try{await db.doc(path).update(data);return true}catch(e){fail(e);return false}}
function fail(e){const c=e&&e.code;if(c==='invalid_argument'&&!canWrite)return;if(c==='quota_exceeded'){toast('Base pleine : supprime de vieilles soirées.');return}if(c==='permission-denied'){toast('Accès refusé : ce téléphone n\'est pas dans l\'équipe.');return}toast('Pas enregistré ('+(c||'erreur')+'). Réessaie.')}
function patchSoiree(id,key,val){const s=S.soirees.get(id);if(!s)return;s[key]=val;const p=dirty.get(id)||{};p[key]=val;dirty.set(id,p);clearTimeout(timers[id]);timers[id]=setTimeout(()=>flushSoiree(id),650);setEtat('lent','Enregistrement…')}
async function flushSoiree(id){if(busy.has(id)){timers[id]=setTimeout(()=>flushSoiree(id),400);return}const p=dirty.get(id);dirty.delete(id);if(!p)return;busy.add(id);await upd('soirees/'+id,p);busy.delete(id);if(dirty.has(id))flushSoiree(id);else setEtatLive()}
function setEtatLive(){if(!db)setEtat('demo','Démo, rien n\'est gardé');else if(!canWrite)setEtat('ro','Lecture seule');else setEtat(live?'':'lent',live?'En direct':'Connexion…')}

/* ---------- son et voix ---------- */
function chime(){if(!son||!actx)return;try{const t=actx.currentTime;[[988,0],[740,.22]].forEach(([f,d])=>{const o=actx.createOscillator(),g=actx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0.0001,t+d);g.gain.exponentialRampToValueAtTime(0.35,t+d+.02);g.gain.exponentialRampToValueAtTime(0.0001,t+d+.9);o.connect(g).connect(actx.destination);o.start(t+d);o.stop(t+d+1)})}catch(e){}}
const fileVoix=[];let parle=false;
function dire(txt){if(!voix)return;fileVoix.push(txt);if(!parle)suite()}
async function suite(){const t=fileVoix.shift();if(!t){parle=false;return}parle=true;try{if(window.speechSynthesis){await new Promise(r=>{const u=new SpeechSynthesisUtterance(t);u.lang='fr-FR';u.rate=1;const fv=speechSynthesis.getVoices().find(v=>/^fr/i.test(v.lang));if(fv)u.voice=fv;u.onend=r;u.onerror=r;speechSynthesis.speak(u);setTimeout(r,9000)})}}catch(e){}setTimeout(suite,500)}
function phrase(c){const ph=(S.config.phrases&&S.config.phrases.length?S.config.phrases:PHRASES);const t=ph[(num(c.num)+ph.length)%ph.length].replace(/\{n\}/g,String(c.num));return c.nom?String(c.nom)+'. '+t:t}
function annonce(c,force){if(!force&&annonces.has(c.id))return;annonces.add(c.id);flashIds.add(c.id);setTimeout(()=>{flashIds.delete(c.id);if(view==='ecran')renderEcran()},6000);chime();dire(phrase(c));toast('Commande '+c.num+(c.nom?' ('+c.nom+')':'')+' prête','prete');notifier('Commande '+c.num+' prête',(c.nom?c.nom+' · ':'')+resume(c,active()));$('#ticker').textContent=phrase(c)}

/* ---------- rendu : bandeau ---------- */
function renderTop(){const s=active();$('#soirTitre').textContent=s?(s.titre||'Sans titre')+(s.lieu?' · '+s.lieu:''):'Aucune soirée choisie (onglet Soirées)'}

/* ---------- rendu : caisse ---------- */
function nextNum(){return cmdsActive().reduce((m,c)=>Math.max(m,num(c.num)),0)+1}
function ticketParts(){const s=active();return ticket.lignes.reduce((a,l)=>a+l.qte*(l.unite==='entiere'?P(s):1),0)}
function renderCaisse(){
 const s=active();const st=stock(s);const pct=st.tot?Math.round(st.rest/st.tot*100):0;const tp=ticketParts();
 $('#stock').className='stock'+(pct<15?' bas':'');
 $('#stock').innerHTML=s?`<b class="nb">${st.piz} pizza${st.piz>1?'s':''}${st.pa?' + '+st.pa+' part'+(st.pa>1?'s':''):''}</b><div class="m" role="meter" aria-valuemin="0" aria-valuemax="${st.tot}" aria-valuenow="${st.rest}" aria-label="Pâte restante"><i style="width:${pct}%"></i></div><span class="muted">sur ${esc(num(s.patons))} pâtons</span>`:'<span class="muted">Choisis la soirée en cours dans l\'onglet Soirées pour afficher son menu.</span>';
 $('#finPate').classList.toggle('on',!!s&&st.tot>0&&st.rest<=0);
 const menu=(s&&s.menu)||[];
 $('#menu').innerHTML=menu.map(m=>{const pe=num(m.entiere,num(m.part)*P(s));const nope=!canWrite||st.rest-tp<1;return `<div class="card pz"><h3>${esc(m.nom||'Sans nom')}</h3><p>${esc(m.compo)}</p><div class="acts"><button class="btn" type="button" data-add="${esc(m.id)}" data-u="part" ${nope?'disabled':''}>Part<span class="nb">${eur(num(m.part))}</span></button><button class="btn" type="button" data-add="${esc(m.id)}" data-u="entiere" ${!canWrite||st.rest-tp<P(s)?'disabled':''}>Entière<span class="nb">${eur(pe)}</span></button></div></div>`}).join('')||(s?'<p class="muted">Pas encore de pizzas au menu : ajoute-les dans l\'onglet Soirées.</p>':'');
 renderTicket();
 const list=cmdsActive().sort((a,b)=>num(b.num)-num(a.num));
 $('#dernInfo').textContent=list.length?list.filter(c=>c.statut!=='annulee').length+' commandes ce soir':'';
 $('#dern').innerHTML=list.slice(0,12).map(c=>`<tr><td class="n nb">${esc(c.num)}</td><td>${esc(resume(c,s))}${c.nom?' <span class="muted">· '+esc(c.nom)+'</span>':''}</td><td class="hide-s">${esc(PAY[c.paiement]||'')}</td><td class="r nb">${eur(num(c.total))}</td><td><span class="pill ${esc(c.statut)}">${esc(CST[c.statut]||'')}</span></td><td class="r">${c.statut==='attente'&&canWrite?`<button class="btn lien s" type="button" data-annul="${esc(c.id)}">Annuler</button>`:c.statut==='prete'?`<button class="btn s" type="button" data-rappel="${esc(c.id)}">Rappeler</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Pas encore de commande.</td></tr>';
}
function resume(c,s){return (c.lignes||[]).map(l=>l.nom+' '+(l.unite==='entiere'?'entière':'part')+(l.qte>1?' ×'+l.qte:'')).join(', ')}
function renderTicket(){const oq=$('#optQr');if(oq){oq.checked=!!S.config.qr;oq.disabled=!canWrite}
 const s=active();const n=nextNum();$('#tkNum').textContent=n;$('#mbNum').textContent='N° '+n;
 const tot=ticket.paiement==='offert'?0:ticket.lignes.reduce((a,l)=>a+l.qte*l.prix,0);
 $('#tkLignes').innerHTML=ticket.lignes.length?ticket.lignes.map((l,i)=>`<li><span>${esc(l.nom)}<small>${l.unite==='entiere'?'entière':'part'} · ${eur(l.prix)}</small></span><span class="q"><button type="button" data-q="${i}" data-d="-1" aria-label="Moins">−</button><span class="nb">${l.qte}</span><button type="button" data-q="${i}" data-d="1" aria-label="Plus">+</button></span><span class="nb">${eur(l.qte*l.prix)}</span></li>`).join(''):'<li class="vide">Touche une pizza pour commencer.</li>';
 $('#tkTot').textContent=eur(tot);$('#mbTot').textContent=eur(tot);
 for(const b of document.querySelectorAll('#tkPay button'))b.setAttribute('aria-pressed',String(b.dataset.pay===ticket.paiement));
 $('#tkSend').disabled=!ticket.lignes.length||!s||!canWrite;
}
$('#menu').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;const s=active();const m=(s.menu||[]).find(x=>x.id===b.dataset.add);if(!m)return;const u=b.dataset.u;const prix=u==='entiere'?num(m.entiere,num(m.part)*P(s)):num(m.part);const l=ticket.lignes.find(x=>x.id===m.id&&x.unite===u);if(l)l.qte++;else ticket.lignes.push({id:m.id,nom:m.nom||'Pizza',unite:u,qte:1,prix});renderCaisse()});
$('#tkLignes').addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(!b)return;const l=ticket.lignes[+b.dataset.q];l.qte+=+b.dataset.d;if(l.qte<=0)ticket.lignes.splice(+b.dataset.q,1);renderCaisse()});
$('#tkPay').addEventListener('click',e=>{const b=e.target.closest('[data-pay]');if(!b)return;ticket.paiement=b.dataset.pay;renderTicket()});
$('#tkNom').addEventListener('input',e=>{ticket.nom=e.target.value});
$('#tkVider').onclick=()=>{ticket={lignes:[],nom:'',paiement:ticket.paiement};$('#tkNom').value='';renderCaisse()};
$('#mbGo').onclick=()=>$('#ticket').scrollIntoView({behavior:'smooth'});
$('#tkSend').onclick=async()=>{const s=active();if(!s||!ticket.lignes.length)return;const id=uid();const n=nextNum();const tot=ticket.paiement==='offert'?0:ticket.lignes.reduce((a,l)=>a+l.qte*l.prix,0);
 const suivi=uid()+uid();const c={soiree:s.id,num:n,lignes:ticket.lignes.map(l=>({id:l.id,nom:l.nom,unite:l.unite,qte:l.qte,prix:l.prix})),nom:ticket.nom.trim().slice(0,30),paiement:ticket.paiement,total:tot,statut:'attente',t:{c:Date.now()},par:me,suivi};
 S.cmds.set(id,{...c,id});ticket={lignes:[],nom:'',paiement:ticket.paiement};$('#tkNom').value='';renderAll();
 if(S.config.qr)montrerQR(n,suivi);if(await put('commandes/'+id,c)){toast('Commande '+n+' envoyée en cuisine.');put('suivi/'+suivi,{num:n,statut:'attente',titre:s.titre||'',lignes:resume(c,s),maj:Date.now()})}};
$('#dern').addEventListener('click',e=>{const a=e.target.closest('[data-annul]'),r=e.target.closest('[data-rappel]');if(a){const c=S.cmds.get(a.dataset.annul);if(c)ask('Annuler la commande '+c.num+' ?','Elle sort de la file et les parts reviennent au stock.','Annuler la commande',()=>setStatut(c,'annulee'))}if(r){const c=S.cmds.get(r.dataset.rappel);if(c)annonce(c,true)}});

/* ---------- rendu : cuisine ---------- */
async function setStatut(c,st){const t={...(c.t||{})};const k={four:'f',prete:'p',servie:'s',annulee:'x',attente:'c'}[st];if(k&&k!=='c')t[k]=Date.now();c.statut=st;c.t=t;renderAll();if(st==='prete')annonce(c,true);await upd('commandes/'+c.id,{statut:st,t});if(c.suivi)put('suivi/'+c.suivi,{num:c.num,statut:st,titre:(active()||{}).titre||'',lignes:resume(c,active()),maj:Date.now()})}
function cmdCard(c,s){const vieux=c.statut!=='prete'&&Date.now()-num(c.t&&c.t.c)>20*60000;const nxt={attente:['four','Au four','or'],four:['prete','Prête','ok'],prete:['servie','Servie','']}[c.statut];const prev={four:'attente',prete:'four'}[c.statut];
 return `<div class="card cmd${flashIds.has(c.id)?' flash':''}"><div class="hd"><b class="nb">${esc(c.num)}</b><span class="age nb${vieux?' vieux':''}" data-age="${num(c.t&&(c.statut==='prete'?c.t.p:c.t.c))}">${age(num(c.t&&(c.statut==='prete'?c.t.p:c.t.c)))}</span></div><ul>${(c.lignes||[]).map(l=>`<li>${esc(l.nom)} · ${l.unite==='entiere'?'entière':esc(l.qte)+' part'+(l.qte>1?'s':'')}${l.unite==='entiere'&&l.qte>1?' ×'+esc(l.qte):''}</li>`).join('')}</ul>${c.nom?`<div class="nom">${esc(c.nom)}</div>`:''}${canWrite?`<div class="acts"><button class="btn ${nxt[2]}" type="button" data-go="${esc(c.id)}" data-st="${nxt[0]}">${nxt[1]}</button>${c.statut==='prete'?`<button class="btn s" type="button" data-rappel="${esc(c.id)}">Rappeler</button>`:''}${prev?`<button class="btn s" type="button" data-go="${esc(c.id)}" data-st="${prev}">Retour</button>`:''}</div>`:''}</div>`}
function renderCuisine(){const s=active();const list=cmdsActive().sort((a,b)=>num(a.num)-num(b.num));
 const by=k=>list.filter(c=>c.statut===k);const A=by('attente'),F=by('four'),Pr=by('prete');
 $('#nA').textContent=A.length;$('#nF').textContent=F.length;$('#nP').textContent=Pr.length;
 $('#colA').innerHTML=A.map(c=>cmdCard(c,s)).join('')||'<div class="vide-col">Rien en attente.</div>';
 $('#colF').innerHTML=F.map(c=>cmdCard(c,s)).join('')||'<div class="vide-col">Four vide.</div>';
 $('#colP').innerHTML=Pr.map(c=>cmdCard(c,s)).join('')||'<div class="vide-col">Rien à appeler.</div>';
 const agg={};for(const c of A)for(const l of c.lignes||[]){agg[l.nom]=(agg[l.nom]||0)+num(l.qte)*(l.unite==='entiere'?P(s):1)}
 $('#aEnfourner').innerHTML=Object.entries(agg).map(([n,p])=>`<span>${esc(n)} <em>· ${p} part${p>1?'s':''} ≈ ${Math.ceil(p/P(s))} pizza${Math.ceil(p/P(s))>1?'s':''}</em></span>`).join('')||'<span class="muted" style="background:none;padding:0;font-weight:600">Aucune commande en attente.</span>';
 const st=stock(s);$('#cuiInfo').textContent=s?`Pâte : ${st.piz} pizza${st.piz>1?'s':''}${st.pa?' + '+st.pa+' part'+(st.pa>1?'s':''):''} restantes`:'';
}
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g){const c=S.cmds.get(g.dataset.go);if(c)setStatut(c,g.dataset.st);return}const r=e.target.closest('#v-cuisine [data-rappel]');if(r){const c=S.cmds.get(r.dataset.rappel);if(c)annonce(c,true)}});
setInterval(()=>{if(view!=='cuisine')return;for(const el of document.querySelectorAll('[data-age]'))el.textContent=age(+el.dataset.age)},1000);

/* ---------- rendu : écran ---------- */
function renderEcran(){const s=active();const list=cmdsActive();const pr=list.filter(c=>c.statut==='prete').sort((a,b)=>num(b.t&&b.t.p)-num(a.t&&a.t.p));const fo=list.filter(c=>c.statut==='four').sort((a,b)=>num(a.num)-num(b.num));const at=list.filter(c=>c.statut==='attente').length;const st=stock(s);
 $('#prets').innerHTML=pr.slice(0,8).map(c=>`<b class="nb${flashIds.has(c.id)?' new':''}">${esc(c.num)}</b>`).join('')||`<div class="rien">${s&&st.tot>0&&st.rest<=0?'Plus de pâte.<br>Le son, lui, continue.':'Rien à appeler pour l\'instant.'}</div>`;
 $('#aufour').innerHTML=fo.map(c=>`<b class="nb">${esc(c.num)}</b>`).join('')||'<p>Rien au four.</p>';
 $('#ecAtt').textContent=at?at+' commande'+(at>1?'s':'')+' en attente.':'';
 $('#ecSon').textContent=voix?'Voix activée':'Activer le son et la voix';
}
$('#ecSon').onclick=async()=>{try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();await actx.resume()}catch(e){}son=true;voix=true;renderEcran();chime();dire('Le son est branché. On appelle les commandes ici.');garderAllume()};
$('#ecFull').onclick=()=>{const el=document.documentElement;try{(el.requestFullscreen||el.webkitRequestFullscreen).call(el)?.catch?.(()=>toast('Plein écran refusé ici.'))}catch(e){toast('Plein écran refusé ici.')}};
document.addEventListener('click',()=>{if(!actx){try{actx=new (window.AudioContext||window.webkitAudioContext)();actx.resume();son=true}catch(e){}}},{once:true});

/* ---------- rendu : soirées ---------- */
function sortSoirees(){return [...S.soirees.values()].sort((a,b)=>{const da=a.date||'9999',dbb=b.date||'9999';const today=new Date().toISOString().slice(0,10);const pa=da<today,pb=dbb<today;if(pa!==pb)return pa?1:-1;return pa?dbb.localeCompare(da):da.localeCompare(dbb)})}
function checkProg(s){const tot=ETAPES.reduce((a,e)=>a+e[1].length,0);const ok=Object.values(s.check||{}).filter(Boolean).length;return [ok,tot]}
function renderSoirees(){const arr=sortSoirees();if(!sel||!S.soirees.has(sel))sel=(active()||arr[0]||{}).id||'';
 $('#soireeList').innerHTML=arr.map(s=>{const d=dateParts(s.date);const [ok,tot]=checkProg(s);return `<button type="button" class="si" data-sel="${esc(s.id)}" aria-current="${s.id===sel}"><div class="d">${d?`<b>${d.j}</b><span>${d.m}</span>`:'<span>SANS<br>DATE</span>'}</div><div><strong>${esc(s.titre||'Sans titre')}</strong><div class="mt"><span class="pill ${esc(s.statut)}">${esc(STAT[s.statut]||'')}</span>${s.id===S.config.soireeActive?'<span class="encours">En cours</span>':''}<span>${esc(s.lieu||'')}</span><span class="nb">${ok}/${tot}</span></div></div></button>`}).join('')||'<p class="muted">Aucune soirée. Crée la première.</p>';
 renderFiche();}
function renderFiche(){const s=S.soirees.get(sel);const f=$('#fiche');if(!s){f.innerHTML='<p class="muted">Choisis ou crée une soirée.</p>';return}
 const foc=document.activeElement&&f.contains(document.activeElement)?[document.activeElement.dataset.k||'',document.activeElement.dataset.mi||'',document.activeElement.dataset.mf||'',document.activeElement.selectionStart]:null;
 const ro=canWrite?'':'disabled';const d=dateParts(s.date);const [ok,tot]=checkProg(s);
 f.innerHTML=`<input class="titre" data-k="titre" value="${esc(s.titre)}" aria-label="Titre de la soirée" ${ro}>
 <div class="seg" style="margin-top:12px" id="segStat">${Object.entries(STAT).map(([k,v])=>`<button type="button" data-stat="${k}" aria-pressed="${s.statut===k}" ${ro}>${v}</button>`).join('')}</div>
 <section><h2>L'essentiel</h2><div class="g">
  <label class="f">Date<input class="i" type="date" data-k="date" value="${esc(s.date)}" ${ro}></label>
  <label class="f">Début<input class="i" type="time" data-k="debut" value="${esc(s.debut)}" ${ro}></label>
  <label class="f">Fin<input class="i" type="time" data-k="fin" value="${esc(s.fin)}" ${ro}></label>
  <label class="f">Lieu<input class="i" data-k="lieu" value="${esc(s.lieu)}" ${ro}></label>
  <label class="f">Adresse<input class="i" data-k="adresse" value="${esc(s.adresse)}" ${ro}></label>
  <label class="f">Contact du lieu<input class="i" data-k="contact" value="${esc(s.contact)}" ${ro}></label>
  <label class="f">Pâtons prévus<input class="i" inputmode="numeric" data-k="patons" value="${esc(s.patons)}" ${ro}></label>
  <label class="f">Parts par pizza<input class="i" inputmode="numeric" data-k="parts" value="${esc(s.parts)}" ${ro}></label>
 </div>${d?`<p class="muted" style="margin:10px 0 0">${d.w} ${d.j} ${d.m.toLowerCase()} ${d.y}${s.debut?' · '+esc(s.debut)+(s.fin?' → '+esc(s.fin):''):''}</p>`:''}</section>
 <section><h2>Menu</h2>${(s.menu||[]).map((m,i)=>`<div class="mrow"><label class="f">Nom<input class="i" data-mi="${i}" data-mf="nom" value="${esc(m.nom)}" ${ro}></label><label class="f compo">Composition<input class="i" data-mi="${i}" data-mf="compo" value="${esc(m.compo)}" ${ro}></label><label class="f">Part €<input class="i" inputmode="decimal" data-mi="${i}" data-mf="part" value="${esc(m.part)}" ${ro}></label><label class="f">Entière €<input class="i" inputmode="decimal" data-mi="${i}" data-mf="entiere" value="${esc(m.entiere)}" ${ro}></label><button type="button" class="x" data-mdel="${i}" aria-label="Retirer" ${ro}>×</button></div>`).join('')}
  <button class="btn s" type="button" id="mAdd" ${ro}>Ajouter une pizza</button></section>
 <section><h2>Préparation</h2><div class="prog"><span class="nb">${ok}/${tot}</span><div class="m"><i style="width:${Math.round(ok/tot*100)}%"></i></div></div><div class="etapes">${ETAPES.map((e,i)=>`<div class="et"><h3>${i+1}. ${e[0]}</h3>${e[1].map((t,j)=>`<label class="chk"><input type="checkbox" data-chk="s${i}_${j}" ${s.check&&s.check['s'+i+'_'+j]?'checked':''} ${ro}><span>${t}</span></label>`).join('')}</div>`).join('')}</div></section>
 <section><h2>Bilan</h2><div id="bilan"><p class="muted">Calcul…</p></div><div class="g" style="margin-top:12px">
  <label class="f">Cachet reçu €<input class="i" inputmode="decimal" data-k="cachet" value="${esc(s.cachet)}" ${ro}></label>
  <label class="f">Dépenses (ingrédients, transport…) €<input class="i" inputmode="decimal" data-k="depenses" value="${esc(s.depenses)}" ${ro}></label></div>
  <label class="f" style="margin-top:12px">Ce qu'on garde, ce qu'on change<textarea class="i" data-k="notes" ${ro}>${esc(s.notes)}</textarea></label></section>
 <div class="factions">${s.id===S.config.soireeActive?'<span class="encours" style="font-size:14px;padding:8px 14px">Soirée en cours</span>':`<button class="btn p" type="button" id="fActive" ${ro}>En faire la soirée en cours</button>`}<button class="btn" type="button" id="fDup" ${ro}>Dupliquer</button><button class="btn lien" type="button" id="fDel" ${ro}>Supprimer</button></div>`;
 if(foc){const q=foc[0]?`[data-k="${foc[0]}"]`:foc[1]?`[data-mi="${foc[1]}"][data-mf="${foc[2]}"]`:'';const el=q&&f.querySelector(q);if(el){el.focus();try{if(foc[3]!=null)el.setSelectionRange(foc[3],foc[3])}catch(e){}}}
 renderBilan(s);}
async function renderBilan(s){let list;if(s.id===S.config.soireeActive)list=cmdsActive();else if(bilans.has(s.id))list=bilans.get(s.id);else{list=[];if(db){try{const q=await db.collection('commandes').where('soiree','==',s.id).get();list=q.docs.map(d=>({...d.data(),id:d.id}))}catch(e){}}else list=[...S.cmds.values()].filter(c=>c.soiree===s.id);bilans.set(s.id,list)}
 const el=$('#bilan');if(!el||sel!==s.id)return;const ok=list.filter(c=>c.statut!=='annulee');const parts=ok.reduce((a,c)=>a+partsOf(c,s),0);const rec=ok.reduce((a,c)=>a+num(c.total),0);const cash=ok.filter(c=>c.paiement==='cash').reduce((a,c)=>a+num(c.total),0);const carte=ok.filter(c=>c.paiement==='carte').reduce((a,c)=>a+num(c.total),0);const off=ok.filter(c=>c.paiement==='offert').length;
 const att=ok.filter(c=>c.t&&c.t.p&&c.t.c).map(c=>(c.t.p-c.t.c)/60000);const moy=att.length?Math.round(att.reduce((a,b)=>a+b,0)/att.length):null;const net=rec+num(s.cachet)-num(s.depenses);
 el.innerHTML=ok.length?`<div class="kpis"><div class="kpi"><b class="nb">${ok.length}</b><span>commandes</span></div><div class="kpi"><b class="nb">${parts}</b><span>parts, soit ${(parts/P(s)).toLocaleString('fr-BE',{maximumFractionDigits:1})} pizzas</span></div><div class="kpi"><b class="nb">${eur(rec)}</b><span>recette pizzas (${eur(cash)} cash, ${eur(carte)} carte${off?', '+off+' offerte'+(off>1?'s':''):''})</span></div><div class="kpi"><b class="nb">${moy==null?'–':moy+' min'}</b><span>entre commande et appel</span></div><div class="kpi net"><b class="nb">${eur(net)}</b><span>net : recette + cachet − dépenses</span></div></div>`:'<p class="muted">Pas encore de commande enregistrée pour cette soirée.</p>'}
$('#soireeList').addEventListener('click',e=>{const b=e.target.closest('[data-sel]');if(!b)return;sel=b.dataset.sel;renderSoirees();if(matchMedia('(max-width:900px)').matches)$('#fiche').scrollIntoView({behavior:'smooth'})});
$('#fiche').addEventListener('input',e=>{const t=e.target;if(t.dataset.k){patchSoiree(sel,t.dataset.k,t.value);if(['titre','lieu','patons','parts'].includes(t.dataset.k)){renderTop();renderListOnly()}if(['cachet','depenses'].includes(t.dataset.k))renderBilan(S.soirees.get(sel));return}
 if(t.dataset.mi!=null){const s=S.soirees.get(sel);const menu=(s.menu||[]).map(m=>({...m}));menu[+t.dataset.mi][t.dataset.mf]=t.value;patchSoiree(sel,'menu',menu)}});
$('#fiche').addEventListener('change',e=>{const t=e.target;if(t.dataset.chk){const s=S.soirees.get(sel);const ch={...(s.check||{})};ch[t.dataset.chk]=t.checked;patchSoiree(sel,'check',ch);renderSoireesList();const [ok,tot]=checkProg(S.soirees.get(sel));const pr=$('#fiche .prog');if(pr){pr.firstElementChild.textContent=ok+'/'+tot;pr.querySelector('i').style.width=Math.round(ok/tot*100)+'%'}}});
$('#fiche').addEventListener('click',e=>{const s=S.soirees.get(sel);if(!s)return;const st=e.target.closest('[data-stat]');if(st){patchSoiree(sel,'statut',st.dataset.stat);renderSoirees();return}
 if(e.target.closest('#mAdd')){patchSoiree(sel,'menu',[...(s.menu||[]),{id:uid(),nom:'',compo:'',part:'2',entiere:'8'}]);renderFiche();return}
 const md=e.target.closest('[data-mdel]');if(md){const menu=(s.menu||[]).filter((_,i)=>i!==+md.dataset.mdel);patchSoiree(sel,'menu',menu);renderFiche();return}
 if(e.target.closest('#fActive')){S.config.soireeActive=sel;put('config/app',{...S.config});ticket={lignes:[],nom:'',paiement:'cash'};subCmds();renderAll();toast('« '+(s.titre||'Soirée')+' » est la soirée en cours.');return}
 if(e.target.closest('#fDup')){const id=uid();const c=JSON.parse(JSON.stringify(s));delete c.id;c.titre=(s.titre||'Soirée')+' (copie)';c.date='';c.statut='piste';c.check={};c.cachet='';c.depenses='';c.notes='';c.creeLe=Date.now();S.soirees.set(id,{...c,id});sel=id;busy.add(id);put('soirees/'+id,c).finally(()=>busy.delete(id));renderSoirees();return}
 if(e.target.closest('#fDel')){ask('Supprimer « '+(s.titre||'cette soirée')+' » ?','La soirée et ses commandes disparaissent pour toute l\'équipe. Tu pourras annuler juste après.','Supprimer',()=>supprimer(s))}});
async function supprimer(s){const id=s.id;const copie=JSON.parse(JSON.stringify(s));delete copie.id;let list=[...S.cmds.values()].filter(c=>c.soiree===id);if(db&&id!==S.config.soireeActive){try{const q=await db.collection('commandes').where('soiree','==',id).get();list=q.docs.map(d=>({...d.data(),id:d.id}))}catch(e){}}
 const cmdCopies=list.map(c=>{const x={...c};delete x.id;return [c.id,x]});const etaitActive=S.config.soireeActive===id;
 S.soirees.delete(id);for(const c of list)S.cmds.delete(c.id);if(S.config.soireeActive===id){S.config.soireeActive='';put('config/app',{...S.config})}sel='';renderAll();
 await del('soirees/'+id);for(const c of list){await del('commandes/'+c.id);if(c.suivi)await del('suivi/'+c.suivi)}
 toast('Soirée supprimée.','',['Annuler',async()=>{S.soirees.set(id,{...copie,id});for(const [cid,x] of cmdCopies)S.cmds.set(cid,{...x,id:cid});sel=id;if(etaitActive){S.config.soireeActive=id;cmdFor='';subCmds();put('config/app',{...S.config})}renderAll();await put('soirees/'+id,copie);for(const [cid,x] of cmdCopies)await put('commandes/'+cid,x)}])}
$('#newSoiree').onclick=()=>{if(!canWrite)return;const id=uid();const s={titre:'Nouvelle soirée',statut:'piste',date:'',debut:'19:00',fin:'23:00',lieu:'',adresse:'',contact:'',patons:'50',parts:'4',menu:[],check:{},cachet:'',depenses:'',notes:'',creeLe:Date.now()};S.soirees.set(id,{...s,id});sel=id;busy.add(id);put('soirees/'+id,s).finally(()=>busy.delete(id));location.hash='soirees';renderSoirees();setTimeout(()=>{const t=$('#fiche .titre');if(t){t.focus();t.select()}},50)};
function renderListOnly(){const keep=sel;renderSoireesList(keep)}
function renderSoireesList(){const arr=sortSoirees();$('#soireeList').innerHTML=arr.map(s=>{const d=dateParts(s.date);const [ok,tot]=checkProg(s);return `<button type="button" class="si" data-sel="${esc(s.id)}" aria-current="${s.id===sel}"><div class="d">${d?`<b>${d.j}</b><span>${d.m}</span>`:'<span>SANS<br>DATE</span>'}</div><div><strong>${esc(s.titre||'Sans titre')}</strong><div class="mt"><span class="pill ${esc(s.statut)}">${esc(STAT[s.statut]||'')}</span>${s.id===S.config.soireeActive?'<span class="encours">En cours</span>':''}<span>${esc(s.lieu||'')}</span><span class="nb">${ok}/${tot}</span></div></div></button>`}).join('')}

/* ---------- navigation ---------- */
const VUES=['caisse','cuisine','ecran','soirees','concept','orga'];
function route(){const h=location.hash.slice(1);view=VUES.includes(h)?h:'caisse';for(const v of VUES)$('#v-'+v).classList.toggle('on',v===view);for(const a of document.querySelectorAll('nav.tabs a')){if(a.getAttribute('href')==='#'+view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}document.body.classList.toggle('mode-ecran',view==='ecran');renderView()}
function renderView(){renderTop();if(view==='caisse')renderCaisse();else if(view==='cuisine')renderCuisine();else if(view==='ecran')renderEcran();else if(view==='soirees')renderSoirees();else if(view==='orga'){const t=$('#phrases');if(document.activeElement!==t)t.value=(S.config.phrases||PHRASES).join('\n');t.disabled=!canWrite}}
$('#phrases').addEventListener('change',e=>{const l=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,30);S.config.phrases=l.length?l:PHRASES;put('config/app',{...S.config});toast('Phrases d\'appel enregistrées.')});
$('#testVoix').onclick=async()=>{try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();await actx.resume()}catch(e){}son=true;voix=true;chime();dire(phrase({num:23,nom:''}))};
function renderAll(){renderView()}
window.addEventListener('hashchange',route);

/* ---------- données ---------- */
function onCmdChanges(changes){for(const ch of changes){const id=ch.doc.id;if(ch.type==='removed'){S.cmds.delete(id);continue}const c={...ch.doc.data(),id};const old=S.cmds.get(id);S.cmds.set(id,c);if(c.statut==='prete'&&num(c.t&&c.t.p)>T0&&!annonces.has(id)&&(!old||old.statut!=='prete'))annonce(c)}}
function subCmds(){const id=S.config.soireeActive;if(!db||cmdFor===id)return;if(unsubCmd)unsubCmd();cmdFor=id;for(const [k,c] of S.cmds)if(c.soiree!==id)S.cmds.delete(k);if(!id){unsubCmd=null;return}
 unsubCmd=db.collection('commandes').where('soiree','==',id).onSnapshot(q=>{onCmdChanges(q.docChanges());bilans.delete(id);renderAll()},e=>toast('Commandes injoignables ('+e.code+').'))}
function demo(){const sid='demo1';S.soirees.set(sid,{id:sid,titre:'Exemple : Face B à la Laverie',statut:'confirme',date:'2026-12-12',debut:'19:00',fin:'23:00',lieu:'La Laverie',adresse:'Outremeuse, Liège',contact:'Sam, 0470 00 00 00',patons:'50',parts:'4',menu:[{id:'fa',nom:'Face A',compo:'Tomate, fior di latte, basilic, huile de croûte.',part:'2',entiere:'8'},{id:'fb',nom:'Face B',compo:'La même, plus nduja et un filet de miel piquant.',part:'2',entiere:'8'},{id:'vl',nom:'Version longue',compo:'Bianca, courge rôtie, sauge, parmesan.',part:'2.5',entiere:'10'}],check:{s0_0:true,s0_1:true,s0_2:true,s1_0:true,s1_1:true,s2_0:true,s2_1:true},cachet:'150',depenses:'140',notes:'',creeLe:0});
 S.soirees.set('demo2',{id:'demo2',titre:'Exemple : Digestif au Grenier',statut:'option',date:'2027-01-23',debut:'21:00',fin:'01:00',lieu:'Le Grenier',adresse:'',contact:'',patons:'40',parts:'4',menu:[],check:{},cachet:'',depenses:'',notes:'Tester un format fin de soirée.',creeLe:0});
 S.config.soireeActive=sid;const now=Date.now();const L=(id,nom,u,q,p)=>({id,nom,unite:u,qte:q,prix:p});
 [[21,[L('fb','Face B','part',2,2)],'Léa','cash','servie',38],[22,[L('fa','Face A','entiere',1,8)],'','carte','prete',19],[23,[L('vl','Version longue','part',1,2.5),L('fa','Face A','part',1,2)],'Momo','cash','four',9],[24,[L('fb','Face B','part',3,2)],'','carte','attente',4],[25,[L('fa','Face A','part',2,2)],'Inès','cash','attente',1]].forEach(([n,l,nom,pay,st,m])=>{const id='c'+n;const tc=now-m*60000;const t={c:tc};if(['four','prete','servie'].includes(st))t.f=tc+120000;if(['prete','servie'].includes(st))t.p=tc+480000;if(st==='servie')t.s=tc+600000;S.cmds.set(id,{id,soiree:sid,num:n,lignes:l,nom,paiement:pay,total:l.reduce((a,x)=>a+x.qte*x.prix,0),statut:st,t});annonces.add(id)});}

async function boot(){route();setEtat('lent','Connexion…');majInvite();
 if(!configured()){demo();setEtatLive();banner('Mode démo : la base Firebase n\'est pas encore branchée, rien n\'est gardé ni partagé.');renderAll();ouvrirInstallSiBesoin();return}
 try{conn=await connect()}catch(e){conn=null}
 if(!conn){setEtat('lent','Hors ligne');banner('Impossible de joindre la base. Vérifie le réseau puis rouvre l\'appli.');ouvrirInstallSiBesoin();return}
 me=conn.uid;
 if(!(await conn.isMember())){ouvrirInstallSiBesoin();montrerGate();return}
 demarrer();ouvrirInstallSiBesoin();
}
function demarrer(){db=conn.db;canWrite=true;
 const tm=setTimeout(()=>{if(!live)setEtat('lent','Connexion lente')},10000);
 db.doc('config/app').onSnapshot(d=>{const c=d.exists?d.data():{};S.config={soireeActive:c.soireeActive||'',phrases:Array.isArray(c.phrases)&&c.phrases.length?c.phrases:PHRASES,qr:!!c.qr};subCmds();renderAll()},e=>toast('Réglages injoignables ('+e.code+').'));
 db.collection('soirees').onSnapshot(q=>{if(!q.metadata.fromCache){live=true;clearTimeout(tm);setEtatLive()}for(const ch of q.docChanges()){const id=ch.doc.id;if(ch.type==='removed'){S.soirees.delete(id);continue}if(dirty.has(id)||busy.has(id))continue;S.soirees.set(id,{...ch.doc.data(),id})}if(view==='soirees'){const a=document.activeElement;if(a&&$('#fiche').contains(a)&&a.matches('input,textarea'))renderSoireesList();else renderSoirees()}else renderAll()},e=>{clearTimeout(tm);setEtat('lent','Hors ligne');toast('Base injoignable ('+e.code+').')});
}

/* ---------- code d'équipe ---------- */
function montrerGate(){$('#gate').classList.add('on');setTimeout(()=>$('#gCode').focus(),100)}
async function entrer(code,creer){const v=String(code||'').trim().toUpperCase();const err=$('#gErr');if(v.length<6){err.textContent='Le code fait au moins 6 caractères.';return}
 err.textContent=creer?'Création…':'Vérification…';const ok=creer?await conn.create(v):await conn.join(v);
 if(!ok){err.textContent=creer?'Impossible : l\'équipe a sans doute déjà un code. Demande-le.':'Ce code ne marche pas. Vérifie-le dans le message d\'invitation.';return}
 try{localStorage.setItem('btt-code',v)}catch(e){}err.textContent='';$('#gate').classList.remove('on');majInvite();demarrer();toast(creer?'Équipe créée. Invite les autres depuis le bouton Inviter.':'Bienvenue dans l\'équipe.')}
$('#gGo').onclick=()=>entrer($('#gCode').value,false);
$('#gCode').addEventListener('keydown',e=>{if(e.key==='Enter')entrer($('#gCode').value,false)});
$('#gCreate').onclick=()=>entrer($('#gNew').value,true);

/* ---------- installation ---------- */
let promptInstall=null;
const UA=navigator.userAgent;
const IOS=/iPhone|iPad|iPod/.test(UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const ANDROID=/Android/i.test(UA);
const INAPP=/WhatsApp|FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(UA);
const installee=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const IC_SHARE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
const IC_PLUS='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const IC_DOTS='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>';
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e;renderInstall();$('#btnInstall').hidden=false});
window.addEventListener('appinstalled',()=>{promptInstall=null;$('#install').classList.remove('on');$('#btnInstall').hidden=true;toast('Appli installée. Ouvre-la depuis l\'écran d\'accueil.')});
function renderInstall(){const b=$('#instBody');let h='';
 if(INAPP){h+=`<div class="alerte">Tu es dans le navigateur de WhatsApp : l'installation n'y est pas possible. Ouvre ce lien dans ${IOS?'Safari':'Chrome'}.</div><ol class="steps">${IOS?`<li><span>Touche l'icône ${IC_SHARE} ou « … » en bas, puis <b>Ouvrir dans Safari</b>.</span></li>`:`<li><span>Touche ${IC_DOTS} en haut à droite, puis <b>Ouvrir dans Chrome</b>.</span></li>`}<li><span>La page se rouvre : suis les étapes d'installation.</span></li></ol><button class="btn big" type="button" id="instCopy">Copier le lien</button>`}
 else if(promptInstall){h+=`<p>Un raccourci sur l'écran d'accueil, en plein écran, sans passer par un store.</p><button class="btn p big" type="button" id="instGo">Installer l'appli</button>`}
 else if(IOS){h+=`<p>Sur iPhone, l'installation se fait depuis Safari, en trois gestes :</p><ol class="steps"><li><span>Touche ${IC_SHARE} <b>Partager</b>, en bas de l'écran (en haut sur iPad).</span></li><li><span>Fais défiler et choisis ${IC_PLUS} <b>Sur l'écran d'accueil</b>.</span></li><li><span>Touche <b>Ajouter</b>. L'icône BTT apparaît avec tes applis.</span></li></ol>`}
 else if(ANDROID){h+=`<p>Dans Chrome :</p><ol class="steps"><li><span>Touche ${IC_DOTS} en haut à droite.</span></li><li><span>Choisis <b>Installer l'application</b> (ou <b>Ajouter à l'écran d'accueil</b>).</span></li><li><span>Confirme. L'icône BTT apparaît avec tes applis.</span></li></ol>`}
 else{h+=`<p>Sur ordinateur, dans Chrome ou Edge, clique sur l'icône d'installation à droite de la barre d'adresse. Pour les téléphones, envoie le lien sur WhatsApp.</p>`}
 h+=`<p class="note">Ensuite, ouvre l'appli depuis son icône et entre le code d'équipe une seule fois.</p>`;
 b.innerHTML=h;
 const go=$('#instGo');if(go)go.onclick=async()=>{const p=promptInstall;if(!p)return;p.prompt();try{const r=await p.userChoice;if(r.outcome==='accepted')$('#install').classList.remove('on')}catch(e){}promptInstall=null};
 const cp=$('#instCopy');if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(lienAppli());toast('Lien copié.')}catch(e){toast(lienAppli())}};
}
function ouvrirInstall(){renderInstall();$('#install').classList.add('on')}
function ouvrirInstallSiBesoin(){if(installee())return;$('#btnInstall').hidden=false;let vu=false;try{vu=localStorage.getItem('btt-install-vu')==='1'}catch(e){}if(!vu&&(IOS||ANDROID||INAPP))ouvrirInstall()}
$('#instLater').onclick=()=>{$('#install').classList.remove('on');try{localStorage.setItem('btt-install-vu','1')}catch(e){}};
$('#btnInstall').onclick=ouvrirInstall;$('#btnInstall2').onclick=ouvrirInstall;

/* ---------- invitation WhatsApp ---------- */
function lienAppli(){return new URL('./',location.href).href}
function majInvite(){let code='';try{code=localStorage.getItem('btt-code')||''}catch(e){}
 const txt='Bake That Track : installe l\'appli de l\'équipe (caisse, cuisine, appel des commandes).\n'+lienAppli()+(code?'\nCode d\'équipe : '+code:'')+'\nSur iPhone : ouvre le lien dans Safari, puis Partager > Sur l\'écran d\'accueil.';
 const href='https://wa.me/?text='+encodeURIComponent(txt);for(const a of [$('#btnInvite'),$('#waInvite2')])if(a)a.href=href}

/* ---------- QR de suivi client ---------- */
function montrerQR(n,tok){const url=new URL('suivi.html#'+tok,location.href).href;$('#qrNum').textContent=n;$('#qrUrl').textContent=url;let svg='';try{const q=window.qrcode(0,'M');q.addData(url);q.make();svg=q.createSvgTag(6,2)}catch(e){}$('#qrBox').innerHTML=svg||'<p class="note">QR indisponible hors ligne : montre le lien ci-dessous.</p>';$('#qrDlg').classList.add('on');$('#qrOk').focus()}
$('#qrOk').onclick=()=>$('#qrDlg').classList.remove('on');
$('#optQr').addEventListener('change',e=>{S.config.qr=e.target.checked;put('config/app',{...S.config})});

/* ---------- notifications et écran allumé ---------- */
async function notifier(titre,corps){try{if(!document.hidden||!('Notification' in window)||Notification.permission!=='granted')return;const r=await navigator.serviceWorker?.getRegistration();if(r)r.showNotification(titre,{body:corps,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:'btt-'+titre,vibrate:[200,80,200]});else new Notification(titre,{body:corps,icon:'icons/icon-192.png'})}catch(e){}}
$('#btnNotif').onclick=async()=>{if(!('Notification' in window)){toast(IOS&&!installee()?'Sur iPhone, installe d\'abord l\'appli pour recevoir des notifications.':'Ce navigateur ne gère pas les notifications.');return}const p=await Notification.requestPermission();toast(p==='granted'?'Notifications activées sur cet appareil.':'Notifications refusées.')};
let verrou=null;async function garderAllume(){try{verrou=await navigator.wakeLock?.request('screen')}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&verrou&&verrou.released&&view==='ecran')garderAllume()});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
boot();
}
