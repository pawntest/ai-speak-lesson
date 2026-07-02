/**
 * ProScreen — understated pricing + license activation (D8).
 */
import { useState } from "react";
import { activateLicense, storeLicenseKey } from "../api";

interface ProScreenProps {
  licensed: boolean;
  onLicensed(): void;
  onBack(): void;
}

export default function ProScreen({ licensed, onLicensed, onBack }: ProScreenProps) {
  const upgradeUrl = import.meta.env.VITE_UPGRADE_URL;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleActivate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await activateLicense(trimmed);
      if (result.valid) {
        storeLicenseKey(trimmed);
        onLicensed();
        setMessage(null);
      } else {
        setMessage("このキーは確認できませんでした。入力をもう一度お確かめください。");
      }
    } catch {
      setMessage("いまはキーを確認できませんでした。少し待ってからもう一度どうぞ。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen pro-screen">
      <header className="flow-top">
        <button type="button" className="ghost-btn" onClick={onBack}>
          ← もどる
        </button>
      </header>

      {licensed ? (
        <div className="pro-card pro-active">
          <span className="pro-badge">Pro</span>
          <h1 className="pro-title">Proが有効です</h1>
          <p className="pro-line">コーチもカードも、無制限に。よい練習を。</p>
        </div>
      ) : (
        <>
          <div className="pro-card">
            <span className="pro-badge">Pro</span>
            <h1 className="pro-title">
              ¥600<span className="pro-per">/月</span>
            </h1>
            <ul className="pro-perks">
              <li>コーチ回数 無制限（無料は1日3回）</li>
              <li>カード保存 無制限（無料は10枚）</li>
              <li>新しいシーンを先行利用</li>
            </ul>
            {upgradeUrl ? (
              <a className="primary-btn upsell-cta" href={upgradeUrl} target="_blank" rel="noreferrer">
                Proにアップグレード
              </a>
            ) : (
              <button type="button" className="primary-btn upsell-cta" disabled>
                アップグレード準備中
              </button>
            )}
          </div>

          <div className="pro-license">
            <h2 className="section-title">ライセンスキーをお持ちの方</h2>
            <form className="license-form" onSubmit={handleActivate}>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="購入時に届いたキー"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={busy}
              />
              <button type="submit" className="say-submit" disabled={busy || !key.trim()}>
                有効化
              </button>
            </form>
            {message && <p className="soft-hint">{message}</p>}
          </div>
        </>
      )}
    </div>
  );
}
