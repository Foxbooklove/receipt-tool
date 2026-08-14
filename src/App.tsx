import { useState } from "react";
import { parseReceipt } from "./parse";
import type { Receipt } from "./parse";
import { downloadExcel } from "./excel";
import { configured, uploadImage, saveRows, logMetric } from "./supabase";

const FIELDS = [
  ["date", "일자"],
  ["merchant", "사용처"],
  ["amount", "금액"],
  ["payment_method", "결제수단"],
  ["category", "분류"],
  ["note", "비고"],
] as const;

const DEFAULT_URL = "http://localhost:11434";

export default function App() {
  // 터널 URL은 빌드에 굽지 않는다. quick tunnel 주소가 매번 바뀌기 때문이다.
  const [ollamaUrl, setOllamaUrl] = useState(
    () => localStorage.getItem("ollama_url") || DEFAULT_URL
  );
  const [rows, setRows] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  function setUrl(v: string) {
    setOllamaUrl(v);
    localStorage.setItem("ollama_url", v);
  }

  function edit(i: number, k: keyof Receipt, v: string) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [k]: k === "amount" ? Number(v.replace(/[^\d-]/g, "")) || 0 : v };
      return next;
    });
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setBusy(true);
    setTotal(files.length);
    setDone(0);
    setElapsed(null);
    setMsg("");

    const t0 = performance.now();
    const out: Receipt[] = [];

    // VRAM 12GB에서 동시 추론은 실패하거나 느려진다. 반드시 순차로 돈다.
    for (const f of files) {
      try {
        const r = await parseReceipt(f, ollamaUrl);
        // 이미지 업로드가 실패해도 파싱 결과는 버리지 않는다.
        try {
          r.image_path = await uploadImage(f);
        } catch {
          r.image_path = f.name;
        }
        out.push(r);
      } catch (err) {
        out.push({
          date: "", merchant: "", amount: 0, payment_method: "", category: "",
          note: `파싱 실패 — ${String(err).slice(0, 60)}`,
          image_path: f.name,
        });
      }
      setDone(out.length);
      setRows([...out]);
    }

    const ms = Math.round(performance.now() - t0);
    setElapsed(ms);
    setBusy(false);
    logMetric(files.length, ms).catch(() => {});
  }

  async function onSave() {
    try {
      await saveRows(rows);
      setMsg(`Supabase에 ${rows.length}건 저장했습니다.`);
    } catch (err) {
      setMsg(`저장 실패 — ${String(err).slice(0, 100)}`);
    }
  }

  const failed = rows.filter((r) => r.note.startsWith("파싱 실패")).length;

  return (
    <main>
      <h1>연구비 영수증 정리</h1>
      <p className="sub">
        쿠팡 거래명세표·카드 매출전표를 한 번에 올리면 항목을 뽑아 정산용 엑셀로 만듭니다.
        파싱은 로컬 PC에서 이루어지며 이미지가 외부 AI 서비스로 나가지 않습니다.
      </p>

      <section className="panel">
        <label htmlFor="ollama">파싱 서버 주소</label>
        <input
          id="ollama"
          value={ollamaUrl}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://....trycloudflare.com"
        />
        <small>
          로컬 실행 시 {DEFAULT_URL} 그대로 둡니다. 배포본에서는 Cloudflare Tunnel 주소를 붙여넣습니다.
        </small>
      </section>

      <section className="panel">
        <input type="file" accept="image/*" multiple disabled={busy} onChange={onFiles} />
        {busy && (
          <>
            <progress value={done} max={total} />
            <span className="progress-text">
              {done} / {total} 처리 중…
            </span>
          </>
        )}
        {elapsed !== null && !busy && (
          <p className="metric">
            {rows.length}건 · {(elapsed / 1000).toFixed(1)}초 · 장당 평균{" "}
            {(elapsed / 1000 / Math.max(rows.length, 1)).toFixed(1)}초
            {failed > 0 && <span className="warn"> · 실패 {failed}건</span>}
          </p>
        )}
      </section>

      {rows.length > 0 && (
        <>
          <p className="hint">틀린 칸만 고치세요. 자동 확정하지 않습니다.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  {FIELDS.map(([, label]) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="idx">{i + 1}</td>
                    {FIELDS.map(([k]) => (
                      <td key={k}>
                        <input
                          value={String(r[k])}
                          onChange={(e) => edit(i, k, e.target.value)}
                          className={k === "amount" ? "num" : undefined}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>합계</td>
                  <td className="num total">
                    {rows.reduce((s, r) => s + r.amount, 0).toLocaleString()}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          <section className="actions">
            <button onClick={() => downloadExcel(rows)}>엑셀 다운로드</button>
            <button onClick={onSave} disabled={!configured}>
              Supabase에 저장
            </button>
            {!configured && <small>환경변수가 없어 저장 기능이 꺼져 있습니다.</small>}
            {msg && <span className="msg">{msg}</span>}
          </section>
        </>
      )}
    </main>
  );
}
