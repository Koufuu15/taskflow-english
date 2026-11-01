/* Task persistence boundary: per-account IndexedDB cache and durable mutation queue. */
(() => {
  const DB = 'taskflow-sync-v1';
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('tasks', { keyPath: 'key' });
      db.createObjectStore('queue', { keyPath: 'opId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const request = (db, store, mode, action) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), result = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
  });
  let db, client, userId, channel, onChange = () => {}, onStatus = () => {}, flushing = false, confirmedEmptyRemote = false;
  const key = id => `${userId}:${id}`;
  const taskFromDb = row => ({ id: row.id, name: row.name, memo: row.memo || '', due: row.due || '', mode: row.mode || 'card', done: !!row.done, updated_at: row.updated_at, deleted_at: row.deleted_at });
  const rowFromTask = task => ({ id: task.id, user_id: userId, name: task.name, memo: task.memo || '', due: task.due || null, mode: task.mode || 'card', done: !!task.done, updated_at: task.updated_at, deleted_at: task.deleted_at || null });
  async function cached() {
    const all = await request(db, 'tasks', 'readonly', s => s.getAll());
    return all.filter(x => x.userId === userId && !x.deleted_at).map(x => x.task);
  }
  async function cache(task) { await request(db, 'tasks', 'readwrite', s => s.put({ key: key(task.id), userId, task, updated_at: task.updated_at, deleted_at: task.deleted_at || null })); }
  async function enqueue(op) { await request(db, 'queue', 'readwrite', s => s.put({ ...op, opId: crypto.randomUUID(), userId })); }
  async function mergeRemote(row) {
    const task = taskFromDb(row), stored = await request(db, 'tasks', 'readonly', s => s.get(key(task.id)));
    if (stored && stored.updated_at >= task.updated_at) return;
    await cache(task);
    onChange(await cached());
  }
  async function refreshRemote() {
    const { data, error } = await client.from('tasks').select('*').eq('user_id', userId);
    if (error) throw error;
    confirmedEmptyRemote = (data || []).length === 0;
    for (const row of data || []) await mergeRemote(row);
    onChange(await cached());
  }
  async function flush() {
    if (!client || flushing || !navigator.onLine) return;
    flushing = true; onStatus('syncing');
    try {
      const queue = (await request(db, 'queue', 'readonly', s => s.getAll())).filter(x => x.userId === userId).sort((a,b) => a.createdAt - b.createdAt);
      for (const op of queue) {
        const { data: remote, error: readError } = await client.from('tasks').select('updated_at').eq('id', op.task.id).maybeSingle();
        if (readError) throw readError;
        if (!remote || remote.updated_at <= op.task.updated_at) {
          const { error } = await client.from('tasks').upsert(rowFromTask(op.task), { onConflict: 'id' });
          if (error) throw error;
        } else {
          const { data, error } = await client.from('tasks').select('*').eq('id', op.task.id).single();
          if (error) throw error;
          await mergeRemote(data);
        }
        await request(db, 'queue', 'readwrite', s => s.delete(op.opId));
      }
      onStatus('synced');
    } catch { onStatus('error'); }
    finally { flushing = false; }
  }
  async function connect(supabase, user, callbacks = {}) {
    db = await openDb(); client = supabase; userId = user.id;
    onChange = callbacks.onChange || onChange; onStatus = callbacks.onStatus || onStatus;
    onStatus(navigator.onLine ? 'syncing' : 'offline');
    channel = client.channel(`tasks:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` }, async payload => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (payload.eventType === 'DELETE' && row?.id) {
        const stored = await request(db, 'tasks', 'readonly', s => s.get(key(row.id)));
        if (stored) await mergeRemote({ ...stored.task, user_id: userId, updated_at: new Date().toISOString(), deleted_at: new Date().toISOString() });
      } else if (row?.user_id === userId) await mergeRemote(row);
    }).subscribe(status => {
      if (status === 'SUBSCRIBED') { refreshRemote().then(flush).catch(() => onStatus('error')); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
    });
    confirmedEmptyRemote = false;
    try { await refreshRemote(); await flush(); } catch { onStatus('offline'); }
    return cached();
  }
  async function save(task) {
    const now = new Date().toISOString();
    const value = { ...task, updated_at: now, deleted_at: task.deleted_at || null };
    await cache(value); if (client) await enqueue({ task: value, createdAt: Date.now() });
    onChange(await cached()); flush(); return value;
  }
  async function remove(task) { return save({ ...task, deleted_at: new Date().toISOString() }); }
  async function disconnect() {
    if (channel && client) await client.removeChannel(channel);
    channel = null; client = null; userId = null; onChange([]); onStatus('local');
  }
  async function clearAccountCache(id) {
    db = db || await openDb();
    const tasks = await request(db, 'tasks', 'readonly', s => s.getAll());
    const queue = await request(db, 'queue', 'readonly', s => s.getAll());
    for (const item of tasks.filter(x => x.userId === id)) await request(db, 'tasks', 'readwrite', s => s.delete(item.key));
    for (const item of queue.filter(x => x.userId === id)) await request(db, 'queue', 'readwrite', s => s.delete(item.opId));
  }
  window.TaskSync = { connect, cached, save, remove, disconnect, clearAccountCache, flush, get userId() { return userId; }, get confirmedEmptyRemote() { return confirmedEmptyRemote; } };
  addEventListener('online', () => { onStatus('syncing'); flush(); if (client) refreshRemote().catch(() => onStatus('error')); });
  addEventListener('offline', () => onStatus('offline'));
})();
