# Hướng dẫn triển khai lên Google Cloud / Firebase

Tài liệu này mô tả cách đưa ClassInteract AI lên project GCP `classinteractive` (hoặc project khác).
Toàn bộ quá trình được gói trong **một script**: `infrastructure/deploy.sh`, chạy trong **Google Cloud Shell**.

## 1. Kiến trúc khi chạy thật

```
Trình duyệt / PWA ──HTTPS──► Firebase Hosting (https://<project>.web.app)
                                 │  /api/**  → rewrite
                                 ▼
                           Cloud Run: classinteract-api  (Node.js, asia-southeast1)
                                 │ Admin SDK (service account classinteract-api)
               ┌─────────────────┼──────────────────────┐
               ▼                 ▼                      ▼
        Cloud Firestore   Firebase Auth (Custom Token)  Secret Manager (API key AI, setup token)
               ▲
               └── trình duyệt đọc realtime (chỉ đọc, theo Security Rules)
```

- Web và API cùng một tên miền nên không cần CORS.
- Sinh viên đăng nhập bằng mã SV + mật khẩu; backend kiểm tra (Argon2id) rồi phát hành Firebase Custom Token.
- Trình duyệt **chỉ đọc** Firestore (realtime). Mọi thao tác ghi đi qua API.

## 2. Chuẩn bị (một lần)

| Việc | Ghi chú |
|---|---|
| Project GCP có **billing** | Cloud Run, Secret Manager, Artifact Registry cần tài khoản thanh toán. Mức dùng của một vài lớp nằm trong hạn mức miễn phí hoặc rất thấp. |
| Quyền **Owner** (hoặc Editor + Security Admin) trên project | Script bật API, tạo service account, gán quyền. |
| (Tuỳ chọn) API key AI | Anthropic (Claude), OpenAI, Google Gemini. Có thể thêm sau. |

## 3. Triển khai bằng Cloud Shell

1. Mở https://console.cloud.google.com/welcome?project=classinteractive&cloudshell=true
2. Trong terminal Cloud Shell:

```bash
git clone -b claude/happy-ptolemy-nf4c4b https://github.com/thoannv1976/classinteractive.git
cd classinteractive
bash infrastructure/deploy.sh
```

> Nếu repository ở chế độ private, Cloud Shell sẽ hỏi đăng nhập GitHub. Dùng **Personal Access Token** (GitHub → Settings → Developer settings → Tokens) làm mật khẩu.

Script sẽ hỏi bạn vài lần:

| Khi nào | Bạn làm gì |
|---|---|
| Firebase CLI chưa đăng nhập | Mở link được in ra, đăng nhập tài khoản Google của project, dán mã xác nhận. |
| Firebase Authentication chưa khởi tạo | Mở link Firebase Console → Authentication → bấm **Get started**. Không cần bật nhà cung cấp nào. Quay lại Cloud Shell nhấn Enter. |
| API key Claude / OpenAI / Gemini | Dán key (không hiện ra màn hình) hoặc nhấn Enter để bỏ qua. Key được lưu vào **Secret Manager**, không lưu vào mã nguồn. |
| Tài khoản quản trị đầu tiên | Nhập email, họ tên, mật khẩu. Đây là tài khoản **Quản trị cấp cao**. |

Kết thúc, script in địa chỉ ứng dụng: **https://classinteractive.web.app**

### Script làm những gì

1. Bật các API: Cloud Run, Artifact Registry, Cloud Build, Firestore, Secret Manager, IAM Credentials, Identity Toolkit, Firebase, Firebase Hosting, Rules, Logging, Monitoring.
2. Cài `pnpm` và `firebase-tools` (theo `package.json`).
3. Thêm Firebase vào project nếu chưa có.
4. Tạo **Cloud Firestore** (Native mode, `asia-southeast1`) nếu chưa có.
5. Kiểm tra Firebase Authentication đã khởi tạo.
6. Tạo service account `classinteract-api` với quyền tối thiểu:
   `roles/datastore.user`, `roles/firebaseauth.admin`, `roles/secretmanager.secretAccessor`, `roles/logging.logWriter`, `roles/monitoring.metricWriter`, và `roles/iam.serviceAccountTokenCreator` trên chính nó (để ký Custom Token).
   Tạo secret `classinteract-setup-token` (ngẫu nhiên) và các secret AI nếu bạn nhập key.
7. Build image API (Docker trong Cloud Shell, hoặc Cloud Build nếu `USE_CLOUD_BUILD=1`), đẩy lên Artifact Registry `asia-southeast1-docker.pkg.dev/<project>/classinteract/api`, deploy **Cloud Run** `classinteract-api`.
8. Tạo Firebase Web App, ghi cấu hình công khai vào `apps/web/.env.production`, build web, deploy **Hosting** + **Firestore rules** + **indexes**.
9. Gọi `POST /api/v1/setup/bootstrap` (kèm setup token) để tạo quản trị viên đầu tiên. Endpoint này tự khóa sau lần đầu.

### Cập nhật phiên bản mới

```bash
cd ~/classinteractive && git pull && bash infrastructure/deploy.sh
```

Chỉ deploy một phần: `SKIP_WEB=1 bash infrastructure/deploy.sh` (chỉ API) hoặc `SKIP_API=1 …` (chỉ web/rules).

## 4. Thêm hoặc đổi API key AI sau này

```bash
printf '%s' 'sk-ant-...' | gcloud secrets create anthropic-api-key --data-file=-     # lần đầu
printf '%s' 'sk-ant-...' | gcloud secrets versions add anthropic-api-key --data-file=-  # đổi key
# tương tự: openai-api-key, gemini-api-key
SKIP_WEB=1 bash infrastructure/deploy.sh   # để Cloud Run nạp secret mới
```

Sau đó vào **Quản trị → Cấu hình AI** để bật nhà cung cấp, chọn model mặc định, đơn giá và hạn mức chi phí.
Model ID mặc định: `claude-opus-5-5` (Anthropic), `gpt-5-mini` (OpenAI), `gemini-2.5-flash` (Gemini). Kiểm tra tên model hiện hành của OpenAI/Gemini trước khi dùng và sửa ngay trên trang này nếu cần (không phải sửa mã).

## 5. Biến môi trường của API (Cloud Run)

| Biến | Nguồn | Ý nghĩa |
|---|---|---|
| `GCLOUD_PROJECT` | env | Project ID |
| `SETUP_TOKEN` | Secret `classinteract-setup-token` | Chỉ dùng cho `/setup/bootstrap` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Secret (tuỳ chọn) | Khóa AI |
| `LOG_LEVEL` | env | `info` (mặc định) |
| `TENANT_ID` | env (tuỳ chọn) | Mặc định `default` – thiết kế sẵn cho nhiều đơn vị |
| `CORS_ORIGINS` | env (tuỳ chọn) | Chỉ cần nếu web chạy khác tên miền |

Cấu hình web (`VITE_FIREBASE_*`) là thông tin **công khai** của Firebase Web App, không phải bí mật.

## 6. Kiểm tra sau triển khai

```bash
curl https://classinteractive.web.app/healthz                    # {"ok":true}
curl https://classinteractive.web.app/api/v1/setup/status        # {"initialized":true}
gcloud run services logs read classinteract-api --region asia-southeast1 --limit 50
```

Kịch bản thử nhanh trên môi trường thật:
1. Đăng nhập quản trị → **Người dùng → Tạo tài khoản cán bộ** (giảng viên).
2. Giảng viên đăng nhập, đổi mật khẩu, **Tạo lớp**, **Nhập danh sách** (file mẫu: cột `Mã SV`, `Họ tên`).
3. Sinh viên vào `/register`, nhập mã SV + mật khẩu → vào thẳng hệ thống.
4. Giảng viên **Bắt đầu buổi học**, chiếu QR; sinh viên quét và đặt câu hỏi; câu hỏi hiện ngay trên màn hình giảng viên.

## 7. Sao lưu và khôi phục

```bash
# Bật khôi phục theo thời điểm (7 ngày)
gcloud firestore databases update --database='(default)' --enable-pitr
# Xuất toàn bộ dữ liệu ra Cloud Storage (nên đặt lịch hằng tuần bằng Cloud Scheduler)
gsutil mb -l asia-southeast1 gs://classinteractive-backup
gcloud firestore export gs://classinteractive-backup/$(date +%F)
# Khôi phục
gcloud firestore import gs://classinteractive-backup/<ngày>
```

## 8. Theo dõi chi phí

- **Billing → Budgets & alerts**: đặt ngân sách tháng và cảnh báo email.
- Chi phí AI ước tính hiển thị tại **Quản trị → Cấu hình AI**; khi vượt **hạn mức chi phí/tháng**, AI tự tạm dừng, lớp học vẫn hoạt động.
- Cloud Run đặt `min-instances=0` (không tốn tiền khi không dùng), `max-instances=10`.

## 9. Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Đăng nhập báo lỗi `auth/configuration-not-found` | Chưa bấm **Get started** ở Firebase Authentication. |
| `/api/...` trả về 403 từ Google | Chính sách tổ chức chặn `allUsers` cho Cloud Run (Domain restricted sharing). Nhờ quản trị tổ chức cho phép, hoặc thêm ngoại lệ cho project. |
| Lỗi `FAILED_PRECONDITION … requires an index` | Index Firestore đang được tạo (vài phút sau lần deploy đầu). Xem tại Firebase Console → Firestore → Indexes. |
| `Permission 'iam.serviceAccounts.signBlob' denied` | Thiếu quyền Token Creator cho service account – chạy lại script. |
| AI báo "Chưa cấu hình nhà cung cấp AI nào" | Chưa có secret API key, hoặc chưa bật nhà cung cấp trong Cấu hình AI. |

## 10. Triển khai tự động bằng GitHub Actions (tuỳ chọn)

Workflow `.github/workflows/deploy.yml` chạy bằng tay (**Actions → Deploy → Run workflow**) và dùng
**Workload Identity Federation** (không lưu khóa trong GitHub):

```bash
PROJECT_ID=classinteractive
gcloud iam service-accounts create github-deployer
for R in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/firebase.admin roles/iam.serviceAccountUser roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:github-deployer@$PROJECT_ID.iam.gserviceaccount.com --role=$R
done
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='thoannv1976/classinteractive'"
gcloud iam service-accounts add-iam-policy-binding github-deployer@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/github/attribute.repository/thoannv1976/classinteractive"
```

Biến repository (Settings → Secrets and variables → Actions → Variables): `GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_WIF_PROVIDER` (`projects/<số>/locations/global/workloadIdentityPools/github/providers/github`),
`GCP_DEPLOY_SA`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID` (lấy trong `apps/web/.env.production` sau lần chạy script đầu).
