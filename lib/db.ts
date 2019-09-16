"use strict";

// eslint-disable-next-line no-unused-vars
import { BaseItem } from "./item";
// eslint-disable-next-line no-unused-vars
import { Download } from "./manager/download";
import { RUNNING, QUEUED, RETRYING } from "./manager/state";

// License: MIT

const VERSION = 1;
const STORE = "queue";

export const DB = new class DB {
  private db?: IDBDatabase;

  constructor() {
    this.db = undefined;
    this.getAllInternal = this.getAllInternal.bind(this);
  }

  async init() {
    if (this.db) {
      return;
    }
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("downloads", VERSION);
      req.onupgradeneeded = evt => {
        const db = req.result;
        switch (evt.oldVersion) {
        case 0: {
          const queueStore = db.createObjectStore(STORE, {
            keyPath: "dbId",
            autoIncrement: true
          });
          queueStore.createIndex("by_position", "position", {unique: false});
          break;
        }
        }
      };
      req.onerror = ex => reject(ex);
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
    });
  }

  getAllInternal(resolve: (items: BaseItem[]) => void, reject: Function) {
    if (!this.db) {
      reject(new Error("db closed"));
      return;
    }
    const items: BaseItem[] = [];
    const transaction = this.db.transaction(STORE, "readonly");
    transaction.onerror = ex => reject(ex);
    const store = transaction.objectStore(STORE);
    const index = store.index("by_position");
    index.openCursor().onsuccess = event => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) {
        resolve(items);
        return;
      }
      items.push(cursor.value);
      cursor.continue();
    };
  }

  async getAll() {
    await this.init();
    return await new Promise(this.getAllInternal);
  }

  saveItemsInternal(items: Download[], resolve: Function, reject: Function) {
    if (!items || !items.length || !this.db) {
      resolve();
      return;
    }
    try {
      const transaction = this.db.transaction(STORE, "readwrite");
      transaction.onerror = ex => reject(ex);
      transaction.oncomplete = () => resolve();
      const store = transaction.objectStore(STORE);
      for (const item of items) {
        if (item.private) {
          continue;
        }
        const json = item.toJSON();
        if (item.state === RUNNING || item.state === RETRYING) {
          json.state = QUEUED;
        }
        const req = store.put(json);
        if (!("dbId" in item) || item.dbId < 0) {
          req.onsuccess = () => item.dbId = req.result as number;
        }
      }
    }
    catch (ex) {
      reject(ex);
    }
  }

  async saveItems(items: Download[]) {
    await this.init();
    return await new Promise(this.saveItemsInternal.bind(this, items));
  }

  deleteItemsInternal(items: any[], resolve: Function, reject: Function) {
    if (!items || !items.length || !this.db) {
      resolve();
      return;
    }
    try {
      const transaction = this.db.transaction(STORE, "readwrite");
      transaction.onerror = ex => reject(ex);
      transaction.oncomplete = () => resolve();
      const store = transaction.objectStore(STORE);
      for (const item of items) {
        if (item.private) {
          continue;
        }
        if (!("dbId" in item)) {
          continue;
        }
        store.delete(item.dbId);
      }
    }
    catch (ex) {
      console.error(ex.message, ex);
      reject(ex);
    }
  }

  async deleteItems(items: any[]) {
    if (!items.length) {
      return;
    }
    await this.init();
    await new Promise(this.deleteItemsInternal.bind(this, items));
  }
}();
