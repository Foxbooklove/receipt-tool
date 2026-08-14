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

export async function saveRows(rows: Receipt[]) {
  if (!supabase) throw new Error("Supabase 미설정");
  const { error } = await supabase.from("receipts").insert(rows);
  if (error) throw error;
}

// 6단계 지표. GA로는 장당 파싱 시간을 잴 수 없어 따로 남긴다.
export async function logMetric(file_count: number, elapsed_ms: number) {
  if (!supabase) return;
  await supabase.from("parse_metrics").insert({ file_count, elapsed_ms });
}
