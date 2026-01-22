// config.js
// === إعدادات Firebase ===
// غير هذه البيانات ببيانات مشروعك الحقيقية
export const firebaseConfig = {
    apiKey: "AIzaSyCGVuftvCWX8psK9-GnMIFUbK8hYIpl36s",
    authDomain: "sedkrar-1c800.firebaseapp.com",
    projectId: "sedkrar-1c800",
    storageBucket: "sedkrar-1c800.firebasestorage.app",
    messagingSenderId: "984266925049",
    appId: "1:984266925049:web:bfe5fd2a4e4cfd2c9c5328"
};

// رابط أيقونة التطبيق (يستخدم في التثبيت)
export const APP_ICON_URL = "https://cdn-icons-png.flaticon.com/512/2534/2534204.png";

// دالة التشفير (بسيطة)
export const hashPass = str => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
};
