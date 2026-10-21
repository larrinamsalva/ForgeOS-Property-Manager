export async function pendingMeterCount(userId: string): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('forgeos-meter-v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('vaults', { keyPath: 'scope' });
      const records = db.createObjectStore('records', { keyPath: 'id' });
      records.createIndex('stopKey', 'stopKey', { unique: true });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('records', 'readonly');
      const read = tx.objectStore('records').getAll();
      read.onsuccess = () => {
        resolve(
          read.result.filter(
            (r: { scope: string; pending: boolean }) => r.scope.endsWith(`:${userId}`) && r.pending
          ).length
        );
        db.close();
      };
      read.onerror = () => {
        db.close();
        reject(read.error);
      };
    };
  });
}
