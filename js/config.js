import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCRG7NqvtPJlVhD7XDqd8CZO1Nd0UJ0tBg",
  authDomain: "notefy-48dcd.firebaseapp.com",
  projectId: "notefy-48dcd",
  storageBucket: "notefy-48dcd.firebasestorage.app",
  messagingSenderId: "897014697920",
  appId: "1:897014697920:web:4cfe90baae747aaa754225",
  measurementId: "G-6N5CHT381J"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
