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

## 10. Phase 2 – Phân tích lớp học thông minh

### Tác vụ AI chạy nền
- Tác vụ dài (phân loại chủ đề, gom nhóm câu hỏi, tóm tắt buổi học, tổng hợp phiếu cuối buổi, gợi ý giảng dạy) chạy ngoài request vì Firebase Hosting giới hạn 60 giây.
- Production: **Cloud Tasks** (hàng đợi `classinteract-ai`, tối đa 3 lần thử) gọi thẳng Cloud Run `POST /internal/jobs/:classId/:jobId` kèm OIDC token của service account; API xác minh token (`lib/jobs.ts`). Local/emulator: chạy ngay trong tiến trình.
- Trạng thái lưu ở `classes/{classId}/aiJobs/{jobId}` (queued → running → completed/failed, tiến độ), giảng viên theo dõi realtime.
- Mọi lời gọi AI đi qua `executeStructured()` (`modules/ai/executor.ts`): thứ tự nhà cung cấp, model theo tác vụ (`taskModels`), quota lớp/ngày, hạn mức chi phí tháng, hoàn quota khi lỗi, ghi `aiRuns` (nguồn dữ liệu, model, token, chi phí).
- Khi giảng viên kết thúc buổi học (và lớp bật `autoAiOnSessionEnd`), hệ thống tự xếp 3 tác vụ: phân loại chủ đề, gom nhóm câu hỏi, tóm tắt buổi.

### Chủ đề kiến thức
- Danh mục: `classes/{classId}/topics/{topicId}` (tên, mô tả, nguồn lecturer/ai/session). Bài đăng vẫn lưu tên chủ đề trong `topics[]`.
- Đổi tên/gộp/xóa/chuyển bài cập nhật mọi bài đăng (kể cả câu trả lời kế thừa chủ đề của chuỗi) và chủ đề của buổi học.
- AI phân loại ghi `aiTopics` + `topicReview = pending`; giảng viên chấp nhận/sửa/bỏ qua. `aiTopics` được giữ để so sánh với nhãn cuối cùng (`topics`).

### Gom nhóm câu hỏi
- Có API key OpenAI/Gemini: embedding (`text-embedding-3-small` / `gemini-embedding-001`, cấu hình được) lưu ở `postEmbeddings/` (chỉ server), gom theo ngưỡng cosine, AI đặt tên nhóm.
- Chỉ có Claude: mô hình ngôn ngữ đọc danh sách câu hỏi và tự xếp nhóm.
- `classes/{classId}/clusters/{id}`: phạm vi (buổi/lớp), câu hỏi, số SV, số buổi, bình chọn, mức quan tâm, còn mở/đã giải đáp. Nhóm giảng viên đã sửa (`locked`) được giữ khi chạy lại.
- Gợi ý câu hỏi tương tự khi soạn: `POST /classes/:id/similar-questions` (embedding); không có embedding thì dùng so khớp từ khóa trên trình duyệt.

### Tóm tắt buổi học và phiếu cuối buổi
- `sessions/{s}/summary/current`: 8 mục theo đặc tả (mục 19), mỗi nhận định có `refs` là id bài đăng gốc (id không có thật bị loại). Trạng thái draft → approved; `published` mới hiện cho sinh viên (Security Rules kiểm tra). Sửa nội dung đưa bản tóm tắt về draft và gỡ công bố.
- Hoạt động `exit_ticket`: 3 câu hỏi chuẩn, một bài nộp; tính riêng `exitTicketCount` (cơ hội) và `exitTickets` (đã nộp). AI tổng hợp câu trả lời hoạt động tự do/phiếu cuối buổi vào `activities/{a}/staff/aiSummary`.

### Gợi ý giảng dạy
- `classes/{classId}/insights/latest` (+ lịch sử): nhận định theo nhóm (chủ đề nhiều câu hỏi, khái niệm dễ nhầm, câu hỏi chưa trả lời, cần giảng giải, mức độ tham gia tổng hợp, gợi ý), mỗi nhận định có căn cứ số liệu và liên kết bài gốc; kèm câu hỏi tiếp nối. Prompt cấm suy diễn năng lực/động cơ/tâm lý và không chứa tên/mã SV.

### Điểm tham gia (Engagement Score)
`packages/shared/src/score.ts` – hàm thuần, có unit test:

| Thành phần (mặc định) | Đã làm / cơ hội |
|---|---|
| Hoàn thành hoạt động 30% | hoạt động đã làm (trừ phiếu cuối buổi) / hoạt động đã mở |
| Trả lời/thảo luận 25% | Σ min(trả lời + bình luận + nhận xét của buổi, giới hạn) / (giới hạn × số buổi) |
| Đặt câu hỏi 20% | Σ min(câu hỏi của buổi, giới hạn) / (giới hạn × số buổi) |
| Đóng góp có ích 15% | min(câu trả lời được GV xác nhận, giới hạn × số buổi) / (giới hạn × số buổi) |
| Phiếu cuối buổi 10% | phiếu đã nộp / phiếu đã mở |

- Thành phần không có cơ hội bị bỏ qua và trọng số được chuẩn hóa lại, nên buổi không có hoạt động không làm giảm điểm. Giới hạn mỗi buổi chống spam. "Số buổi" là các buổi đã diễn ra hoặc (tùy chọn) chỉ các buổi SV có mặt.
- Công thức lưu phiên bản (`scoreConfigs/current` + `v{n}`); điều chỉnh của giảng viên (`scoreAdjustments/{uid}`); chỉ bản **xác nhận** (`scoreSnapshots/`) mới được coi là chính thức. Sinh viên chỉ thấy điểm tham khảo của mình khi lớp bật `showScoreToStudents`.

### Song ngữ
- Tiếng Việt là ngôn ngữ nguồn và là khóa dịch; tiếng Anh trong `apps/web/src/i18n/en/*.ts` và `packages/shared/src/i18n/*.ts`. Test bao phủ ở web và API báo lỗi khi thiếu bản dịch.
- API đọc `x-lang` (hoặc ngôn ngữ trong hồ sơ người dùng) để trả thông báo lỗi, xuất Excel; thông báo trong ứng dụng lưu khóa dịch + tham số để hiển thị theo ngôn ngữ người đọc. AI trả lời theo ngôn ngữ của câu hỏi; tóm tắt/gợi ý theo ngôn ngữ giao diện của người yêu cầu.
- API key AI: quản trị cấp cao nhập trên giao diện; lưu thành phiên bản mới trong Secret Manager (`anthropic-api-key`, `openai-api-key`, `gemini-api-key`); API đọc lại sau tối đa 60 giây; giao diện chỉ hiện 4 ký tự cuối.

## 11. Phạm vi và việc còn lại

Đã có trong Phase 1: toàn bộ mục 53 của đặc tả, cộng thêm quiz nhanh, kiểm tra mức độ hiểu một chạm, phiếu cuối buổi (mẫu trả lời tự do), heatmap, Presenter Mode, hỏi ẩn danh, bình chọn câu hỏi, hàng đợi câu hỏi chưa giải đáp, gợi ý câu hỏi tương tự (theo từ khóa), in/lưu PDF báo cáo lớp.

Phase 2 (mục 10) đã có. Còn lại (Phase 3 và tùy chọn): Knowledge Base/RAG theo tài liệu môn học, tìm kiếm ngữ nghĩa toàn khóa, Moodle/LTI, thông báo đẩy (web push), thảo luận nhóm, đính kèm tệp, App Check, phân tích nhiều học phần.
