/** Applies server events to the local store. Nothing here ever touches selection or tools. */
export function bindSync({ net, store, onNotice }) {
  net.on('joined', (snap) => {
    store.me = snap.you;
    store.load(snap); // replaces everything with the authoritative state
    store.setStatus('online');
  });
  net.on('status', (s) => {
    store.setStatus(s);
    if (s === 'offline') onNotice?.('Connection lost - reconnecting…');
  });

  net.on('obj:add', (obj) => {
    store.drafts.delete(`${obj.ownerId}:${obj.id}`);
    store.upsert(obj);
  });
  net.on('obj:update', ({ id, patch, v }) => store.patch(id, { ...patch, v }));
  net.on('obj:delete', ({ ids }) => store.remove(ids));

  // The server refused one of OUR operations: restore its authoritative version.
  net.on('obj:reject', ({ id, obj, reason }) => {
    if (obj) store.upsert(obj); else store.remove([id]);
    if (reason === 'forbidden') onNotice?.('You can only change items you created.');
  });

  net.on('draft:begin', ({ userId, id, color, width, alpha }) => {
    store.drafts.set(`${userId}:${id}`, { pts: [], color, width, alpha });
  });
  net.on('draft:pts', ({ userId, id, pts }) => {
    const d = store.drafts.get(`${userId}:${id}`);
    if (!d || d.pts.length > 40000) return;
    d.pts.push(...pts);
    store._changed('drafts');
  });
  net.on('draft:end', ({ userId, id }) => {
    // keep until obj:add arrives so there is no flicker; obj:add removes it
    setTimeout(() => { if (store.drafts.delete(`${userId}:${id}`)) store._changed('drafts'); }, 1500);
  });

  net.on('cursor', ({ userId, x, y }) => { if (userId !== store.me?.userId) store.setCursor(userId, x, y); });
  net.on('user:join', (u) => { if (u.userId !== store.me?.userId) store.addUser(u); });
  net.on('user:leave', ({ userId }) => store.removeUser(userId));
  net.on('room:host', ({ hostId }) => store.setHost(hostId));
  net.on('room:policy', ({ policy }) => {
    store.setPolicy(policy);
    onNotice?.(policy === 'open' ? 'Everyone can now edit everything.' : 'Only creators can edit their own items.');
  });
}
