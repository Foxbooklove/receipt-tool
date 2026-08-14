import * as XLSX from "xlsx";
import type { Receipt } from "./parse";

// 연구실 양식이 확정되면 이 객체와 순서만 고친다. 다른 층에 한글 컬럼명을 두지 않는다.
const COLUMN_MAP = {
  date: "일자",
  merchant: "사용처",
  amount: "금액",
  payment_method: "결제수단",
  category: "분류",
  note: "비고",
} as const;

export function downloadExcel(rows: Receipt[]) {
  const keys = Object.keys(COLUMN_MAP) as (keyof typeof COLUMN_MAP)[];
  const data = rows.map((r) =>
    Object.fromEntries(keys.map((k) => [COLUMN_MAP[k], r[k]]))
  );
  const ws = XLSX.utils.json_to_sheet(data, {
    header: keys.map((k) => COLUMN_MAP[k]),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "영수증");
  XLSX.writeFile(wb, "영수증정리.xlsx");
}
