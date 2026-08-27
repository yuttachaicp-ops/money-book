/* สมุดรายรับ–รายจ่าย — service worker
 *
 * เวลาจะปล่อยเวอร์ชันใหม่: แก้ VERSION บรรทัดล่างนี้บรรทัดเดียวพอ
 * แอปที่ติดตั้งไว้จะเห็นแถบ "มีเวอร์ชันใหม่" ขึ้นมาเอง
 */
const VERSION = "2026.08.27-5";
const CACHE = "money-book-" + VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

/* ---- install: เตรียมแคชของเวอร์ชันใหม่ไว้เงียบ ๆ ----
   ไม่เรียก skipWaiting() ตรงนี้ เพราะจะทำให้หน้าที่เปิดค้างอยู่โดนสลับ
   ไฟล์ใต้เท้ากลางคัน — รอให้หน้าเว็บสั่งมาเองว่าพร้อมอัปเดตแล้ว */
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

/* ---- activate: ลบแคชเวอร์ชันเก่าทิ้ง แล้วเข้าคุมทุกหน้าที่เปิดอยู่ ---- */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---- ข้อความจากหน้าเว็บ ---- */
self.addEventListener("message", (e) => {
  const data = e.data || {};
  if (data === "SKIP_WAITING" || data.type === "SKIP_WAITING") {
    self.skipWaiting();                       // ผู้ใช้กด "อัปเดตเลย"
  } else if (data.type === "VERSION" && e.ports && e.ports[0]) {
    e.ports[0].postMessage(VERSION);          // หน้าเว็บถามว่าตอนนี้รันเวอร์ชันอะไร
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // เปิดหน้าเว็บ: เอาของใหม่จากเน็ตก่อนเสมอ ถ้าไม่มีเน็ตค่อยใช้ของในแคช
  // cache:"no-cache" บังคับให้ถามเซิร์ฟเวอร์ทุกครั้ง ไม่งั้น GitHub Pages
  // สั่งให้เบราว์เซอร์เก็บ index.html ไว้ 10 นาที แล้วเวอร์ชันใหม่จะมาช้า
  if (req.mode === "navigate") {
    const fresh = () => {
      try {
        return fetch(req.url, { cache: "no-cache", credentials: "same-origin", redirect: "follow" });
      } catch (err) {
        return fetch(req);
      }
    };
    e.respondWith(
      fresh()
        .then((res) => {
          if (!res || !res.ok) throw new Error("bad response");
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // ไฟล์ของเราเอง: ใช้ของในแคชก่อนเพื่อความเร็ว
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // ฟอนต์จาก Google: ใช้ของในแคชไปก่อน แล้วค่อยอัปเดตเบื้องหลัง
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
