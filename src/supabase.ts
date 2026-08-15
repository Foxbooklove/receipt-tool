import { createClient } from "@supabase/supabase-js";
import type { Receipt } from "./parse";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

const BUCKET = "receipts";

// 원본 파일명은 한글·공백이 섞여 Storage 키로 쓰기 나쁘다. 확장자만 살린다.
export async function uploadImage(file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase 미설정");
  const ext = file.name.split(".").pop() || "png";
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, file);
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

// 앱을 열 때 지금까지 쌓인 내역을 전부 불러온다.
// 정산은 몰아서 하지만 영수증은 살 때마다 생기므로, 화면이 누적본을 보여줘야 한다.
export async function loadRows(): Promise<Receipt[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("receipts")
    .select("id,date,merchant,amount,payment_method,category,note,image_path")
    .order("date", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Receipt[];
}

// id 가 있으면 수정, 없으면 추가. 저장 후 새로 받은 id 를 화면에 돌려준다.
export async function saveRows(rows: Receipt[]): Promise<Receipt[]> {
  if (!supabase) throw new Error("Supabase 미설정");

  const updates = rows.filter((r) => r.id != null);
  const inserts = rows.filter((r) => r.id == null);

  for (const r of updates) {
    const { id, ...rest } = r;
    const { error } = await supabase.from("receipts").update(rest).eq("id", id);
    if (error) throw error;
  }

  let added: Receipt[] = [];
  if (inserts.length) {
    const { data, error } = await supabase
      .from("receipts")
      .insert(inserts.map(({ id, ...rest }) => rest))
      .select("id,date,merchant,amount,payment_method,category,note,image_path");
    if (error) throw error;
    added = (data ?? []) as Receipt[];
  }

  // 화면 순서를 유지한 채 새로 받은 id 만 채워 넣는다.
  let k = 0;
  return rows.map((r) => (r.id != null ? r : added[k++] ?? r));
}

export async function deleteRow(id: number) {
  if (!supabase) throw new Error("Supabase 미설정");
  const { error } = await supabase.from("receipts").delete().eq("id", id);
  if (error) throw error;
}

// 6단계 지표. GA로는 장당 파싱 시간을 잴 수 없어 따로 남긴다.
export async function logMetric(file_count: number, elapsed_ms: number) {
  if (!supabase) return;
  await supabase.from("parse_metrics").insert({ file_count, elapsed_ms });
}
