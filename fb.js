// Couche de données : Firebase (Auth anonyme + Firestore), exposée avec la même forme
// que le reste de l'appli attend : db.doc(path).set/update/delete/get/onSnapshot,
// db.collection(path).where(...).get/onSnapshot.
import { CONFIG, TEAM } from './config.js';

const V = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;

export const configured = () => !!(CONFIG && CONFIG.apiKey && CONFIG.projectId);

export async function connect() {
  if (!configured()) return null;
  const [A, U, F] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js')
  ]);
  const app = A.initializeApp(CONFIG);
  let fs;
  try {
    fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) {
    fs = F.getFirestore(app);
  }
  const auth = U.getAuth(app);
  const first = await new Promise(res => { const un = U.onAuthStateChanged(auth, u => { un(); res(u); }); });
  const user = first || (await U.signInAnonymously(auth)).user;
  const uid = user.uid;

  const path = p => (p.startsWith('suivi/') ? p : `equipes/${TEAM}/${p}`);
  const err = e => ({ code: (e && e.code) || 'erreur', message: (e && e.message) || '' });
  const wrap = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });

  const db = {
    doc(p) {
      const ref = F.doc(fs, path(p));
      return {
        set: d => F.setDoc(ref, d).catch(e => { throw err(e); }),
        update: d => F.updateDoc(ref, d).catch(e => { throw err(e); }),
        delete: () => F.deleteDoc(ref).catch(e => { throw err(e); }),
        get: async () => wrap(await F.getDoc(ref)),
        onSnapshot: (next, onErr) => F.onSnapshot(ref, s => next(wrap(s)), e => onErr && onErr(err(e)))
      };
    },
    collection(p) {
      const make = q => ({
        where: (f, op, v) => make(F.query(q, F.where(f, op, v))),
        get: async () => { const s = await F.getDocs(q); return { docs: s.docs.map(wrap) }; },
        onSnapshot: (next, onErr) => F.onSnapshot(q, { includeMetadataChanges: true }, s => next({
          docs: s.docs.map(wrap),
          metadata: s.metadata,
          docChanges: () => s.docChanges().map(c => ({ type: c.type, doc: wrap(c.doc) }))
        }), e => onErr && onErr(err(e)))
      });
      return make(F.collection(fs, path(p)));
    }
  };

  const memRef = F.doc(fs, path('membres/' + uid));
  async function isMember() {
    try { return (await F.getDoc(memRef)).exists(); }
    catch (e) {
      try { return (await F.getDocFromCache(memRef)).exists(); } catch (e2) { return false; }
    }
  }
  async function join(code) {
    try { await F.setDoc(memRef, { code: String(code), depuis: Date.now() }); return true; }
    catch (e) { return false; }
  }
  async function create(code) {
    const b = F.writeBatch(fs);
    b.set(F.doc(fs, path('prive/acces')), { code: String(code) });
    b.set(memRef, { code: String(code), depuis: Date.now() });
    try { await b.commit(); return true; } catch (e) { return false; }
  }
  return { db, uid, isMember, join, create };
}
