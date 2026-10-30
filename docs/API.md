# ClassInteract AI – Tài liệu REST API (`/api/v1`)

Tài liệu dành cho lập trình viên tích hợp hoặc bảo trì backend (`apps/api`, Fastify). Mọi schema đầu vào nằm trong `packages/shared/src/schemas.ts` (Zod); quyền truy cập được kiểm tra ở `apps/api/src/lib/auth.ts` và `apps/api/src/lib/access.ts`.

> Lưu ý kiến trúc: **mọi thao tác ghi** đi qua REST API. Một số dữ liệu **chỉ đọc theo thời gian thực** (bảng tin, hoạt động, kết quả, thông báo, hồ sơ người dùng) được web client đọc trực tiếp từ Firestore theo `firebase/firestore.rules` – không có endpoint REST tương ứng để liệt kê chúng.

## 1. Quy ước chung

| Mục | Giá trị |
|---|---|
| Base URL | `https://<host>/api/v1` (web dùng `VITE_API_BASE`, mặc định `/api/v1`) |
| Định dạng | JSON (`content-type: application/json`), body tối đa 2 MB |
| Thời gian | Chuỗi ISO 8601 (Timestamp Firestore được chuyển đổi khi trả về) |
| Health check | `GET /healthz` → `{ "ok": true }` (nằm ngoài `/api/v1`) |
| Endpoint không tồn tại | `404 { error: { code: "NOT_FOUND" } }` |

### 1.1 Xác thực

1. Gọi `POST /auth/login` (hoặc `POST /auth/register` với sinh viên) → nhận `{ token, user }`; `token` là **Firebase custom token**.
2. Client đăng nhập Firebase Auth bằng `signInWithCustomToken(token)` rồi lấy **ID token** (`getIdToken()`).
3. Mọi endpoint ngoài nhóm *Setup* và *Auth công khai* yêu cầu header:
   ```
   Authorization: Bearer <Firebase ID token>
   ```
4. Server kiểm tra token **kèm trạng thái thu hồi** (`verifyIdToken(token, true)`) và hồ sơ `users/{uid}` phải có `status = "active"`.

| Tình huống | HTTP | `code` |
|---|---|---|
| Thiếu/sai header, token hết hạn | 401 | `UNAUTHENTICATED` |
| Token đã bị thu hồi (đổi/đặt lại mật khẩu, đổi vai trò, khóa tài khoản) | 401 | `SESSION_REVOKED` |
| Tài khoản bị khóa | 403 | `ACCOUNT_DISABLED` |

### 1.2 Vai trò và quan hệ với lớp

Vai trò hệ thống (`users.role`): `student`, `lecturer`, `admin`, `superadmin`. *Staff* = lecturer/admin/superadmin; *Admin* = admin/superadmin.

Quan hệ với một lớp (tính bởi `loadClassAccess`):

| Ký hiệu | Ai | Hàm |
|---|---|---|
| **Xem lớp** | admin, giảng viên trong `lecturerIds`, thành viên `active` (SV hoặc TA) | `loadClassAccess` (403 nếu không) |
| **Quản lý lớp** (Manager) | admin hoặc giảng viên phụ trách | `requireClassManager` |
| **Điều phối** (Moderator) | Manager hoặc thành viên có vai trò lớp `ta` | `requireClassModerator` |
| **Lớp ghi được** | Lớp `active`; nếu lớp `locked/archived` chỉ Manager được ghi | `assertClassWritable` |

### 1.3 Định dạng lỗi

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Mật khẩu tối thiểu 6 ký tự", "details": [{ "path": "password", "message": "..." }] } }
```

`message` luôn bằng tiếng Việt, có thể hiển thị trực tiếp cho người dùng. `details` tùy lỗi (danh sách trường lỗi, thông tin lớp, các lần thử AI…).

**Mã lỗi chung**

| HTTP | `code` | Ý nghĩa |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Sai schema Zod; `details` = `[{ path, message }]` |
| 400 | `BAD_REQUEST` | Dữ liệu hợp lệ về kiểu nhưng sai nghiệp vụ |
| 401 | `UNAUTHENTICATED`, `SESSION_REVOKED` | Xem 1.1 |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED` | Không đủ quyền / tài khoản khóa |
| 404 | `NOT_FOUND` | Không có dữ liệu hoặc endpoint |
| 409 | `CONFLICT` | Xung đột trạng thái (trùng mã, sai trạng thái…) |
| 429 | `RATE_LIMITED` | Vượt giới hạn tần suất |
| 500 | `INTERNAL` | Lỗi hệ thống |

**Mã lỗi nghiệp vụ đáng chú ý**

| HTTP | `code` | Endpoint / khi nào |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Đăng nhập sai mã SV/email hoặc mật khẩu (không tiết lộ tài khoản có tồn tại hay không) |
| 429 | `ACCOUNT_LOCKED` | Sai mật khẩu 5 lần liên tiếp → khóa đăng nhập 5 phút |
| 403 | `NOT_IN_ROSTER` | Đăng ký với mã SV chưa có trong danh sách lớp nào |
| 409 | `ALREADY_REGISTERED` | Mã SV đã có tài khoản |
| 400 | `WRONG_PASSWORD`, `SAME_PASSWORD` | Đổi mật khẩu |
| 409 | `EMAIL_EXISTS` | Tạo tài khoản cán bộ trùng email |
| 503 / 409 | `SETUP_DISABLED`, `ALREADY_INITIALIZED` | Bootstrap |
| 409 | `SESSION_NOT_OPEN`, `SESSION_PAUSED`, `SESSION_CLOSED` | Tương tác khi buổi học chưa mở / tạm dừng / đã kết thúc |
| 410 | `CODE_EXPIRED` | Mã tham gia hết hạn (12 giờ) |
| 403 | `NOT_MEMBER` | Mã tham gia đúng nhưng chưa có trong lớp; `details = { classId, classCode, className }` |
| 409 | `EDIT_WINDOW_PASSED` | Sửa/xóa bài sau thời gian cho phép |
| 409 | `ACTIVITY_CLOSED` | Nộp bài khi hoạt động chưa mở/đã đóng |
| 503 / 403 | `AI_DISABLED` | AI tắt toàn hệ thống (503) hoặc tắt ở lớp (403) |
| 503 | `AI_NOT_CONFIGURED` | Không có nhà cung cấp nào bật **và** có API key |
| 429 | `AI_QUOTA_EXCEEDED` | Hết lượt AI/ngày của lớp hoặc của sinh viên |
| 429 | `AI_BUDGET_EXCEEDED` | Đạt hạn mức chi phí AI của tháng |
| 502 | `AI_PROVIDER_ERROR` | Mọi nhà cung cấp đều lỗi; `details.attempts = [{ provider, error }]` |

### 1.4 Idempotency – `clientRequestId`

Các thao tác tạo có thể bị gửi lại khi mạng chập chờn nhận trường `clientRequestId` (chuỗi `[A-Za-z0-9_-]{8,64}`):

| Endpoint | Cách xử lý |
|---|---|
| Tạo bài gốc, tạo phản hồi | ID bài = hash(uid, buổi/bài cha, `clientRequestId`). Gửi lại cùng khóa → không tạo bản sao, trả `{ postId, duplicate: true }` |
| Nộp hoạt động | Mỗi SV chỉ có một bài nộp/hoạt động; gửi lại cùng đáp án → `{ ok: true, changed: false }` |

Client nên **giữ nguyên** `clientRequestId` khi thử lại sau lỗi mạng và tạo khóa mới cho lần gửi mới.

### 1.5 Giới hạn tần suất

- Toàn cục: **600 yêu cầu/phút**. Khóa giới hạn là **token của người dùng** (hash header `Authorization`), không phải IP – vì cả lớp thường dùng chung một IP NAT. Yêu cầu không có token (đăng nhập, đăng ký, setup) tính **theo IP**.
- Giới hạn riêng (cùng cách tính khóa):

| Endpoint | Giới hạn/phút |
|---|---|
| `POST /auth/register`, `POST /auth/login` | 300 (theo IP; chống dò mật khẩu bằng khóa tài khoản) |
| `POST /auth/change-password` | 10 |
| `POST /setup/bootstrap` | 5 |
| `POST /sessions/join-by-code` | 30 |
| Tạo bài gốc / phản hồi | 30 / 40 |
| Phản hồi nhanh, bình chọn | 120 |
| Nộp hoạt động | 60 |
| `POST /ai/answer` | 20 |

Vượt giới hạn → `429 RATE_LIMITED`.

---

## 2. Setup (công khai)

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| GET | `/setup/status` | Công khai | → `{ initialized: boolean }` (đã có superadmin chưa) |
| POST | `/setup/bootstrap` | Header `x-setup-token` = biến môi trường `SETUP_TOKEN`; chỉ chạy được **một lần** | `bootstrapSchema`: `email`, `password` (≥6), `displayName` → `{ uid }`. Tạo superadmin và cấu hình AI mặc định |

## 3. Auth

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| POST | `/auth/register` | Công khai | `registerSchema`: `studentId` (3–32 ký tự chữ/số/`._-`, tự viết hoa), `password` (6–128) → `{ token, user }`. SV được tự động gán vào mọi lớp đã nhập mã SV này. Lỗi: `NOT_IN_ROSTER`, `ALREADY_REGISTERED` |
| POST | `/auth/login` | Công khai | `loginSchema`: `loginId` (mã SV, hoặc email nếu chứa `@`), `password` → `{ token, user }`. Lỗi: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED` |
| GET | `/auth/me` | Đăng nhập | → `{ user }` |
| POST | `/auth/change-password` | Đăng nhập | `currentPassword`, `newPassword` → `{ token }` (custom token mới). Thu hồi mọi phiên khác, xóa cờ `mustChangePassword` |

`user` (UserDoc) chính: `uid, role, status, displayName, studentId, email, mustChangePassword, lastLoginAt, createdAt`.

## 4. Users

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| GET | `/users` | Admin | Query `listUsersQuerySchema`: `role`, `status`, `q` (tìm tiền tố theo mã SV, tên không dấu, email), `limit` (1–200, mặc định 50), `cursor` → `{ items, nextCursor }` |
| GET | `/users/:id` | Staff: admin; chính mình; giảng viên nếu SV đang học một lớp của mình | → `{ user, memberships, classes, teaching }` |
| POST | `/users` | Admin | `createStaffSchema`: `email`, `displayName`, `role` (`lecturer`\|`admin`), `password` → `{ uid }`. Chỉ superadmin tạo được `admin`. Tài khoản mới phải đổi mật khẩu lần đầu |
| PATCH | `/users/:id` | Admin | `{ displayName }` → `{ ok }` |
| PATCH | `/users/:id/status` | Admin (không tự khóa mình; admin chỉ quản lý SV/giảng viên, superadmin quản lý mọi tài khoản) | `{ status: "active"\|"disabled" }`. Khóa = vô hiệu hóa Firebase Auth + thu hồi refresh token ngay |
| PATCH | `/users/:id/role` | Admin, theo `canAssignRole` | `{ role }`. Không chuyển giữa SV ↔ cán bộ; admin chỉ gán `student/lecturer`; superadmin gán mọi vai trò. Thu hồi phiên của người bị đổi |
| POST | `/users/:id/reset-password` | Admin với SV/giảng viên, superadmin với mọi tài khoản, hoặc giảng viên với SV lớp mình | `{ newPassword? }` → `{ temporaryPassword }`. Bỏ trống → sinh ngẫu nhiên 8 ký tự; bật `mustChangePassword`, mở khóa đăng nhập, thu hồi phiên |

## 5. Courses (học phần)

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| GET | `/courses` | Staff | → `{ items }` (sắp theo mã) |
| POST | `/courses` | Staff | `courseSchema`: `code` (viết hoa, duy nhất), `name`, `description?` → `{ courseId }` |
| PATCH | `/courses/:id` | Admin hoặc người tạo | Một phần `courseSchema` → `{ ok }` |

## 6. Classes & roster

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| GET | `/classes` | Đăng nhập | Query `status?`, `all?`. Admin: mọi lớp (tối đa 500); giảng viên: lớp phụ trách + lớp là thành viên; SV: lớp là thành viên, ẩn lớp `archived` → `{ items }` |
| POST | `/classes` | Staff | `createClassSchema`: `courseId`, `classCode` (viết hoa), `name?`, `semester`, `academicYear`, `schedule?`, `lecturerIds?` (admin chọn; giảng viên luôn tự được thêm) → `{ classId }`. Trùng `classCode` + `semester` → 409 |
| GET | `/classes/:classId` | Xem lớp | → `{ class, access: { canManage, canModerate, memberRole } }` |
| PATCH | `/classes/:classId` | Manager | `updateClassSchema`: `name, semester, academicYear, schedule, status` (`active\|locked\|archived`), `settings` (một phần, xem bảng dưới), `lecturerIds` (chỉ admin, 1–10) |
| GET | `/classes/:classId/members` | Moderator | → `{ members, pendingRoster }` (`pendingRoster`: mã SV đã nhập nhưng chưa đăng ký) |
| POST | `/roster/parse` | Staff | `{ filename (.csv/.txt/.xlsx), contentBase64 }` → `{ rows: [{ studentId, fullName, email }], columns }`. Chỉ đọc, không lưu |
| POST | `/classes/:classId/roster/import` | Manager | `{ rows: [...] }` (1–1000 dòng, mỗi dòng theo `rosterRowSchema`: `studentId`, `fullName`, `email?`) → `{ result: { total, created, updated, enrolled, pendingRegistration, alreadyMember }, errors: [{ row, message }] }` |
| DELETE | `/classes/:classId/roster/:studentId` | Manager | Bỏ mã SV (chưa đăng ký) khỏi danh sách chờ của lớp |
| POST | `/classes/:classId/members` | Manager | `{ studentIds: [...] }` – thêm các mã SV đã có trong danh bạ → `{ result, missing }` |
| PATCH | `/classes/:classId/members/:uid` | Manager | `{ role: "student"\|"ta" }` |
| DELETE | `/classes/:classId/members/:uid` | Manager | Xóa khỏi lớp (đánh dấu `removed`, giữ dữ liệu cũ) |
| POST | `/classes/:classId/members/:uid/move` | Manager của **cả hai** lớp | `{ toClassId }` |

`settings` của lớp (`classSettingsSchema`, mặc định khi tạo lớp):

| Trường | Mặc định | Ý nghĩa |
|---|---|---|
| `allowAnonymous` | `true` | SV được gửi bài ẩn danh |
| `revealAnonymousToStaff` | `false` | Moderator được xem danh tính bài ẩn danh (mỗi lần xem ghi audit) |
| `editWindowMinutes` | `15` | Thời gian SV được sửa/xóa bài (0–1440) |
| `aiEnabled` | `true` | Bật AI cho lớp |
| `aiMode` | `assistant` | `assistant` (GV duyệt) hoặc `student_support` (SV tự hỏi AI) |
| `aiDailyQuota` | `200` | Lượt AI/ngày của cả lớp |
| `aiStudentDailyQuota` | `5` | Lượt AI/ngày mỗi SV (chế độ `student_support`) |
| `aiProvider` | `null` | Nhà cung cấp ưu tiên của lớp (`openai\|anthropic\|gemini`) |

## 7. Enrollment requests (xin vào lớp)

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| POST | `/enrollment-requests` | Đăng nhập | `{ classId? \| classCode?, message? (≤500) }` → `{ classId, className, status: "pending" }`. Gửi thông báo cho giảng viên. Đã ở trong lớp → 409 |
| GET | `/classes/:classId/enrollment-requests` | Moderator | → `{ items }` (đang chờ) |
| POST | `/classes/:classId/enrollment-requests/:uid/decide` | Manager | `{ approve: boolean }` → `{ ok }`. Duyệt → thêm vào lớp + thông báo SV |

## 8. Sessions (buổi học)

Trạng thái: `draft` → `open` ⇄ `paused` → `closed` → `archived` (`closed` có thể mở lại).

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| GET | `/me/live-sessions` | Đăng nhập | Buổi `open`/`paused` trong các lớp `active` của tôi → `{ items: [{ session, class }] }` |
| GET | `/classes/:classId/sessions` | Xem lớp | → `{ items }` kèm `stats`. SV không thấy buổi `archived`; `joinCode` chỉ trả cho SV khi buổi đang `open` |
| POST | `/classes/:classId/sessions` | Manager | `createSessionSchema`: `title`, `description?`, `topics[]` (≤30), `date` (YYYY-MM-DD), `plannedStart`/`plannedEnd` (HH:mm), `sessionNumber?` → `{ sessionId }` |
| GET | `/classes/:classId/sessions/:sessionId` | Xem lớp | → `{ session, class, stats, joined, access }` |
| PATCH | `/classes/:classId/sessions/:sessionId` | Manager | Một phần `createSessionSchema` |
| DELETE | `/classes/:classId/sessions/:sessionId` | Manager | Chỉ buổi `draft` chưa từng bắt đầu |
| POST | `.../:sessionId/start` | Manager, lớp `active` | Mở/tiếp tục/mở lại. Cấp mã tham gia (6 ký tự, hiệu lực 12 giờ) nếu chưa có; lần đầu: tính 1 “buổi đã diễn ra” và thông báo SV |
| POST | `.../:sessionId/pause` | Manager | Chỉ khi `open` |
| POST | `.../:sessionId/end` | Manager | `{ lateReplyMinutes: 0–20160 }`. Đóng mọi hoạt động đang mở |
| POST | `.../:sessionId/archive` | Manager | Chỉ khi không `open/paused` |
| POST | `.../:sessionId/join-code/rotate` | Manager | → `{ joinCode }` (mã cũ hết hiệu lực ngay) |
| POST | `.../:sessionId/join` | Xem lớp, lớp ghi được | Ghi nhận điểm danh (idempotent) |
| POST | `/sessions/join-by-code` | Đăng nhập | `{ code }` (4–10 ký tự A–Z0–9) → `{ classId, sessionId }`. Lỗi: `NOT_FOUND`, `CODE_EXPIRED`, `NOT_MEMBER` |

Ma trận chấp nhận tương tác (`assertSessionAccepts`):

| Trạng thái | Vào buổi | Bài gốc | Phản hồi / reaction | Nộp hoạt động |
|---|---|---|---|---|
| `open` | ✓ | ✓ | ✓ | ✓ |
| `paused` | ✓ | `SESSION_PAUSED` | `SESSION_PAUSED` | `SESSION_PAUSED` |
| `closed`, còn hạn trả lời bổ sung | ✓ | `SESSION_CLOSED` | ✓ | `SESSION_CLOSED` |
| `closed`, hết hạn | `SESSION_CLOSED` | `SESSION_CLOSED` | `SESSION_CLOSED` | `SESSION_CLOSED` |
| `draft`, `archived` | `SESSION_NOT_OPEN` | … | … | … |

## 9. Posts (hỏi đáp)

Loại bài gốc: `question`, `reflection` (Nhận xét), `discussion`; phản hồi: `answer`, `comment`. Trạng thái câu hỏi: `new`, `answered`, `need_clarification`, `resolved`, `archived`.

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| POST | `/classes/:classId/sessions/:sessionId/posts` | Xem lớp, lớp ghi được | `createPostSchema`: `type`, `content` (≤5000), `topics[]` (≤5), `isAnonymous`, `clientRequestId` → `{ postId, duplicate }`. Ẩn danh chỉ cho SV khi lớp cho phép |
| POST | `.../posts/:postId/replies` | Xem lớp, lớp ghi được | `createReplySchema`: `type` (`answer`\|`comment`), `content`, `isAnonymous`, `clientRequestId` → `{ postId, duplicate }`. Câu trả lời của GV/TA/admin chuyển câu hỏi đang mở sang `answered`; gửi thông báo cho tác giả bài gốc |
| PATCH | `.../posts/:postId` | Tác giả trong `editWindowMinutes`; Moderator bất kỳ lúc nào | `editPostSchema`: `content?`, `topics?` (chỉ bài gốc) |
| DELETE | `.../posts/:postId` | Tác giả trong thời gian cho phép | Xóa mềm (ẩn), trừ khỏi thống kê |
| PATCH | `.../posts/:postId/moderation` | Moderator | `moderatePostSchema`: `moderationStatus` (`visible\|hidden`), `isPinned`, `isAccepted` (chỉ với `answer`), `status` (chỉ với `question`), `topics` → `{ ok }`. Ghi audit `post.moderate` |
| POST | `.../posts/:postId/reactions` | Xem lớp, lớp ghi được | `{ reaction?: agree\|disagree\|helpful\|same_question\|need_explanation\|understood\|null, upvoted?: boolean }` (cần ít nhất một trường; `upvoted` chỉ cho câu hỏi) → `{ reaction, upvoted }`. Mỗi người một reaction/bài |
| GET | `.../posts/:postId/author` | Moderator; bài ẩn danh chỉ khi lớp bật `revealAnonymousToStaff` và bài có `identityRevealable` (gửi trong lúc chính sách bật) | → `{ uid, displayName, studentId }`. Mỗi lần xem bài ẩn danh ghi audit `post.reveal_author` |
| GET | `/classes/:classId/questions` | Moderator | Query `status` (`open`\|`all`), `sessionId?` → `{ items }` (bình chọn cao trước) |

Danh tính tác giả lưu tách ở `posts/{id}/postAuthor/author` (client không đọc được); với bài ẩn danh, `authorId = null`, `authorName = "Ẩn danh"`.

## 10. Activities (hoạt động)

Loại: `poll`, `quiz`, `understanding` (3 phương án cố định: Đã hiểu / Hiểu một phần / Chưa hiểu), `free_text`. Trạng thái: `draft`, `open`, `closed`.

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| POST | `/classes/:classId/sessions/:sessionId/activities` | Moderator | `createActivitySchema`: `type`, `title`, `prompt?`, `options[]` (2–10 với poll/quiz), `correctOptionIndexes[]` (bắt buộc với quiz, đánh số từ 0), `allowMultiple`, `showResults`, `openNow` → `{ activityId }`. Đáp án quiz lưu ở tài liệu riêng SV không đọc được |
| POST | `.../activities/:activityId/open` | Moderator, buổi `open`/`paused` | Lần mở đầu tiên tính 1 “hoạt động đã mở”; thông báo SV đã vào buổi |
| POST | `.../activities/:activityId/close` | Moderator | Chỉ khi `open` |
| PATCH | `.../activities/:activityId` | Moderator | `{ showResults?, revealAnswer? }` (`revealAnswer` chỉ với quiz) |
| DELETE | `.../activities/:activityId` | Moderator | Chỉ khi chưa từng mở và chưa có bài nộp |
| POST | `.../activities/:activityId/submissions` | Chỉ tài khoản `student`, lớp ghi được | `submitActivitySchema`: `optionIds[]` (ví dụ `"o1"`, `"understood"`), `text` (≤3000, free_text), `clientRequestId` → `{ ok, changed }`. Gửi lại khi hoạt động còn mở = đổi câu trả lời |
| POST | `.../submissions/:uid/feature` | Moderator | `{ featured: boolean }` – câu trả lời tiêu biểu cho màn hình trình chiếu |
| GET | `.../activities/:activityId/results` | Moderator | → `{ activity, results, correctOptionIds, submissions[] (kèm isCorrect) }` |

## 11. Analytics

| Method | Path | Quyền | Kết quả |
|---|---|---|---|
| GET | `/classes/:classId/analytics/overview` | Moderator | `{ class, stats, totals: { students, interacted, notInteracted, interactionRate, completionRate }, sessions[], distribution[], topics[] (top 15) }` |
| GET | `/classes/:classId/analytics/students` | Moderator | `{ rows[], sessions[], heatmap: { uid: { sessionId: n } }, joined, opportunities: { sessionsHeld, activitiesOpened } }` |
| GET | `/classes/:classId/analytics/students/:uid` | Chính SV đó hoặc Moderator | `{ member, metrics, derived, sessions[], topics[], posts[] }` |
| GET | `/classes/:classId/analytics/topics` | Moderator | Query `topic?`, `sessionId?` → `{ topics }` hoặc thêm `threads` của chủ đề (`"Chưa phân loại"` = bài không gắn chủ đề) |
| GET | `/classes/:classId/sessions/:sessionId/analytics` | Moderator | `{ session, stats, attendance[], activities[], openQuestions[] }` |
| GET | `/me/participation` | Đăng nhập | Mỗi lớp của tôi: `{ class, metrics, derived, opportunities }` |
| GET | `/teach/overview` | Đăng nhập (dùng cho staff) | Các lớp tôi phụ trách: `{ class, stats, liveSessions, pendingRequests }` |

Chỉ số dẫn xuất (`packages/shared/src/metrics.ts`): `attendanceRate = sessionsJoined / sessionsHeld`, `activityCompletionRate = activitiesCompleted / activitiesOpened`, `quizAccuracy = quizCorrect / quizzesAnswered`, `consistency = sessionsInteracted / sessionsHeld`; mẫu số bằng 0 → `null`.

## 12. Export

| Method | Path | Quyền | Query / kết quả |
|---|---|---|---|
| GET | `/classes/:classId/export` | Moderator | `format`: `xlsx` (mặc định, mọi bảng trong một file) \| `csv` (một bảng, UTF-8 có BOM) \| `json` (mọi bảng); `dataset` (cho CSV): `students`, `sessions`, `questions`, `answers`, `topics`, `activities`, `submissions`. Ghi audit `class.export` |

Ô bắt đầu bằng `= + - @` được thêm dấu `'` để chống chèn công thức. Bài ẩn danh xuất là “Ẩn danh”, trừ khi lớp bật `revealAnonymousToStaff` và bài có `identityRevealable`.

## 13. AI

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| POST | `/ai/answer` | Moderator; hoặc SV là tác giả câu hỏi khi lớp ở chế độ `student_support` | `aiAnswerSchema`: `classId`, `sessionId`, `postId`, `provider?` (chỉ Moderator) → `{ runId, provider, model, output: { shortAnswer, explanation, example, relatedConcepts }, content, publishedPostId }`. Với SV, câu trả lời được đăng ngay (`publishedPostId`) |
| POST | `/ai/runs/:runId/publish` | Moderator | `{ content }` (đã chỉnh sửa) → `{ postId }`. Đăng câu trả lời gắn nhãn AI, đánh dấu câu hỏi `answered`, thông báo tác giả |
| POST | `/ai/runs/:runId/reject` | Moderator | Bỏ bản nháp |
| GET | `/ai/runs` | Moderator | Query `classId`, `postId?` → `{ items }` |
| GET | `/ai/status` | Đăng nhập | `{ enabled, defaultProvider, providers: [{ provider, configured, enabled, model }] }` |
| GET | `/admin/settings/ai` | Admin | `{ settings, providers: [{ provider, configured, fake }] }` |
| PUT | `/admin/settings/ai` | Admin | `aiSettingsSchema`: `enabled`, `defaultProvider`, `fallbackOrder[]`, `providers.{openai,anthropic,gemini}.{enabled, model, inputCostPerMTok, outputCostPerMTok}`, `maxOutputTokens` (100–8000), `timeoutMs` (5000–120000), `monthlyCostLimitUsd` |

Thứ tự thử nhà cung cấp: `provider` được chọn → `aiProvider` của lớp → `defaultProvider` → `fallbackOrder` → còn lại; chỉ giữ nhà cung cấp đang bật và có API key. Kiểm tra hạn mức trước khi gọi: chi phí tháng → lượt/ngày của lớp → lượt/ngày của SV.

## 14. Notifications

| Method | Path | Quyền | Body / kết quả |
|---|---|---|---|
| POST | `/notifications/read` | Đăng nhập | `{ ids?: string[] }` (≤200). Bỏ trống → đánh dấu mọi thông báo chưa đọc → `{ updated }` |

Danh sách thông báo được đọc trực tiếp từ Firestore `users/{uid}/notifications`. Loại: `session_opened`, `activity_opened`, `question_answered`, `lecturer_reply`, `enrollment_request`, `enrollment_approved`, `ai_answer`.

## 15. Admin

| Method | Path | Quyền | Kết quả |
|---|---|---|---|
| GET | `/admin/overview` | Admin | `{ users: { student, lecturer, admin, superadmin }, disabledUsers, classes, activeClasses, liveSessions, unregisteredStudents, aiThisMonth: { costUsd, runs } }` |
| GET | `/admin/audit-logs` | Admin | Query `action?`, `actorId?`, `targetId?`, `limit` (≤200), `cursor?` → `{ items, nextCursor }` |
| GET | `/admin/ai-usage` | Admin | `{ months[] (12 tháng gần nhất), recentRuns[] (50 lượt) }` |

## 16. Ví dụ nhanh

```bash
# 1. Đăng nhập (nhận custom token), đổi sang ID token bằng Firebase Auth SDK
curl -s -X POST https://HOST/api/v1/auth/login \
  -H 'content-type: application/json' -d '{"loginId":"2251010001","password":"..."}'

# 2. Tham gia buổi học bằng mã
curl -s -X POST https://HOST/api/v1/sessions/join-by-code \
  -H "authorization: Bearer $ID_TOKEN" -H 'content-type: application/json' -d '{"code":"K7M2QX"}'

# 3. Đặt câu hỏi (giữ nguyên clientRequestId khi thử lại)
curl -s -X POST https://HOST/api/v1/classes/$CLASS/sessions/$SESSION/posts \
  -H "authorization: Bearer $ID_TOKEN" -H 'content-type: application/json' \
  -d '{"type":"question","content":"Khác nhau giữa B2B và B2C?","topics":[],"isAnonymous":false,"clientRequestId":"q_3f9c2a71"}'
```

## Phase 2 – AI, chủ đề, điểm tham gia

Mọi endpoint dưới đây yêu cầu đăng nhập. "Moderator" = giảng viên phụ trách, quản trị viên hoặc trợ giảng của lớp; "Manager" = giảng viên phụ trách hoặc quản trị viên.

### Ngôn ngữ và tài khoản

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| PATCH | `/auth/me` | Người dùng | `{ language: "vi" \| "en" }` – ngôn ngữ giao diện |
| (header) | `x-lang: vi \| en` | – | Ngôn ngữ của thông báo lỗi, xuất Excel/CSV; mặc định theo hồ sơ |

### API key AI (quản trị cấp cao)

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/admin/settings/ai` | Admin | Thêm `keys[]`: `{ provider, configured, source: store\|env\|none, last4, updatedAt }` – không bao giờ trả key |
| PUT | `/admin/settings/ai/keys/:provider` | Superadmin | `{ apiKey }` (`""` = xóa). Ghi phiên bản mới vào Secret Manager |
| POST | `/admin/settings/ai/keys/:provider/test` | Admin | Gọi thử mô hình đã cấu hình → `{ ok, model, latencyMs, error? }` |

`PUT /admin/settings/ai` nhận thêm `taskModels` (`{ [answer\|classify\|cluster\|summarize\|insights\|activity_summary]: { provider\|null, model\|null } }`) và `embedding` (`{ provider: openai\|gemini\|null, model, threshold }`).

### Tác vụ AI chạy nền

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| POST | `/classes/:classId/ai-jobs` | Moderator | `{ type, sessionId?, activityId?, force? }`; `type` = `classify_topics` \| `cluster_questions` \| `summarize_session` \| `summarize_activity` \| `teaching_insights` → `AiJobDoc`. Một tác vụ cùng loại/đối tượng đang chạy thì trả lại tác vụ đó |
| GET | `/classes/:classId/ai-jobs` | Moderator | 30 tác vụ gần nhất (cũng đọc realtime ở `classes/{id}/aiJobs`) |
| POST | `/internal/jobs/:classId/:jobId` | Cloud Tasks (OIDC) | Nội bộ, không qua Hosting |

### Chủ đề

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/classes/:classId/topics` | Thành viên (moderator thấy thống kê) | Danh mục + số câu hỏi/trả lời/SV/buổi + `pendingAi` |
| POST | `/classes/:classId/topics` | Moderator | `{ name, description }` |
| PATCH | `/classes/:classId/topics/:name` | Moderator | `{ name?, description? }` – đổi tên cập nhật mọi bài đăng |
| DELETE | `/classes/:classId/topics/:name` | Moderator | Gỡ chủ đề khỏi bài đăng và danh mục |
| POST | `/classes/:classId/topics/merge` | Moderator | `{ from: string[], into }` |
| POST | `/classes/:classId/topics/move` | Moderator | `{ posts: PostRef[], remove?, add: string[] }` – chuyển/tách chủ đề |
| GET | `/classes/:classId/topic-reviews` | Moderator | Bài có đề xuất AI chờ duyệt |
| POST | `/classes/:classId/topic-reviews` | Moderator | `{ items: [{ sessionId, postId, action: accept\|edit\|reject, topics? }] }` |

### Nhóm câu hỏi

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/classes/:classId/clusters?scope=class\|session&sessionId=` | Moderator | `{ clusters, posts }` |
| PATCH | `/classes/:classId/clusters/:id` | Moderator | `{ name?, description?, status? }` (đánh dấu đã chỉnh sửa) |
| DELETE | `/classes/:classId/clusters/:id` | Moderator | Giải tán nhóm |
| POST | `/classes/:classId/clusters/merge` | Moderator | `{ ids, name? }` |
| POST | `/classes/:classId/clusters/move` | Moderator | `{ item: PostRef, toClusterId \| null }` |
| POST | `/classes/:classId/similar-questions` | Thành viên | `{ text, sessionId? }` → `{ method: embedding\|none, items[] }` |

### Tóm tắt buổi học, phiếu cuối buổi, gợi ý giảng dạy

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/classes/:c/sessions/:s/summary` | Moderator; SV khi đã công bố | `{ summary \| null }` |
| PUT | `/classes/:c/sessions/:s/summary` | Moderator | `{ sections?, status?: draft\|approved, published? }`; công bố cần duyệt trước |
| GET | `/classes/:c/sessions/:s/activities/:a/ai-summary` | Moderator | Tổng hợp AI của câu trả lời tự do / phiếu cuối buổi |
| GET | `/classes/:c/insights` | Moderator | Gợi ý giảng dạy mới nhất |

Hoạt động mới `type: "exit_ticket"`: bài nộp gửi `answers: [string, string, string]` (ít nhất một câu có nội dung).

### Điểm tham gia

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/classes/:c/scores` | Moderator | `{ config, rows[{ uid, studentId, displayName, components, raw, adjustment, score }], sessionsHeld, lastSnapshot }` |
| GET | `/classes/:c/scores/me` | SV (khi lớp bật `showScoreToStudents`) | Điểm tham khảo của chính mình |
| PUT | `/classes/:c/score-config` | Manager | `{ weights (tổng 100), caps, basis: held\|attended }` → phiên bản mới |
| PUT | `/classes/:c/score-adjustments/:uid` | Manager | `{ delta: -100..100, note }` |
| POST | `/classes/:c/scores/confirm` | Manager | Lưu bản xác nhận (snapshot) |
| GET | `/classes/:c/scores/snapshots` | Moderator | Lịch sử xác nhận |

Xuất dữ liệu có thêm `dataset=scores` (Engagement Scores) và `dataset=clusters` (Question Clusters); file XLSX gồm cả hai bảng.
