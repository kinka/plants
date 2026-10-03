/* =========================================================================
   1. 存储层：IndexedDB（照片是 dataURL，localStorage 装不下）
   ========================================================================= */
const DB = (() => {
  let db;
  const open = () => new Promise((res, rej) => {
    if (db) return res(db);
    const r = indexedDB.open('plants', 1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('entries')) d.createObjectStore('entries', {keyPath:'id'});
      if (!d.objectStoreNames.contains('cards'))   d.createObjectStore('cards',   {keyPath:'term'});
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put:  (s, v) => tx(s, 'readwrite', o => o.put(v)),
    get:  (s, k) => tx(s, 'readonly',  o => o.get(k)),
    all:  (s)    => tx(s, 'readonly',  o => o.getAll()),
    del:  (s, k) => tx(s, 'readwrite', o => o.delete(k)),
    clear:(s)    => tx(s, 'readwrite', o => o.clear()),
  };
})();
