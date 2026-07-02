# デプロイ & 収益化開始手順(固定費0円)

月1万円の収益化に必要な公開作業。すべて無料枠で完結する。

## 1. ホスティング(無料枠)
候補(いずれもNode対応・無料枠あり)。性能と安定性のバランスで **Render Free** を推奨。

- Render (Web Service, Free): build `npm install && npm run build`, start `npm start`, Node 22。
- 代替: Railway trial / Fly.io free allowance。

環境変数(Render の Environment に設定):

| 変数 | 値 |
|---|---|
| `AI_PROVIDER` | `mock`(まず0円運用)→ 品質を上げる時 `gemini` |
| `GEMINI_API_KEY` | Google AI Studio で無料発行(無料枠内で運用) |
| `LICENSE_SECRET` | `openssl rand -hex 32` で生成した秘密値 |
| `VITE_UPGRADE_URL` | Stripe Payment Link(下記) ※ビルド時に必要 |

注意: `VITE_UPGRADE_URL` はビルド時に埋め込まれるため、値を変えたら再ビルド(再デプロイ)する。

## 2. Stripe Payment Link(月額¥600のPro)
1. Stripe アカウント作成(無料)。
2. 商品「Context Diff English Pro」/ 継続 ¥600/月 を作成。
3. Payment Link を発行し、`VITE_UPGRADE_URL` に設定。
4. 支払い完了メール(Stripeの自動領収書)に「ライセンスキーはこのメールへの返信で送付します」と案内文を設定(Payment Link の確認ページメッセージでも可)。

## 3. ライセンスキー発行(購入者ごと)
```bash
LICENSE_SECRET=<デプロイと同じ値> node scripts/generate-license.mjs buyer@example.com
```
出力されたキー(`CDE-...`)を購入者にメールで送付。購入者はアプリの「Pro」画面で入力して有効化。

運用メモ: Stripeダッシュボードの通知(メール)を受けたら発行・返信。1日数分の手作業でMVPとして十分。自動化はWebhook対応時に。

## 4. 収益目標の算数
- Pro ¥600/月 × 18人 = ¥10,800(Stripe手数料3.6%控除後 ≈ ¥10,411)→ **目標達成**
- 転換率2–5%想定 ⇒ MAU 400–900 が必要。獲得チャネル: note/X/Qiitaでの「英単語は知ってるのに話せない」向け記事、無料で核心ループが体験できることが最大の導線。

## 5. 公開後チェックリスト
- [ ] `GET /api/scenes` が本番URLで返る
- [ ] 無料で3回改善→4回目に402→アップグレード導線表示
- [ ] 発行したキーで Pro 有効化→無制限
- [ ] APIキー・シークレットがクライアントに露出していない(DevTools確認)
