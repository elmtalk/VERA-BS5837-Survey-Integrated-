/* VERA experimental advanced save/export companion.
   Preserve upstream assessment engine; this module reads/writes only VERA-related browser storage. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const storageMatch = /vera|veteran|bs5837/i;
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  const bytesToBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(s); };
  const base64ToBytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  async function encodeValue(v) {
    if (v instanceof Blob) return { __veraType: 'Blob', mime: v.type, name: v instanceof File ? v.name : undefined, data: bytesToBase64(new Uint8Array(await v.arrayBuffer())) };
    if (v instanceof ArrayBuffer) return { __veraType: 'ArrayBuffer', data: bytesToBase64(new Uint8Array(v)) };
    if (ArrayBuffer.isView(v)) return { __veraType: 'TypedArray', kind: v.constructor.name, data: bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (v instanceof Date) return { __veraType: 'Date', data: v.toISOString() };
    if (Array.isArray(v)) return Promise.all(v.map(encodeValue));
    if (v && typeof v === 'object') { const out = {}; for (const k of Object.keys(v)) out[k] = await encodeValue(v[k]); return out; }
    return v;
  }
  function decodeValue(v) {
    if (Array.isArray(v)) return v.map(decodeValue);
    if (v && typeof v === 'object') {
      if (v.__veraType === 'Blob') { const bytes = base64ToBytes(v.data); return v.name ? new File([bytes], v.name, { type: v.mime || '' }) : new Blob([bytes], { type: v.mime || '' }); }
      if (v.__veraType === 'ArrayBuffer') return base64ToBytes(v.data).buffer;
      if (v.__veraType === 'TypedArray') { const bytes = base64ToBytes(v.data); const ctor = globalThis[v.kind]; return typeof ctor === 'function' && ctor.BYTES_PER_ELEMENT ? new ctor(bytes.buffer) : bytes; }
      if (v.__veraType === 'Date') return new Date(v.data);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decodeValue(x)]));
    }
    return v;
  }
  function openDB(name, version) { return new Promise((resolve, reject) => { const req = version ? indexedDB.open(name, version) : indexedDB.open(name); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); req.onblocked = () => reject(Error('Database blocked; close other VERA tabs.')); }); }
  const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  async function capture() {
    if (!indexedDB.databases) throw Error('This browser cannot enumerate IndexedDB databases.');
    const found = await indexedDB.databases();
    const databases = [];
    for (const item of found.filter(x => x.name && storageMatch.test(x.name))) {
      const db = await openDB(item.name);
      try {
        const stores = [];
        for (const name of Array.from(db.objectStoreNames)) {
          const tx = db.transaction(name, 'readonly');
          const store = tx.objectStore(name);
          const keyPath = store.keyPath;
          const autoIncrement = store.autoIncrement;
          const entries = await new Promise((resolve,reject) => {
            const rows = [];
            const cursor = store.openCursor();
            cursor.onerror = () => reject(cursor.error);
            cursor.onsuccess = async () => {
              const c = cursor.result;
              if (!c) { resolve(rows); return; }
              // Advance synchronously; serialise values after the transaction.
              rows.push({ key: c.key, value: c.value }); c.continue();
            };
          });
          const records = [];
          for (const row of entries) records.push({ key: await encodeValue(row.key), value: await encodeValue(row.value) });
          stores.push({ name, keyPath, autoIncrement, records });
        }
        databases.push({ name: item.name, version: db.version, stores });
      } finally { db.close(); }
    }
    const local = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (storageMatch.test(k)) local[k] = localStorage.getItem(k); }
    if (!databases.length && !Object.keys(local).length) throw Error('No VERA-named browser databases or localStorage keys were found. The app may use a different storage name; do not treat this as a successful backup.');
    return { format: 'vera-browser-backup', format_version: 1, created_at: new Date().toISOString(), app_version: VERSION, origin: location.origin, databases, localStorage: local };
  }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function csvCell(v) {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function rowsCSV(rows) {
    const keys = [...new Set(rows.flatMap(x => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x) : ['value']))];
    return [keys.map(csvCell).join(','), ...rows.map(r => keys.map(k => csvCell(r && typeof r === 'object' ? r[k] : k === 'value' ? r : '')).join(','))].join('\r\n');
  }
  const crcTable = (() => { const t = new Uint32Array(256); for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[i]=c>>>0;}return t;})();
  function crc32(data) { let c=-1; for(const b of data)c=crcTable[(c^b)&255]^(c>>>8); return (c^-1)>>>0; }
  function zip(files) { // Portable ZIP stored method: no external library or network required.
    const pieces=[], central=[]; let offset=0;
    for(const [name,body] of files) {
      const n=enc.encode(name), b=typeof body==='string'?enc.encode(body):body, crc=crc32(b);
      const loc=new Uint8Array(30+n.length), l=new DataView(loc.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint32(14,crc,true);l.setUint32(18,b.length,true);l.setUint32(22,b.length,true);l.setUint16(26,n.length,true);loc.set(n,30);
      pieces.push(loc,b);
      const cen=new Uint8Array(46+n.length),c=new DataView(cen.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,b.length,true);c.setUint32(24,b.length,true);c.setUint16(28,n.length,true);c.setUint32(42,offset,true);cen.set(n,46);central.push(cen);offset+=loc.length+b.length;
    }
    const size=central.reduce((s,b)=>s+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
    return new Blob([...pieces,...central,end],{type:'application/zip'});
  }
  function unzipBackup(buffer) {
    const b=new Uint8Array(buffer),v=new DataView(buffer); let p=0;
    while(p+30<=b.length && v.getUint32(p,true)===0x04034b50){
      const flags=v.getUint16(p+6,true),method=v.getUint16(p+8,true),size=v.getUint32(p+18,true);
      const len=v.getUint16(p+26,true),extra=v.getUint16(p+28,true);
      if(flags&8 || method!==0) throw Error('This ZIP uses unsupported compression. Import the .json file instead.');
      const name=dec.decode(b.subarray(p+30,p+30+len)), start=p+30+len+extra;
      if(start+size>b.length) throw Error('Truncated ZIP');
      if(name==='vera-backup.json') return JSON.parse(dec.decode(b.subarray(start,start+size)));
      p=start+size;
    }
    throw Error('ZIP has no vera-backup.json');
  }
  function ensureBackup(obj) {
    if(!obj || obj.format!=='vera-browser-backup' || obj.format_version!==1 || !Array.isArray(obj.databases) || !obj.localStorage) throw Error('Not a compatible VERA browser backup.');
    if(obj.databases.some(db=>!storageMatch.test(db.name))) throw Error('Backup contains an unexpected database name.');
  }
  async function restore(obj) {
    ensureBackup(obj);
    if(!confirm('Restore this VERA browser backup? Matching existing saved records may be overwritten. Make a backup of this device first.')) return;
    for(const data of obj.databases){
      let db=await openDB(data.name);
      const missing=data.stores.filter(s=>!db.objectStoreNames.contains(s.name));
      if(missing.length){
        const version=Math.max(db.version+1, data.version || 1);db.close();
        db=await new Promise((resolve,reject)=>{
          const req=indexedDB.open(data.name,version);
          req.onupgradeneeded=()=>{for(const s of missing){if(!req.result.objectStoreNames.contains(s.name))req.result.createObjectStore(s.name,{keyPath:s.keyPath??null,autoIncrement:!!s.autoIncrement});}};
          req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Database blocked by another tab.'));
        });
      }
      try {
        for(const s of data.stores){
          const tx=db.transaction(s.name,'readwrite'),store=tx.objectStore(s.name);
          for(const item of s.records){
            const value=decodeValue(item.value);
            if(store.keyPath!==null)store.put(value);
            else store.put(value,decodeValue(item.key));
          }
          await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
        }
      }finally{db.close();}
    }
    for(const [k,v] of Object.entries(obj.localStorage)) if(storageMatch.test(k)) localStorage.setItem(k,v);
    alert('Restore finished. The app will reload to reread the saved data.');
    location.reload();
  }
  async function run(fn) { try { status.textContent='Working…';await fn();if(status.textContent==='Working…')status.textContent='Finished'; } catch(e){console.error('VERA advanced save/export:',e);status.textContent='Error: '+e.message;alert('Save/export error: '+e.message);} }
  const panel=document.createElement('details');panel.id='vera-advanced-tools';
  panel.style.cssText='position:fixed;bottom:12px;right:12px;z-index:2147483000;max-width:min(340px,calc(100vw - 24px));background:#132132;color:#fff;border:1px solid #6e9a90;border-radius:10px;padding:10px;font:13px/1.5 system-ui;box-shadow:0 4px 24px #0008';
  panel.innerHTML='<summary style="cursor:pointer;font-weight:700">Advanced save & export</summary><p style="margin:8px 0">Browser-storage backup, including stored photos where present. ZIP exports the selected project only (with assessment CSV and saved photos). Full JSON backup exports all projects.</p><div id="vera-export-buttons" style="display:flex;flex-wrap:wrap;gap:6px"></div><small id="vera-export-status" role="status"></small>';
  document.body.append(panel);
  const buttons=panel.querySelector('#vera-export-buttons'),status=panel.querySelector('#vera-export-status');
  function button(label,action){const b=document.createElement('button');b.textContent=label;b.type='button';b.style.cssText='background:#e1f1e9;color:#10251f;border:0;border-radius:5px;padding:7px;cursor:pointer;font-weight:600';b.addEventListener('click',()=>run(action));buttons.append(b);}
  // Prepare a complete local ZIP first, then share from a separate user tap.
  // Web Share API requires user activation and cannot reliably be called after long IndexedDB reads.
  let preparedShare = null;
  const recipientRow = document.createElement('label');
  recipientRow.style.cssText = 'display:block;margin:8px 0 6px';
  recipientRow.textContent = 'Email recipient: ';
  const recipientInput = document.createElement('input');
  recipientInput.type = 'email';
  recipientInput.placeholder = 'recipient@example.com';
  recipientInput.value = localStorage.getItem('vera_export_email_recipient') || 'jamesroberts@logikaconsultants.co.uk';
  recipientInput.style.cssText = 'box-sizing:border-box;width:100%;margin-top:3px;padding:7px;border-radius:5px;border:1px solid #9fb7ad;color:#111;background:#fff';
  recipientInput.addEventListener('change',()=>localStorage.setItem('vera_export_email_recipient',recipientInput.value.trim()));
  recipientRow.append(recipientInput);
  buttons.before(recipientRow);
  function activeProjectOnly(data) {
    const id = data.localStorage['vera_projects_v2_active_project'];
    if (!id) throw Error('No active VERA project selected. Open a project before exporting a ZIP.');
    const db = data.databases.find(x => x.name === 'VERA_Projects_v2');
    if (!db) throw Error('VERA project database not available.');
    const projectStore = db.stores.find(x => x.name === 'projects');
    const project = projectStore && projectStore.records.find(r => r.value && r.value.project_uuid === id);
    if (!project) throw Error('The active project is not present in the saved project database. Open the project and try again.');
    const assessmentStore = db.stores.find(x => x.name === 'assessments');
    const selected = (assessmentStore?.records || []).filter(r => r.value && r.value.project_uuid === id);
    const ids = new Set(selected.map(r => r.value.assessment_uuid));
    const scopedStores = db.stores.map(store => ({
      ...store,
      records: store.name === 'projects' ? [project]
        : store.name === 'assessments' ? selected
        : store.name === 'photos' ? store.records.filter(r => ids.has(r.value?.assessment_uuid) || ids.has(r.key))
        : []
    }));
    return {
      ...data, export_scope: 'selected-project', project_uuid: id, project_name: project.value.project_name,
      databases: [{...db, stores: scopedStores}],
      localStorage: Object.fromEntries(Object.entries(data.localStorage).filter(([k]) => k === 'vera_projects_v2_active_project' || k === 'vera_projects_v2_active_assessment:' + id))
    };
  }
  function makeBundle(allData) {
    const data = activeProjectOnly(allData);
    const files=[['vera-backup.json',JSON.stringify(data,null,2)]];
    const manifest={created_at:data.created_at,format:data.format,databases:data.databases.map(d=>({name:d.name,stores:d.stores.map(s=>({name:s.name,records:s.records.length}))})),localStorage_keys:Object.keys(data.localStorage)};
    manifest.project_uuid = data.project_uuid;
    manifest.project_name = data.project_name;
    manifest.scope = data.export_scope;
    files.push(['manifest.json',JSON.stringify(manifest,null,2)]);
    const assessments = data.databases.flatMap(db => (db.stores.find(st => st.name === 'assessments')?.records || []).map(r => r.value));
    const schedule = assessments.map(a => ({project_uuid:a.project_uuid,project_name:a.project_name,assessment_uuid:a.assessment_uuid,tree_uuid:a.tree_uuid,tree_ref:a.tree_ref,status:a.status,...(a.csv_row || {})}));
    files.push(['assessment-schedule.csv',rowsCSV(schedule)]);
    for(const db of data.databases) for(const store of db.stores) {
      const safe=(db.name+'-'+store.name).replace(/[^a-z0-9_-]/gi,'_');
      files.push(['csv/'+safe+'.csv',rowsCSV(store.records.map(r=>({__record_key:r.key,...(r.value&&typeof r.value==='object'&&!Array.isArray(r.value)?r.value:{value:r.value})})))]);
    }
    return { filename:'VERA-'+String(data.project_name||'project').replace(/[^a-z0-9_-]/gi,'_').slice(0,50)+'-'+stamp()+'.zip', blob:zip(files), manifest };
  }
  const prepareButton=document.createElement('button');
  prepareButton.type='button'; prepareButton.textContent='Save & prepare email ZIP';
  prepareButton.style.cssText='background:#cce7ce;color:#10251f;border:0;border-radius:5px;padding:7px;cursor:pointer;font-weight:700';
  buttons.append(prepareButton);
  const sendButton=document.createElement('button');
  sendButton.type='button';sendButton.textContent='Share / email ZIP';sendButton.disabled=true;
  sendButton.style.cssText='background:#e1f1e9;color:#10251f;border:0;border-radius:5px;padding:7px;cursor:pointer;font-weight:600';
  buttons.append(sendButton);
  prepareButton.addEventListener('click',()=>run(async()=>{
    // Upstream VERA autosaves editable drafts; allow its debounced handler to settle.
    // This is NOT a substitute for completing/saving an assessment in the original app.
    const active=document.activeElement;
    if(active && typeof active.blur==='function') active.blur();
    await new Promise(resolve=>setTimeout(resolve,1500));
    const data=await capture();
    preparedShare=makeBundle(data);
    sendButton.disabled=false;
    status.textContent='Project ZIP prepared ('+preparedShare.manifest.databases.reduce((n,d)=>n+d.stores.reduce((m,s)=>m+s.records,0),0)+' records). Tap Share / email ZIP. Original VERA save should be completed first.';
  }));
  sendButton.addEventListener('click',()=>{
    if(!preparedShare) return;
    const prepared=preparedShare;
    const file=new File([prepared.blob],prepared.filename,{type:'application/zip'});
    const to=recipientInput.value.trim();
    const subject='VERA survey export — '+new Date().toLocaleDateString('en-GB');
    const message='Please find attached the VERA survey ZIP export ('+prepared.filename+').';
    const fallback=()=>{
      download(prepared.filename,prepared.blob,'application/zip');
      if(confirm('ZIP downloaded. Open an email draft to '+(to||'your chosen recipient')+'? You must manually attach the downloaded ZIP.')) {
        location.href='mailto:'+(to?encodeURIComponent(to):'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(message+'\\n\\nAttach the ZIP from Downloads before sending.');
      }
      status.textContent='ZIP downloaded. Attach it manually to the email before sending.';
    };
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
      // The share sheet includes email apps; choose email and confirm the attachment/recipient there.
      navigator.share({files:[file],title:subject,text:message+' Recipient: '+to}).then(()=>{
        status.textContent='Share sheet closed. Check the message in your chosen email app was actually sent.';
      }).catch(e=>{if(e.name!=='AbortError'){console.warn(e);fallback();}});
    } else fallback();
  });
  button('Backup JSON',async()=>{const data=await capture();download('VERA-backup-'+stamp()+'.json',JSON.stringify(data,null,2),'application/json');});
  button('Export ZIP + CSV',async()=>{const bundle=makeBundle(await capture());download(bundle.filename,bundle.blob,'application/zip');});
  const file=document.createElement('input');file.type='file';file.accept='.json,.zip,application/json,application/zip';file.style.display='none';panel.append(file);
  button('Restore JSON / ZIP',async()=>file.click());
  file.addEventListener('change',()=>run(async()=>{const f=file.files[0];if(!f)return;const obj=f.name.toLowerCase().endsWith('.zip')?unzipBackup(await f.arrayBuffer()):JSON.parse(await f.text());await restore(obj);file.value='';}));
})();