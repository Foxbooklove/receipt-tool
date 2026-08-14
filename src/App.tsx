import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { parseReceipt } from "./parse";
import type { Receipt } from "./parse";
import { downloadExcel } from "./excel";
import { configured, uploadImage, saveRows, logMetric } from "./supabase";

const FIELDS = [
  ["date", "일자", "col-date"],
  ["merchant", "사용처", ""],
  ["amount", "금액", "col-money num"],
  ["payment_method", "결제수단", "col-pay"],
  ["category", "분류", "col-cat"],
  ["note", "비고", "col-note"],
] as const;

const DEFAULT_URL = "http://localhost:11434";

export default function App() {
  // 터널 URL은 빌드에 굽지 않는다. quick tunnel 주소가 띄울 때마다 바뀌기 때문이다.
  const [ollamaUrl, setOllamaUrl] = useState(
    () => localStorage.getItem("ollama_url") || DEFAULT_URL
  );
  const [rows, setRows] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [uploadFails, setUploadFails] = useState(0);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function setUrl(v: string) {
    setOllamaUrl(v);
    localStorage.setItem("ollama_url", v);
  }

  function edit(i: number, k: keyof Receipt, v: string) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = {
        ...next[i],
        [k]: k === "amount" ? Number(v.replace(/[^\d-]/g, "")) || 0 : v,
      };
      return next;
    });
  }

  async function run(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setTotal(files.length);
    setDone(0);
    setElapsed(null);
    setUploadFails(0);
    setMsg(null);

    const t0 = performance.now();
    const out: Receipt[] = [];

    // VRAM 12GB에서 동시 추론은 실패하거나 느려진다. 반드시 순차로 돈다.
    for (const f of files) {
      try {
        const r = await parseReceipt(f, ollamaUrl);
        // 업로드가 실패해도 파싱 결과는 버리지 않되, 조용히 넘기지도 않는다.
        // Storage 정책이 없어 전부 실패하는데 화면에 표시가 없어 한참 못 알아챈 적이 있다.
        try {
          r.image_path = await uploadImage(f);
        } catch (err) {
          r.image_path = f.name;
          setUploadFails((n) => n + 1);
          console.warn("이미지 업로드 실패", f.name, err);
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

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    run(files);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    run(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
  }

  async function onSave() {
    try {
      await saveRows(rows);
      setMsg({ kind: "ok", text: `Supabase에 ${rows.length}건 저장했습니다.` });
    } catch (err) {
      setMsg({ kind: "warn", text: `저장 실패 — ${String(err).slice(0, 120)}` });
    }
  }

  const failed = rows.filter((r) => r.note.startsWith("파싱 실패")).length;
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="app">
      <header className="head">
        <div className="badge">로컬 처리 · 이미지가 외부로 나가지 않습니다</div>
        <h1>연구비 영수증 정리</h1>
        <p>
          쿠팡 거래명세표와 카드 매출전표를 한 번에 올리면 일자·사용처·금액을 뽑아
          정산용 엑셀로 만듭니다. 파싱은 연구실 PC의 로컬 모델이 수행하므로 결제 정보가
          외부 AI 서비스로 전송되지 않습니다.
        </p>
      </header>

      <label
        className={`drop${over ? " over" : ""}${busy ? " busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple disabled={busy} onChange={onPick} />
        <strong>{busy ? "처리 중입니다" : "영수증 이미지를 끌어다 놓거나 클릭해서 선택"}</strong>
        <span>PNG · JPG · 여러 장 한꺼번에 가능</span>
      </label>

      {busy && (
        <div className="progress">
          <div className="progress-top">
            <b>파싱 중</b>
            <span>{done} / {total}장 · {pct}%</span>
          </div>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {elapsed !== null && !busy && (
            <dl className="stats">
              <div className="stat">
                <dt>처리 건수</dt>
                <dd>{rows.length}<small>건</small></dd>
              </div>
              <div className="stat">
                <dt>합계 금액</dt>
                <dd>{sum.toLocaleString()}<small>원</small></dd>
              </div>
              <div className="stat">
                <dt>소요 시간</dt>
                <dd>{(elapsed / 1000).toFixed(1)}<small>초</small></dd>
              </div>
              <div className="stat">
                <dt>장당 평균</dt>
                <dd>{(elapsed / 1000 / rows.length).toFixed(1)}<small>초</small></dd>
              </div>
            </dl>
          )}

          {failed > 0 && (
            <div className="note warn">
              {failed}건이 파싱에 실패했습니다. 파싱 서버 주소가 맞는지 확인하고, 해당 행은 직접 입력하세요.
            </div>
          )}
          {uploadFails > 0 && (
            <div className="note warn">
              이미지 업로드 {uploadFails}건 실패 — Storage 정책이 없을 수 있습니다.
              storage-policy.sql을 Supabase SQL Editor에서 실행하세요. 파싱 결과 자체는 정상입니다.
            </div>
          )}
          {msg && <div className={`note ${msg.kind}`}>{msg.text}</div>}

          <div className="section-head">
            <h2>검토</h2>
            <p>자동 확정하지 않습니다. 틀린 칸만 고치세요.</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th />
                  {FIELDS.map(([, label, cls]) => (
                    <th key={label} className={cls || undefined}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="idx">{i + 1}</td>
                    <td className="thumb">
                      {r.image_path.startsWith("http") ? (
                        <a href={r.image_path} target="_blank" rel="noreferrer" title="원본 보기">
                          <img src={r.image_path} alt="" />
                        </a>
                      ) : (
                        <span className="none">—</span>
                      )}
                    </td>
                    {FIELDS.map(([k]) => (
                      <td key={k}>
                        <input
                          value={String(r[k])}
                          onChange={(e) => edit(i, k, e.target.value)}
                          className={k === "amount" ? "num" : undefined}
                          placeholder={k === "payment_method" ? "명세표에는 없음" : undefined}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>합계 {rows.length}건</td>
                  <td className="total">{sum.toLocaleString()}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="actions">
            <button className="primary" onClick={() => downloadExcel(rows)}>
              엑셀 다운로드
            </button>
            <button className="secondary" onClick={onSave} disabled={!configured}>
              Supabase에 저장
            </button>
            {!configured && <small>환경변수가 없어 저장이 꺼져 있습니다.</small>}
          </div>
        </>
      )}

      <details className="settings">
        <summary>파싱 서버 설정</summary>
        <div className="settings-body">
          <label htmlFor="ollama">Ollama 주소</label>
          <input
            id="ollama"
            value={ollamaUrl}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://....trycloudflare.com"
          />
          <small>
            연구실 PC에서 직접 실행할 때는 <code>{DEFAULT_URL}</code> 그대로 둡니다.
            배포된 주소에서 쓸 때는 Cloudflare Tunnel 주소를 붙여넣습니다.
            이 값은 브라우저에만 저장되며 서버로 전송되지 않습니다.
          </small>
        </div>
      </details>

      <footer className="foot">
        Qwen2.5-VL 7B · 로컬 추론 · 파싱 결과는 검토 후 확정합니다.
      </footer>
    </div>
  );
}
