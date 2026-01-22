const CACHE_NAME = 'debt-app-offline-v5';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './customer.html',
    './styles.css',
    './app.js',
    './customer.js',
    './pwa.js',
    './config.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

self.addEventListener('fetch', (e) => {
    // نتجاهل طلبات الفايربيس لأن الـ SDK الخاص بها يتعامل مع الأوفلاين داخلياً
    if (e.request.url.includes('firestore') || e.request.url.includes('googleapis')) {
        return; 
    }

    e.respondWith(
        caches.match(e.request).then((response) => {
            // نرجع الملف من الكاش، وإذا غير موجود نجلبه من الشبكة
            return response || fetch(e.request).catch(() => {
                // في حالة انقطاع النت وفشل الجلب، يمكن إرجاع صفحة بديلة إذا أردت
                // هنا نكتفي بالوضع الحالي
            });
        })
    );
});
