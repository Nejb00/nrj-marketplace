/**
 * NRJ Marketplace - Base de données IndexedDB
 * Gère le stockage hors ligne pour le panier, les favoris et les commandes
 */

// Initialiser la base de données
const db = new (class NRJDatabase {
  constructor() {
    this.dbName = 'NRJMarketplaceDB';
    this.dbVersion = 2;
    this.db = null;
    this.initialize();
  }

  async initialize() {
    if (!window.indexedDB) {
      console.warn('IndexedDB non supporté, utilisation de localStorage comme fallback');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Erreur ouverture IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Créer le store pour le panier
        if (!db.objectStoreNames.contains('cart')) {
          const cartStore = db.createObjectStore('cart', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          cartStore.createIndex('productId', 'productId', { unique: false });
          cartStore.createIndex('userId', 'userId', { unique: false });
        }
        
        // Créer le store pour les favoris
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          favStore.createIndex('productId', 'productId', { unique: true });
          favStore.createIndex('userId', 'userId', { unique: false });
        }
        
        // Créer le store pour les commandes hors ligne
        if (!db.objectStoreNames.contains('pendingOrders')) {
          const ordersStore = db.createObjectStore('pendingOrders', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          ordersStore.createIndex('userId', 'userId', { unique: false });
          ordersStore.createIndex('status', 'status', { unique: false });
          ordersStore.createIndex('date', 'date', { unique: false });
        }
      };
    });
  }

  // Méthodes pour le panier
  async addToCart(item) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé, utilisation de localStorage');
      return this.fallbackAddToCart(item);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cart'], 'readwrite');
      const store = transaction.objectStore('cart');

      const request = store.add({
        ...item,
        userId: item.userId || 'default',
        updatedAt: new Date().toISOString()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getCart(userId = 'default') {
    if (!this.db) {
      console.warn('IndexedDB non initialisé, utilisation de localStorage');
      return this.fallbackGetCart();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cart'], 'readonly');
      const store = transaction.objectStore('cart');
      const index = store.index('userId');

      const request = index.getAll(userId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async updateCartItem(id, updates) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cart'], 'readwrite');
      const store = transaction.objectStore('cart');

      const request = store.get(id);
      request.onsuccess = () => {
        const item = request.result;
        if (item) {
          const updatedItem = { ...item, ...updates, updatedAt: new Date().toISOString() };
          const updateRequest = store.put(updatedItem);
          updateRequest.onsuccess = () => resolve(updatedItem);
          updateRequest.onerror = (event) => reject(event.target.error);
        } else {
          reject(new Error('Item not found'));
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async removeFromCart(id) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cart'], 'readwrite');
      const store = transaction.objectStore('cart');

      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async clearCart(userId = 'default') {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['cart'], 'readwrite');
      const store = transaction.objectStore('cart');
      const index = store.index('userId');

      const request = index.getAllKeys(userId);
      request.onsuccess = () => {
        const keys = request.result;
        const deletePromises = keys.map(key => 
          new Promise((res, rej) => {
            const delRequest = store.delete(key);
            delRequest.onsuccess = () => res();
            delRequest.onerror = (e) => rej(e.target.error);
          })
        );
        Promise.all(deletePromises).then(() => resolve()).catch(reject);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Méthodes pour les favoris
  async addToFavorites(item) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['favorites'], 'readwrite');
      const store = transaction.objectStore('favorites');

      // Vérifier si le produit est déjà en favoris
      const index = store.index('productId');
      const checkRequest = index.get(item.productId);
      
      checkRequest.onsuccess = () => {
        if (checkRequest.result) {
          // Déjà en favoris, mettre à jour
          const updateRequest = store.put({ ...checkRequest.result, ...item, updatedAt: new Date().toISOString() });
          updateRequest.onsuccess = () => resolve(updateRequest.result);
          updateRequest.onerror = (event) => reject(event.target.error);
        } else {
          // Nouveau favoris
          const addRequest = store.add({ ...item, userId: item.userId || 'default', updatedAt: new Date().toISOString() });
          addRequest.onsuccess = () => resolve(addRequest.result);
          addRequest.onerror = (event) => reject(event.target.error);
        }
      };
      checkRequest.onerror = (event) => reject(event.target.error);
    });
  }

  async getFavorites(userId = 'default') {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['favorites'], 'readonly');
      const store = transaction.objectStore('favorites');
      const index = store.index('userId');

      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async removeFromFavorites(productId) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['favorites'], 'readwrite');
      const store = transaction.objectStore('favorites');
      const index = store.index('productId');

      const request = index.getKey(productId);
      request.onsuccess = () => {
        if (request.result) {
          const deleteRequest = store.delete(request.result);
          deleteRequest.onsuccess = () => resolve(true);
          deleteRequest.onerror = (event) => reject(event.target.error);
        } else {
          resolve(false); // Pas trouvé
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Méthodes pour les commandes hors ligne
  async addPendingOrder(order) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingOrders'], 'readwrite');
      const store = transaction.objectStore('pendingOrders');

      const request = store.add({
        ...order,
        userId: order.userId || 'default',
        status: 'pending',
        date: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getPendingOrders(userId = 'default') {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingOrders'], 'readonly');
      const store = transaction.objectStore('pendingOrders');
      const index = store.index('userId');

      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async updatePendingOrder(id, updates) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingOrders'], 'readwrite');
      const store = transaction.objectStore('pendingOrders');

      const request = store.get(id);
      request.onsuccess = () => {
        const order = request.result;
        if (order) {
          const updatedOrder = { ...order, ...updates, updatedAt: new Date().toISOString() };
          const updateRequest = store.put(updatedOrder);
          updateRequest.onsuccess = () => resolve(updatedOrder);
          updateRequest.onerror = (event) => reject(event.target.error);
        } else {
          reject(new Error('Order not found'));
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async removePendingOrder(id) {
    if (!this.db) {
      console.warn('IndexedDB non initialisé');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingOrders'], 'readwrite');
      const store = transaction.objectStore('pendingOrders');

      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Fallback vers localStorage si IndexedDB n'est pas disponible
  fallbackAddToCart(item) {
    try {
      const cart = JSON.parse(localStorage.getItem('nrj_cart') || '[]');
      cart.push(item);
      localStorage.setItem('nrj_cart', JSON.stringify(cart));
      return true;
    } catch (e) {
      console.error('Erreur fallback localStorage:', e);
      return false;
    }
  }

  fallbackGetCart() {
    try {
      return JSON.parse(localStorage.getItem('nrj_cart') || '[]');
    } catch (e) {
      return [];
    }
  }

  // Vider tous les stores
  async clearAll() {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const stores = ['cart', 'favorites', 'pendingOrders'];
      const transaction = this.db.transaction(stores, 'readwrite');
      
      let completed = 0;
      stores.forEach(storeName => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => {
          completed++;
          if (completed === stores.length) resolve();
        };
        request.onerror = (event) => reject(event.target.error);
      });
    });
  }
})();

// Exporter l'instance unique
export default db;