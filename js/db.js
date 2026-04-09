import { db } from './config.js';
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function dbGet(col, id) {
  try {
    const snap = await getDoc(doc(db, col, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error(`dbGet ${col}/${id}:`, e);
    return null;
  }
}

export async function dbSet(col, id, data) {
  await setDoc(doc(db, col, id), data, { merge: true });
}

export async function dbDelete(col, id) {
  await deleteDoc(doc(db, col, id));
}

export async function dbQuery(col, uid) {
  const q = query(collection(db, col), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function dbListen(col, uid, callback) {
  const q = query(collection(db, col), where('uid', '==', uid));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(data);
  }, err => console.error(`dbListen ${col}:`, err));
}

export function newDocRef(col) {
  return doc(collection(db, col));
}
