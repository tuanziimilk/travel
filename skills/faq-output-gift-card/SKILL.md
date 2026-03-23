name: gift-card-faq-skill
description: 褰撶敤鎴锋彁渚涜〃鏍硷紝骞跺笇鏈涘熀浜?Google AI Overview 鐨勭粨鏋滄憳瑕佺敓鎴?HotDeals gift card FAQ 鏃朵娇鐢ㄦ skill銆傝鍙栬緭鍏ヨ〃涓殑 country銆乼erm_name銆乨iscount_details锛屽厛鍋?gift card 鏈哄埗鍒嗙被涓庝富浣撴牎楠岋紝鍐嶆寜鎸囧畾 FAQ 妯℃澘杈撳嚭 Excel 鏂囦欢锛涘彧鏈夊湪鍟嗗鑷湁銆佸彲鐩存帴鍏戞崲鐨?gift card / e-gift card / voucher / certificate 璇佹嵁鏄庣‘鏃舵墠杈撳嚭姝ｅ悜绛旀銆?---
# Gift Card FAQ Skill
浣犳槸 HD 鐨?SEO 涓撳锛屾鍦ㄤ负 HotDeals 鐨?gift card 椤甸潰鍋?FAQ 鍐呭浼樺寲銆?
褰撶敤鎴锋彁渚涗竴涓〃鏍硷紝骞惰姹傛牴鎹?Google AI Overview 鏀堕泦鍒扮殑 `discount_details` 鍐呭锛屾娊璞＄敓鎴?gift card FAQ锛屽苟涓ユ牸鎸夋寚瀹?Excel 妯℃澘杈撳嚭鏃讹紝浣跨敤姝?skill銆?
鏈?skill 鐨勮緟鍔╂枃浠讹細
- `scripts/faq_excel_tools.py`锛氫粠 xlsx 鎻愬彇杈撳叆瀛楁锛屽苟鏋勫缓鏈€缁堣緭鍑?xlsx
- `references/output-format.md`锛氳緭鍑哄瓧娈垫槧灏勪笌浜や粯妫€鏌ユ竻鍗?
## 鐩爣
閽堝姣忎釜鍟嗗锛岃緭鍑虹鍚堣姹傜殑 FAQ 鍐呭銆傜瓟妗堝繀椤绘弧瓒筹細
- 瀵?SEO 鍜?AI 鎼滅储鍙嬪ソ
- 鍙鎬у己銆侀€昏緫娓呮櫚銆佺畝娲併€佸鐢ㄦ埛鍙嬪ソ
- 浣跨敤璇ヨ `country` 瀵瑰簲璇█
- 姣忔潯绛旀涓嶈秴杩?50 涓崟璇?- 浠呭熀浜庡師濮嬩簨瀹烇紝涓嶅緱缂栭€?- 鍏堝垎绫汇€佸啀鍒ゆ柇銆佸啀杈撳嚭锛涗笉婊¤冻姝ｅ悜鏉′欢鏃跺繀椤绘嫆缁濇鍚戣緭鍑?
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
- `Subclass`锛氬浐瀹氬～ `gift card`
- `鏉垮潡鍚嶇О`锛氬浐瀹氬～ `faq`
- `Titile1`锛欶AQ 闂
- `Brief Introduction`锛欶AQ 绛旀
- `Href Kw`锛氱暀绌?- `Href Url`锛氱暀绌?
妯℃澘鍙傝€冿細
- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`
闇€瑕佸鐞?Excel 鏃讹紝浣跨敤锛?
```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/gift_card_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/gift_card_output.json --output /path/to/output.xlsx
```
## Core Policy
杩欎笉鏄竴涓€滅湅鍒?gift 鐩稿叧璇嶅氨鏀瑰啓鎴?yes鈥濈殑浠诲姟銆?
蹇呴』鍏堝垽鏂細
1. 涓讳綋鏄笉鏄洰鏍囧晢瀹?2. gift mechanism 灞炰簬浠€涔堢被鍨?3. 鏄惁灞炰簬鍟嗗鑷湁銆佸彲鐩存帴鍏戞崲鐨?gifting payment instrument
4. 鏄惁婊¤冻姝ｅ悜杈撳嚭闂ㄦ
鍙湁鍦ㄨ瘉鎹槑纭椂锛屾墠鍏佽杈撳嚭姝ｅ悜 FAQ銆傚惁鍒欏繀椤昏緭鍑鸿皑鎱庢垨鍚﹀畾缁撹锛屼笉寰楄剳琛ヨ偗瀹氥€?
## Gift Instrument Classification
鍦ㄦ寮忔敼鍐欏墠锛屽繀椤诲厛鎶?source 褰掑叆浠ヤ笅 9 绫讳箣涓€锛?
1. `Official branded physical gift card`
2. `Official branded digital / e-gift card`
3. `Official gift voucher / gift certificate redeemable with the merchant`
4. `Gift-card-like travel / booking voucher clearly issued by the merchant`
5. `Gift set or product bundle that only includes a voucher`
6. `Gift subscription / prepaid subscription / guest certificate / gift option, but not a true gift card`
7. `Third-party flexible gifting service or retailer-sold alternative`
8. `No clear merchant-branded gift card`
9. `Wrong merchant / ambiguous entity / multi-entity summary`
寮哄埗瑙勫垯锛?
- Do not rewrite every gift-related product as 鈥淵es, [Brand] offers gift cards.鈥?- Only treat it as a positive gift-card FAQ when the merchant clearly issues its own branded gift card, e-gift card, redeemable voucher, or merchant-issued certificate that functions as stored value or a gifting payment instrument.
- If the source only describes a gift set, bundled product, prepaid subscription, guest certificate, or other gifting mechanism, do not automatically classify it as a standard gift card.
- If the source only shows third-party flexible gifting services, retailer gift options, or marketplace alternatives, do not classify that as the merchant鈥檚 own gift card.
- If the source summarizes multiple businesses sharing the same name or multiple related entities, do not output a positive answer unless one target entity is clearly confirmed.
姝ｅ悜杈撳嚭鍙厑璁告潵鑷 1銆?銆?銆? 绫伙紝骞朵笖杩樺繀椤婚€氳繃涓讳綋鏍￠獙涓庤喘涔版笭閬撴牎楠屻€?
绗?5銆?銆?銆?銆? 绫婚粯璁や笉鍏佽杈撳嚭鏍囧噯姝ｅ悜 gift card FAQ銆?
## Merchant-Issued vs Third-Party Gifting Rule
Only treat a gift card as positive when the merchant itself or the merchant鈥檚 official store, official checkout, official gift-card portal, or official customer program clearly offers it.
浠ヤ笅鍐呭閮戒笉鑳戒綔涓衡€滃晢瀹惰嚜鏈?branded gift card鈥濈殑璇佹嵁锛?
- Giftly 鎴栫被浼?flexible gifting 鏈嶅姟
- Amazon gift cards 鎴?marketplace gift cards
- third-party retailer resale锛岄櫎闈炲凡鏄庣‘纭鎵€鍞崱鏈韩灏辨槸璇?merchant-branded card
- generic gifting suggestions
- 鈥測ou could gift this through Amazon / PayPal / another platform鈥?
濡傛灉 source 鍙彁渚涚涓夋柟 gifting 鏇夸唬鏂规锛屽繀椤绘敼鍐欎负浠ヤ笅鏂瑰悜涔嬩竴锛?
- `No. {Merchant} does not clearly advertise its own gift cards.`
- `No. No clear merchant-branded gift card was found for {Merchant}.`
涓嶅緱鎶婄涓夋柟鏇夸唬 gifting 鏈嶅姟鍐欐垚鍟嗗鑷繁鐨勭ぜ鍝佸崱銆?
## Gift Voucher / Certificate Boundary Rule
杈圭晫瑙勫垯濡備笅锛?
- Merchant-issued e-gift cards, redeemable vouchers, and branded gift certificates can count as positive only when they are directly redeemable with the target merchant for the merchant鈥檚 own goods, bookings, or services.
- A voucher embedded inside a bundled product, discovery set, trial kit, or merchandise package is not automatically the same as a standard gift card.
- Guest certificates, transfer certificates, reservation certificates, or prepaid gift subscriptions should not be called gift cards unless the source clearly describes them as such and they function like a stored-value gifting instrument.
杈撳嚭绛栫暐锛?
- If it is only a bundled gift set with a voucher, prefer a cautious or negative phrasing rather than a standard 鈥淵es, [Brand] offers gift cards.鈥?- If it is a guest certificate or gift subscription but not a true gift card, do not answer as though a normal gift card exists.
浠ヤ笅鏈哄埗榛樿涓嶈兘褰撲綔鏍囧噯 gift card锛?
- gift set with voucher
- discovery set with voucher
- prepaid subscription
- gift subscription
- guest certificate
- already-booked trip transfer certificate
- refund credit or adjustment credit
闄ら潪 source 鏄庣‘璇佹槑瀹冩湰璐ㄤ笂鏄?merchant-issued stored-value gifting instrument锛屽惁鍒欎笉寰楄緭鍑?`Yes, {Merchant} offers gift cards.`
## Ambiguous Entity and Multi-Brand Rejection
If the source mentions multiple businesses with the same or similar name, or lists several unrelated entities under one brand-like label, do not generate a positive merchant FAQ unless the target merchant is clearly identified.
If the source cannot clearly distinguish which entity owns the gift card, output a negative or uncertainty-based answer instead of a blended 鈥淵es鈥?
杩欐潯瑙勫垯蹇呴』閫傜敤浜庯細
- 鍚屽悕涓嶅悓鍏徃
- 涓€涓悕瀛楀搴斿涓簵銆佸涓搧鐗屻€佸涓湰鍦板晢鎴?- 鏂囨湰涓讳綋浠庣洰鏍囧晢瀹舵紓绉诲埌鐩搁偦鍝佺墝
- `Other gift options`銆乣similar brands`銆乣also available from` 绛夋澘鍧楁贩鍏ユ棤鍏充富浣?- 澶氬搧鐗屽悎闆嗐€佹瘮杈冩枃銆佽仛鍚堢粨鏋滈〉
濡傛灉 source 鍚屾椂鎻愬埌澶氫釜瀹炰綋锛岃€屼笉鑳芥槑纭攣瀹氱洰鏍囧晢瀹惰嚜宸辩殑 gift card锛屽垯鍒嗙被涓虹 9 绫伙紝涓嶅緱姝ｅ悜杈撳嚭銆?
## Official Purchase Channel Priority
褰撻渶瑕佹€荤粨璐拱娓犻亾鏃讹紝浼樺厛淇濈暀瀹樻柟娓犻亾锛?
- official website
- official app
- official store locations
- official gift-card portal
鍙湁鍚屾椂婊¤冻浠ヤ笅鏉′欢鏃讹紝鎵嶅彲浠ユ彁鍙婄涓夋柟 retailer锛?
- source 鏄庣‘纭閿€鍞殑鏄?merchant-branded card
- 璇ヤ俊鎭兘瀹炶川鎻愬崌绛旀
- 鍔犲叆鍚庣瓟妗堜粛鐒剁畝娲?
涓嶅緱涓轰簡璁╃瓟妗堚€滄洿涓板瘜鈥濊€岄粯璁よ拷鍔犵涓夋柟 retailer 鍒楄〃銆?
## Third-Party Alternative Suppression
鏇夸唬 gifting 鏂规涓嶈兘鍐欒繘涓荤瓟妗堬紝闄ら潪鐢ㄦ埛鏄庣‘闂€滆繕鏈変粈涔堟浛浠ｉ€夋嫨鈥濄€?
涓荤瓟妗堜腑涓嶅緱鍖呭惈锛?
- Giftly alternatives
- Amazon gift card alternatives
- PayPal gifting suggestions
- other merchants with similar names
- generic gifting workarounds
濡傛灉娌℃湁纭 merchant-branded gift card锛屽氨鐩存帴璇存槑杩欎竴鐐癸紝涓嶈缁欐浛浠ｆ柟妗堛€?
## Unsupported Positive Inference Ban
绂佹浠庝互涓嬩俊鎭剳琛ュ嚭姝ｅ悜缁撹锛?
- general gifting language
- product pages that merely say `great gift`
- subscription gifting
- retailer resale context
- a brand being sold on another platform
- a page about related but different entities
If support is unclear, use cautious wording such as:
- `No. {Merchant} does not clearly advertise its own gift cards.`
- `No. No clear merchant-branded gift card was found for {Merchant}.`
- `No. Public details about a merchant-issued gift card for {Merchant} are limited.`
Do not force a positive answer just because the source is gift-related.
## Merchant Name Lock And Output Rejection
### Merchant Name Lock
The merchant name in the final answer must exactly match the merchant in the user query or a clearly equivalent normalized form.
鍏佽鐨勭瓑浠峰綊涓€鍖栦粎闄愶細
- 鍘婚櫎甯歌娉曚汉鍚庣紑锛屽 `Inc`, `Ltd`, `LLC`, `PLC`, `Corp`, `Co.`, `Company`, `AG`
- 鏄庢樉鐨勬爣鐐广€佺┖鏍笺€佸ぇ灏忓啓宸紓
- 鏄庢樉鐨勬寮忓搧鐗岀畝绉颁笌鍏ㄧО绛変环褰㈠紡
涓嶅緱鎶婁袱涓瓑浠峰悕瀛楁満姊板苟鍒楀埌鍚屼竴鍙ラ噷銆?
### Merchant Name Validation
濡傛灉鏈€缁堢瓟妗堜腑鍑虹幇浠ヤ笅浠讳竴鎯呭喌锛岀瓟妗堝繀椤诲垽瀹氫负澶辫触骞堕噸鍐欙細
- another merchant entity
- duplicated merchant names
- partially corrupted merchant names
- truncated merchant names
### Output Rejection Conditions
鑻ュ嚭鐜颁互涓嬩换涓€闂锛屽繀椤绘嫆缁濆綋鍓嶇瓟妗堝苟閲嶅啓锛?
- merchant name does not match the target merchant
- another merchant appears in the answer
- a third-party gifting service is presented as the merchant鈥檚 own gift card
- a bundled gift set or subscription gift is presented as a normal gift card without direct support
- a multi-entity summary is presented as one merchant鈥檚 confirmed gift card
- source headings, URLs, domains, or retailer labels remain
- duplicated words, broken syntax, malformed fragments, half-sentences, or lower-case fragments remain
## Complete Sentence Rule
Every final answer must be a complete sentence.
寮哄埗瑕佹眰锛?
- Never output only a fragment, label residue, lower-case fragment, or truncated phrase.
- If the answer is negative, it must still be a full sentence beginning with `No.` and naming the merchant.
- If the answer is positive, it must still be a full sentence beginning with the merchant or a clear `Yes.`
`no` 鍙兘浣滀负鍐呴儴鍒ゆ柇淇″彿锛屼笉鑳戒綔涓烘渶缁堢敤鎴峰彲璇诲彞瀛愰鏍肩殑鏀句换鍊熷彛銆傜敓鎴?`Brief Introduction` 鏃讹紝蹇呴』鎶婂惁瀹氱粨璁哄啓鎴愬畬鏁村彞銆?
## Subclass Focus Rule
- `Subclass` 鍐冲畾褰撳墠琛屽彧鑳藉啓杩欎竴绫绘満鍒讹紝涓嶈鎶婂叾浠栦紭鎯犵被鍒贩鍐欒繘绛旀
- 鍙彁鍙栦笌褰撳墠 `Subclass` 鐩存帴鐩稿叧鐨勪簨瀹烇紱鍏朵粬鎶樻墸銆佷細鍛樸€佽繑鍒┿€佺ぜ鍖呫€佹弧鍑忋€佸厤杩愮瓑淇℃伅锛岄櫎闈炲畠鏈韩灏辨槸璇?`Subclass` 鐨勮喘涔版潯浠躲€佷娇鐢ㄩ檺鍒舵垨閫傜敤鑼冨洿锛屽惁鍒欎笉瑕佸啓鍏?- 濡傛灉婧愭枃鏈悓鏃舵彁鍒板绫讳紭鎯狅紝浼樺厛淇濈暀褰撳墠 `Subclass` 鐨勬牳蹇冩満鍒躲€侀潰棰濇垨绫诲瀷銆佽幏鍙栨柟寮忋€佷娇鐢ㄨ寖鍥淬€佹湁鏁堟湡銆佸湴鍖洪檺鍒?- 涓嶈涓轰簡涓板瘜绛旀锛屾妸鍏朵粬浼樻儬绫诲埆鎷兼帴鎴愨€滈檮鍔犱俊鎭€?
## Evidence Selection Rule
闃呰 `discount_details` 鏃讹紝涓嶈鍋滃湪绗竴鍙ヨ瘽銆傚繀椤荤户缁鏌ュ悗鏂囨槸鍚﹀瓨鍦ㄨ繖浜涢珮浠峰€间俊鎭細
- 鏄惁涓哄疄浣撳崱鎴栨暟瀛楀崱
- 鏄惁涓?merchant-issued voucher / certificate
- 闈㈤銆佸竵绉嶃€佹。浣?- 瀹樻柟璐拱鍏ュ彛
- 閫傜敤鍟嗗搧銆佹湇鍔°€佽埅鐝€侀璁㈡垨闂ㄥ簵
- 鏈夋晥鏈?- 鍦板尯闄愬埗
- 鏄惁鍙兘绾夸笂鎴栫嚎涓嬩娇鐢?
浣嗗彧鑳戒繚鐣欎笌鐩爣 merchant 鐨?gift card 鏈哄埗鐩存帴鐩稿叧鐨勪簨瀹炪€?
浠ヤ笅鍐呭涓嶅緱鍐欏叆 FAQ 涓荤瓟妗堬細
- URL
- 鍩熷悕
- 鏉ユ簮鏍囬
- 鏉ユ簮绔欏悕
- 鎼滅储缁撴灉鎷兼帴娈嬬墖
- `Key Details`, `Negative feedback`, `How to Get`, `Source` 绛夋爣棰樻畫鐣?
## Positive Answer Rule
鍙湁褰撲互涓嬫潯浠跺叏閮ㄦ弧瓒虫椂锛屾墠鍏佽姝ｅ悜杈撳嚭锛?
1. 涓讳綋鏄庣‘鏄洰鏍?merchant
2. 鏈哄埗鍒嗙被灞炰簬绗?1銆?銆? 鎴?4 绫?3. 璇佹嵁鏄庣‘鏄剧ず璇ユ満鍒剁敱 merchant 鏈韩銆佸畼鏂规笭閬撴垨瀹樻柟椤圭洰鎻愪緵
4. 鍙洿鎺ョ敤浜庤 merchant 鑷韩鍟嗗搧銆佹湇鍔°€侀璁㈡垨鏉冪泭鍏戞崲
5. 鏈€缁堢瓟妗堜腑娌℃湁娣峰叆绗笁鏂规浛浠ｆ柟妗堛€佹棤鍏冲疄浣撴垨鏉ユ簮娈嬬墖
姝ｅ悜绛旀浼樺厛淇濈暀 3 涓牳蹇冧簨瀹烇細
1. 璇ュ晢瀹舵槸鍚︽彁渚?gift card
2. 闈㈤銆佺被鍨嬫垨浣跨敤鏂瑰紡
3. 濡備綍鑾峰彇鎴栬喘涔?
濡傛灉鍏蜂綋闈㈤鎴栫被鍨嬫病鏈夋槑纭鏄庯細
- 涓嶈鍐欌€滈噾棰濇湭璇存槑鈥濃€滈潰棰濇湭鐭モ€濃€滄湭娉ㄦ槑鍏蜂綋绫诲瀷鈥濊繖绫讳笉纭畾琛ㄨ堪
- 鐩存帴鐪佺暐璇ヤ俊鎭紝鍙繚鐣欏凡缁忕‘璁ょ殑浜嬪疄
- 涓嶈涓轰簡鍑戞弧 3 涓簨瀹炶€屽姞鍏ユā绯婃弿杩?
## Negative Answer Rule
鑻ュ睘浜庝互涓嬩换涓€鎯呭舰锛屽繀椤昏緭鍑哄惁瀹氭垨璋ㄦ厧鍚﹀畾绛旀锛?
- 绗?5銆?銆?銆?銆? 绫?- 涓讳綋涓嶄竴鑷?- 鍙兘纭绗笁鏂?gifting 鏂规
- 鍙兘纭 bundled gift set / voucher-in-product
- 鍙兘纭 subscription gifting / guest certificate
- 娌℃湁鏄庣‘ merchant-branded gift card 璇佹嵁
浼樺厛鍐欐硶锛?
- `No. {Merchant} does not clearly advertise its own gift cards.`
- `No. No clear merchant-branded gift card was found for {Merchant}.`
- `No. {Merchant} appears to offer gifting options, but not a standard merchant-issued gift card.`
鍚﹀畾绛旀涔熷繀椤绘槸瀹屾暣鍙ワ紝骞舵槑纭偣鍚嶇洰鏍?merchant銆?
## Writing Rules
- 涓嶆敼鍙樺師鎰?- 淇濈暀鎵€鏈夐噸瑕佹牳蹇冧簨瀹?- 鍒犻櫎閲嶅鍜屽墠鍚庣煕鐩捐〃杩?- 鍚屼竴鏈哄埗銆侀棬妲涖€侀檺鍒舵垨鏉′欢涓嶈鎹㈠彞閲嶅璇翠袱閬?- 浼樺厛浣跨敤鐩存帴銆佷簨瀹炲瀷琛ㄨ揪
- 涓嶈鎶?bundled gift set銆乻ubscription gift銆乬uest certificate 鍐欐垚鏍囧噯 gift card
- 涓嶈鎶?retailer銆丟iftly銆丄mazon銆丳ayPal 鎴栧叾浠栨浛浠ｆ柟妗堝啓鎴愬晢瀹跺畼鏂?gift card 璇佹嵁
- 涓嶈鎶婂悓鍚嶅叾浠栧疄浣撶殑淇℃伅鎻夎繘褰撳墠鍟嗗绛旀
- 涓嶈鎶?URL銆佺綉椤垫爣棰樸€佹潵婧愮珯鍚嶃€佸煙鍚嶃€佹潵婧愭嫭鍙锋敞閲婄洿鎺ュ啓杩?FAQ 姝ｆ枃
- 涓嶈杈撳嚭鍧忓彞銆佸崐鍙ャ€佸皬鍐欐畫鐗囥€佸垪琛ㄦ畫鐗囥€佹嫾鎺ユ畫鐗?- 璇皵鍙嬪ソ銆佺揣鍑?- 涓ユ牸鎺у埗鍦?50 涓崟璇嶄互鍐?
## Language Rules
绛旀蹇呴』浣跨敤 `country` 瀵瑰簲鍥藉鐨勫父鐢ㄨ瑷€銆?
渚嬪锛?
- `US`銆乣UK`銆乣CA`銆乣AU`锛氳嫳鏂?- `DE`锛氬痉鏂?- `FR`锛氭硶鏂?- `ES`锛氳タ鐝墮鏂?- `IT`锛氭剰澶у埄鏂?- `JP`锛氭棩鏂?
濡傛灉鍥藉涓庤瑷€鐨勫搴斿叧绯讳笉澶熸槑纭紝浣跨敤璇ュ浗瀹剁敤鎴锋渶甯歌鐨勯潰鍚戞秷璐硅€呰瑷€銆?
鍗充娇鏄礋鍚戠瓟妗堬紝涔熷繀椤荤敤璇ュ浗瀹跺搴旇瑷€鍐欐垚瀹屾暣鍙ャ€?
## Question Rule
`Titile1` 闇€瑕佺敓鎴愪竴涓竻鏅般€佽嚜鐒躲€佷笌 `term_name` 瀵归綈鐨?gift card FAQ 闂銆?
浼樺厛鍙ュ紡锛?
- `Does {Merchant} offer gift cards?`
濡傛灉鐩爣鍥藉涓嶆槸鑻辫鐜锛屽簲缈昏瘧鎴愬搴旇瑷€銆?
## Execution Flow
閫愯澶勭悊鏃讹紝蹇呴』鎸変互涓嬮『搴忔墽琛岋細
1. 浠?`term_name` 璇嗗埆鐩爣鍟嗗
2. 闃呰 `discount_details`锛屾娊鍙栦笌 gift card 鏈哄埗鐩稿叧鐨勫叏閮ㄥ€欓€変簨瀹?3. 鍋氫富浣撻攣瀹氾紝纭 source 鏄惁鐪熺殑鍦ㄨ鐩爣鍟嗗
4. 鍋?mechanism classification锛屽己鍒跺綊鍏?9 绫讳箣涓€
5. 鍒ゆ柇鏄惁婊¤冻 merchant-issued 姝ｅ悜闂ㄦ
6. 鑻ヤ笉婊¤冻姝ｅ悜闂ㄦ锛岀洿鎺ュ啓鍚﹀畾鎴栬皑鎱庡惁瀹氱瓟妗?7. 鑻ユ弧瓒虫鍚戦棬妲涳紝鍐嶆彁鐐奸潰棰濄€佺被鍨嬨€佽幏鍙栨柟寮忓拰鍏抽敭闄愬埗
8. 鐢ㄧ洰鏍囧浗瀹惰瑷€鍐欐垚 50 璇嶄互鍐呭畬鏁村彞
9. 鍋氳緭鍑烘嫆缁濇鏌ワ紱鑻ヨЕ鍙戜换涓€ rejection condition锛屽繀椤婚噸鍐?10. 浣跨敤 `scripts/faq_excel_tools.py` 鐢熸垚鏈€缁?Excel
## Final Sanitation
杈撳嚭鍓嶅繀椤诲啀娆℃鏌ワ細
- 鏈夋病鏈夋妸绗笁鏂?gifting 鏈嶅姟鍐欐垚鍟嗗鑷湁绀煎搧鍗?- 鏈夋病鏈夋妸 gift voucher / certificate / gift set / subscription gift / guest certificate 娣峰啓鎴愭爣鍑?gift card
- 鏈夋病鏈夋妸澶氬疄浣?summary 鍐欐垚鍗曚竴鍟嗗鐨勭‘璁ょ粨璁?- 鏈夋病鏈夊湪娌℃湁鏄庣‘ branded gift card 璇佹嵁鏃朵粛鐒惰緭鍑?`Yes`
- 鏈夋病鏈夋妸 URL銆佸煙鍚嶃€乺etailer銆乻ource heading銆乴abel residue 鐣欏湪姝ｆ枃
- 鏈夋病鏈夊嚭鐜伴噸澶嶈瘝銆佸潖鍙ャ€佸崐鍙ャ€佹埅鏂彞銆乴ower-case fragment
- 鏈夋病鏈夊嚭鐜伴敊璇晢瀹躲€佸弻鍐欏晢瀹跺悕銆佹崯鍧忓晢瀹跺悕
- 鏈夋病鏈夊姞鍏ユ棤鍏虫浛浠ｆ柟妗?
## Quality Checklist
浜や粯鍓嶇‘璁わ細
- 姣忎竴琛岄兘瀵瑰簲姝ｇ‘鍟嗗
- 姣忔潯绛旀閮?<= 50 璇?- 姣忔潯绛旀閮戒娇鐢ㄦ纭浗瀹惰瑷€
- 姣忔潯绛旀閮芥槸瀹屾暣鍙?- 姣忔潯绛旀閮藉彧鍐欏綋鍓?`Subclass` 瀵瑰簲鍐呭
- 鍙湁鏈哄埗鍒嗙被涓虹 1銆?銆?銆? 绫讳笖璇佹嵁鏄庣‘鏃舵墠杈撳嚭姝ｅ悜
- 绗?5銆?銆?銆?銆? 绫绘病鏈夎璇啓涓烘爣鍑?gift card `Yes`
- 娌℃湁鎶婄涓夋柟 gifting 鏈嶅姟褰撴垚鍟嗗鑷湁 gift card
- 娌℃湁鎶?bundled gift set銆乻ubscription gift銆乬uest certificate 娣峰啓鎴愭爣鍑?gift card
- 娌℃湁鎶婂瀹炰綋鎴栧悓鍚嶄笉鍚屽晢瀹朵俊鎭贩鍐欒繘绛旀
- 娌℃湁鍑虹幇 URL銆佹潵婧愭爣棰樸€佸煙鍚嶃€侀浂纰庢爣绛俱€佸潖鍙ユ垨鏃犲叧鏇夸唬鏂规
- 鏈€缁堜氦浠樹负涓庢ā鏉垮瓧娈靛畬鍏ㄤ竴鑷寸殑 Excel 鏂囦欢
