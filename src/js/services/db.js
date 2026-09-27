/**
 * NRJ Marketplace — IndexedDB
 */

const DB_NAME = 'NRJMarketplaceDB';
const DB_VERSION = 6;  // BUMP pour recreer le store products_cache
const USER = 'default';

class NRJDatabase {
  constructor() {
    this.db = null;
    this.ready = this.open();
  }

  open() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        for (const name of ['cart', 'favorites', 'pendingOrders', 'products_cache']) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        }
        db.createObjectStore('cart', { keyPath: 'userId' });
        db.createObjectStore('favorites', { keyPath: 'userId' });
        db.createObjectStore('pendingOrders', { keyPath: 'userId' });
        // ✅ CORRECTION: keyPath = 'userId' pour etre coherent avec getRecord/putRecord
        db.createObjectStore('products_cache', { keyPath: 'userId' });
      };
    });
  }

  async ensure() {
    try {
      await this.ready;
    } catch (err) {
      console.warn('IndexedDB indisponible, fallback localStorage', err);
      this.db = null;
    }
    return this.db;
  }

  async getRecord(storeName) {
    const db = await this.ensure();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(USER);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async putRecord(storeName, data) {
    const db = await this.ensure();
    if (!db) return false;
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put({
          userId: USER,
          ...data,
          updatedAt: new Date().toISOString()
        });
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          if (req.error.name === 'QuotaExceededError') {
            console.warn('IndexedDB quota depasse');
            this.cleanupOldRecords(storeName).then(() => {
              this.putRecord(storeName, data).then(resolve).catch(reject);
            });
          } else {
            reject(req.error);
          }
        };
      });
    } catch (err) {
      console.warn('IndexedDB erreur:', err);
      return false;
    }
  }

  async cleanupOldRecords(storeName) {
    const db = await this.ensure();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = req.result || [];
        if (records.length <= 1) {
          resolve();
          return;
        }
        const latest = records.sort((a, b) => 
          new Date(b.updatedAt || b.timestamp) - new Date(a.updatedAt || a.timestamp)
        )[0];
        const toDelete = records.filter(r => r !== latest);
        toDelete.forEach(r => store.delete(r.userId || r.id || r.timestamp));
        tx.oncomplete = resolve;
      };
      req.onerror = resolve;
    });
  }

  async getCart() {
    const rec = await this.getRecord('cart');
    return rec && Array.isArray(rec.items) ? rec.items : [];
  }

  async putCart(items) {
    return this.putRecord('cart', { items });
  }

  async getFavorites() {
    const rec = await this.getRecord('favorites');
    return rec && Array.isArray(rec.productIds) ? rec.productIds : [];
  }

  async putFavorites(productIds) {
    return this.putRecord('favorites', { productIds });
  }

  async getOrders() {
    const rec = await this.getRecord('pendingOrders');
    return rec && Array.isArray(rec.orders) ? rec.orders : [];
  }

  async putOrders(orders) {
    return this.putRecord('pendingOrders', { orders });
  }

  async getProductsCache() {
    const rec = await this.getRecord('products_cache');
    return rec || null;
  }

  async putProductsCache(products) {
    return this.putRecord('products_cache', { 
      timestamp: Date.now(),
      products 
    });
  }
}

const db = new NRJDatabase();
export default db;
