import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {

  apiKey: "AIzaSyAjlSrH_YCLH27Sxv57logPE4AtiN_Tgwc",

  authDomain: "test-cere3d-72d9e.firebaseapp.com",

  projectId: "test-cere3d-72d9e",

  storageBucket: "test-cere3d-72d9e.firebasestorage.app",

  messagingSenderId: "308589765845",

  appId: "1:308589765845:web:ef3770e1ecd969c3902e5c",

  measurementId: "G-VNQ3GJ3J9F"

};


export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
