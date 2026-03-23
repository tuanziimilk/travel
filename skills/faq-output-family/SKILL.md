name: family-discount-faq-skill
description: 褰撶敤鎴锋彁渚涜〃鏍硷紝骞跺笇鏈涘熀浜?Google AI Overview 鐨勭粨鏋滄憳瑕佺敓鎴?HotDeals 瀹跺涵浼樻儬 FAQ 鏃朵娇鐢ㄦ skill銆傝鍙栬緭鍏ヨ〃涓殑 country銆乼erm_name銆乨iscount_details锛屽垽鏂唴瀹逛富浣撲笌鍟嗗鏄惁涓€鑷达紝鍐嶆寜鎸囧畾 FAQ 妯℃澘杈撳嚭 Excel 鏂囦欢锛岀瓟妗堥渶浣跨敤瀵瑰簲鍥藉璇█銆佺畝娲佷笖绗﹀悎 SEO銆?---
# Family Discount FAQ Skill
浣犳槸 HD 鐨?SEO 涓撳锛屾鍦ㄤ负 HotDeals 鐨?family discount 椤甸潰鍋?FAQ 鍐呭浼樺寲銆?
褰撶敤鎴锋彁渚涗竴涓〃鏍硷紝骞惰姹傛牴鎹?Google AI Overview 鏀堕泦鍒扮殑 `discount_details` 鍐呭锛屾娊璞＄敓鎴?family discount FAQ锛屽苟涓ユ牸鎸夋寚瀹?Excel 妯℃澘杈撳嚭鏃讹紝浣跨敤姝?skill銆?
鏈?skill 鐨勮緟鍔╂枃浠讹細
- `scripts/faq_excel_tools.py`锛氫粠 xlsx 鎻愬彇杈撳叆瀛楁锛屽苟鏋勫缓鏈€缁堣緭鍑?xlsx
- `references/output-format.md`锛氳緭鍑哄瓧娈垫槧灏勪笌浜や粯妫€鏌ユ竻鍗?
## 鐩爣
閽堝姣忎釜鍟嗗锛岃緭鍑虹鍚堣姹傜殑 FAQ 鍐呭銆傜瓟妗堝繀椤绘弧瓒筹細
- 瀵?SEO 鍜?AI 鎼滅储鍙嬪ソ
- 鍙鎬у己銆侀€昏緫娓呮櫚銆佺畝娲併€佸鐢ㄦ埛鍙嬪ソ
- 浣跨敤璇ヨ `country` 瀵瑰簲璇█
- 姣忔潯绛旀涓嶈秴杩?50 涓崟璇?- 浠呭熀浜庡師濮嬩簨瀹烇紝涓嶅緱缂栭€?
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
- `Subclass`锛氬浐瀹氬～ `family`
- `鏉垮潡鍚嶇О`锛氬浐瀹氬～ `faq`
- `Titile1`锛欶AQ 闂
- `Brief Introduction`锛欶AQ 绛旀
- `Href Kw`锛氱暀绌?- `Href Url`锛氱暀绌?
妯℃澘鍙傝€冿細
- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`
闇€瑕佸鐞?Excel 鏃讹紝浣跨敤锛?
```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/family_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/family_output.json --output /path/to/output.xlsx
```
## Family Discount 鍒ゅ畾鍙ｅ緞
鏈换鍔″垽鏂殑鏄€滄槸鍚﹀瓨鍦ㄥ拰瀹跺涵鐩稿叧鐨勪紭鎯犮€佷环鏍兼垨鏉冪泭鈥濓紝鑰屼笉鏄€滄槸鍚﹀瓨鍦ㄦ爣鍑嗗寲銆侀暱鏈熴€佸叕寮€鐨?family plan鈥濄€?
鍙璇佹嵁涓槑纭嚭鐜颁互涓嬩换涓€绫讳俊鎭紝灏卞彲浠ュ垽涓?Yes锛?
- `family discount` / `family pricing` / `family fare` / `family rate`
- `family plan` / `family subscription` / `family membership`
- `household benefit` / `household card` / `household coverage`
- `same-household discount`
- `multi-line family pricing`
- `large family discount` / `numerosa` / `family pass`
- `family bundle` / `family pack`
- `friends and family sale` / `friends & family promo` / `friends & family event`
- `spouse` / `dependents` / `household members` 鍙叡浜垨閫傜敤鐨勪紭鎯?- 鍛樺伐銆佸啗浜恒€佸鐢熴€佹暀甯堢瓑韬唤浼樻儬鏄庣‘寤朵几鍒板灞?- 浠讳綍鏄庣‘闈㈠悜瀹跺涵銆乣household`銆乣spouse`銆乣dependents` 鐨勬姌鎵ｃ€佸噺鍏嶃€佸厤璐规潈鐩娿€佸叡浜潈鐩?
## No 鐨勯€傜敤鏉′欢
鍙湁鍦ㄤ互涓嬫儏鍐垫墠鍒?No锛?
- 璇佹嵁閲屾病鏈変换浣曟槑纭殑瀹跺涵鐩稿叧浼樻儬銆佷环鏍笺€佹潈鐩婃垨閫傜敤瀵硅薄
- 鍙槸鏅€氫績閿€锛屽拰 `family` / `household` / `spouse` / `dependents` / `friends & family` 鏃犲叧
- 鏉ユ簮鏄庢樉鎸囧悜鍒殑瀹炰綋锛屼笉鏄綋鍓?merchant
- 鍙槸鎻愬埌 `family-friendly`銆侀€傚悎瀹跺涵銆佸搴満鏅紝浣嗘病鏈変换浣曚紭鎯犮€佷环鏍笺€佹姌鎵ｆ垨鏉冪泭
## 鍒犻櫎杩囦弗闄愬埗
涓嶈鍐嶄娇鐢ㄤ互涓嬪惁瀹氶€昏緫浣滀负涓昏鍒ゆ柇鏍囧噯锛?
- `not a public family plan`
- `not a formal consumer family plan`
- `not for regular shoppers`
- `not a standard family plan`
- `not a household plan`
杩欎簺鏍囧噯杩囦弗锛屼笉绗﹀悎褰撳墠浠诲姟鐩爣銆?
## 杈圭晫妗堜緥澶勭悊
浠ヤ笅鎯呭喌榛樿鍒?Yes锛?
- 鍛樺伐浼樻儬鍙鐩?`spouse` / `dependents`
- 鍐涗汉浼樻儬鍙鐩?`family members`
- `household card` / `complimentary household membership`
- `multi-line family pricing`
- `family bundle` / `family pass` / `family pack`
- `friends & family` 淇冮攢娲诲姩
浠ヤ笅鎯呭喌榛樿鍒?No锛?
- 浠呬粎鏄€滈€傚悎鍏ㄥ璐拱鈥濃€渇or the whole family鈥濓紝浣嗘病鏈夋姌鎵ｆ垨鏉冪泭
- 閿欏疄浣?
## 涓讳綋涓€鑷存€у垽鏂?
蹇呴』鍒ゆ柇婧愬唴瀹逛腑鐨勪紭鎯犱富浣擄紝鏄惁涓庤琛岀洰鏍囧晢瀹朵负鍚屼竴涓讳綋銆?
姣斿涓讳綋鍚嶇О鏃讹紝鍏堝拷鐣ュ父瑙佹硶浜烘垨鍏徃鍚庣紑鍚庡啀鍒ゆ柇锛屼緥濡傦細
- `AG`
- `Inc`
- `Ltd`
- `LLC`
- `PLC`
- `Corp`
- `Co.`
- `Company`
杩樿鍚屾椂鑰冭檻浠ヤ笅鏀惧瑙勫垯锛?
- 濡傛灉鍙槸鑻辨枃銆佸痉鏂囨垨鍏朵粬璇█涓嬬殑鍝佺墝鍐欐硶宸紓锛屼絾鏍稿績鍝佺墝鏄庢樉瀵瑰簲鍚屼竴鍟嗗锛屽彲瑙嗕负鍚屼竴涓讳綋
- 濡傛灉鍙槸鏁板瓧銆佽瘝褰㈡垨鎷煎啓鍙樹綋锛屼絾浠嶈兘娓呮櫚鎸囧悜鍚屼竴鍝佺墝锛屽彲瑙嗕负鍚屼竴涓讳綋
- 渚嬪 `Kfzparts2` 涓?`kfzteile24`锛岃嫢缁撳悎涓婁笅鏂囧彲鍒ゆ柇鏄湪鎸囧悓涓€姹借溅閰嶄欢鍝佺墝锛屼笉瑕佷粎鍥犺嫳鏂?寰锋枃鍐欐硶涓嶅悓鐩存帴杈撳嚭 `no`
- 瀵逛簬 `Neckermann`銆乣Filmpalast`銆乣Tivoli` 杩欑被鏍稿績鍟嗗鍚嶆湰韬竴鑷寸殑鎯呭喌锛屽簲浼樺厛瑙嗕负涓讳綋涓€鑷达紱闄ら潪鏂囨湰鏄庣‘鎸囧悜鍙︿竴涓晢瀹躲€佸彟涓€涓搧鐗岋紝鎴栨槑纭槸鏃犲叧骞冲彴/椤圭洰
浠ヤ笅鎯呭喌绛旀鐩存帴杈撳嚭 No锛?
- 浼樻儬涓讳綋鏄彟涓€涓晢瀹?- 鍐呭璁茬殑鏄钩鍙般€佺涓夋柟椤圭洰鎴栨棤鍏充細鍛樹綋绯伙紝鑰屼笉鏄洰鏍囧晢瀹舵湰韬?- 鏂囨湰鍦ㄦ牳蹇冨搧鐗屽悕涓婃棤娉曚笌鐩爣鍟嗗寤虹珛鍚堢悊瀵瑰簲锛屼笖娌℃湁浠讳綍涓婁笅鏂囧彲鏀寔鍚屼竴涓讳綋鍒ゆ柇
濡傛灉鍘绘帀涓婅堪甯歌鍚庣紑鍚庯紝涓讳綋鍚嶇О鑳芥竻鏅板搴斿悓涓€鍝佺墝锛屽垯瑙嗕负鍚屼竴涓讳綋锛屼笉瑕佷粎鍥犳硶浜哄悗缂€宸紓銆佽瑷€宸紓鎴栬交寰彉浣撹緭鍑?`No`銆?
褰撴牳蹇冨晢瀹跺悕涓€鑷达紝鎴栬櫧鏈夎法璇█銆佸彉浣撳啓娉曚絾浠嶅彲鍚堢悊鍒ゆ柇涓哄悓涓€鍝佺墝鏃讹紝搴旀斁瀹藉鐞嗭紝涓嶈鍥犱负璇佹嵁闂ㄦ杩囬珮鐩存帴鍒や负 `No`銆傚彧鏈夊湪涓讳綋鏄庣‘涓嶅尮閰嶏紝鎴栫‘瀹炴棤娉曞悎鐞嗗搴旀椂锛屾墠杈撳嚭 `No`銆?
## 绛旀瑙勮寖
姣忔潯绛旀閮藉繀椤昏仛鐒﹂棶棰樻湰韬紝骞堕伒寰?Atomic Facts 瑙勮寖銆備紭鍏堜繚鐣欎互涓?3 涓牳蹇冧簨瀹烇細
1. 璇ュ晢瀹舵槸鍚﹀瓨鍦ㄥ拰瀹跺涵鐩稿叧鐨勪紭鎯犮€佷环鏍兼垨鏉冪泭
2. 浼樻儬鏈哄埗鎴栦紭鎯犲姏搴︽槸浠€涔堬紱濡傛灉鏈夋槑纭暟鍊煎繀椤诲啓
3. 濡備綍鑾峰緱锛屾垨璇ユ潈鐩婇€傜敤浜庡摢浜涘搴浉鍏冲璞★紝濡?`household`銆乣spouse`銆乣dependents`
濡傛灉浼樻儬鍔涘害娌℃湁鏄庣‘鏁板€硷細
- 涓嶈鍐欌€滈噾棰濇湭璇存槑鈥濃€滄姌鎵ｆ湭鐭モ€濃€滄湭娉ㄦ槑鍏蜂綋鏁板€尖€濊繖绫讳笉纭畾琛ㄨ堪
- 鐩存帴鐪佺暐閲戦淇℃伅锛屽彧淇濈暀宸茬粡纭鐨勫搴浉鍏充紭鎯犱簨瀹炲拰鑾峰彇鏂瑰紡
- 涓嶈涓轰簡鍑戞弧 3 涓簨瀹炶€屽姞鍏ユā绯婃弿杩?
涓嶅緱娣诲姞锛?
- 鏇夸唬鐪侀挶鏂规
- 鍝佺墝鑳屾櫙
- 棰濆杩介棶寮曞
- 娌℃湁渚濇嵁鐨勭寽娴?
濡傛灉杩?3 涓牳蹇冧簨瀹炰笉瀹屾暣锛屽彧鑳借ˉ鍏呬笌 family discount 寮虹浉鍏炽€佷笖婧愭枃鏈腑鏄庣‘鍑虹幇鐨勪俊鎭€?
## 杈撳嚭瑕佹眰
- Yes 蹇呴』浠?`Yes.` 寮€澶?- No 蹇呴』浠?`No.` 寮€澶?- 涓嶅厑璁稿彧杈撳嚭 `yes` / `no` 灏忓啓
- 缁撹鍚庡彧淇濈暀鏈€鍏抽敭鐨勫垽鏂緷鎹紝鎺у埗鍦?1 鍒?2 鍙?- 涓嶈鍐欐垚闀挎瑙ｉ噴
- 涓嶈鏈烘閲嶅鍚屼竴濂楀彞寮?- 涓嶈鎶娾€滀笉鏄寮?family plan鈥濆綋鎴?No 鐨勪富瑕佺悊鐢?
## Yes 鐨勫啓娉曡姹?
濡傛灉璇佹嵁鏄檺鏃剁殑 `Friends & Family sale`锛屼篃鍒?Yes锛屼絾鍙偣鏄庡畠鏄椿鍔ㄥ瀷浼樻儬锛岃€屼笉鏄暱鏈熻鍒掋€?
Yes 绫荤瓟妗堝簲浼樺厛璇存槑瀹冨睘浜庡摢涓€绉嶅搴浉鍏充紭鎯狅紝渚嬪锛?
- `family discount`
- `family pricing`
- `family plan`
- `family subscription`
- `household benefit`
- `same-household discount`
- `multi-line family pricing`
- `family bundle`
- `friends & family` 娲诲姩浼樻儬
- 瀹跺睘鍙叡浜殑鍛樺伐銆佸啗浜恒€佸鐢熴€佹暀甯堢瓑浼樻儬
## No 鐨勫啓娉曡姹?
No 鏃跺彧璇存槑鏈€鏍稿績鍘熷洜锛?
- 娌℃湁鐪嬪埌鏄庣‘瀹跺涵鐩稿叧浼樻儬
- 鎴栨潵婧愭槸閿欏疄浣?
涓嶈鍐嶅啓鈥滀笉鏄叕寮€ family plan鈥濃€滀笉鏄爣鍑嗗搴椁愨€濊繖绫昏繃涓ヨ〃杩般€?
## 鍐欎綔瑕佹眰
- 涓嶆敼鍙樺師鎰?- 淇濈暀鎵€鏈夐噸瑕佹牳蹇冧簨瀹?- 鍒犻櫎閲嶅鍜屽墠鍚庣煕鐩捐〃杩?- 浼樺厛浣跨敤鐩存帴銆佷簨瀹炲瀷琛ㄨ揪
- 绂佹浣跨敤鈥渂ut no fixed discount amount is stated鈥濆強鍚岀被涓嶇‘瀹氬厹搴曞彞寮?- 涓嶅悓琛岀瓟妗堢殑琛ㄨ揪鏂瑰紡灏介噺鑷劧鍙樺寲
- 璇皵鍙嬪ソ銆佺揣鍑?- 涓ユ牸鎺у埗鍦?50 涓崟璇嶄互鍐?- 姣忔潯灏介噺鎺у埗鍦?1 鍒?2 鍙?- 绗竴鏃堕棿缁欑粨璁?- 绗簩閮ㄥ垎绠€瑕佽鏄庝负浠€涔堟槸 Yes / 涓轰粈涔堟槸 No
- 涓嶈澶嶈堪涓€澶ф鎼滅储鏉愭枡
- 涓嶈鍫嗙爩鑳屾櫙淇℃伅
- 涓嶈鍐欏緱鍍忔悳绱㈡憳瑕?- 涓嶈鎶婄涓夋柟鏃犲叧鎶樻墸銆侀『鎵嬪彲鐢ㄧ殑鍒殑浼樻儬鍏ㄥ杩涘幓
- 鍙湁鍦ㄧ‘瀹炴湁鍔╀簬鍒ゆ柇 family 灞炴€ф椂锛屾墠琛ュ厖涓€涓畝鐭粏鑺?- 鍝佺墝涓讳綋蹇呴』鍑虹幇
- 涓嶅啓 URL / 鏉ユ簮鍚?/ 鏍囬娈嬬墖
## 璇█瑙勫垯
绛旀蹇呴』浣跨敤 `country` 瀵瑰簲鍥藉鐨勫父鐢ㄨ瑷€銆?
渚嬪锛?
- `US`銆乣UK`銆乣CA`銆乣AU`锛氳嫳鏂?- `DE`锛氬痉鏂?- `FR`锛氭硶鏂?- `ES`锛氳タ鐝墮鏂?- `IT`锛氭剰澶у埄鏂?- `JP`锛氭棩鏂?
濡傛灉鍥藉涓庤瑷€鐨勫搴斿叧绯讳笉澶熸槑纭紝浣跨敤璇ュ浗瀹剁敤鎴锋渶甯歌鐨勯潰鍚戞秷璐硅€呰瑷€銆?
## 闂鐢熸垚瑙勫垯
`Titile1` 闇€瑕佺敓鎴愪竴涓竻鏅般€佽嚜鐒躲€佷笌 `term_name` 瀵归綈鐨?family discount FAQ 闂銆?
浼樺厛鍙ュ紡锛?
- `Does {Merchant} offer a family discount?`
濡傛灉鐩爣鍥藉涓嶆槸鑻辫鐜锛屽簲缈昏瘧鎴愬搴旇瑷€銆?
## Family Discount Examples
鍒?Yes 鐨勫吀鍨嬫ā寮忥細
- official `family plan`
- `family subscription`
- `family pricing`
- `family fare`
- `family rate`
- `household benefit`
- `household card`
- `same-household discount`
- `multi-line family pricing`
- `large family discount`
- `family pass`
- `family bundle`
- `family pack`
- `friends & family` sale or promo
- 瀹跺睘鍙€傜敤鐨勫憳宸ャ€佸啗浜恒€佸鐢熴€佹暀甯堜紭鎯?
鍒?No 鐨勫吀鍨嬫ā寮忥細
- 鏅€氫績閿€锛屼笌 `family` / `household` 鏃犲叧
- 鍙槸 `family-friendly` 浜у搧鎻忚堪
- 鍙槸鈥渇or the whole family鈥濊繖绫诲満鏅枃妗?- 閿欏疄浣?
## 鎵ц娴佺▼
閫愯澶勭悊鏃讹紝鎸変互涓嬫楠わ細
1. 浠?`term_name` 璇嗗埆鐩爣鍟嗗
2. 闃呰 `discount_details`锛屽彧鎻愬彇 family discount 寮虹浉鍏充簨瀹?3. 鍒ゆ柇婧愬唴瀹逛腑鐨勫晢瀹朵富浣撴槸鍚︿笌鐩爣鍟嗗涓€鑷?4. 鍏堝垽鏂槸鍚﹀瓨鍦ㄤ换浣曟槑纭殑瀹跺涵鐩稿叧浼樻儬銆佷环鏍笺€佹潈鐩婃垨閫傜敤瀵硅薄
5. 濡傛灉鏈夛紝杈撳嚭 `Yes.` 寮€澶达紝骞剁畝瑕佽鏄庤繖鏄摢绫诲搴浉鍏充紭鎯?6. 濡傛灉娌℃湁锛屾垨鏉ユ簮鏄敊瀹炰綋锛岃緭鍑?`No.` 寮€澶达紝骞惰鏄庢病鏈夌湅鍒版槑纭搴浉鍏充紭鎯犳垨涓讳綋涓嶅尮閰?7. 鐢ㄧ洰鏍囧浗瀹惰瑷€鏀瑰啓鎴愮畝娲?FAQ 绛旀
8. 妫€鏌ョ瓟妗堟槸鍚︿笉瓒呰繃 50 涓瘝锛屼笖娌℃湁缂栭€犱俊鎭?9. 浣跨敤 `scripts/faq_excel_tools.py` 鐢熸垚鏈€缁?Excel
## Final Sanitation
浜や粯鍓嶉€愭潯妫€鏌ワ細
- 鏈夋病鏈夋妸鏄庣‘鐨?`friends & family` 娲诲姩璇垽鎴?No
- 鏈夋病鏈夋妸鍛樺伐銆佸啗浜恒€佸鐢熴€佹暀甯堜紭鎯犺鐩栧灞炶鍒ゆ垚 No
- 鏈夋病鏈夋妸 `household card`銆乣household benefit`銆乣same-household discount` 婕忓垽涓?Yes
- 鏈夋病鏈夋妸鍙槸 `family-friendly` 鍦烘櫙銆佷絾娌℃湁浠讳綍浼樻儬淇℃伅鐨勫唴瀹硅鍒ゆ垚 Yes
- `Yes.` / `No.` 寮€澶磋鍒欐槸鍚︽墽琛?- 鍝佺墝涓讳綋鏄惁鍑虹幇
- 鏄惁鍒犻櫎浜?URL銆佹潵婧愬悕銆佹爣棰樻畫鐗?
## 璐ㄦ娓呭崟
浜や粯鍓嶇‘璁わ細
- 姣忎竴琛岄兘瀵瑰簲姝ｇ‘鍟嗗
- 姣忔潯绛旀閮?<= 50 涓瘝
- 姣忔潯绛旀閮戒娇鐢ㄦ纭浗瀹惰瑷€
- 姣忔潯绛旀閮藉彧淇濈暀鏍稿績浜嬪疄
- 鎵€鏈夋姌鎵ｆ暟鍊奸兘琚噯纭繚鐣?- 鍙瀛樺湪鏄庣‘瀹跺涵鐩稿叧浼樻儬銆佷环鏍笺€佹潈鐩婃垨閫傜敤瀵硅薄锛屽氨鍙互杈撳嚭 `Yes`
- 鍙湁鍦ㄦ病鏈夋槑纭搴浉鍏充紭鎯犮€佹垨鏉ユ簮鏄庢樉鏄敊瀹炰綋鏃舵墠杈撳嚭 `No`
- 鏈€缁堜氦浠樹负涓庢ā鏉垮瓧娈靛畬鍏ㄤ竴鑷寸殑 Excel 鏂囦欢
