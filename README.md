# YOSHI RIDE v1.2

個人用ロードバイクPWA。20周年アプリ / KENJI MODEとは完全に別のGitHub Pagesアプリとして動きます。

## 入っている機能
- 最初の画面に現在地中心のCyclOSM地図を常時表示
- 地図タップで目的地を指定
- ジャンル別の周辺スポット検索（カフェ・パン / グルメ / コンビニ / 温泉 / 景色・公園 / 駅 / 自転車店）
- 検索範囲 3 / 5 / 10 / 20 km
- 現在地 → 目的地のロードバイクルート
- 距離 / 目安時間 / 獲得標高 / 最大斜度
- 標高グラフ、上り区間一覧、地図上の斜度色分け
- ルートモード
  - バランス
  - サイクリングロード優先
  - 坂トレ優先（3段階）
- 実走GPS記録
  - 距離 / 時間 / 速度 / 最大速度 / 獲得標高（GPS概算）
  - 走った軌跡を端末に保存
- 走行履歴
- GPX書き出し
- 全記録JSONバックアップ / 復元
- PWAホーム画面追加
- 走行中のScreen Wake Lock

## ルートモードの仕組み
OpenRouteServiceの `cycling-road` を利用します。

- サイクリングロード優先: 最大3候補を取り、OSMの `highway=cycleway` と判定される区間の比率を重視して選択します。
- 坂トレ: `steepness_difficulty` を指定し、候補の獲得標高・最大斜度・上り区間を比較して強いルートを選択します。
- OpenRouteServiceの代替ルートは100km制限があるため、このアプリでは直線距離65km以上では候補比較を使わず単一ルートにフォールバックします。

※ OSM側の道路タグが未整備の場所では「サイクリングロード優先」の精度が下がります。

## 周辺スポット検索
OpenStreetMapのPOIデータをOverpass APIで検索します。検索はSupabase Edge Function `cycle-route` を経由し、ブラウザからOverpass APIへ直接アクセスしません。個人利用向けの軽量検索として、最大40件を距離順に表示します。

## 走行記録の保存
v1.1ではブラウザの IndexedDB に保存します。個人用として、サーバーへGPS軌跡を送らない設計です。

- 同じ端末・同じブラウザ/PWAなら残ります。
- 機種変更に備え、LOG画面の「記録をバックアップ」を使用してください。
- GPXは個別走行ごとに出力できます。

## セットアップ
### 1. Supabase Edge Function
既存のSupabaseプロジェクトに、別Functionとして作成します。

Function name:
`cycle-route`

ZIP内:
`supabase/functions/cycle-route/index.ts`

をEditorに貼ってDeployしてください。v1.0から更新する場合も、同じ `cycle-route` のコードをv1.1版に差し替えて再Deployします。

`Settings > Verify JWT with legacy secret` は **OFF**。

既にKENJI MODE用に `ORS_API_KEY` をSecretsへ登録済みなら、追加Secretは不要です。

### 2. GitHub Pages
新しいリポジトリ（例: `yoshi-ride`）を作り、このZIPの中身をルートへアップロードします。

`Settings > Pages > Deploy from a branch > main / root`

公開後の例:
`https://yoshiokayuta2-lgtm.github.io/yoshi-ride/`

### 3. スマホ
Safari / Chromeで開き、ホーム画面に追加するとPWAとして使えます。

## 重要な制約
WebアプリのGPSは、OSがブラウザ/PWAをバックグラウンド停止すると記録が止まることがあります。走行中は「画面常時ON」を利用し、アプリを前面で開いた状態を推奨します。

安全上、表示ルートより現地の標識・通行規制・道路状況を優先してください。


## v1.2 周辺検索の改善
- Overpass APIを3系統でフォールバック。
- 0件時は around（円検索）からbbox（矩形検索）へ自動再検索。
- 駅は railway=station/halt に加え public_transport=station / building=train_station も検索。
- name必須条件を廃止し、brand/operator/refからも名称を補完。
- 検索上限を60件、最大半径を30kmへ拡張。

- v1.2 final: 現在地から2km以内はOpenRouteService POI APIを優先し、広域はOverpassで補完する二重検索に変更。


## v1.3
- MY HOME: 現在地または地図タップで自宅を登録。座標はブラウザのlocalStorageだけに保存し、Supabaseへは保存しません。
- TIME PLAN: 片道30/45/60/90/120分 × 娯楽/トレーニングで周囲6方向を比較し、3コースを提案。
- 娯楽: 予定時間への近さ、cycleway比率、舗装率、登りすぎないことを重視。
- トレーニング: 予定時間への近さ、獲得標高、最大斜度、まとまった上りを重視。
- ROUTEで計算したルートは自動でRIDEへ反映し、端末内にアクティブルートとして保持。
- RIDEを簡易サイコン化: 現在速度、平均速度、距離、時間、獲得標高、最大速度、残距離、到着予想、この先約150mの斜度、次の上り、ルート離脱距離を表示。
- GPSログと自宅・アクティブルートは個人端末内に保存。

### v1.3 更新時
GitHub Pages側の全ファイルを上書きし、Supabase Edge Function `cycle-route` の `index.ts` も v1.3 に再Deployしてください。`ORS_API_KEY` は既存Secretをそのまま使い、Verify JWTはOFFのままです。


## v1.4
- YOSHI + FELT F85の挿絵をアプリUIへ追加。
- RIDE地図のワールド表示を修正。表示後にLeafletを再計算し、ルートまたは現在地へ確実にフィットします。
- 今回はフロント側のみの更新で、Supabase再デプロイは不要です。
