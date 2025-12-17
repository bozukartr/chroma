// TODO: REPLACE WITH YOUR OWN FIREBASE CONFIGURATION
// 1. Go to console.firebase.google.com
// 2. Create a new project
// 3. Add a Web App
// 4. Copy the "firebaseConfig" object here

const firebaseConfig = {
    apiKey: "AIzaSyBtVV8wzWPT-okrSI-xdwduqZTEjiBpxCU",
    authDomain: "chroma-e6de3.firebaseapp.com",
    projectId: "chroma-e6de3",
    storageBucket: "chroma-e6de3.firebasestorage.app",
    messagingSenderId: "602977702008",
    appId: "1:602977702008:web:daa824b6460bddd357dd8d",
    measurementId: "G-GBMPPQ9QNB"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();
