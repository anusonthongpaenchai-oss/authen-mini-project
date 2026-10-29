# Authentication & Role-Based Access Mini Project

Angular + Express/TypeScript + SQLite — รองรับ **Admin และ User** บน branch `feat/admin` ใช้ Login, Remember Me, Token Lifecycle และ Logout ร่วมกัน พร้อม Dashboard/API แยกตาม Role

## ติดตั้งและรัน

ใช้ Node.js 24 และ npm ที่รองรับ dependencies ใน lockfile เปิด Backend ก่อน:

```bash
cd backend
npm ci
cp .env.example .env
```

`backend/.env.example` มี `JWT_SECRET` สำหรับโปรเจกต์ทดสอบนี้แล้ว คัดลอกเป็น `.env` แล้วรันต่อได้เลย:

```bash
npm run db:init
npm run db:seed
npm run dev
```

เปิดอีก Terminal:

```bash
cd frontend
npm ci
npm start
```

เปิด **http://localhost:4200** หรือ `/login` และใช้ hostname `localhost` ทั้งสองฝั่ง เพื่อให้ SameSite Cookie ทำงานตามนโยบายเดียวกัน ตรวจการเชื่อมต่อเดิมได้ที่ `/health-check`

SQLite อยู่ใน `backend/src/db/auth.sqlite` และถูก ignore จาก Git คำสั่ง Seed สร้างบัญชีเมื่อยังไม่มีเท่านั้น ไม่เพิ่มข้อมูลซ้ำหรือเปลี่ยน Password ของบัญชีเดิม การเริ่ม Server จะไม่ Seed ให้อัตโนมัติ

## บัญชีทดสอบ

| Email | Password | ชื่อ | Role |
|---|---|---|---|
| `moodeng@gmail.com` | `moodeng123` | Moodeng | user |
| `admin@gmail.com` | `admin123` | Admin | admin |

Password ในฐานข้อมูลเป็น bcrypt hash (cost 12) ทั้งสองบัญชีใช้สำหรับ Demo เท่านั้น `npm run db:seed` เตรียมทั้งสองบัญชีและรักษาข้อมูลบัญชีเดิมไว้ ไม่จำเป็นต้องเปลี่ยน Schema หรือสร้างฐานข้อมูลใหม่

## Dashboard และสิทธิ์

| Role | หน้า Dashboard | API ที่อนุญาต |
|---|---|---|
| User | `/dashboard` | `/api/user/dashboard` |
| Admin | `/admin/dashboard` | `/api/admin/dashboard` |

ใช้หน้า `/login` เดียว ไม่มีตัวเลือก Role ในฟอร์ม ระบบนำทางตามข้อมูลผู้ใช้จาก Backend หลัง Login หรือกู้ Session หากเข้าหน้าข้าม Role จะถูกส่งกลับ Dashboard ของตนเอง ส่วนการเรียก API ข้าม Role โดยตรงตอบ `403` ทั้งสองทิศทาง Admin ไม่ได้สิทธิ์ User โดยอัตโนมัติ

User เห็นข้อความ “คุณสามารถเข้าถึงข้อมูลส่วนตัวของคุณได้” ส่วน Admin เห็น “คุณสามารถเข้าถึงส่วนจัดการระบบได้” โดยโหลดจาก API ของแต่ละ Role จริง

Backend แยก `authenticate` สำหรับตรวจ JWT/Session และอ่านผู้ใช้จากฐานข้อมูล ออกจาก `authorizeRole` สำหรับตรวจสิทธิ์ Endpoint ส่วน `/api/auth/me` ใช้ Authentication ร่วมกันได้ทั้งสอง Role Guard ของ Angular ใช้ควบคุมการนำทางเท่านั้น สิทธิ์เข้าถึงข้อมูลตรวจที่ Backend เสมอ

## Config

| ตัวแปร | ค่าเริ่มต้น/ข้อกำหนด |
|---|---|
| `PORT` | `3000` |
| `FRONTEND_ORIGIN` | `http://localhost:4200` ไม่มี `/` ท้าย |
| `JWT_SECRET` | มีค่าสำหรับทดสอบใน `.env.example` แล้ว; อย่างน้อย 32 ตัวอักษร |
| `ACCESS_TOKEN_SECONDS` | `300` (5 นาที) |
| `REFRESH_SESSION_SECONDS` | `604800` (7 วัน) |
| `COOKIE_SECURE` | `false` สำหรับ HTTP localhost; ใช้ `true` เมื่อ Backend ใช้ HTTPS |

Frontend ใช้ API base `http://localhost:3000/api` กำหนดผ่าน Injection Token `API_BASE` ใน `frontend/src/app/core/auth/auth.models.ts` หากเปลี่ยน Backend Port ต้องปรับค่านี้ด้วย

## Token Strategy และ Session Lifecycle

| พฤติกรรม | ไม่ Remember Me | Remember Me |
|---|---|---|
| Access Token | JWT HS256 อายุสูงสุด 5 นาที | JWT HS256 อายุสูงสุด 5 นาที |
| ที่เก็บ Access Token | `sessionStorage` ของแท็บ | หน่วยความจำของแอป |
| รีโหลด | ตรวจ Token เดิมผ่าน `/auth/me` | ใช้ Refresh Cookie กู้ Session |
| Access Token หมดอายุ | ล้างสถานะและกลับ Login ด้วย Timer/401 ไม่ Refresh | Refresh เมื่อ API ตอบ 401 แล้ว Retry หนึ่งครั้ง |
| อายุ Session สูงสุด | เท่าอายุ Access Token | 7 วันนับจาก Login ไม่ขยายอายุเมื่อ Refresh |
| Refresh Token | ไม่มี | ค่าสุ่ม 256 บิต พร้อม Session ID ใน HttpOnly Cookie |

- JWT มี User ID (`sub`), Session ID (`sid`), `exp`, issuer และ audience ไม่ใช้ Role จาก Frontend เป็นหลักฐานสิทธิ์
- ทุก Protected Request ตรวจลายเซ็น JWT, อายุ Token และ Session ที่ไม่หมดอายุ/ไม่ถูกเพิกถอน Dashboard API ตรวจ Role `user` หรือ `admin` จากฐานข้อมูลทุกครั้ง แม้แก้ Role ใน Browser/JWT ก็ไม่ได้สิทธิ์เพิ่ม การเปลี่ยน Role ในฐานข้อมูลมีผลกับ Request ถัดไป
- Refresh Cookie ชื่อ `user_refresh`, Path `/api/auth`, `HttpOnly`, `SameSite=Lax`, `Secure` เมื่อใช้ HTTPS และมี Expires ตรงกับวันหมดอายุสูงสุดของ Session
- ฐานข้อมูลเก็บเฉพาะ SHA-256 hash ของ Refresh Token ซึ่งมี entropy สูง เปลี่ยน Token แบบ Atomic ใน SQLite Transaction ทุกครั้งที่ Refresh ค่าเก่าใช้ซ้ำไม่ได้
- Access Token ที่ออกใหม่มีอายุไม่เกินอายุ Session ที่เหลือ การเปลี่ยน Secret ทำให้ Access Token เดิมใช้ไม่ได้
- Angular รวม Refresh ที่เกิดพร้อมกันในแอปหนึ่ง instance เป็นคำขอเดียว คำขอเดิม Retry ได้ครั้งเดียว ไม่ Refresh Login/Refresh/Logout Endpoint และไม่แนบ Token ให้ URL ภายนอก
- เมื่อ Refresh ถูกปฏิเสธ จะกลับ Login; หากเป็น Network Error/Timeout จะแจ้งให้ลองใหม่ ไม่วนส่งคำขออัตโนมัติ
- Logout เพิกถอน Session ในฐานข้อมูลและล้าง Cookie จึงปฏิเสธ Access/Refresh Token เดิมทันที รับได้ทั้ง Access Token ที่หมดอายุแต่ลายเซ็นถูกต้อง หรือ Refresh Cookie
- UI ล้างสถานะหลัง Backend ยืนยัน Logout สำเร็จ หากเครือข่ายขัดข้องจะแสดง Error และให้ลอง Logout ใหม่
- ทั้งสอง Dashboard ใช้ Component ตัวนับถอยหลังร่วมกัน วางด้านขวาใต้เนื้อหาตาม Layout ปัจจุบัน แสดงเวลาที่เหลือของ Access Token แบบ `MM:SS` อัปเดตทุกวินาที พร้อมสถานะกำลัง Refresh และนับใหม่เมื่อได้ Token ใหม่ เมื่อ Remember Me นับถึงศูนย์จะรอ Refresh ตอนเรียก API; Session ชั่วคราวจะกลับ Login ตามนโยบายเดิม
- Login ครั้งใหม่จะเพิกถอน Session ของ Refresh Cookie เดิมที่ส่งมา โดยเฉพาะเมื่อเปลี่ยนเป็นไม่ Remember Me จะล้าง Cookie เดิมด้วย
- ทั้งสอง Role ใช้นโยบายอายุ Token/Session เดียวกัน คงชื่อ Cookie `user_refresh`, Storage Key `user-auth`, JWT issuer `authen-mini-project` และ audience `user-app` เดิมเพื่อรองรับ Session ฝั่ง User เดิม

## API

| Method | Endpoint | การใช้งาน |
|---|---|---|
| POST | `/api/auth/login` | JSON `{ email, password, rememberMe }` คืน `{ accessToken, expiresAt, rememberMe, user }` |
| POST | `/api/auth/refresh` | ใช้ Refresh Cookie คืนข้อมูลรูปแบบเดียวกับ Login |
| POST | `/api/auth/logout` | ใช้ Bearer Token/Refresh Cookie; สำเร็จ `204` แบบ idempotent |
| GET | `/api/auth/me` | Bearer Token; คืน `{ id, email, name, role }` |
| GET | `/api/user/dashboard` | Bearer Token + Role User; คืน `{ user, message }` |
| GET | `/api/admin/dashboard` | Bearer Token + Role Admin; คืน `{ user, message }` |
| GET | `/api/health` | ตรวจ Backend/SQLite โดยไม่ต้อง Login |

`expiresAt` เป็น Unix milliseconds ส่วน Error ใช้ `{ code, message }`: `400` ข้อมูลไม่ถูกต้อง, `401` Login/Session ไม่ผ่าน, `403` Role/Origin ไม่ได้รับอนุญาต, `500` ระบบขัดข้อง ไม่คืน Password Hash หรือ Refresh Token ใน JSON

Auth POST ทุก Endpoint ต้องมี `Origin` ตรงกับ `FRONTEND_ORIGIN` เพื่อป้องกันคำขอ Cookie จาก Origin อื่น Browser จะส่งให้อัตโนมัติ สำหรับ curl/Postman ต้องใส่เอง เช่น:

```bash
curl -i http://localhost:3000/api/auth/login \
  -H 'Origin: http://localhost:4200' \
  -H 'Content-Type: application/json' \
  -d '{"email":"moodeng@gmail.com","password":"moodeng123","rememberMe":false}'
```

## ทดสอบ Demo Remember Me

ตั้งค่าใน `backend/.env` แล้ว Restart Backend:

```dotenv
ACCESS_TOKEN_SECONDS=60
REFRESH_SESSION_SECONDS=600
```

**ไม่ Remember Me**

1. Login โดยไม่ติ๊ก Checkbox: บัญชี Moodeng ไป User Dashboard ส่วนบัญชี Admin ไป Admin Dashboard แสดงชื่อและ Role ตรงกับบัญชี
2. รีโหลดภายใน 60 วินาที ต้องใช้งานต่อได้ด้วย Token เดิม โดยไม่เรียก `/auth/refresh`
3. รอครบ 60 วินาทีจาก Login โดยไม่ต้องกดอะไร ต้องกลับหน้า Login พร้อมข้อความ Session หมดอายุ และไม่มี Refresh Request
4. Login ใหม่แล้ว Logout ก่อนหมดอายุ เก็บ Access Token ก่อน Logout ไว้ทดสอบ `/auth/me` อีกครั้ง ต้องได้ `401`

**Remember Me**

1. Login โดยติ๊ก Checkbox ตรวจใน DevTools ว่ามี Cookie `user_refresh` แบบ HttpOnly และไม่มี Access Token ของรอบนี้ใน sessionStorage/localStorage
2. รีโหลด หรือปิดแล้วเปิด Browser กลับมา ก่อนครบ 10 นาที ต้องกู้ Session ผ่าน `/auth/refresh` ได้
3. รอให้ Access Token หมดอายุ แล้วกด “โหลดข้อมูลอีกครั้ง” จะเห็น API ตอบ `401` ตามด้วย Refresh และ Retry สำเร็จ โดยไม่ต้องกรอก Password
4. ทุกครั้งที่ Refresh ค่า Cookie ต้องเปลี่ยน แต่ Expires ต้องไม่เลื่อนออกไป ทดลองนำ Cookie ค่าเก่ามา Refresh ด้วย API Client ต้องได้ `401`
5. รอเกิน 10 นาทีจาก Login แล้วโหลดข้อมูลอีกครั้ง ต้องกลับ Login หากต้องการ Demo เร็วขึ้นตั้ง `REFRESH_SESSION_SECONDS=90` แล้ว Login ใหม่
6. Login แล้ว Logout จากนั้นใช้ Access Token/Cookie ที่เก็บไว้ก่อน Logout เรียก API ต้องได้ `401`

ทดสอบ Backend ปิดชั่วคราวระหว่างโหลด/Refresh/Logout ต้องเห็น Error และลองใหม่ได้ โดยไม่มี Refresh Loop

ทำขั้นตอน Remember Me ทั้งสองแบบซ้ำกับบัญชี Admin ด้วย ตรวจการแยกสิทธิ์เพิ่มเติมดังนี้:

1. Login เป็น User แล้วเปิด `/admin/dashboard` ต้องกลับ `/dashboard`
2. Login เป็น Admin แล้วเปิด `/dashboard` ต้องกลับ `/admin/dashboard`
3. ใช้ User Bearer Token เรียก `/api/admin/dashboard` โดยตรงต้องได้ `403`; ใช้ Admin Token เรียก `/api/user/dashboard` ต้องได้ `403` เช่นกัน
4. รีโหลด `/login` ขณะมี Session ที่ใช้ได้ ต้องกู้ Session และนำกลับ Dashboard ตาม Role

## Build และ Automated Tests

```bash
cd backend
npm run build
npm test
```

```bash
cd frontend
npm run build
npm test -- --watch=false
```

Backend integration tests ใช้ SQLite ในหน่วยความจำและ HTTP Server บน localhost port ชั่วคราว ไม่แก้ฐานข้อมูลจริง ครอบคลุม Config, Seed ทั้งสองบัญชี, Credentials, Token หมดอายุ/ปลอม, Refresh Rotation/Replay/Concurrent Requests, Logout, Origin, การปฏิเสธ API ข้าม Role, Role ปลอมจาก Frontend/JWT และ Role ที่เปลี่ยนในฐานข้อมูล

Angular tests ครอบคลุม Validation/Loading/Error, การนำทางหลัง Login/กู้ Session ตาม Role, การป้องกันหน้าข้าม Role, Role ใน sessionStorage ที่ถูกแก้ไข, Reload, Timer หมดอายุโดยไม่เรียก API, Guard ที่รอกู้ Session, Single-flight Refresh, Late 401, Retry Limit, Network Failure, Logout และ Refresh Response ที่มาถึงหลัง Logout โดยรัน Token Lifecycle และตัวนับถอยหลังทั้งสอง Role
