// ── IndexedDB wrapper for storing snapped images ─────────────────────────────
const DB_NAME    = 'WeirdFacesDB'
const DB_VERSION = 1
const STORE      = 'snaps'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

// Save a Blob and return the new record's id
export async function saveSnap(blob) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req   = store.add({ blob, createdAt: Date.now() })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

// Return all snaps sorted newest-first
export async function getAllSnaps() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req   = store.getAll()
    req.onsuccess = e => resolve(e.target.result.reverse())
    req.onerror   = e => reject(e.target.error)
  })
}

// Delete a single snap by id
export async function deleteSnap(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req   = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}
