#!/usr/bin/env bash
# =============================================================================
# ClassInteract AI – one-command deployment to Google Cloud / Firebase.
#
# Run it in Google Cloud Shell (it already has gcloud, docker, node, git):
#
#   git clone -b <branch> https://github.com/thoannv1976/classinteractive.git
#   cd classinteractive
#   bash infrastructure/deploy.sh
#
# Safe to re-run: every step checks what already exists. Re-running redeploys
# the latest code. Nothing secret is written to the repository.
#
# Options (environment variables):
#   PROJECT_ID   GCP/Firebase project (default: current gcloud project)
#   REGION       Cloud Run + Firestore region (default: asia-southeast1)
#   SKIP_WEB=1   only redeploy the API
#   SKIP_API=1   only redeploy web/rules
# =============================================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-southeast1}"
SERVICE="classinteract-api"
REPO="classinteract"
SA_NAME="classinteract-api"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="$(date +%Y%m%d-%H%M%S)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/api:${TAG}"

bold() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok() { printf '\033[0;32m  ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m  ! %s\033[0m\n' "$*"; }
die() { printf '\033[0;31m  ✖ %s\033[0m\n' "$*"; exit 1; }

[ -n "$PROJECT_ID" ] || die "Chưa có project. Chạy: gcloud config set project classinteractive"
cd "$ROOT"
gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
echo "Project: $PROJECT_ID ($PROJECT_NUMBER) · Region: $REGION"

# -----------------------------------------------------------------------------
bold "1/9 Bật các Google Cloud API cần thiết"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com \
  identitytoolkit.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
  firebaserules.googleapis.com logging.googleapis.com monitoring.googleapis.com
ok "Đã bật API"

# -----------------------------------------------------------------------------
bold "2/9 Cài công cụ (pnpm, firebase-tools)"
command -v corepack >/dev/null && corepack enable >/dev/null 2>&1 || true
if ! command -v pnpm >/dev/null; then npm install -g pnpm@10 >/dev/null; fi
pnpm install --frozen-lockfile >/dev/null
FIREBASE="pnpm exec firebase"
if ! $FIREBASE projects:list --json >/dev/null 2>&1; then
  warn "Firebase CLI cần đăng nhập. Làm theo hướng dẫn hiện ra (mở link, dán mã)."
  $FIREBASE login --no-localhost
fi
ok "Công cụ sẵn sàng"

# -----------------------------------------------------------------------------
bold "3/9 Liên kết Firebase với project"
if $FIREBASE projects:list --json | grep -q "\"projectId\": *\"$PROJECT_ID\""; then
  ok "Project đã có Firebase"
else
  $FIREBASE projects:addfirebase "$PROJECT_ID"
  ok "Đã thêm Firebase vào project"
fi

# -----------------------------------------------------------------------------
bold "4/9 Cloud Firestore (Native mode, $REGION)"
if gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  ok "Firestore đã tồn tại ($(gcloud firestore databases describe --database='(default)' --format='value(locationId)'))"
else
  gcloud firestore databases create --database="(default)" --location="$REGION" --type=firestore-native
  ok "Đã tạo Firestore"
fi

# -----------------------------------------------------------------------------
bold "5/9 Firebase Authentication"
AUTH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT_ID" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT_ID/config")
if [ "$AUTH_STATUS" != "200" ]; then
  warn "Firebase Authentication chưa được khởi tạo."
  echo "    Mở: https://console.firebase.google.com/project/$PROJECT_ID/authentication"
  echo "    Bấm \"Get started\" (Bắt đầu). KHÔNG cần bật nhà cung cấp đăng nhập nào –"
  echo "    ứng dụng tự xác thực mã SV/mật khẩu ở backend và dùng Custom Token."
  read -r -p "    Nhấn Enter sau khi đã bấm Get started… " _
fi
ok "Authentication sẵn sàng"

# -----------------------------------------------------------------------------
bold "6/9 Service account và Secret Manager"
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="ClassInteract API (Cloud Run)"
fi
for ROLE in roles/datastore.user roles/firebaseauth.admin roles/secretmanager.secretAccessor roles/logging.logWriter roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --condition=None >/dev/null
done
# Needed to sign Firebase custom tokens (IAM signBlob on itself).
gcloud iam service-accounts add-iam-policy-binding "$SA" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator >/dev/null
ok "Service account: $SA (quyền tối thiểu)"

secret_exists() { gcloud secrets describe "$1" >/dev/null 2>&1; }
put_secret() { # name value
  if secret_exists "$1"; then printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null
  else printf '%s' "$2" | gcloud secrets create "$1" --replication-policy=automatic --data-file=- >/dev/null; fi
}
if ! secret_exists classinteract-setup-token; then
  put_secret classinteract-setup-token "$(openssl rand -hex 24)"
  ok "Đã tạo secret classinteract-setup-token"
fi
SECRETS="SETUP_TOKEN=classinteract-setup-token:latest"
for PAIR in "anthropic-api-key:ANTHROPIC_API_KEY:Anthropic Claude" "openai-api-key:OPENAI_API_KEY:OpenAI" "gemini-api-key:GEMINI_API_KEY:Google Gemini"; do
  NAME="${PAIR%%:*}"; REST="${PAIR#*:}"; VAR="${REST%%:*}"; LABEL="${REST#*:}"
  if ! secret_exists "$NAME"; then
    read -r -s -p "    API key $LABEL (Enter để bỏ qua): " KEY; echo
    if [ -n "$KEY" ]; then put_secret "$NAME" "$KEY"; ok "Đã lưu $NAME vào Secret Manager"; fi
  fi
  if secret_exists "$NAME"; then SECRETS="$SECRETS,$VAR=$NAME:latest"; fi
done
echo "  Biến môi trường lấy từ Secret Manager: $(echo "$SECRETS" | sed -E 's/=[^,]+//g')"

# -----------------------------------------------------------------------------
if [ "${SKIP_API:-0}" != "1" ]; then
  bold "7/9 Build và deploy API lên Cloud Run"
  if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
    gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="ClassInteract images"
  fi
  if command -v docker >/dev/null && docker info >/dev/null 2>&1 && [ "${USE_CLOUD_BUILD:-0}" != "1" ]; then
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null
    docker build -f infrastructure/api.Dockerfile -t "$IMAGE" .
    docker push "$IMAGE"
  else
    gcloud builds submit --config infrastructure/cloudbuild.api.yaml --substitutions "_IMAGE=$IMAGE" .
  fi
  gcloud run deploy "$SERVICE" \
    --image "$IMAGE" --region "$REGION" --service-account "$SA" \
    --allow-unauthenticated --port 8080 --cpu 1 --memory 512Mi \
    --concurrency 80 --min-instances 0 --max-instances 10 --timeout 60 \
    --set-env-vars "GCLOUD_PROJECT=$PROJECT_ID,LOG_LEVEL=info" \
    --set-secrets "$SECRETS"
  ok "API: $(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
  echo "  (Ứng dụng tự kiểm tra đăng nhập; truy cập công khai là cần thiết để Firebase Hosting chuyển tiếp /api.)"
fi

# -----------------------------------------------------------------------------
if [ "${SKIP_WEB:-0}" != "1" ]; then
  bold "8/9 Build web và deploy Firebase Hosting + Firestore rules/indexes"
  APP_ID=$($FIREBASE apps:list WEB --project "$PROJECT_ID" --json | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result||[];const a=r.find(x=>x.displayName==="ClassInteract Web")||r[0];console.log(a?a.appId:"")})')
  if [ -z "$APP_ID" ]; then
    APP_ID=$($FIREBASE apps:create WEB "ClassInteract Web" --project "$PROJECT_ID" --json | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.appId))')
  fi
  $FIREBASE apps:sdkconfig WEB "$APP_ID" --project "$PROJECT_ID" --json | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const r=JSON.parse(s).result;let c=r.sdkConfig;
      if(!c){const m=/\{[\s\S]*\}/.exec(r.fileContents||"");c=m?Function("return "+m[0])():{};}
      const out=["VITE_FIREBASE_API_KEY="+c.apiKey,"VITE_FIREBASE_AUTH_DOMAIN="+c.authDomain,"VITE_FIREBASE_PROJECT_ID="+c.projectId,"VITE_FIREBASE_APP_ID="+c.appId,"VITE_USE_EMULATORS=false",""].join("\n");
      require("fs").writeFileSync("apps/web/.env.production",out);})'
  ok "Cấu hình web (public) đã ghi vào apps/web/.env.production"
  pnpm --filter @classinteract/web build
  # Point the Hosting rewrite at the chosen region
  node -e '
    const f=require("fs");const j=JSON.parse(f.readFileSync("firebase.json","utf8"));
    for(const r of j.hosting.rewrites) if(r.run){r.run.region=process.argv[1];}
    f.writeFileSync("firebase.json",JSON.stringify(j,null,2)+"\n");' "$REGION"
  $FIREBASE deploy --project "$PROJECT_ID" --only hosting,firestore:rules,firestore:indexes --non-interactive
  ok "Web: https://${PROJECT_ID}.web.app"
  warn "Firestore indexes có thể mất vài phút để xây dựng lần đầu."
fi

# -----------------------------------------------------------------------------
bold "9/9 Tài khoản quản trị đầu tiên"
BASE="https://${PROJECT_ID}.web.app/api/v1"
for i in $(seq 1 20); do
  STATUS_JSON=$(curl -s "$BASE/setup/status" || true)
  echo "$STATUS_JSON" | grep -q initialized && break
  sleep 3
done
if echo "$STATUS_JSON" | grep -q '"initialized":true'; then
  ok "Hệ thống đã có quản trị viên"
elif echo "$STATUS_JSON" | grep -q '"initialized":false'; then
  read -r -p "    Email quản trị: " ADMIN_EMAIL
  read -r -p "    Họ tên: " ADMIN_NAME
  read -r -s -p "    Mật khẩu (≥ 6 ký tự): " ADMIN_PW; echo
  TOKEN=$(gcloud secrets versions access latest --secret=classinteract-setup-token)
  BODY=$(node -e 'console.log(JSON.stringify({email:process.argv[1],displayName:process.argv[2],password:process.argv[3]}))' "$ADMIN_EMAIL" "$ADMIN_NAME" "$ADMIN_PW")
  RES=$(curl -s -X POST "$BASE/setup/bootstrap" -H 'content-type: application/json' -H "x-setup-token: $TOKEN" -d "$BODY")
  echo "$RES" | grep -q '"uid"' && ok "Đã tạo quản trị viên $ADMIN_EMAIL" || die "Không tạo được quản trị viên: $RES"
else
  warn "Không gọi được $BASE/setup/status. Kiểm tra log: gcloud run services logs read $SERVICE --region $REGION"
fi

bold "Hoàn tất"
echo "  Ứng dụng:   https://${PROJECT_ID}.web.app"
echo "  Sinh viên đăng ký tại: https://${PROJECT_ID}.web.app/register (mã SV phải có trong danh sách lớp)"
echo "  Log API:    gcloud run services logs read $SERVICE --region $REGION"
