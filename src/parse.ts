export type Receipt = {
  id?: number;          // Supabase 에 저장된 행에만 있다. 없으면 아직 저장 전이다.
  date: string;
  merchant: string;
  amount: number;
  payment_method: string;
  category: string;
  note: string;
  image_path: string;
};

const MODEL = "qwen2.5vl:7b";

// 15장 대조로 확정한 프롬프트. 금액·날짜는 7/7 정확했다.
// 손대기 전에 receipts/answers.csv 와 다시 대조할 것.
const PROMPT = `너는 쿠팡 결제 증빙 이미지에서 정산용 항목을 뽑는 도구다.
이미지는 두 종류 중 하나다.

[A] 거래명세표 — 표 형태. 발행인 상호가 "쿠팡(주)"이고, 하단에 "총 거래액 합계 / 배송비 합계 / 할인금액 / 실제 총 결제 금액" 행이 있다.
[B] 신용카드 매출전표 — 목록 형태. "결제정보 / 구매정보 / 이용상점정보" 구획이 있다.

아래 JSON 객체 하나만 출력한다. 설명이나 코드블록 표기를 붙이지 않는다.

{
  "date": "YYYY-MM-DD",
  "merchant": "문자열",
  "amount": 정수,
  "payment_method": "문자열",
  "category": "문자열",
  "note": "문자열",
  "item_count": 정수
}

각 필드 규칙:

date — [A]는 표 안 "거래일시"의 연/월/일 칸을 합친다. 칸이 나뉘어 있어도 하나의 날짜다. 품목 행이 여러 개면 첫 행의 날짜를 쓴다. [B]는 "거래일시"의 날짜 부분만 쓴다.

merchant — [A]는 발행인 "상호(법인명)" 값을 쓴다. [B]는 이용상점정보의 "판매자상호" 값을 쓴다.

amount — 반드시 최종 결제 금액이다.
  [A]는 맨 아래 "실제 총 결제 금액" 행의 값이다. "총 거래액 합계"가 아니다. 배송비가 붙으면 두 값이 다르므로 반드시 마지막 행을 읽어라.
  [B]는 "합계금액"이다. "과세금액"이나 "부가세"가 아니다.
  쉼표와 "원"을 빼고 정수로만 쓴다.

payment_method — [B]의 "카드종류" 값을 쓴다. [A]에는 결제수단 정보가 없으므로 빈 문자열 ""로 둔다. 추측하지 않는다.

category — 상품명을 보고 다음 중 하나를 고른다: 소모품, 도서, 식비, 장비, 기타.
  전자부품·케이블·어댑터·모듈·공구는 "소모품". 웹캠·카메라처럼 단가가 높은 기기는 "장비".

note — 첫 품목의 상품명이다. 30자 이내로 줄인다. 모델명·색상·수량 표기는 버리고 물건 이름만 남긴다.
  예: "싸이피아 40CM 점퍼케이블 40P 암암/암수/수수 점퍼선, WF6-암수40cm점퍼선" -> "점퍼케이블"
  "외 N건" 같은 표현을 절대 붙이지 않는다. 개수는 item_count로만 답한다.

item_count — 상품 품목의 개수다. [A]는 표에서 상품명이 채워진 행의 수를 센다. 빈 행은 세지 않는다.
  [B]는 상품명이 하나이므로 1이다.

품목이 여러 개여도 객체는 하나만 출력한다. 품목별로 나누지 않는다.`;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const EMPTY: Omit<Receipt, "image_path"> = {
  date: "",
  merchant: "",
  amount: 0,
  payment_method: "",
  category: "",
  note: "",
};

export async function parseReceipt(file: File, baseUrl: string): Promise<Receipt> {
  const images = [await toBase64(file)];
  const res = await fetch(baseUrl.replace(/\/$/, "") + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: PROMPT,
      images,
      stream: false,
      format: "json",
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error("Ollama " + res.status);

  const raw = JSON.parse((await res.json()).response);

  // "외 N건"은 모델에게 조립시키지 않는다. 품목이 1개일 때도 "외 1건"을 붙이는 일이 있었다.
  const n = Number(raw.item_count) || 1;
  const note = n > 1 ? String(raw.note ?? "") + " 외 " + (n - 1) + "건" : String(raw.note ?? "");

  return {
    ...EMPTY,
    date: String(raw.date ?? ""),
    merchant: String(raw.merchant ?? ""),
    amount: Number(raw.amount) || 0,
    payment_method: String(raw.payment_method ?? ""),
    category: String(raw.category ?? ""),
    note,
    image_path: file.name,
  };
}
