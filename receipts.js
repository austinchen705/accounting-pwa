(function (root, factory) {
  const api = Object.freeze(factory(root));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Receipts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, root => {
  'use strict';

  function defaultId() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  function createReceiptStore(adapter, options = {}) {
    if (!adapter) throw new TypeError('A receipt storage adapter is required.');
    const now = options.now || (() => new Date());
    const id = options.id || defaultId;
    return {
      async save(blob) {
        if (!blob) throw new TypeError('Receipt image is required.');
        const date = now();
        const path = `receipts/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${id()}.jpg`;
        await adapter.write(path, blob);
        return path;
      },
      async read(path) {
        if (!path) return null;
        return adapter.read(path);
      },
      async exists(path) {
        if (!path) return false;
        return adapter.exists(path);
      },
      async delete(path) {
        if (path) await adapter.delete(path);
      },
    };
  }

  async function commitReplacement(store, oldPath, newPath, metadataWriter) {
    try {
      await metadataWriter(newPath);
    } catch (error) {
      if (newPath && newPath !== oldPath) await store.delete(newPath);
      throw error;
    }
    if (oldPath && oldPath !== newPath) await store.delete(oldPath);
    return newPath;
  }

  function canUseOpfs() {
    return Boolean(root.navigator?.storage?.getDirectory);
  }

  async function resolveFile(path, create) {
    const parts = String(path).split('/').filter(Boolean);
    const fileName = parts.pop();
    let directory = await root.navigator.storage.getDirectory();
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
    return { directory, fileName };
  }

  function createOpfsAdapter() {
    if (!canUseOpfs()) throw new Error('Receipt attachments require browser OPFS support.');
    return {
      async write(path, blob) {
        const { directory, fileName } = await resolveFile(path, true);
        const handle = await directory.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      },
      async read(path) {
        try {
          const { directory, fileName } = await resolveFile(path, false);
          return await (await directory.getFileHandle(fileName)).getFile();
        } catch {
          return null;
        }
      },
      async exists(path) {
        try {
          const { directory, fileName } = await resolveFile(path, false);
          await directory.getFileHandle(fileName);
          return true;
        } catch {
          return false;
        }
      },
      async delete(path) {
        try {
          const { directory, fileName } = await resolveFile(path, false);
          await directory.removeEntry(fileName);
        } catch {
          // Missing local files are valid when metadata came from another device.
        }
      },
    };
  }

  async function loadImage(file) {
    if (root.createImageBitmap) return root.createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function compressImage(file, options = {}) {
    if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file.');
    const maxDimension = options.maxDimension || 1600;
    const quality = options.quality || 0.78;
    const image = await loadImage(file);
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    return new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Unable to compress receipt image.')),
      'image/jpeg',
      quality,
    ));
  }

  return { createReceiptStore, commitReplacement, canUseOpfs, createOpfsAdapter, compressImage };
});
