/**
 * NRJ Marketplace — IndexedDB
 * Un enregistrement par magasin (panier, favoris, commandes) pour garder
 * exactement la même forme en mémoire que le reste de l'app.
 */

const DB_NAME = 'NRJMarketplaceDB';
const DB_VERSION = 3;
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
        for (const name of ['cart', 'favorites', 'pendingOrders']) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        }
        db.createObjectStore('cart', { keyPath: 'userId' });
        db.createObjectStore('favorites', { keyPath: 'userId' });
        db.createObjectStore('pendingOrders', { keyPath: 'userId' });
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put({
        userId: USER,
        ...data,
        updatedAt: new Date().toISOString()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
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
}

const db = new NRJDatabase();
export default db;
