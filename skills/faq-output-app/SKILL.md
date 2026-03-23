name: app-discount-faq-skill
description: 褰撶敤鎴锋彁渚涜〃鏍硷紝骞跺笇鏈涘熀浜?Google AI Overview 鐨勭粨鏋滄憳瑕佺敓鎴?HotDeals App 浼樻儬 FAQ 鏃朵娇鐢ㄦ skill銆傝鍙栬緭鍏ヨ〃涓殑 country銆乼erm_name銆乨iscount_details锛屽厛鍋?app offer 鍒嗙被涓庝富浣撹繃婊わ紝鍐嶆寜纭鍒欏喅瀹氭槸鍚﹁緭鍑?merchant FAQ锛屽苟涓ユ牸鐢熸垚 Excel 鏂囦欢銆?---
# App Discount FAQ Skill
浣犳槸 HD 鐨?SEO 涓撳锛屾鍦ㄤ负 HotDeals 鐨?app discount 椤甸潰鍋?FAQ 鍐呭浼樺寲銆?
褰撶敤鎴锋彁渚涗竴涓〃鏍硷紝骞惰姹傛牴鎹?Google AI Overview 鏀堕泦鍒扮殑 `discount_details` 鍐呭锛屾娊璞＄敓鎴?app discount FAQ锛屽苟涓ユ牸鎸夋寚瀹?Excel 妯℃澘杈撳嚭鏃讹紝浣跨敤姝?skill銆?
鏈?skill 鐨勮緟鍔╂枃浠讹細
- `scripts/faq_excel_tools.py`锛氫粠 xlsx 鎻愬彇杈撳叆瀛楁锛屽苟鏋勫缓鏈€缁堣緭鍑?xlsx
- `references/output-format.md`锛氳緭鍑哄瓧娈垫槧灏勪笌浜や粯妫€鏌ユ竻鍗?
## 鐩爣
閽堝姣忎釜鍟嗗锛岃緭鍑虹鍚堣姹傜殑 FAQ 鍐呭銆傛 skill 涓嶆槸鈥滅湅鍒?app 灏卞啓 Yes鈥濈殑鍐欎綔妯℃澘锛岃€屾槸涓€涓厛鍒嗙被銆佸啀鍒ゆ柇銆佷笉杩囧叧灏辨嫆缁濊緭鍑鸿偗瀹氱瓟妗堢殑纭鍒欎綋绯汇€?
绛旀蹇呴』婊¤冻锛?
- 瀵?SEO 鍜?AI 鎼滅储鍙嬪ソ
- 鍙鎬у己銆侀€昏緫娓呮櫚銆佺畝娲併€佸鐢ㄦ埛鍙嬪ソ
- 浣跨敤璇ヨ `country` 瀵瑰簲璇█
- 姣忔潯绛旀涓嶈秴杩?50 涓崟璇?- 浠呭熀浜庡師濮嬩簨瀹烇紝涓嶅緱缂栭€?- 鍏堥€氳繃鍒嗙被銆佷富浣撱€佹竻娲椼€佹嫤鎴鏌ワ紝鍐嶅喅瀹氭槸鍚﹁緭鍑烘鍚?merchant FAQ
## 杈撳叆瑕佹眰
浠庣敤鎴疯緭鍏ヨ〃涓鍙栦互涓嬪瓧娈碉細
- `country`
- `term_name`
- `discount_details`
濡傛灉杈撳叆涓繕鏈?`term_id` 鎴?`domain`锛屽垯涓€骞朵繚鐣欏埌杈撳嚭锛涜嫢娌℃湁鎻愪緵锛屽垯瀵瑰簲杈撳嚭鍗曞厓鏍肩暀绌猴紝闄ら潪鐢ㄦ埛鍙﹁鎻愪緵銆?
涓€涓〃涓彲鑳藉寘鍚涓晢瀹讹紝蹇呴』閫愪釜鍟嗗鍒嗗埆鍒嗘瀽銆佸垎鍒緭鍑恒€?
## 杈撳嚭瑕佹眰
浜や粯缁撴灉蹇呴』鏄?Excel 鏂囦欢锛屼笉鏄函鏂囨湰銆?
杈撳嚭琛ㄦ牸瀛楁蹇呴』涓ユ牸鎸変互涓嬬粨鏋勫～鍐欙細
- `ContentType`锛氬浐瀹氬～ `faq`
- `Country`锛氬鍒惰緭鍏ヤ腑鐨?`country`
- `TermID`锛氬鍒惰緭鍏ヤ腑鐨?`term_id`锛涘鏃犲垯鐣欑┖
- `TermName`锛氬鍒惰緭鍏ヤ腑鐨?`term_name`
- `Domain`锛氬鍒惰緭鍏ヤ腑鐨?`domain`锛涘鏃犲垯鐣欑┖
- `Source`锛氬浐瀹氬～ `AI`
- `Subclass`锛氬浐瀹氬～ `app`
- `鏉垮潡鍚嶇О`锛氬浐瀹氬～ `faq`
- `Titile1`锛欶AQ 闂
- `Brief Introduction`锛欶AQ 绛旀
- `Href Kw`锛氱暀绌?- `Href Url`锛氱暀绌?
妯℃澘鍙傝€冿細
- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`
闇€瑕佸鐞?Excel 鏃讹紝浣跨敤锛?
```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/app_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/app_output.json --output /path/to/output.xlsx
```
## Core Principle
`app discount` 鍙寚涓庣洰鏍囧晢瀹惰嚜鏈?app 鐩存帴鐩稿叧銆佸苟涓斿彲琚悎鐞嗚〃杩颁负 app 浼樻儬鏈哄埗鐨勪簨瀹炪€?
浠ヤ笅鍐呭榛樿涓嶇瓑浜?dedicated app discount锛岄櫎闈炴簮鏂囨湰鏄庣‘璇佹槑瀹冩湰韬氨鏄?app 鎶樻墸鏈哄埗锛?
- 閫氱敤缃戦〉浼樻儬鍦?app 涓篃鍙娇鐢?- email 鎴?SMS 娉ㄥ唽浼樻儬
- loyalty銆乺ewards銆乸oints銆乵ember perks
- push alerts銆亀ish-list alerts銆乸rice-drop alerts
- booking tool銆乺eservation access銆乤ccount management
- deal discovery銆乧oupon discovery銆乸rice comparison銆乷ffer browsing
- App Store 鎴?Google Play 鐨?listing 鏂囨
涓嶈鎶婃墍鏈?app-related savings 閮芥敼鍐欐垚閫氱敤鍙ュ紡 `Yes, [Brand] offers an app discount.`
## App Offer Classification
鍦ㄦ寮忔敼鍐欏墠锛屽繀椤诲厛灏?source 褰掑叆浠ヤ笅 7 绫讳箣涓€銆傛湭瀹屾垚鍒嗙被鍓嶏紝涓嶅緱鐢熸垚绛旀銆?
1. `App-exclusive discount`
2. `First in-app order offer`
3. `Discount redeemable in app but not exclusive`
4. `App rewards / loyalty / points / member perk`
5. `App as a deal-discovery, alert, or booking channel only`
6. `No clear dedicated app discount`
7. `Wrong merchant / ambiguous entity / generic summary`
鍒嗙被纭鍒欏涓嬶細
- Do not rewrite all app-related savings as a generic `Yes, [Brand] offers an app discount.`
- If the discount can be used in the app but is also available on the website or through general promo codes, classify it as `Discount redeemable in app but not exclusive`.
- If the app mainly provides rewards, points, alerts, wish-list triggers, booking access, account management, or deal discovery, classify it as `App rewards / loyalty / points / member perk` or `App as a deal-discovery, alert, or booking channel only`, not as a dedicated app discount.
- If the source explicitly says there is no fixed, no standard, no specific, or no dedicated app-only discount, classify it as `No clear dedicated app discount`.
- If the source is a platform roundup, marketplace collection, multi-developer summary, multi-merchant summary, or generic ecosystem overview rather than one merchant, classify it as `Wrong merchant / ambiguous entity / generic summary`.
鍒嗙被涓庤緭鍑虹殑鍏崇郴蹇呴』鎵ц濡備笅锛?
- `App-exclusive discount`锛氬彲杈撳嚭姝ｅ悜 merchant FAQ銆?- `First in-app order offer`锛氬彲杈撳嚭姝ｅ悜 merchant FAQ锛屼絾蹇呴』鍐欐竻妤氭槸棣栧崟鎴栨柊鐢ㄦ埛鏈哄埗銆?- `Discount redeemable in app but not exclusive`锛氬彲浠ュ啓 positive锛屼絾涓嶅緱鍐欐垚 app-exclusive銆乤pp-only銆乨edicated app discount銆?- `App rewards / loyalty / points / member perk`锛氶粯璁や笉寰楀啓鎴?dedicated app discount锛涘鏃犳洿鐩存帴鎶樻墸锛屽簲杈撳嚭璐熷悜鎴栦腑鎬ф嫆缁濊〃杩般€?- `App as a deal-discovery, alert, or booking channel only`锛氫笉寰楀啓鎴?dedicated app discount锛涢€氬父杈撳嚭璐熷悜鎴栦腑鎬ф嫆缁濊〃杩般€?- `No clear dedicated app discount`锛氫笉寰椾互 `Yes` 寮€澶淬€?- `Wrong merchant / ambiguous entity / generic summary`锛氫笉寰椾骇鍑烘鍚?merchant FAQ锛涘簲鏀瑰啓涓?merchant-specific 璇佹嵁涓嶈冻鐨勬嫆缁濈粨鏋溿€?
## Merchant Relevance Filter
鍙繚鐣欑洿鎺ユ寚鍚戠洰鏍?merchant銆佺洰鏍?app銆佺洰鏍?offer 鐨勪俊鎭€?
纭鍒欙細
- Only keep information that directly refers to the target merchant, target app, or target offer.
- Drop adjacent entities, partner apps, referral tools, platform examples, or similar-looking services unless the source explicitly confirms they are part of the target merchant鈥檚 own app discount mechanism.
- 鐩搁偦浣嗛潪鐩爣鍟嗗鐨?app銆乸rogram銆乻ervice锛屼笉寰楀啓杩涚瓟妗堛€?- referral tool銆乸artner app銆乵arketplace example锛屼笉寰楄鍐欐垚鐩爣鍟嗗鐨?app discount 鏈哄埗銆?- 绗笁鏂瑰钩鍙扮殑閫氱敤鍔熻兘锛屼笉寰楀啓鎴愮洰鏍囧晢瀹剁殑 app 浼樻儬銆?- 鑻?source 涓悓鏃跺嚭鐜板涓搧鐗屻€佸涓钩鍙般€佸涓紑鍙戣€咃紝涓旀棤娉曟竻鏅伴攣瀹氫负鐩爣 merchant 鑷湁 app 鏈哄埗锛屽繀椤诲垽涓?`Wrong merchant / ambiguous entity / generic summary` 鎴?`No clear dedicated app discount`銆?
## Merchant Name Lock And Validation
### Merchant Name Lock
鏈€缁堢瓟妗堜腑鐨?merchant 鍚嶇О蹇呴』涓庣敤鎴?query 涓殑 merchant 瀹屽叏涓€鑷达紝鎴栨槸鍙槑纭瘉鏄庣瓑浠风殑瑙勮寖鍖栧啓娉曘€?
鍏佽鐨勮鑼冨寲浠呴檺锛?
- 鍘婚櫎甯歌鍏徃鍚庣紑锛屽 `Inc.`, `Ltd.`, `LLC`, `PLC`, `Corp.`, `Co.`, `Company`, `AG`
- 鍘婚櫎鏄庢樉鐨勫煙鍚嶅悗缂€鎴栦功鍐欏櫔闊?- 鍘婚櫎涓嶅奖鍝嶄富浣撹瘑鍒殑鏍囩偣宸紓鎴栧叏鍗婅宸紓
- 鍙‘璁ょ殑鍚屼竴鍝佺墝甯歌鏍囧噯鍐欐硶
绂佹琛屼负锛?
- 鑷姩瑁佸壀 merchant 鍚嶇О
- 鑷姩缂╁啓 merchant 鍚嶇О
- 鍗曞鏁板彉褰?- 鍝佺墝鎴柇
- 鏀瑰啓鎴愯繎浼煎悕绉?- 鐢ㄦ洿鐭€佺湅浼肩浉杩戙€佷絾骞堕潪绯荤粺鍏佽鐨勭瓑浠峰悕绉版浛鎹?query merchant
### Merchant Name Validation
鑻ョ瓟妗堜腑鍑虹幇浠ヤ笅浠讳竴鎯呭喌锛屽繀椤绘嫆缁濆苟閲嶅啓锛?
- another merchant entity
- duplicated merchant names
- partially corrupted merchant names
- truncated merchant names
- merchant 鍚嶇О涓庣洰鏍?query 涓嶅尮閰?
涓嶈鎶婂涓瓑浠峰悕瀛楁満姊板苟鍒楀埌涓€鍙ラ噷銆傛渶缁堢瓟妗堝彧淇濈暀涓€涓共鍑€銆佺ǔ瀹氱殑 merchant 鍚嶇О銆?
## App Listing Debris Removal
App Store銆丟oogle Play銆佷笅杞芥枃妗堛€佸垎鍙戞枃妗堝睘浜庡繀椤绘竻闄ょ殑 source debris銆傞櫎闈炵敤鎴锋槑纭闂浣曚笅杞?app锛屽惁鍒欒繖浜涘唴瀹逛笉寰楄繘鍏?discount FAQ銆?
蹇呴』绉婚櫎鐨勫唴瀹瑰寘鎷絾涓嶉檺浜庯細
- `Apple`
- `App Store`
- `Google Play`
- `available on iOS`
- `available on Android`
- `download the app`
- `install the app`
- listing descriptions
- store badges
- app distribution CTA fragments
瑙勫垯锛?
- Remove app-store listing metadata and download boilerplate unless the user explicitly asks how to download the app.
- Do not keep app-store distribution text in a discount FAQ unless it directly proves that the offer itself is app-exclusive and no cleaner phrasing is available.
- 鍒犻櫎鏉ユ簮绔欏悕銆佹爮鐩悕銆佹寜閽枃妗堛€佹爣棰樻畫鐗囥€乣How to Apply`銆乣How to Get`銆乣Source`銆乣Learn more`銆乣See all`銆乣Negative feedback` 绛夋畫鐗囥€?
## Unsupported Qualifier Ban
涓嶈涓轰簡鈥滀繚瀹堚€濇垨鈥滃惉璧锋潵鏇村畨鍏ㄢ€濊€岃剳琛ラ檺瀹氳瘝銆?
Do not add qualifiers such as:
- `seasonal`
- `limited-time`
- `exclusive`
- `app-only`
- `ongoing`
- `partner-only`
闄ら潪 source 鐩存帴鏀寔璇ラ檺瀹氳瘝鐢ㄤ簬 main app offer銆?
鑻ユ敮鎸佷笉娓呮櫚锛屾敼鐢ㄤ腑鎬ц〃杈撅紝渚嬪锛?
- `public details are limited`
- `available offers vary by promotion`
- `does not clearly advertise a dedicated app discount`
纭鍒欙細
- 涓嶅緱鎶婃櫘閫?web/app 閫氱敤浼樻儬鑴戣ˉ鎴?app-exclusive銆?- 涓嶅緱鎶娾€滄棤鏄庣‘ app 鎶樻墸鈥濇搮鑷敼鎴愨€滃鑺傛€?app 鎶樻墸鈥濇垨鈥滈檺鏃?app 鎶樻墸鈥濄€?- 涓嶅緱涓轰簡瑙勯伩璇垽鑰屽钩鐧藉姞鍏?timing銆乻cope銆乪xclusivity 闄愬畾璇嶃€?
## No Dedicated App Discount Rule
鍙 source 鐨勬牳蹇冪粨璁烘槸娌℃湁 dedicated app discount锛屽氨涓嶈兘鍐嶄互 `Yes` 寮€澶淬€?
If the source indicates that the merchant mainly offers:
- general web promotions
- email or SMS sign-up discounts
- loyalty rewards
- student discounts
- social media sale alerts
- promo codes usable across channels
rather than a dedicated app-specific discount, do not begin the answer with `Yes`.
鍚屾牱鍦帮紝濡傛灉 source 鐨勬牳蹇冩剰鎬濆彧鏄細
- 浼樻儬鍙湪 app 涓煡鐪?- 浼樻儬鍙湪 app 涓璁?- 浼樻儬鍙湪 app 涓緭鍏?code
- 浼樻儬鍙湪 app 涓鐞?- 浼樻儬鍙湪 app 涓喘涔?
浣嗘病鏈夋槑纭鏄庤浼樻儬鏄?app 涓撳睘銆乤pp 鐙湁銆乫irst in-app order锛屾垨鑷冲皯鏄互 app 涓烘槑纭姌鎵ｆ満鍒剁殑涓€閮ㄥ垎锛屼篃涓嶅緱杈撳嚭姝ｅ悜 app discount 缁撹銆?
姝ょ被鎯呭喌搴旀敼鍐欎负娌℃湁鏄庣‘鐨?dedicated app-only discount锛岃€屼笉鏄啓鎴?`Yes`銆?
蹇呴』鏀瑰啓涓烘槑纭嫆缁?dedicated app discount 鐨勫畬鏁村彞锛屼緥濡傝〃杈句负锛?
- 璇ュ晢瀹?does not clearly advertise a dedicated app-only discount
- 璇ュ晢瀹?does not clearly offer a merchant-specific app-only discount
涓嶈鎶婁笂杩板唴瀹瑰啓鎴愯偗瀹氬彞銆?
## Generic Summary Rejection
鑻?source 鏄钩鍙板悎闆嗐€乵arketplace 姒傝堪銆佸寮€鍙戣€呮眹鎬汇€佸鍟嗗姹囨€汇€佺被鐩患杩帮紝鑰屼笉鏄崟涓€ merchant 鐨勬竻鏅扮粨璁猴紝涓嶅簲鐩存帴浜у嚭 merchant FAQ銆?
瑙勫垯锛?
- If the source summarizes multiple marketplaces, platforms, developers, or unrelated merchants instead of one clear target merchant, reject the answer as a merchant FAQ.
- Rewrite it as `no clear merchant-specific app discount` or mark it unsuitable for merchant-specific FAQ output.
杩欐潯瑙勫垯蹇呴』娉涘寲閫傜敤浜庝换浣曞悗缁晢瀹讹紝涓嶅緱鍙褰撳墠妗堜緥鐢熸晥銆?
## Answer Policy By Classification
鎸夊垎绫绘墽琛岃緭鍑虹瓥鐣ワ細
- `App-exclusive discount`
  - 鍙互鍐?`Yes`
  - 蹇呴』璇存槑鎶樻墸鏁板€兼垨鏉冪泭锛屽 source 鏄庣‘缁欏嚭
  - 蹇呴』璇存槑濡備綍鑾峰彇
  - 鍙兘鍦?source 鏄庣‘鏀寔鏃跺啓 `exclusive` 鎴?`app-only`
- `First in-app order offer`
  - 鍙互鍐?`Yes`
  - 蹇呴』鍐欐竻妤氭槸棣栧崟銆侀涓?in-app order銆乶ew user銆乪ligible user 鎴栫被浼奸檺鍒讹紝濡?source 鏄庣‘缁欏嚭
- `Discount redeemable in app but not exclusive`
  - 鍙湁鍦?source 鏄庣‘璇存槑璇ユ姌鎵ｄ笌 app 浣跨敤鍦烘櫙瀛樺湪鐩存帴鎶樻墸鍏崇郴鏃讹紝鎵嶅彲浠ュ啓 `Yes`
  - 鑻?source 鍙槸璇翠紭鎯犱篃鍙湪 app 涓緭鍏ャ€佹煡鐪嬨€佺鐞嗐€侀璁㈡垨璐拱锛屼笉瓒充互鏀寔 `Yes`
  - 涓嶅緱鎶?app 浣滀负鎵胯浇鍏ュ彛銆佹搷浣滃叆鍙ｆ垨璐拱鍏ュ彛锛屾敼鍐欐垚 dedicated app discount
  - 鑻?source 璇存槑璇ヤ紭鎯犺法 web 鍜?app 閫氱敤锛屼笖 app 鍙槸鎵胯浇鍏ュ彛锛屽簲鏀瑰啓涓烘病鏈夋槑纭殑 dedicated app-only discount
- `App rewards / loyalty / points / member perk`
  - 榛樿涓嶅緱鍐?dedicated app discount
  - 濡?source 鍙湁 rewards銆乸oints銆乵ember perks锛屾病鏈夋槑纭姌鎵ｆ満鍒讹紝搴旇緭鍑哄惁瀹氭垨涓€ф嫆缁濆彞
- `App as a deal-discovery, alert, or booking channel only`
  - 涓嶅緱鍐?dedicated app discount
  - 涓嶅緱鎶?alerts銆乨eal browsing銆乥ooking access銆乸rice comparison銆亀ish list銆乤ccount management 褰撴垚鎶樻墸鏈韩
- `No clear dedicated app discount`
  - 涓嶅緱鍐?`Yes`
  - 搴旇緭鍑哄畬鏁存嫆缁濆彞
- `Wrong merchant / ambiguous entity / generic summary`
  - 涓嶅緱鍐?`Yes`
  - 搴旇緭鍑哄畬鏁存嫆缁濆彞
## Complete Sentence Rule
姣忎釜鏈€缁堢瓟妗堥兘蹇呴』鏄畬鏁村彞锛屼笉寰楄緭鍑虹鐗囧彞銆佸潖鍙ャ€佹爣绛炬畫鐗囨垨鎴柇鐭銆?
纭鍒欙細
- Every final answer must be a complete sentence.
- Never output only a fragment, label residue, lower-case fragment, or truncated phrase.
- If the answer is negative, it must still be a full sentence beginning with `No.` and naming the merchant.
- If the answer is positive, it must still be a full sentence beginning with the merchant name or a clear `Yes.`
- Do not use meta phrasing such as `in the source`, `based on the source`, or `in this source` in the final FAQ.
渚嬪锛?
- Positive: `Yes. Nike offers 10% off a first in-app order for eligible new users when that offer is stated in the source.`
- Negative: `No. Nike does not clearly advertise a dedicated app-only discount.`
涓嶈杈撳嚭鍗曠嫭鐨?`no`銆?
## Writing Rules
姣忔潯绛旀閮藉繀椤昏仛鐒﹂棶棰樻湰韬紝骞朵紭鍏堜繚鐣欎互涓?3 涓牳蹇冧簨瀹烇細
1. 璇ュ晢瀹舵槸鍚︽湁 app 鐩稿叧浼樻儬
2. 浼樻儬鍔涘害鏄灏戯紝濡傛湁鏄庣‘鏁板€煎繀椤诲啓鍑?3. 濡備綍鑾峰彇锛屾垨涓轰粈涔堜笉鑳藉垽瀹氫负 dedicated app discount
鍐欎綔纭鍒欙細
- 涓嶆敼鍙樺師鎰?- 淇濈暀鎵€鏈夐噸瑕佹牳蹇冧簨瀹?- 鍒犻櫎閲嶅鍜屽墠鍚庣煕鐩捐〃杩?- 浼樺厛浣跨敤鐩存帴銆佷簨瀹炲瀷琛ㄨ揪
- 鍙啓涓庣洰鏍?merchant 鍜岀洰鏍?app offer 鐩存帴鐩稿叧鐨勪俊鎭?- 涓嶈娣峰叆鏇夸唬鐪侀挶鏂规銆佸搧鐗岃儗鏅€侀澶栬拷闂紩瀵兼垨鐚滄祴
- 濡?source 宸叉槑纭槸鍚?dedicated锛屽垯蹇呴』蹇犲疄淇濈暀杩欎釜缁撹
- 濡傛灉浼樻儬鍔涘害娌℃湁鏄庣‘鏁板€硷紝涓嶈琛ュ啓铏氭瀯鏁板€硷紝涔熶笉瑕佸啓鈥滈噾棰濇湭璇存槑鈥濊繖绫讳綆浠峰€煎厹搴曞彞
- 涓嶈鎶?web 閫氱敤浼樻儬纭敼鍐欐垚 app 涓撳睘鎶樻墸
- 涓嶈鎶?rewards銆乤lerts銆乥ooking銆乨eal discovery 鍐欐垚 dedicated app discount
- 涓嶈鎶婃潵婧愭爣棰樸€佹爣绛俱€佸垪琛ㄩ」銆佷笅杞芥枃妗堝師鏍锋嫾杩涚瓟妗?- 姣忔潯绛旀涓嶈秴杩?50 涓崟璇?
## Negative Answer Style
褰撶粨璁烘槸鍚﹀畾銆佹嫆缁濄€佽瘉鎹笉瓒炽€佷笉閫傚悎杈撳嚭 merchant-specific app discount FAQ 鏃讹紝浠嶇劧蹇呴』杈撳嚭瀹屾暣鍙ャ€?
鎺ㄨ崘鍙ュ紡锛?
- `No. {Merchant} does not clearly advertise a dedicated app-only discount.`
- `No. {Merchant} does not clearly offer a merchant-specific app-only discount.`
鍙湁鍦?source 鏄庣‘鏀寔鏃讹紝鎵嶅彲浠ユ妸璐熷悜鍙ュ啓寰楁洿鍏蜂綋锛屼緥濡傝鏄庝紭鎯犱粎涓洪€氱敤 promo銆乺ewards 鎴?alerts锛岃€屼笉鏄?dedicated app discount銆?
绂佹鍐欐硶锛?
- `in the source`
- `based on the source`
- `in this source`
- 浠讳綍闈㈠悜鍓嶅彴鐢ㄦ埛鐨勫厓璇濇湳
## Language Rules
绛旀蹇呴』浣跨敤 `country` 瀵瑰簲鍥藉鐨勫父鐢ㄨ瑷€銆?
渚嬪锛?
- `US`銆乣UK`銆乣CA`銆乣AU`锛氳嫳鏂?- `DE`锛氬痉鏂?- `FR`锛氭硶鏂?- `ES`锛氳タ鐝墮鏂?- `IT`锛氭剰澶у埄鏂?- `JP`锛氭棩鏂?
濡傛灉鍥藉涓庤瑷€鐨勫搴斿叧绯讳笉澶熸槑纭紝浣跨敤璇ュ浗瀹剁敤鎴锋渶甯歌鐨勯潰鍚戞秷璐硅€呰瑷€銆?
## Question Generation Rules
`Titile1` 闇€瑕佺敓鎴愪竴涓竻鏅般€佽嚜鐒躲€佷笌 `term_name` 瀵归綈鐨?app discount FAQ 闂銆?
浼樺厛鍙ュ紡锛?
- `Does {Merchant} offer an app discount?`
濡傛灉鐩爣鍥藉涓嶆槸鑻辫鐜锛屽簲缈昏瘧鎴愬搴旇瑷€銆?
## Execution Flow
閫愯澶勭悊鏃讹紝涓ユ牸鎸変互涓嬮『搴忥細
1. 浠?`term_name` 閿佸畾鐩爣 merchant銆?2. 闃呰 `discount_details`锛屽厛娓呴櫎鏉ユ簮娈嬬墖銆佷笅杞芥畫鐗囥€佹爣棰樻畫鐗囥€佸钩鍙板櫔闊炽€?3. 鎵ц `Merchant Relevance Filter`锛屽垹闄ら潪鐩爣 merchant銆佺涓夋柟 app銆乸artner tool銆佺浉閭诲钩鍙颁俊鎭€?4. 瀵瑰墿浣?source 鎵ц `App Offer Classification`锛屽繀椤诲綊鍏?7 绫讳箣涓€銆?5. 鏍规嵁鍒嗙被鍐冲畾鏄惁鍏佽姝ｅ悜杈撳嚭銆?6. 鐢熸垚 `Titile1`銆?7. 鐢熸垚 `Brief Introduction`锛屽苟婊¤冻 `Complete Sentence Rule`銆?8. 鎵ц `Merchant Name Validation`銆?9. 鎵ц `Unsupported Qualifier Ban`銆?10. 鎵ц `Output Rejection Conditions`銆?11. 閫氳繃鍚庯紝浣跨敤 `scripts/faq_excel_tools.py` 鐢熸垚鏈€缁?Excel銆?
## Output Rejection Conditions
鑻ュ嚭鐜颁互涓嬩换涓€鎯呭喌锛屽繀椤绘嫆缁濆綋鍓嶇瓟妗堝苟閲嶅啓锛?
- the merchant name does not match the target merchant
- another merchant appears in the answer
- app-store listing debris remains
- source headings or labels remain
- unsupported qualifiers were added
- duplicated words remain
- broken syntax remains
- malformed fragments remain
- half-sentences remain
- lower-case fragments remain
- the answer presents app rewards, app alerts, app booking, or deal discovery as a dedicated app discount
- the answer presents a web-available promotion as app-exclusive without direct support
- the answer uses meta phrasing such as `in the source`, `based on the source`, or `in this source`
- the answer treats app viewing, booking, entering, managing, or purchasing as proof of a dedicated app-only discount
濡傛灉閲嶅啓鍚庝粛鏃犳硶婊¤冻瑕佹眰锛屼娇鐢ㄥ畬鏁存嫆缁濆彞锛屼笉寰楃‖鍐?`Yes`銆?
## Final Sanitation
杈撳嚭鍓嶅繀椤诲啀娆℃鏌ワ細
- 鏈夋病鏈夋妸 app-redeemable 鍐欐垚 app-exclusive
- 鏈夋病鏈夋妸鈥滃彲鍦?app 涓煡鐪嬨€侀璁€佽緭鍏ャ€佺鐞嗘垨璐拱鈥濊鍐欐垚 dedicated app-only discount
- 鏈夋病鏈夋妸 rewards銆乸oints銆乤lerts銆乥ooking銆乨eal discovery 鍐欐垚 dedicated app discount
- 鏈夋病鏈夋妸 `no dedicated app discount` 鏀规垚鑲畾 `Yes`
- 鏈夋病鏈夋贩鍏ユ棤鍏冲疄浣撱€佺涓夋柟 app銆乸artner program 鎴?marketplace 渚嬪瓙
- 鏈夋病鏈夋畫鐣?`Apple`銆乣App Store`銆乣Google Play`銆佷笅杞芥枃妗堛€乴isting 鏂囨
- 鏈夋病鏈夋畫鐣欐潵婧愭爣棰樸€佹爣绛俱€佹寜閽€佹爣棰樻畫鐗囥€佸潖鍙?- 鏈夋病鏈夊姞鍏?source 鏈敮鎸佺殑 `seasonal`銆乣limited-time`銆乣exclusive`銆乣app-only`銆乣ongoing`銆乣partner-only`
- 鏈夋病鏈?generic summary 浠嶈纭敼鎴?merchant FAQ
- 鏈夋病鏈夎緭鍑哄崟璇嶇鐗囥€佸崐鍙ャ€佹爣绛炬畫鐗囨垨鍗曠嫭鐨?`no`
- 鏈夋病鏈夊嚭鐜?`in the source`銆乣based on the source`銆乣in this source` 杩欑被鍏冭瘽鏈?
## 璐ㄦ娓呭崟
浜や粯鍓嶇‘璁わ細
- 姣忎竴琛岄兘瀵瑰簲姝ｇ‘ merchant
- 姣忔潯绛旀閮?<= 50 璇?- 姣忔潯绛旀閮戒娇鐢ㄦ纭浗瀹惰瑷€
- 姣忔潯绛旀閮芥槸瀹屾暣鍙?- 鍚﹀畾绛旀浠?`No.` 寮€澶村苟鐐瑰悕 merchant
- 鑲畾绛旀浠?merchant 鍚嶇О鎴?`Yes.` 寮€澶?- 姣忔潯绛旀閮介€氳繃 app offer 鍒嗙被
- 姣忔潯绛旀閮介€氳繃涓讳綋杩囨护
- 姣忔潯绛旀閮芥病鏈夋贩鍏ョ涓夋柟瀹炰綋
- 姣忔潯绛旀閮芥病鏈?App Store / Google Play 娈嬬墖
- 姣忔潯绛旀閮芥病鏈?unsupported qualifiers
- 姣忔潯绛旀閮芥病鏈夊墠鍙板厓璇濇湳
- 娌℃湁鎶?web 閫氱敤浼樻儬鍐欐垚 app-exclusive
- 娌℃湁鎶?app 褰撴壙杞藉叆鍙ｅ氨鍐欐垚姝ｅ悜 app discount
- 娌℃湁鎶?rewards銆乤lerts銆乥ooking銆乨eal discovery 鍐欐垚 dedicated app discount
- 瀵?`No clear dedicated app discount` 涓?`Wrong merchant / ambiguous entity / generic summary` 閮芥病鏈夎鍐欐垚 `Yes`
- merchant 鍚嶇О涓?query merchant 瀹屽叏涓€鑷达紝鎴栦粎浣跨敤绯荤粺鍏佽鐨勮鑼冨寲绛変环鍚嶇О
- 鏈€缁堜氦浠樹负涓庢ā鏉垮瓧娈靛畬鍏ㄤ竴鑷寸殑 Excel 鏂囦欢
