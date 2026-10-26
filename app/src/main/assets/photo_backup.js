/* Photo files are kept out of localStorage. Full archives carry the image bytes. */
(function() {
  'use strict';
  let dbPromise;
  const urls = new Map();
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('ghostyGainsPhotos', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Photo storage could not be opened.'));
    });
    return dbPromise;
  }
  async function transaction(mode, action) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode);
      const request = action(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(new Error('Photo storage failed. Free some space and try again.'));
    });
  }
  const dataPattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  function validate(data) {
    if (typeof data !== 'string' || data.length > 24000000 || !dataPattern.test(data)) throw new Error('The backup contains an invalid or oversized photo.');
    return data;
  }
  function checkImage(data) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => img.naturalWidth > 0 && img.naturalWidth <= 10000 && img.naturalHeight <= 10000
        ? resolve() : reject(new Error('A backup photo has invalid dimensions.'));
      img.onerror = () => reject(new Error('A backup photo could not be decoded. Existing data has been kept.'));
      img.src = data;
    });
  }
  async function read(uri) {
    if (!uri) return '';
    if (uri.startsWith('idb:')) {
      const data = await transaction('readonly', store => store.get(uri));
      if (!data) throw new Error('A saved photo is missing. Restore it before making a full backup.');
      return validate(data);
    }
    if (uri.startsWith('data:')) return validate(uri);
    if (!/^(file:|blob:)/.test(uri)) throw new Error('This photo cannot be included in the backup.');
    const response = await fetch(uri);
    if (!response.ok) throw new Error('A photo could not be read.');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { try { resolve(validate(reader.result)); } catch (e) { reject(e); } };
      reader.onerror = () => reject(new Error('A photo could not be read.'));
      reader.readAsDataURL(blob);
    });
  }
  async function exportPhoto(photo) {
    if (window.AndroidApp?.exportProgressPhoto && /^pp_\d+$/.test(photo.id) && !photo.photoUri.startsWith('idb:')) {
      const result = JSON.parse(window.AndroidApp.exportProgressPhoto(photo.id));
      if (!result.original) throw new Error('A saved photo is missing. Full backup was not created.');
      validate(result.original);
      if (result.marked) validate(result.marked);
      if (photo.markedUri && !result.marked) throw new Error('A marked photo is missing. Full backup was not created.');
      return { id: photo.id, original: result.original, marked: result.marked || '' };
    }
    return { id: photo.id, original: await read(photo.photoUri), marked: await read(photo.markedUri) };
  }
  async function restore(photo, id) {
    validate(photo.original);
    if (photo.marked) validate(photo.marked);
    if (window.AndroidApp?.restoreProgressPhoto) {
      const result = JSON.parse(window.AndroidApp.restoreProgressPhoto(id, photo.original, photo.marked || ''));
      if (!result.photoUri) throw new Error('A photo could not be restored. Your existing data has been kept.');
      return result;
    }
    const originalKey = `idb:${id}:original`, markedKey = `idb:${id}:marked`;
    await checkImage(photo.original);
    if (photo.marked) await checkImage(photo.marked);
    try {
      await transaction('readwrite', store => store.put(photo.original, originalKey));
      if (photo.marked) await transaction('readwrite', store => store.put(photo.marked, markedKey));
    } catch (error) {
      await Promise.allSettled([originalKey, markedKey].map(key => transaction('readwrite', store => store.delete(key))));
      throw error;
    }
    return { photoUri: originalKey, markedUri: photo.marked ? markedKey : '' };
  }
  function source(uri) { return uri?.startsWith('idb:') ? (urls.get(uri) || '') : (uri || ''); }
  async function hydrate(photos) {
    for (const photo of photos || []) for (const uri of [photo.photoUri, photo.markedUri]) {
      if (!uri?.startsWith('idb:') || urls.has(uri)) continue;
      const data = await read(uri);
      const blob = await (await fetch(data)).blob();
      urls.set(uri, URL.createObjectURL(blob));
    }
  }
  async function remove(photo) {
    if (window.AndroidApp?.deleteProgressPhoto) window.AndroidApp.deleteProgressPhoto(photo.id);
    for (const uri of [photo.photoUri, photo.markedUri]) if (uri?.startsWith('idb:')) {
      await transaction('readwrite', store => store.delete(uri));
      if (urls.has(uri)) URL.revokeObjectURL(urls.get(uri));
      urls.delete(uri);
    }
  }
  window.GhostyPhotos = { validate, exportPhoto, restore, source, hydrate, remove };
})();
