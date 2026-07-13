# 공사현황관리 ERP

혜송산업개발(주) · 신진조경(주) 공사현황관리 웹앱. 시범 운영 단계 — 로그인 없이 링크만 있으면 누구나 접속해서 함께 데이터를 입력/조회할 수 있어요.

## 접속 주소

**https://hyesong-sinjin-erp.vercel.app**

이 링크를 여는 모든 사람이 같은 데이터를 함께 보고 수정합니다 (계정 구분 없음).

## 배포 구조

- **Vercel** — 앱 호스팅 (Next.js, 계정: ttl4503-5940)
- **Neon** — PostgreSQL DB (Vercel과 연동되어 자동으로 연결됨)
- 코드를 고친 뒤 다시 배포하려면 이 폴더에서: `npx vercel deploy --prod`
  (배포할 때마다 빌드 과정에서 DB 스키마도 최신 상태로 자동 동기화돼요)

## 로컬 컴퓨터에서 개발/테스트하려면

1. `npm install`
2. Neon 대시보드(Vercel 프로젝트 → Storage → Neon)에서 실제 DB 연결 문자열(DATABASE_URL)을 복사해 `.env` 파일에 붙여넣기
   (Vercel의 DB 값은 "민감함" 설정이라 `vercel env pull`로는 못 받아와요 — Neon 대시보드에서 직접 복사해야 해요)
3. `npm run dev` → `http://localhost:3000`

## 데이터

- 실제 데이터는 Neon(PostgreSQL)에 저장돼요. 로컬 SQLite 파일은 더 이상 사용하지 않아요.
- 시범 운영 단계라 로그인/권한 구분이 없습니다. 나중에 정식 운영으로 전환할 때 로그인·권한 기능을 다시 추가할 수 있어요.

## 기술 스택

- Next.js (App Router, TypeScript) — 프론트+백엔드 API
- Prisma + PostgreSQL (Neon, Vercel과 연동)
- xlsx — 착공내역서 엑셀 업로드 파싱 / 월별 집계 엑셀 다운로드
- 배포: Vercel
