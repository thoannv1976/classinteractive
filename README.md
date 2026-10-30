# ClassInteract AI

**Smart Classroom Interaction, Q&A Management & Learning Engagement Analytics Platform**

Ứng dụng web (PWA) cho hỏi đáp và tương tác trên lớp đại học. Mọi câu hỏi, câu trả lời, phản hồi và hoạt động đều được ghi nhận có cấu trúc theo sinh viên, lớp, buổi học và chủ đề, để giảng viên tổng hợp và theo dõi mức độ tham gia suốt học kỳ.

- **Sinh viên**: đăng ký bằng mã SV (có trong danh sách lớp) + tự đặt mật khẩu; quét QR vào buổi học; hỏi (có thể ẩn danh), trả lời, phản hồi nhanh, bình chọn; làm khảo sát/quiz; xem mức độ tham gia của mình.
- **Giảng viên**: tạo lớp, nhập danh sách CSV/XLSX, điều hành buổi học realtime, kiểm duyệt, tạo hoạt động, trình chiếu, AI soạn nháp câu trả lời để duyệt, thống kê tham gia, heatmap, chủ đề, xuất Excel.
- **Quản trị**: tài khoản, phân quyền, khóa/mở, lớp và phân công, cấu hình AI (Claude/OpenAI/Gemini, nhập API key trên giao diện), nhật ký thao tác.
- **Phase 2**: AI phân loại chủ đề, gom nhóm câu hỏi, tóm tắt buổi học, gợi ý giảng dạy, phiếu cuối buổi, điểm tham gia có trọng số, 7 báo cáo in/PDF.
- **Song ngữ Việt / Anh** cho toàn bộ ứng dụng.

## Cấu trúc

```
apps/web          React + Vite + TypeScript + Tailwind (PWA)
apps/api          Fastify + TypeScript trên Cloud Run (Firebase Admin SDK)
packages/shared   kiểu dữ liệu, schema Zod, quyền, nhãn, công thức thống kê
firebase/         firestore.rules, firestore.indexes.json, storage.rules
infrastructure/   Dockerfile, deploy.sh (Cloud Shell), Cloud Build
scripts/          dev-stack.sh (chạy local với Emulator)
tests/            kiểm thử Security Rules và E2E (Playwright)
docs/             kiến trúc, API, triển khai, hướng dẫn sử dụng
```

## Chạy trên máy (Firebase Emulator, không cần tài khoản GCP)

Yêu cầu: Node.js 22, pnpm 10, Java 21 (cho Firestore Emulator).

```bash
pnpm install
./scripts/dev-stack.sh          # Emulator + API :8081 + Web :5173, tự seed dữ liệu mẫu
```

Mở http://localhost:5173. Tài khoản mẫu:

| Vai trò | Đăng nhập | Mật khẩu |
|---|---|---|
| Quản trị | `admin@demo.edu.vn` | `Admin@123` |
| Giảng viên | `gv.demo@demo.edu.vn` | `Giangvien@123` |
| Sinh viên | `SV2026001` … `SV2026020` | `123456` |
| Chưa đăng ký (thử chức năng Đăng ký) | `SV2026021` … `SV2026030` | tự đặt |

Ở chế độ local, AI dùng bộ mô phỏng (`AI_FAKE_PROVIDER=1`). Đặt `AI_FAKE_PROVIDER=0` và các biến `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` để gọi AI thật.

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm lint` · `pnpm typecheck` | ESLint, TypeScript |
| `pnpm test` | Unit test (shared, api, web) |
| `pnpm test:emulator` | Integration test API + test Security Rules trên Emulator |
| `pnpm test:e2e` | E2E Playwright (desktop + điện thoại) trên Emulator |
| `pnpm build` | Build API (esbuild) và web (Vite + PWA) |

## Kết quả kiểm thử

| Bộ test | Kết quả |
|---|---|
| Unit (shared 13, api 6, web 5) | 24/24 đạt |
| Integration API trên Emulator | 34/34 đạt |
| Security Rules | 8/8 đạt |
| E2E Playwright | 11/11 đạt |

Đối chiếu kịch bản nghiệm thu (mục 56 của đặc tả): xem [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Triển khai

Chạy trong Google Cloud Shell của project `classinteractive`:

```bash
git clone -b claude/happy-ptolemy-nf4c4b https://github.com/thoannv1976/classinteractive.git
cd classinteractive && bash infrastructure/deploy.sh
```

Chi tiết: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tài liệu

- [Kiến trúc và cơ sở dữ liệu](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Triển khai](docs/DEPLOYMENT.md)
- [Hướng dẫn quản trị](docs/HUONG_DAN_QUAN_TRI.md) · [giảng viên](docs/HUONG_DAN_GIANG_VIEN.md) · [sinh viên](docs/HUONG_DAN_SINH_VIEN.md)
