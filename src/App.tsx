import { useEffect, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { parseReceipt } from "./parse";
import type { Receipt } from "./parse";
import { downloadExcel } from "./excel";
import { configured, loadRows, uploadImage, saveRows, deleteRow, logMetric } from "./supabase";

const FIELDS = [
  ["date", "일자", "col-date"],
  ["merchant", "사용처", ""],
  ["amount", "금액", "col-money num"],
  ["payment_method", "결제수단", "col-pay"],
  ["category", "분류", "col-cat"],
  ["note", "비고", "col-note"],
] as const;

// 사람이 매번 타이핑하지 않도록 목록에서 고른다.
// 측정에서 사람과 도구의 분류가 3건 어긋났는데, 기준이 없어서였다.
const CATEGORIES = ["소모품", "도서", "식비", "장비", "기타"];

const DEFAULT_URL = "http://localhost:11434";

// 같은 영수증을 두 번 올리는 실수를 잡는다. 일자와 금액이 겹치면 의심으로 본다.
function dupKeys(rows: Receipt[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.date}|${r.amount}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

export default function App() {
  // 터널 URL은 빌드에 굽지 않는다. quick tunnel 주소가 띄울 때마다 바뀌기 때문이다.
  const [ollamaUrl, setOllamaUrl] = useState(
    () => localStorage.getItem("ollama_url") || DEFAULT_URL
  );
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [added, setAdded] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [uploadFails, setUploadFails] = useState(0);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [over, setOver] = useState(false);

  // 앱을 열면 지금까지 쌓인 내역을 먼저 보여준다.
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    loadRows()
      .then(setRows)
      .catch((err) => setMsg({ kind: "warn", text: `불러오기 실패 — ${String(err).slice(0, 100)}` }))
      .finally(() => setLoading(false));
  }, []);

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
    setDirty(true);
  }

  async function remove(i: number) {
    const r = rows[i];
    if (!confirm(`${r.date} · ${r.amount.toLocaleString()}원 행을 삭제할까요?`)) return;
    try {
      if (r.id != null) await deleteRow(r.id);
      setRows((prev) => prev.filter((_, k) => k !== i));
      setMsg({ kind: "ok", text: "한 건을 삭제했습니다." });
    } catch (err) {
      setMsg({ kind: "warn", text: `삭제 실패 — ${String(err).slice(0, 100)}` });
    }
  }

  async function run(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setTotal(files.length);
    setDone(0);
    setElapsed(null);
    setAdded(0);
    setUploadFails(0);
    setMsg(null);

    const t0 = performance.now();
    const fresh: Receipt[] = [];

    // VRAM 12GB에서 동시 추론은 실패하거나 느려진다. 반드시 순차로 돈다.
    for (const f of files) {
      try {
        const r = await parseReceipt(f, ollamaUrl);
        // 업로드가 실패해도 파싱 결과는 버리지 않되, 조용히 넘기지도 않는다.
        try {
          r.image_path = await uploadImage(f);
        } catch (err) {
          r.image_path = f.name;
          setUploadFails((n) => n + 1);
          console.warn("이미지 업로드 실패", f.name, err);
        }
        fresh.push(r);
      } catch (err) {
        fresh.push({
          date: "", merchant: "", amount: 0, payment_method: "", category: "",
          note: `파싱 실패 — ${String(err).slice(0, 60)}`,
          image_path: f.name,
        });
      }
      setDone(fresh.length);
      // 기존 목록을 덮어쓰지 않고 위에 쌓는다.
      setRows((prev) => [...fresh, ...prev.filter((p) => !fresh.includes(p))]);
    }

    const ms = Math.round(performance.now() - t0);
    setElapsed(ms);
    setAdded(fresh.length);
    setDirty(true);
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
      const saved = await saveRows(rows);
      setRows(saved);
      setDirty(false);
      setMsg({ kind: "ok", text: `${saved.length}건을 저장했습니다. 다음에 열면 그대로 남아 있습니다.` });
    } catch (err) {
      setMsg({ kind: "warn", text: `저장 실패 — ${String(err).slice(0, 120)}` });
    }
  }

  const failed = rows.filter((r) => r.note.startsWith("파싱 실패")).length;
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const dups = dupKeys(rows);
  const unsaved = rows.filter((r) => r.id == null).length;

  return (
    <div className="app">
      <header className="head">
        <div className="badge">로컬 처리 · 이미지가 외부로 나가지 않습니다</div>
        <h1>연구비 영수증 정리</h1>
        <p>
          영수증이 생길 때마다 올려두면 목록에 쌓이고, 정산할 때 한 번에 엑셀로 받습니다.
          파싱은 연구실 PC의 로컬 모델이 수행하므로 결제 정보가 외부 AI 서비스로 전송되지 않습니다.
        </p>
      </header>

      <label
        className={`drop${over ? " over" : ""}${busy ? " busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept="image/*" multiple disabled={busy} onChange={onPick} />
        <strong>{busy ? "처리 중입니다" : "영수증 이미지를 끌어다 놓거나 클릭해서 선택"}</strong>
        <span>여러 장 한꺼번에 가능 · 올린 내역은 목록에 계속 쌓입니다</span>
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

      {elapsed !== null && !busy && added > 0 && (
        <dl className="stats">
          <div className="stat">
            <dt>이번에 추가</dt>
            <dd>{added}<small>건</small></dd>
          </div>
          <div className="stat">
            <dt>전체 누적</dt>
            <dd>{rows.length}<small>건</small></dd>
          </div>
          <div className="stat">
            <dt>소요 시간</dt>
            <dd>{(elapsed / 1000).toFixed(1)}<small>초</small></dd>
          </div>
          <div className="stat">
            <dt>장당 평균</dt>
            <dd>{(elapsed / 1000 / added).toFixed(1)}<small>초</small></dd>
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
      {dups.size > 0 && (
        <div className="note warn">
          일자와 금액이 같은 행이 있습니다. 같은 영수증을 두 번 올렸는지 확인하세요.
        </div>
      )}
      {msg && <div className={`note ${msg.kind}`}>{msg.text}</div>}

      {loading ? (
        <p className="hint">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="hint">아직 등록한 영수증이 없습니다. 위에 이미지를 올려 시작하세요.</p>
      ) : (
        <>
          <div className="section-head">
            <h2>
              등록된 영수증 <span className="count">{rows.length}건</span>
            </h2>
            <p>
              {dirty
                ? `저장하지 않은 변경이 있습니다${unsaved ? ` (새 항목 ${unsaved}건)` : ""}`
                : "모든 변경이 저장되었습니다"}
            </p>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `new-${i}`}
                      className={dups.has(`${r.date}|${r.amount}`) ? "dup" : undefined}>
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
                        {k === "category" ? (
                          <select value={r.category} onChange={(e) => edit(i, k, e.target.value)}>
                            <option value="">—</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            {r.category && !CATEGORIES.includes(r.category) && (
                              <option value={r.category}>{r.category}</option>
                            )}
                          </select>
                        ) : (
                          <input
                            value={String(r[k])}
                            onChange={(e) => edit(i, k, e.target.value)}
                            className={k === "amount" ? "num" : undefined}
                            placeholder={k === "payment_method" ? "명세표에는 없음" : undefined}
                          />
                        )}
                      </td>
                    ))}
                    <td className="del">
                      <button className="icon" onClick={() => remove(i)} title="이 행 삭제">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>합계 {rows.length}건</td>
                  <td className="total">{sum.toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="actions">
            <button className="primary" onClick={onSave} disabled={!configured || !dirty}>
              {dirty ? "변경 사항 저장" : "저장됨"}
            </button>
            <button className="secondary" onClick={() => downloadExcel(rows)}>
              엑셀 다운로드 ({rows.length}건)
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
