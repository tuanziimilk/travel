# About 璐ㄩ噺璇勪及宸ュ叿锛坅bout-quality-demo锛?
涓€涓熀浜?Monorepo 鐨?AI 璐ㄦ绯荤粺锛屾敮鎸侊細

- 鎵嬪姩璇勪及锛坄/manual`锛?- 鎵归噺涓婁紶寮傛璇勪及锛坄/upload`锛?- 鍘嗗彶鎵规鏌ヨ涓庡鍑猴紙`/history`锛?- 璇勪及鐪嬫澘锛坄/analytics`锛?
---

## 1. 椤圭洰缁撴瀯

```txt
SC-quality-scoring/
  apps/
    api/                 # Express + tRPC + Drizzle + MySQL
    web/                 # React + Vite 鍓嶇
  packages/
    trpc/                # 鍓嶅悗绔叡浜?schema
  .env.example
  pm2.ecosystem.config.cjs
  package.json
```

---

## 2. 杩愯鐜瑕佹眰

- Node: `22.22.0`锛堝繀椤伙紝椤圭洰鏈?engines 闄愬埗锛?- Yarn: `1.22.22`
- MySQL: `8.x`
- OS: Windows / Linux 鍧囧彲

> 濡傛灉 `yarn` 鎶?`engine incompatible`锛屼紭鍏堟鏌?Node 鐗堟湰鏄惁鏄?`22.22.0`銆?
---

## 3. 鐜鍙橀噺

澶嶅埗 `.env.example` 涓?`.env`锛?
```bash
cp .env.example .env
```

涓昏鍙橀噺璇存槑锛?
- `DATABASE_URL`: MySQL 杩炴帴涓诧紙蹇呭～锛?- `API_PORT`: API 绔彛锛岄粯璁?`3001`
- `WEB_ORIGIN`: 鍓嶇鏉ユ簮鍦板潃锛岄粯璁?`http://localhost:5173`
- `AI_BASE_URL`: 澶фā鍨嬬綉鍏冲湴鍧€
- `AI_API_KEY`: 澶фā鍨嬪瘑閽ワ紙蹇呭～锛?- `AI_MODEL`: 妯″瀷鍚嶏紙濡?`gpt-5-mini`锛?- `AI_PROMPT_VERSION`: Prompt 鐗堟湰鍙?- `AI_INPUT_COST_PER_1M` / `AI_OUTPUT_COST_PER_1M`: 璐圭敤浼扮畻鍙傛暟
- `ABOUT_SKILL_PATH`: About 璇勫垎瑙勫垯鐩綍锛堥粯璁?`skills/about-quality-scoring`锛?- `FAQ_SKILL_PATH`: FAQ 璇勫垎瑙勫垯鐩綍锛堥粯璁?`skills/faq-quality-scoring`锛?- `SNAPSHOT_ENABLED`: 鏄惁淇濆瓨蹇収
- `INGEST_ROW_CONCURRENCY`: 鎵归噺浠诲姟鍐呭苟鍙戯紙褰撳墠寤鸿 `10`锛?- `INGEST_PROGRESS_FLUSH_MS`: 杩涘害鍐欏簱鑺傛祦姣锛堝缓璁?`1000`锛?
---

## 4. 瀹夎涓庢湰鍦板惎鍔?
```bash
yarn install
yarn dev
```

榛樿鍦板潃锛?
- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

---

## 5. 鏁版嵁搴撳垵濮嬪寲

### 5.1 棣栨鍒濆鍖?
```bash
yarn workspace @about-demo/api db:generate
yarn workspace @about-demo/api db:migrate
```

### 5.2 鍏煎鍘嗗彶搴撹鏄?
鏈嶅姟绔凡鍋氳繍琛屾椂鑷姩琛ュ垪锛堜緥濡?`upload_batches.note/source`銆乣about_score_rows.term_name` 绛夛級銆?
鍗充娇鏄棫搴擄紝涔熶細鍦ㄨ鍐欐椂鑷姩灏濊瘯 `ALTER TABLE` 琛ラ綈瀛楁銆?
---

## 6. 鏋勫缓涓庨儴缃?
### 6.1 鏋勫缓

```bash
yarn build
```

### 6.2 鍚姩 API锛圥M2锛?
```bash
yarn start
```

PM2 閰嶇疆鏂囦欢锛歚pm2.ecosystem.config.cjs`

> 褰撳墠浠撳簱鐨?PM2 浠呮墭绠?API銆俉eb 鐢变綘鑷繁閫夋嫨闈欐€侀儴缃叉柟寮忥紙Nginx銆乂ercel銆丯etlify 绛夛級銆?
---

## 7. Web 涓?API 鑱旈€氶厤缃紙閲嶈锛?
褰撳墠鍓嶇 `tRPC` 鍦板潃鍦ㄤ唬鐮佷腑鍐欐涓猴細

- `apps/web/src/lib/trpc.ts` -> `http://localhost:3001/trpc`

鐢熶骇閮ㄧ讲鏃惰鏀逛负浣犵殑瀹為檯 API 鍩熷悕锛堟垨鎸変綘鐨勭綉鍏崇瓥鐣ユ敼閫犱负鐜鍙橀噺锛夈€?
---

## 8. 褰撳墠鎵归噺浠诲姟鎵ц妯″瀷

- 浠诲姟闂达細涓茶锛堥槦鍒椾竴娆″彧璺戜竴涓壒娆★級
- 浠诲姟鍐咃細骞惰锛堟寜 `INGEST_ROW_CONCURRENCY`锛?
骞跺彂璋冧紭寤鸿锛?
- 璧峰鍊?`10`
- 鑻ユā鍨嬬綉鍏抽檺娴佹槑鏄撅紝闄嶅埌 `6~8`
- 鑻ョ綉鍏崇ǔ瀹氬彲鎵垮彈锛屽啀閫愭涓婅皟

---

## 9. 瀵煎嚭鑳藉姏璇存槑

鎵归噺涓庡巻鍙查〉鍧囨敮鎸?xlsx 瀵煎嚭锛屽綋鍓嶅寘鍚?3 涓?sheet锛?
1. `缁撴灉鏄庣粏`
2. `缁撴灉缁熻`锛堜腑鏂囷級
3. `鍙彂甯傾bout`锛堝浐瀹氭ā鏉匡級

鍏朵腑 `鍙彂甯傾bout`锛?
- 浠呰緭鍑衡€滆瘎浼版垚鍔熶笖鍙彂甯冣€濈殑琛?- `Source` 鍥哄畾涓?`AI`
- `鏉垮潡鍚嶇О` 鍥哄畾涓?`About`
- `鏄惁鍙彂甯僠 鍙ｅ緞锛歚AI鎬诲垎 >= 8` 鎴?`OP鎬诲垎 >= 8`

---

## 10. 甯歌闂鎺掓煡

### Q1: 鍘嗗彶椤垫樉绀?0 鏉★紝浣嗗簱閲屾湁鏁版嵁

- 鍏堢湅 API 鏃ュ織鏄惁鏈?SQL 閿欒
- 璁块棶 `/health` 纭 API 姝ｅ父
- 纭 `DATABASE_URL` 鏄惁杩炲埌姝ｇ‘搴?
### Q2: `yarn test` 鏃犳硶杩愯锛屾彁绀?Node 鐗堟湰涓嶅吋瀹?
- 鍒囨崲鍒?Node `22.22.0`

### Q3: 涓婁紶浠诲姟鑰楁椂娉㈠姩澶?
- 妯″瀷鏈嶅姟鏈韩鏈夋姈鍔紝灞炰簬甯歌鐜拌薄
- 鍏堣瀵?`Token/璐圭敤/鑰楁椂`锛屽啀璋冩暣 `INGEST_ROW_CONCURRENCY`

---

## 11. 甯哥敤鍛戒护

```bash
# 鏈湴寮€鍙?yarn dev

# 绫诲瀷妫€鏌?yarn typecheck

# 杩愯娴嬭瘯
yarn test

# 鏋勫缓
yarn build

# 鍚姩 API锛圥M2锛?yarn start
```

---

## 12. 璺敱閫熻

- `/manual`锛氭墜鍔ㄨ瘎浼?- `/upload`锛氭壒閲忎笂浼犱笌浠诲姟闃熷垪
- `/history`锛氬巻鍙叉壒娆′笌瀵煎嚭
- `/analytics`锛氱粺璁＄湅鏉?
