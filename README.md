# Authentication & Role-Based Access Mini Project

Angular + Express/TypeScript + SQLite — รอบนี้พัฒนาเฉพาะ **User** บน branch `feat/user` รวม Login, Remember Me, User Dashboard และ Logout ยังไม่มี feature Admin

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

Password ในฐานข้อมูลเป็น bcrypt hash (cost 12) บัญชีนี้ใช้สำหรับ Demo เท่านั้น

## Config

| ตัวแปร | ค่าเริ่มต้น/ข้อกำหนด |
|---|---|
| `PORT` | `3000` |
| `FRONTEND_ORIGIN` | `http://localhost:4200` ไม่มี `/` ท้าย |
| `JWT_SECRET` | มีค่าสำหรับทดสอบใน `.env.example` แล้ว; อย่างน้อย 32 ตัวอักษร |
| `ACCESS_TOKEN_SECONDS` | `300` (5 นาที) |
| `REFRESH_SESSION_SECONDS` | `604800` (7 วัน) |
| `COOKIE_SECURE` | `false` สำหรับ HTTP localhost; ใช้ `true` เมื่อ Backend ใช้ HTTPS |

TTL ต้องเป็นจำนวนเต็มบวก หาก Frontend Origin เป็น HTTPS ระบบจะบังคับ Secure Cookie และ Production ไม่อนุญาต Cookie แบบไม่ Secure การ Deploy ต้องให้ Frontend/Backend อยู่ในบริบท same-site ที่รองรับ `SameSite=Lax`

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
- ทุก Protected Request ตรวจลายเซ็น JWT, อายุ Token, Session ที่ไม่หมดอายุ/ไม่ถูกเพิกถอน และ Role `user` จากฐานข้อมูล แม้แก้ Role ใน Browser ก็ไม่ได้สิทธิ์เพิ่ม
- Refresh Cookie ชื่อ `user_refresh`, Path `/api/auth`, `HttpOnly`, `SameSite=Lax`, `Secure` เมื่อใช้ HTTPS และมี Expires ตรงกับวันหมดอายุสูงสุดของ Session
- ฐานข้อมูลเก็บเฉพาะ SHA-256 hash ของ Refresh Token ซึ่งมี entropy สูง เปลี่ยน Token แบบ Atomic ใน SQLite Transaction ทุกครั้งที่ Refresh ค่าเก่าใช้ซ้ำไม่ได้
- Access Token ที่ออกใหม่มีอายุไม่เกินอายุ Session ที่เหลือ การเปลี่ยน Secret ทำให้ Access Token เดิมใช้ไม่ได้
- Angular รวม Refresh ที่เกิดพร้อมกันในแอปหนึ่ง instance เป็นคำขอเดียว คำขอเดิม Retry ได้ครั้งเดียว ไม่ Refresh Login/Refresh/Logout Endpoint และไม่แนบ Token ให้ URL ภายนอก
- เมื่อ Refresh ถูกปฏิเสธ จะกลับ Login; หากเป็น Network Error/Timeout จะแจ้งให้ลองใหม่ ไม่วนส่งคำขออัตโนมัติ
- Logout เพิกถอน Session ในฐานข้อมูลและล้าง Cookie จึงปฏิเสธ Access/Refresh Token เดิมทันที รับได้ทั้ง Access Token ที่หมดอายุแต่ลายเซ็นถูกต้อง หรือ Refresh Cookie
- UI ล้างสถานะหลัง Backend ยืนยัน Logout สำเร็จ หากเครือข่ายขัดข้องจะแสดง Error และให้ลอง Logout ใหม่
- มุมขวาบน Dashboard แสดงเวลาที่เหลือของ Access Token แบบ `MM:SS` อัปเดตทุกวินาที พร้อมสถานะกำลัง Refresh และนับใหม่เมื่อได้ Token ใหม่ เมื่อ Remember Me นับถึงศูนย์จะรอ Refresh ตอนเรียก API; Session ชั่วคราวจะกลับ Login ตามนโยบายเดิม
- Login ครั้งใหม่จะเพิกถอน Session ของ Refresh Cookie เดิมที่ส่งมา โดยเฉพาะเมื่อเปลี่ยนเป็นไม่ Remember Me จะล้าง Cookie เดิมด้วย

## API

| Method | Endpoint | การใช้งาน |
|---|---|---|
| POST | `/api/auth/login` | JSON `{ email, password, rememberMe }` คืน `{ accessToken, expiresAt, rememberMe, user }` |
| POST | `/api/auth/refresh` | ใช้ Refresh Cookie คืนข้อมูลรูปแบบเดียวกับ Login |
| POST | `/api/auth/logout` | ใช้ Bearer Token/Refresh Cookie; สำเร็จ `204` แบบ idempotent |
| GET | `/api/auth/me` | Bearer Token; คืน `{ id, email, name, role }` |
| GET | `/api/user/dashboard` | Bearer Token + Role User; คืน `{ user, message }` |
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

1. Login โดยไม่ติ๊ก Checkbox ต้องเห็นชื่อ Moodeng, Role user และ User Dashboard
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

Backend integration tests ใช้ SQLite ในหน่วยความจำและ HTTP Server บน localhost port ชั่วคราว ไม่แก้ฐานข้อมูลจริง ครอบคลุม Config, Seed, Credentials, Token หมดอายุ/ปลอม, Refresh Rotation/Replay/Concurrent Requests, Logout, Origin และ Role Fixture ที่ไม่ใช่ User

Angular tests ครอบคลุม Validation/Loading/Error, Reload, Timer หมดอายุโดยไม่เรียก API, Guard ที่รอกู้ Session, Single-flight Refresh, Late 401, Retry Limit, Network Failure, Logout และ Refresh Response ที่มาถึงหลัง Logout

ผลตรวจล่าสุด: Backend Build ผ่านและ Tests ผ่าน 15 กรณี; Frontend Build ผ่านและ Tests ผ่าน 22 กรณี รวม 37 กรณี รวมการนับถอยหลังและเริ่มนับใหม่หลัง Refresh ตรวจบน Chrome ก่อนเพิ่มตัวนับถอยหลังด้วย Access TTL 15 วินาที/Refresh TTL 120 วินาที: Login ทั้งสองแบบ, รีโหลด Session ชั่วคราวก่อนหมดอายุ, กลับ Login เมื่อหมดอายุ, กู้ Remember Me หลังรีโหลด, โหลดข้อมูลหลัง Access Token หมดอายุ และ Logout สำเร็จ

## ความคืบหน้าตาม Tasks เดิม

| Task | สถานะ |
|---|---|
| 1. Token Strategy และ Config | เสร็จ |
| 2. บัญชีและ Session | เสร็จเฉพาะ User; ไม่มี Seed Admin |
| 3. Backend Authentication และ Authorization | เสร็จเฉพาะ User; ไม่มี Admin API หรือ middleware หลาย Role |
| 4. Angular Login และ Token Lifecycle | เสร็จสำหรับ User |
| 5. Dashboard และ Logout | เสร็จเฉพาะ User |
| 6. Tests | มี Automated Tests สำหรับขอบเขต User; งานทดสอบ feature Admin ยังเหลือ |
| 7. README | เสร็จสำหรับขอบเขตรอบนี้ |

## ข้อจำกัดและงานที่ยังเหลือ

- ยังไม่มี feature Admin, สมัครสมาชิก, ลืมรหัสผ่าน หรือระบบจัดการผู้ใช้ ตามขอบเขตรอบนี้
- `sessionStorage` อ่านได้ด้วย JavaScript จึงมีความเสี่ยงเมื่อเกิด XSS; HttpOnly ป้องกันการอ่าน Refresh Token แต่ไม่ป้องกัน XSS ทุกกรณี
- การปิดแท็บปกติจะล้าง sessionStorage แต่ Browser บางตัวอาจกู้ข้อมูลนี้เมื่อ Restore Session จึงใช้อายุ Token ฝั่ง Server เป็นขอบเขตจริง
- ทุก Protected Request ต้องอ่าน SQLite เพื่อให้การเพิกถอนมีผลทันที เหมาะกับ Mini Project; ยังไม่มี Session Cleanup/Rate Limiting/Audit Log หรือการจัดการหลายเครื่อง
- การรวม Refresh ทำในแอปหนึ่ง instance เท่านั้น ยังไม่มีการประสานระหว่างหลายแท็บ การ Refresh พร้อมกันข้ามแท็บอาจทำให้แท็บหนึ่งถูกบังคับ Login ใหม่
- ไม่เก็บประวัติ Token เก่าสำหรับตรวจจับการขโมยทั้ง Token Family; ปฏิเสธ Token เก่าด้วย Hash ปัจจุบัน หากคำตอบ Refresh สูญหายก่อน Cookie ถูกอัปเดต อาจต้อง Login ใหม่
- UI ภาษาไทยแบบเรียบง่าย เน้นความถูกต้องของ Session; ต้องตั้งค่า HTTPS, Secret และ Origin ให้เหมาะสมก่อน Deploy จริง

## Tailwind CSS Convention

เรียง Class ที่เพิ่ม/แก้ตาม **Layout → Position and alignment → Spacing → Size → Color → Border decoration → Responsive** โดยวาง `sm:`, `md:`, `lg:` ไว้ท้าย ไม่ใช้ Plugin เรียง Class ที่เปลี่ยนลำดับนี้
