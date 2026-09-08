const test = require('node:test');
const assert = require('node:assert/strict');

const Receipts = require('../receipts.js');

function memoryAdapter() {
  const files = new Map();
  return {
    files,
    async write(path, blob) { files.set(path, blob); },
    async read(path) { return files.get(path) || null; },
    async delete(path) { files.delete(path); },
    async exists(path) { return files.has(path); },
  };
}

test('stores receipts under a MAUI-shaped relative path', async () => {
  const adapter = memoryAdapter();
  const store = Receipts.createReceiptStore(adapter, {
    now: () => new Date('2026-09-08T12:00:00Z'),
    id: () => 'abc123',
  });
  const blob = new Blob(['image'], { type: 'image/jpeg' });
  const path = await store.save(blob);
  assert.equal(path, 'receipts/2026/09/abc123.jpg');
  assert.equal(await store.exists(path), true);
  assert.equal(await (await store.read(path)).text(), 'image');
});

test('removes managed receipts and treats missing paths safely', async () => {
  const adapter = memoryAdapter();
  const store = Receipts.createReceiptStore(adapter, { id: () => 'x' });
  assert.equal(await store.read('receipts/missing.jpg'), null);
  await store.delete(null);
  const path = await store.save(new Blob(['x'], { type: 'image/jpeg' }));
  await store.delete(path);
  assert.equal(await store.exists(path), false);
});

test('replacement cleanup happens only after a successful metadata write', async () => {
  const adapter = memoryAdapter();
  let id = 0;
  const store = Receipts.createReceiptStore(adapter, { id: () => String(++id) });
  const oldPath = await store.save(new Blob(['old']));
  const newPath = await store.save(new Blob(['new']));

  await assert.rejects(
    Receipts.commitReplacement(store, oldPath, newPath, async () => { throw new Error('db failed'); }),
    /db failed/,
  );
  assert.equal(await store.exists(oldPath), true);
  assert.equal(await store.exists(newPath), false);

  const successfulPath = await store.save(new Blob(['newer']));
  await Receipts.commitReplacement(store, oldPath, successfulPath, async path => assert.equal(path, successfulPath));
  assert.equal(await store.exists(oldPath), false);
  assert.equal(await store.exists(successfulPath), true);
});

test('removal preserves the old file when metadata write fails', async () => {
  const adapter = memoryAdapter();
  const store = Receipts.createReceiptStore(adapter, { id: () => 'old' });
  const oldPath = await store.save(new Blob(['old']));
  await assert.rejects(
    Receipts.commitReplacement(store, oldPath, null, async () => { throw new Error('db failed'); }),
  );
  assert.equal(await store.exists(oldPath), true);
});
