# Kiến trúc và cơ sở dữ liệu

## 1. Tổng quan

| Tầng | Công nghệ | Thư mục |
|---|---|---|
| Web / PWA | React 19, Vite 7, TypeScript, Tailwind CSS 4, Radix UI (phong cách shadcn/ui), React Router 7, TanStack Query, React Hook Form + Zod, Recharts, vite-plugin-pwa | `apps/web` |
| API | Node.js 22, Fastify 5, TypeScript, Firebase Admin SDK, Zod | `apps/api` |
| Dùng chung | Kiểu dữ liệu, schema Zod, bảng quyền, nhãn tiếng Việt, công thức thống kê | `packages/shared` |
| Dữ liệu | Cloud Firestore (Native), Firebase Authentication (Custom Token) | `firebase/` |
| Hạ tầng | Cloud Run, Firebase Hosting, Secret Manager, Artifact Registry | `infrastructure/` |
| Kiểm thử | Vitest, Firebase Emulator Suite, `@firebase/rules-unit-testing`, Playwright | `apps/*/src/**/*.test.ts`, `tests/` |

Nguyên tắc:

- **Client chỉ đọc, server ghi.** Trình duyệt mở realtime listener trên dữ liệu được phép đọc (Security Rules). Mọi thao tác ghi đi qua REST API, nơi kiểm tra quyền, validate dữ liệu, chống ghi trùng và cập nhật bộ đếm trong cùng transaction.
- **Phân quyền ở backend** (`apps/api/src/lib/access.ts`, `packages/shared/src/permissions.ts`): RBAC theo vai trò + quan hệ thực tế với lớp (giảng viên phụ trách, thành viên, trợ giảng).
- **Thống kê tăng dần.** Không quét lịch sử khi hiển thị dashboard: các document `stats/summary`, `studentMetrics`, `studentSessionMetrics` được cập nhật ngay khi có tương tác.
- **AI tách khỏi nghiệp vụ.** Lớp adapter chung cho Claude / OpenAI / Gemini; lỗi AI không ảnh hưởng lớp học.

## 2. Các module API

`apps/api/src/modules/`:

| Module | Nội dung |
|---|---|
| `setup` | Khởi tạo quản trị viên đầu tiên (một lần, cần `SETUP_TOKEN`) |
| `auth` | Đăng ký SV (chỉ mã có trong danh sách), đăng nhập (mã SV hoặc email), đổi mật khẩu |
| `users` | Quản lý tài khoản, khóa/mở, vai trò, đặt lại mật khẩu |
| `courses`, `classes` | Học phần, lớp, danh sách lớp, ghi danh, yêu cầu tham gia, chuyển lớp, trợ giảng |
| `sessions` | Buổi học: tạo, bắt đầu/tạm dừng/kết thúc/lưu trữ, mã tham gia + QR, ghi nhận tham gia |
| `posts` | Câu hỏi, trả lời, bình luận, phản hồi nhanh, bình chọn, kiểm duyệt, ẩn danh |
| `activities` | Trả lời tự do, khảo sát, trắc nghiệm nhanh, kiểm tra mức độ hiểu |
| `analytics` | Tổng quan lớp, bảng sinh viên, heatmap, hồ sơ cá nhân, chủ đề, buổi học |
| `exports` | XLSX (7 bảng), CSV UTF-8, JSON |
| `ai/*` | Adapter nhà cung cấp, cấu hình, quota, lịch sử, quy trình duyệt |
| `notifications`, `admin` | Thông báo trong ứng dụng; tổng quan quản trị, nhật ký, sử dụng AI |

## 3. Xác thực

1. `POST /auth/register` – kiểm tra mã SV trong `studentDirectory` (do giảng viên/admin import) và chưa được đăng ký; băm mật khẩu Argon2id (19 MiB, t=2); tạo user Firebase Auth với uid ngẫu nhiên, hồ sơ `users/{uid}`, `credentials/{uid}`, chỉ mục `userLogins`, và tự thêm vào các lớp có trong danh sách. Trả về Custom Token.
2. `POST /auth/login` – tra `userLogins` (mã SV hoặc email), so mật khẩu (thời gian tương đương khi tài khoản không tồn tại), khóa tạm 5 phút sau 5 lần sai, kiểm tra trạng thái, trả về Custom Token.
3. Trình duyệt `signInWithCustomToken` → ID token gửi kèm mỗi request (`Authorization: Bearer`).
4. Mỗi request: `verifyIdToken(token, checkRevoked=true)` + đọc hồ sơ, từ chối nếu tài khoản bị khóa.
5. Khóa tài khoản: `status=disabled`, Firebase Auth `disabled`, `revokeRefreshTokens`. Security Rules kiểm tra `status=='active'`, nên listener đang mở cũng bị chặn ngay.

`studentId` không bao giờ dùng làm khóa quan hệ – mọi quan hệ dùng `uid`.

## 4. Mô hình dữ liệu Firestore

Mọi document nghiệp vụ có `tenantId` (mặc định `default`) và `schemaVersion`. Thời gian dùng server timestamp.

```
tenants (dự phòng đa đơn vị)
users/{uid}                         hồ sơ: role, status, studentId, email, displayName, searchName
  notifications/{id}                thông báo của người dùng
credentials/{uid}                   passwordHash, failedCount, lockedUntil      (chỉ server)
userLogins/{tenant__sid|email__x}   ánh xạ mã SV/email → uid, đảm bảo duy nhất   (chỉ server)
studentDirectory/{tenant__studentId} danh sách SV được import: fullName, classIds[], uid|null (chỉ server)
courses/{courseId}                  học phần
classes/{classId}                   lớp học phần: lecturerIds[], settings, studentCount, sessionCount
  members/{uid}                     ghi danh: role student|ta, status active|removed
  enrollmentRequests/{uid}          yêu cầu tham gia lớp
  stats/summary                     bộ đếm cấp lớp
  studentMetrics/{uid}              chỉ số SV theo lớp
  studentSessionMetrics/{sessionId_uid}  chỉ số SV theo buổi (heatmap)
  sessions/{sessionId}              buổi học: status, joinCode, topics, lateRepliesUntil
    stats/summary                   bộ đếm cấp buổi
    attendance/{uid}                ghi nhận tham gia
    posts/{postId}                  câu hỏi/trả lời/bình luận/nhận xét/thảo luận
      postAuthor/author             danh tính thật của tác giả (chỉ server – phục vụ ẩn danh)
      reactions/{uid}               phản hồi nhanh + bình chọn của từng người
    activities/{activityId}         hoạt động
      private/key                   đáp án đúng của quiz (chỉ server)
      results/summary               kết quả tổng hợp
      submissions/{uid}             bài nộp của SV
      grading/{uid}                 đúng/sai (chỉ server)
joinCodes/{code}                    mã tham gia → lớp/buổi, hạn dùng (chỉ server)
aiRuns/{runId}                      lịch sử AI: provider, model, nguồn, token, chi phí, trạng thái duyệt
aiUsage/{key}                       quota theo lớp/ngày, theo SV/ngày, chi phí theo tháng
auditLogs/{id}                      nhật ký thao tác quản trị và bảo mật
systemSettings/ai                   cấu hình AI
```

Lý do lồng dữ liệu theo lớp/buổi: Security Rules chỉ cần kiểm tra quan hệ người dùng–lớp ở một chỗ, truy vấn realtime luôn nằm trong phạm vi một buổi học, và không document nào chứa toàn bộ tương tác của lớp. Truy vấn xuyên buổi (hàng đợi câu hỏi, chủ đề, xuất dữ liệu) dùng collection group có index riêng.

### Trường chính

- **PostDoc**: `type` (question/answer/comment/reflection/discussion), `isRoot`, `rootPostId`, `content`, `topics[]`, `authorId` (null nếu ẩn danh), `authorName`, `authorRole` (student/ta/lecturer/admin/ai), `isAnonymous`, `isAiGenerated`, `aiRunId`, `approvedBy`, `status` (new/answered/need_clarification/resolved/archived), `moderationStatus` (visible/hidden), `isPinned`, `isAccepted`, `replyCount`, `voteCount`, `reactionCounts`.
- **ActivityDoc**: `type` (free_text/poll/quiz/understanding), `options[]`, `allowMultiple`, `status` (draft/open/closed), `showResults`, `revealedCorrectOptionIds`, `openedAt`.
- **StudentClassMetricsDoc**: `sessionsJoined`, `sessionsInteracted`, `questions`, `answers`, `comments`, `reflections`, `reactions`, `activitiesCompleted`, `pollsAnswered`, `quizzesAnswered`, `quizCorrect`, `acceptedAnswers`, `openQuestions`, `lastActiveAt`.

Định nghĩa đầy đủ: `packages/shared/src/types.ts`.

## 5. Tính nhất quán và chống ghi trùng

- Tạo bài đăng: ID document = `sha256(uid, sessionId|postId, clientRequestId)`. Client giữ nguyên `clientRequestId` khi thử lại sau lỗi mạng, nên gửi lại không tạo bài thứ hai và không cộng đếm hai lần.
- Bài nộp hoạt động: một document mỗi SV (`submissions/{uid}`); đổi đáp án chỉ điều chỉnh chênh lệch.
- Phản hồi nhanh: một document mỗi người mỗi bài; đổi lựa chọn trừ cái cũ, cộng cái mới.
- Mọi bộ đếm được cập nhật trong cùng Firestore transaction với thao tác gốc (`apps/api/src/lib/counters.ts`).
- Ẩn/hiện bài đảo ngược đúng các bộ đếm liên quan (bài bị ẩn/spam không được tính).

## 6. Chỉ số tham gia (Phase 1)

`packages/shared/src/metrics.ts`, `apps/api/src/lib/classData.ts`:

| Chỉ số | Công thức |
|---|---|
| Tỷ lệ tham dự | buổi đã tham gia / **buổi đã thực sự diễn ra** |
| Tỷ lệ hoàn thành hoạt động | hoạt động đã làm / **hoạt động giảng viên đã mở** |
| Độ chính xác quiz | số quiz đúng / số quiz đã làm |
| Mức độ đều đặn | số buổi có ít nhất một tương tác / buổi đã diễn ra |
| Tỷ lệ hoàn thành của lớp | tổng bài nộp / Σ(hoạt động mở × SV có mặt) theo từng buổi |

Buổi không có hoạt động không làm giảm chỉ số. Chỉ số đếm (số lượng) tách biệt với chất lượng. Engagement Score có trọng số thuộc Phase 2.

## 7. Realtime

- Bảng tin: `posts where isRoot==true [and moderationStatus=='visible'] orderBy createdAt desc limit N` – tải thêm theo trang.
- Chuỗi trả lời: `posts where rootPostId==X orderBy createdAt`.
- Hoạt động, kết quả, thống kê buổi: listener trên từng document tổng hợp.
- Listener hủy khi rời màn hình (`apps/web/src/lib/firestore.ts`).

## 8. Lớp AI

```
runAnswer() ─► thứ tự provider: chọn tay → mặc định của lớp → mặc định hệ thống → fallback
              (chỉ provider đang bật và có API key)
          ─► reserveQuota() (transaction): hạn mức lớp/ngày, SV/ngày, chi phí/tháng
          ─► AiAdapter.generateStructured()  ← anthropic | openai | gemini | fake
          ─► aiRuns: provider, model, sourceRefs, token, chi phí ước tính, approvalStatus
          ─► Chế độ Assistant: bản nháp → giảng viên sửa → publishAiReply() (nhãn AI Generated)
             Chế độ Student Support: công bố ngay, có nhãn, không thay câu trả lời chính thức
```

- Claude: Messages API (`output_config.format` JSON schema, effort `medium`, server-side fallback khi mô hình từ chối).
- OpenAI: Responses API (`text.format` JSON schema strict).
- Gemini: `@google/genai` `generateContent` với `responseJsonSchema`.
- Model ID nằm trong `systemSettings/ai`, sửa được trên giao diện.
- Prompt: nội dung SV đặt trong thẻ `<student_question>`/`<course_context>`, được loại bỏ thẻ giả mạo, và chỉ dẫn hệ thống coi đó là dữ liệu (chống prompt injection). Không gửi tên/mã SV.
- Timeout, retry tối đa 1 lần ở SDK, fallback sang provider khác; lỗi trả về `AI_PROVIDER_ERROR` mà không ảnh hưởng tương tác lớp học (đã kiểm thử).

## 9. Bảo mật – đối chiếu yêu cầu

| Yêu cầu | Cách đáp ứng |
|---|---|
| HTTPS | Firebase Hosting + Cloud Run (HSTS) |
| Deny by default | `firebase/firestore.rules` – mọi ghi từ client bị từ chối |
| SV không đọc lớp khác / không sửa số liệu / không đổi vai trò | Rules + API, có test (`tests/rules`, `api.int.test.ts`) |
| Mật khẩu | Argon2id, chỉ ở backend, `credentials` không client nào đọc được, không ghi log (log redact header) |
| Chống dò mật khẩu | Khóa tài khoản 5 phút sau 5 lần sai; giới hạn tần suất theo IP cho đăng nhập, theo người dùng cho API |
| Thu hồi phiên khi khóa tài khoản | `revokeRefreshTokens` + `checkRevoked` + Rules kiểm tra trạng thái |
| XSS / injection | React escape nội dung; nội dung lưu dạng văn bản; validate Zod; chống CSV/Excel formula injection khi xuất |
| Bí mật | Secret Manager; không có khóa trong repo hay frontend |
| Audit log | `auditLogs` cho thao tác quản trị, bảo mật, xuất dữ liệu, xem danh tính ẩn danh, AI |
| Tệp đính kèm | Chưa bật ở Phase 1; `storage.rules` từ chối mọi truy cập |
| App Check | Chưa bật (cần đăng ký reCAPTCHA Enterprise cho domain). Có thể bổ sung sau khi có domain chính thức. |

## 10. Phạm vi Phase 1 và việc để Phase 2/3

Đã có trong Phase 1: toàn bộ mục 53 của đặc tả, cộng thêm quiz nhanh, kiểm tra mức độ hiểu một chạm, phiếu cuối buổi (mẫu trả lời tự do), heatmap, Presenter Mode, hỏi ẩn danh, bình chọn câu hỏi, hàng đợi câu hỏi chưa giải đáp, gợi ý câu hỏi tương tự (theo từ khóa), in/lưu PDF báo cáo lớp.

Để lại: phân loại chủ đề và gom nhóm câu hỏi bằng AI (embeddings), tóm tắt buổi học bằng AI, Engagement Score có trọng số, thảo luận nhóm, đính kèm tệp, Knowledge Base/RAG, Moodle/LTI, thông báo đẩy (web push), App Check.
