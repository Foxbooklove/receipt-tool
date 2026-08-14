# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 연구비 영수증 정리 도구

## 현재 상태

파싱 검증 완료, 앱 뼈대 작성 중.

- `src/parse.ts` — 프롬프트 확정. 실제 영수증 15장으로 검증했다.
- `src/excel.ts` — COLUMN_MAP + xlsx 출력
- `src/App.tsx` — 미작성
- Supabase 연동 — 미착수. `supabase.sql`과 `.env.local` 자리만 준비됨

과제 요구사항 원문은 [과제지침.md](과제지침.md)에 따로 있다. 충돌 시 그쪽이 우선한다.

초기 스택(Python + Streamlit + SQLite)은 **폐기되었다**. 문서 어디에도 Streamlit·SQLite·pandas가 다시 등장해서는 안 된다.

## 배포 정보

| 항목 | 값 |
|---|---|
| 배포 URL | https://receipt-tool-rho.vercel.app |
| GitHub | https://github.com/Foxbooklove/receipt-tool |
| Supabase | 프로젝트 `hrezmroqshahkzhskeao`, 테이블 `receipts` / `parse_metrics`, 버킷 `receipts` (public) |

Vercel Deployment 주소는 배포마다 바뀐다. 위 고정 URL만 쓴다.
환경변수 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`는 Vercel(Production and Preview)과 로컬 `.env.local` 양쪽에 있다.
Supabase URL 끝에 `/rest/v1`을 붙이면 전부 404가 난다. 대시보드가 그 형태로 보여주므로 주의.

## 프로젝트 개요

연구실 예산·실험비·여비 정산 시 영수증을 하나씩 보며 엑셀에 수기 입력하는 작업을 자동화한다.
결제 스크린샷 여러 장을 한 번에 업로드하면 로컬 VLM이 항목을 추출하고, 사용자가 표에서 검토·수정한 뒤 엑셀로 내려받는다.

수업 기말 프로젝트다. 채점은 시연 영상으로 이루어지며, 실제 외부 사용자는 없다.

**일요일까지 코딩과 배포를 전부 끝내고 발표팀에 결과물을 넘겨야 한다.** 여유가 없다. 날짜별 계획을 세우지 말고 아래 작업 순서대로 몰아친다.

## 과제 요구 단계

수업에서 제시한 7단계를 모두 충족해야 한다.

| 단계 | 요구 | 대응 |
|---|---|---|
| 1 환경 설치 | CLI·IDE 세팅 | Node.js, Claude Code |
| 2 서비스 개발 | AI로 기능 구현 | Vite + React 앱 |
| 3 디자인 | UI/UX 다듬기 | getdesign.md 참고, 단일 화면 정리 |
| 4 배포 | 웹에 올리기 | Vercel (정적 빌드) |
| 5 DB 관리 | 데이터 저장·연동 | Supabase (Postgres + Storage) |
| 6 데이터 측정 | 사용 지표 | Google Analytics + 자체 처리 건수·소요 시간 기록 |
| 7 검색 등록 | 구글 SEO | Google Search Console |

배포는 URL이 존재하고 접속된다는 것을 영상에서 보이는 수준으로 충족한다. 상시 가동하지 않는다.

## 기본 원칙

- 구조적 완성도보다 동작하는 결과물을 우선한다.
- 추상화 층을 미리 만들지 않는다. 인터페이스, 플러그인 구조, 전략 패턴 등은 요청 없이 도입하지 않는다.
- 테스트 코드는 요청 시에만 작성한다.
- 파일 수를 늘리지 않는다. 아래 파일 구성을 유지하고, 필요할 때만 분리한다.
- 코드 수정 시 전체 재작성보다 최소 변경을 우선한다.
- 상태 관리 라이브러리를 도입하지 않는다. `useState`로 충분하다.

## 기술 스택

| 층 | 선택 |
|---|---|
| 언어 | TypeScript |
| 빌드 | Vite (react-ts 템플릿) |
| UI | React (단일 화면) |
| 배포 | Vercel — 정적 빌드, 서버 함수 없음 |
| DB | Supabase Postgres |
| 이미지 저장 | Supabase Storage |
| 이미지 파싱 | Ollama + Qwen2.5-VL 7B (로컬, Cloudflare Tunnel 경유) |
| 엑셀 출력 | SheetJS (`xlsx`) |
| 분석 | Google Analytics 4 |

로컬 파싱 환경: Windows, RTX 4070 Ti (VRAM 12GB)

영수증에는 결제 정보가 포함되므로 **이미지를 외부 AI 서비스로 보내지 않는다.** 파싱은 로컬 Ollama에서 수행하고, 브라우저는 Cloudflare Tunnel URL을 통해 그 로컬 서버를 호출한다. 외부로 나가는 것은 Supabase(자체 DB)와 GA(집계 지표)뿐이다.

## 파일 구성

```
receipts/           거래명세서 원본 + answers.csv — 코드와 분리, git 제외 (별도 README 참조)
index.html          GA 스니펫, Search Console 메타태그, title/description
public/
  robots.txt
  sitemap.xml
src/
  main.tsx
  App.tsx           전체 UI (업로드 → 진행률 → 검토 표 → 다운로드)
  parse.ts          Ollama 호출, JSON 파싱
  supabase.ts       클라이언트, 테이블 CRUD, Storage 업로드
  excel.ts          COLUMN_MAP 적용 후 xlsx 생성
.env.local          VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

영수증 원본은 `receipts/` 아래에만 둔다. 코드와 섞지 않으며 `.gitignore`로 제외한다.
Vercel은 GitHub 저장소를 그대로 빌드하므로 커밋되면 결제 정보가 공개된다.
같은 이유로 `public/`이나 `src/` 아래로 옮기지 않는다 — Vite가 빌드 산출물에 포함시킨다.
앱이 다루는 이미지는 Supabase Storage에 올라간 것이고, `receipts/`는 개발·검증용 로컬 데이터다.

`npm create vite`는 `.gitignore`를 새로 쓰려 한다. 덮어쓰지 말고 병합할 것.

## 정적 배포에서 반드시 지킬 두 가지

Vite 정적 배포를 택했기 때문에 생기는 제약이다. 어기면 배포본에서 파싱이 동작하지 않는다.

**1. Ollama 터널 URL은 환경변수에 넣지 않는다.**

`VITE_` 환경변수는 빌드 시점에 번들로 구워진다. Cloudflare quick tunnel URL은 터널을 띄울 때마다 바뀌므로, 환경변수에 넣으면 녹화 직전마다 Vercel 재배포가 필요하다.

대신 앱 화면 상단에 터널 URL 입력 필드를 두고 `localStorage`에 보관한다. 녹화 시점에 터널을 띄우고 URL을 붙여넣으면 바로 동작한다. 이 입력 필드 자체가 "로컬에서 파싱한다"는 구조를 시연에서 설명하기 좋다.

**2. Ollama에 CORS를 열어야 한다.**

브라우저가 터널 도메인으로 직접 요청하므로 Ollama가 교차 출처 요청을 거부한다. Ollama 실행 전에 `OLLAMA_ORIGINS`를 설정하고 재시작해야 한다. 설정 없이 요청하면 콘솔에 CORS 오류만 뜨고 원인이 드러나지 않으니, 파싱이 안 될 때 가장 먼저 확인할 것.

## 명령어

아직 실행해 검증하지 않은, 위 스택에서 도출한 명령이다. 최초 셋업 후 실제 동작하는 형태로 갱신할 것.

```powershell
# 프로젝트 생성
npm create vite@latest . -- --template react-ts
npm install
npm i @supabase/supabase-js

# 엑셀 라이브러리 (npm 레지스트리의 xlsx는 구버전이다. 공식 배포본을 쓴다)
# 최신 버전 번호는 https://cdn.sheetjs.com 에서 확인 후 URL에 반영
npm i https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz

# 개발 서버
npm run dev

# 빌드 확인 (Vercel이 실패하기 전에 로컬에서 먼저 잡는다)
npm run build && npm run preview
```

```powershell
# VLM 준비
ollama pull qwen2.5vl:7b
ollama list                  # 모델 존재 확인
ollama ps                    # VRAM 점유 확인

# CORS 허용 후 Ollama 재시작 (터미널 재시작해야 setx가 반영된다)
setx OLLAMA_ORIGINS "*"

# 터널 개방 — 출력되는 https URL을 앱 상단 입력 필드에 붙여넣는다
cloudflared tunnel --url http://localhost:11434
```

```powershell
# 파싱만 단독 확인 (UI 없이 프롬프트·스키마 반복 검증할 때)
curl.exe http://localhost:11434/api/generate -d '{\"model\":\"qwen2.5vl:7b\",\"prompt\":\"...\",\"images\":[\"<base64>\"],\"stream\":false,\"format\":\"json\"}'
```

테스트 러너는 도입하지 않는다. 파싱 정확도는 테스트 코드가 아니라 `receipts/answers.csv` 정답표와의 대조로 확인한다.

## 영수증 포맷

쿠팡 결제 증빙은 두 종류이며 앱은 둘 다 처리한다. 프롬프트가 이미지를 보고 스스로 구분한다.

**[A] 거래명세표** — 표 형태. 대부분이 이쪽이다.

- 발행인 상호가 항상 `쿠팡(주)`다. **입점 판매자명은 나오지 않는다.** merchant에 변별력이 없다.
- 결제수단 정보가 없다. `payment_method`는 빈 문자열로 둔다. 추측해 채우지 않는다.
- **배송비가 별도 행이다. `총 거래액 합계` ≠ `실제 총 결제 금액`.**
  맨 아래 `실제 총 결제 금액`이 정답이다. 5,400 + 배송비 2,900 = 8,300 같은 사례가 실제로 있다.
  이 한 줄을 틀리면 정산 금액이 통째로 어긋난다.
- 품목 행이 여러 개일 수 있다. 그래도 한 건(표 1행)으로 합친다.

**[B] 신용카드 매출전표** — 목록 형태.

- `이용상점정보 > 판매자상호`에 실제 판매자명이 있다.
- `카드종류`에 결제수단이 있다.
- **`합계금액`이 정답이다. `과세금액`이나 `부가세`가 아니다.**

### 프롬프트 수정 시 주의

- `"외 N건"`을 모델에게 조립시키지 않는다. 품목이 1개일 때도 "외 1건"을 붙이는 일이 있었다.
  모델은 `item_count`만 숫자로 답하고, 문자열 조립은 `parse.ts`가 한다.
- 프롬프트를 고쳤으면 `receipts/`의 15장을 다시 돌려 금액·날짜가 그대로인지 확인한다.

### 검증 결과 (15장 파싱, 7장 눈으로 대조)

| 필드 | 결과 |
|---|---|
| `amount` | 7/7. 배송비 합산·과세금액 함정 모두 통과 |
| `date` | 7/7. 연/월/일 3칸 분리 표기 정상 처리 |
| `merchant` | 7/7 |
| `payment_method` | 7/7 |
| `note` | 5/7. 상품명에 한 글자씩 오독 (`탐사`→`타사`, `T플러그`→`T클러그`) |

정산에 쓰이는 숫자 필드는 정확하고 오독은 `note`에만 나타난다. `note`는 검토 화면에서 고치는 참고용이라 실용상 문제되지 않는다.
**따라서 OCR 2단 구성으로 전환할 이유가 없다.**

속도는 장당 1.2~2.0초. 첫 장만 모델 로딩으로 약 40초 걸린다.

## 데이터 스키마

VLM 출력, 내부 처리, Supabase 컬럼명을 아래로 통일한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | str (YYYY-MM-DD) | 결제일 |
| `merchant` | str | 사용처 |
| `amount` | int | 금액 (원, 정수) |
| `payment_method` | str | 결제 수단 |
| `category` | str | 분류. `소모품 / 도서 / 식비 / 장비 / 기타` 중 하나 |
| `note` | str | 비고 |
| `image_path` | str | Supabase Storage 경로 |

Supabase 테이블에는 `id`, `created_at`을 추가한다. 인증을 구현하지 않으므로 RLS는 anon 역할에 읽기·쓰기를 허용하는 단일 정책으로 둔다. 공개 URL에 데모 데이터만 들어간다는 전제다.

**엑셀 출력 시에만** 한글 컬럼명으로 변환한다. 변환은 단일 매핑 객체로 처리하며, 다른 층에 한글 컬럼명이 등장해서는 안 된다.

```ts
const COLUMN_MAP = {
  date: "일자",
  merchant: "사용처",
  amount: "금액",
  payment_method: "결제수단",
  category: "분류",
  note: "비고",
} as const;
```

실제 연구실 엑셀 양식은 추후 확보 예정이다. 확보 시 이 객체와 필드 목록만 수정하여 대응한다.

## 처리 흐름

```
영수증 여러 장 일괄 업로드
  → Supabase Storage 업로드
  → 순차 파싱 (진행률 표시)
  → 결과를 표 하나에 전체 표시
  → 사용자가 틀린 셀만 수정
  → Supabase 저장 + 엑셀 다운로드
```

파싱 결과를 자동 확정하지 않는다. 검토 단계는 제거하지 않는다.
검토 화면은 편집 가능한 `<input>` 셀을 가진 단일 `<table>`로 만든다. 데이터 그리드 라이브러리를 도입하지 않는다.
파싱은 장당 수 초가 소요되므로 진행률 바로 진행 상황을 표시한다. 병렬 요청을 보내지 않는다 — VRAM 12GB에서 동시 추론은 실패하거나 느려진다.

## 범위 결정

### 구현하지 않음

- 사용자 인증, 다중 사용자 지원
- 메신저 연동 (파일 업로드로 대체)
- 컨테이너화
- 에러 처리는 최소한만 (앱이 죽지 않는 수준)
- 쿠팡 외 영수증 포맷 대응

### 반드시 구현

- 일괄 업로드 및 진행률 표시
- 파싱 결과에 대한 사용자 수정 기능
- 엑셀 출력 (컬럼 구성 변경이 용이한 구조)
- 처리 건수·소요 시간 기록 (6단계 및 평가 지표용) — Supabase에 별도 테이블로 남긴다. GA만으로는 장당 파싱 소요 시간을 측정할 수 없다.

## 작업 순서

날짜를 배분하지 않는다. 위에서부터 순서대로 끝내고 다음으로 넘어간다.

1. **VLM 한글 파싱 검증** — 프롬프트와 JSON 스키마 확정. 여기서 막히면 나머지가 전부 무의미하므로 가장 먼저 한다.
2. **전체 관통** — Vite 앱 생성, 업로드 → 파싱 → 표 → 엑셀 다운로드가 로컬에서 한 번 끝까지 돈다.
3. **Supabase 연동** — Postgres 저장, Storage 업로드, 처리 건수·소요 시간 기록.
4. **Vercel 배포** — URL이 열리는 것 확인.
5. **GA·Search Console 등록** — 5·6·7단계 증빙 확보.
6. **일괄 처리·진행률·검토 화면 정비, 디자인 정리.**
7. **정확도 검증** — `split=eval` 장들로 필드별 정확도 측정, 그리고 같은 장들로 사람 수기 입력 시간(베이스라인) 측정.

1번에서 한글 인식 정확도가 부족할 경우, 로컬 OCR로 텍스트를 추출한 뒤 텍스트 LLM으로 구조화하는 2단 구성으로 전환한다. 이 판단은 1번 안에서 끝내고, 뒤로 미루지 않는다.

### 순서에 대한 근거

4번(배포)을 6번(정비·디자인)보다 먼저 둔 이유는, 배포는 미완성 상태로도 성립하지만 마지막에 몰면 실패했을 때 복구할 시간이 없기 때문이다. 배포가 뚫린 뒤에 화면을 다듬는다.

Search Console 색인 등록은 즉시 반영되지 않으므로 5번을 최대한 앞당긴다. 영상에서는 소유권 확인 완료 화면과 색인 요청 제출 화면까지 보이는 것으로 충족한다.

### 시간이 부족할 때 버리는 순서

6번의 디자인 정리 → 7번의 전수 검증(eval 5장으로 축소) → 6번의 화면 정비. 1~5번은 과제 요구 단계와 직결되므로 버리지 않는다.

## 평가 지표

- 필드별 파싱 정확도: `receipts/answers.csv`의 정답 데이터와 대조한다.
  프롬프트를 다듬을 때 눈으로 본 장(`split=dev`)은 정확도 계산에서 제외한다. 튜닝에 쓴 데이터로 재면 숫자가 부풀려진다.
  최종 수치는 `split=eval` 행만으로 낸다.
- 처리 시간: 수기 입력 소요 시간(베이스라인)과 도구 사용 시 소요 시간을 비교한다.

베이스라인은 개발이 끝난 뒤에 측정한다. `split=eval` 장들을 제3자에게 그대로 주고, 같은 컬럼 기준으로 엑셀에 정리하게 한 뒤 소요 시간을 잰다. 도구와 사람이 동일한 입력을 처리하므로 비교가 성립한다.

측정자는 개발자 본인이 아니어야 한다. 본인이 재면 수기 입력이 느리게 나오는 쪽으로 편향된다.

## 과제 지침

원문은 [과제지침.md](과제지침.md)에 있다. 이 저장소에서 유일하게 임의로 고치면 안 되는 문서다.
