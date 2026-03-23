name: student-discount-faq-skill
description: 褰撶敤鎴锋彁渚涜〃鏍硷紝骞跺笇鏈涘熀浜?Google AI Overview 鐨勭粨鏋滄憳瑕佺敓鎴?HotDeals 瀛︾敓浼樻儬 FAQ 鏃朵娇鐢ㄦ skill銆傝鍙栬緭鍏ヨ〃涓殑 country銆乼erm_name銆乨iscount_details锛屽垽鏂唴瀹逛富浣撲笌鍟嗗鏄惁涓€鑷达紝鍐嶆寜鎸囧畾 FAQ 妯℃澘杈撳嚭 Excel 鏂囦欢锛岀瓟妗堥渶浣跨敤瀵瑰簲鍥藉璇█銆佺畝娲佷笖绗﹀悎 SEO銆?---
# Student Discount FAQ Skill
浣犳槸 HD 鐨?SEO 涓撳锛屾鍦ㄤ负 HotDeals 鐨?student discount 椤甸潰鍋?FAQ 鍐呭浼樺寲銆?
褰撶敤鎴锋彁渚涗竴涓〃鏍硷紝骞惰姹傛牴鎹?Google AI Overview 鏀堕泦鍒扮殑 `discount_details` 鍐呭锛屾娊璞＄敓鎴?student discount FAQ锛屽苟涓ユ牸鎸夋寚瀹?Excel 妯℃澘杈撳嚭鏃讹紝浣跨敤姝?skill銆?
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
- `Subclass`锛氬浐瀹氬～ `student`
- `鏉垮潡鍚嶇О`锛氬浐瀹氬～ `faq`
- `Titile1`锛欶AQ 闂
- `Brief Introduction`锛欶AQ 绛旀
- `Href Kw`锛氱暀绌?- `Href Url`锛氱暀绌?
## Subclass 鑱氱劍瑙勫垯
- `Subclass` 鍐冲畾褰撳墠琛屽彧鑳藉啓杩欎竴绫绘満鍒讹紝涓嶈鎶婂叾浠栦紭鎯犵被鍒贩鍐欒繘绛旀
- 鍙彁鍙栦笌褰撳墠 `Subclass` 鐩存帴鐩稿叧鐨勪簨瀹烇紱鍏朵粬鎶樻墸銆佷細鍛樸€佽繑鍒┿€佺ぜ鍖呫€佹弧鍑忋€佸厤杩愮瓑淇℃伅锛岄櫎闈炲畠鏈韩灏辨槸璇?`Subclass` 鐨勯鍙栨潯浠舵垨浣跨敤闄愬埗锛屽惁鍒欎笉瑕佸啓鍏?- 濡傛灉婧愭枃鏈悓鏃舵彁鍒板绫讳紭鎯狅紝浼樺厛淇濈暀褰撳墠 `Subclass` 鐨勬牳蹇冩満鍒躲€佹暟鍊笺€佽幏鍙栨柟寮忋€侀檺鍒舵潯浠讹紝鍒犻櫎鏃犲叧绫诲埆鍐呭
- 涓嶈涓轰簡涓板瘜绛旀锛屾妸鍏朵粬浼樻儬绫诲埆鎷兼帴鎴愨€滈檮鍔犱俊鎭€?
妯℃澘鍙傝€冿細
- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`
闇€瑕佸鐞?Excel 鏃讹紝浣跨敤锛?
```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/student_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/student_output.json --output /path/to/output.xlsx
```
## 绛旀瑙勮寖
姣忔潯绛旀閮藉繀椤昏仛鐒﹂棶棰樻湰韬紝骞堕伒寰?Atomic Facts 瑙勮寖銆備紭鍏堜繚鐣欎互涓?3 涓牳蹇冧簨瀹烇細
1. 璇ュ晢瀹舵槸鍚︽湁瀛︾敓浼樻儬
2. 浼樻儬鍔涘害鏄灏戯紝濡傛灉鏈夋槑纭暟鍊煎繀椤诲啓鍑?3. 濡備綍鑾峰彇
### Complete Sentence Rule
杩欐槸 hard rule銆傛墍鏈夋渶缁堣緭鍑洪兘蹇呴』鏄畬鏁村彞銆?
- 绂佹鍙緭鍑?`yes`銆乣no`銆佸ぇ灏忓啓鐗囨銆佸崟璇嶇鐗囨垨鍗婂彞
- 绂佹杈撳嚭涓嶅甫涓昏鐨勬畫鍙ャ€佹爣棰樼鐗囥€佹爣绛剧鐗囨垨鎴柇鍙?- 鑻ユ槸鍚﹀畾绛旀锛屽繀椤讳娇鐢ㄥ畬鏁村彞褰㈠紡锛歚No. + 鍟嗗鍚?+ 缁撹`
- `no` 鍙兘浣滀负鍐呴儴鍐崇瓥淇″彿锛屼笉鑳界洿鎺ヤ綔涓烘渶缁?FAQ 鏂囨钀藉湴鍒拌緭鍑鸿〃
鍚﹀畾绛旀绀轰緥褰㈠紡锛?
- `No. Quill does not clearly advertise a standard student discount.`
- `No. DHC does not clearly advertise a standard student discount.`
## Student Offer Classification
鍦ㄦ寮忔敼鍐欏墠锛屽繀椤诲厛鍋氫竴娆?student offer 鍒嗙被銆傝繖涓楠ゅ彧鐢ㄤ簬鍒嗙被鍜屽喅绛栵紝涓嶆柊澧炰换浣曡緭鍑烘ā鏉匡紝涔熶笉鏀瑰彉鏈€缁?Excel 瀛楁缁撴瀯銆?
姣忎竴琛?source 蹇呴』鍏堣鍒ゅ畾涓轰互涓?5 绫讳箣涓€锛?
1. `Official student discount`
2. `Partner-platform student offer`
3. `Seasonal or limited student promotion`
4. `No standard student discount`
5. `Wrong merchant or ambiguous entity`
鍒嗙被纭鍒欙細
- Do not rewrite all student-related savings as a generic `Yes, [Brand] offers a student discount.`
- If the offer exists mainly through `Student Beans`銆乣UNiDAYS`銆乣Student Edge`銆乣SheerID` 鎴栫被浼肩涓夋柟楠岃瘉/浼樻儬骞冲彴锛岄粯璁ゅ垽涓?`Partner-platform student offer`锛涘彧鏈?source 鏄庣‘璇存槑鍝佺墝鑷繁闀挎湡杩愯惀 student program锛屾墠鍙垽涓?`Official student discount`
- If the source describes back-to-school銆乵ove-in銆乧ampaign code銆乼emporary event銆乴imited window銆乭oliday push 鎴栧叾浠栨椿鍔ㄥ瀷浼樻儬锛屽垽涓?`Seasonal or limited student promotion`
- If the source says there is no standard銆乶o official銆乶o dedicated銆乶o year-round student discount锛屽繀椤诲垽涓?`No standard student discount`锛屼笖绛旀涓嶅緱浠?`Yes` 寮€澶?- If the source merchant does not match the target merchant, or only matches another entity / another product / another platform, must classify as `Wrong merchant or ambiguous entity`
鍒嗙被涓庢敼鍐欒仈鍔ㄨ鍒欙細
- `Official student discount`锛氬彧鏈夊湪 source 鐩存帴鏀寔鍝佺墝瀹樻柟 student program 鏃讹紝鎵嶈兘鍐欐垚鏄庣‘鑲畾鍙?- `Partner-platform student offer`锛氬繀椤绘妸浼樻儬鍐欐垚骞冲彴鎻愪緵鎴栭€氳繃骞冲彴楠岃瘉鑾峰彇鐨?student offer锛屼笉寰楀啓鎴愬搧鐗屽畼鏂归暱鏈?student discount
- `Seasonal or limited student promotion`锛氬繀椤讳繚鐣欐椿鍔ㄥ瀷鎴栭樁娈垫€у睘鎬э紝涓嶅緱鏀瑰啓鎴愮ǔ瀹氬父椹?student discount
- `No standard student discount`锛氱瓟妗堝繀椤绘槑纭槸鍚﹀畾鎴栦笉鎴愮珛锛屼笉寰楁敼鍐欐垚鑲畾 `Yes`
- `Wrong merchant or ambiguous entity`锛氱瓟妗堢洿鎺ヨ緭鍑?`no`
鍚屾椂閬靛惊浠ヤ笅纭€ц姹傦細
- 姣忔潯绛旀鑷冲皯鍑虹幇涓€娆″搧鐗屼富浣擄紝浼樺厛鐩存帴浣跨敤 `term_name` 鎴栧彲纭鐨勮鑼冨搧鐗屽悕
- 鍝佺墝涓讳綋鍐欐硶蹇呴』骞插噣銆佽嚜鐒讹紝涓嶈鎶?URL銆佺綉椤垫爣棰樸€佹潵婧愬悕銆佸ぇ娈垫嫭鍙疯ˉ鍏呮垨瑙ｉ噴鎬ф墿鍐欐弶杩涚瓟妗?- 闄ら潪鎷彿鍐呭鏈韩灏辨槸娑堣垂鑰呭繀椤荤煡閬撶殑姝ｅ紡鏉冪泭鍚嶇О锛屽惁鍒欎笉瑕佸啓绫讳技 `LA Police Gear (LAPG) https://...`銆乣Navyist Rewards (part of ...)` 杩欑被涓嶈鑼冭〃杈?- 鍙啓涓庡綋鍓?`Subclass` 鐩稿叧鐨勫唴瀹癸紝涓嶈娣峰叆鍏朵粬浼樻儬绫诲埆
- 濡傛灉鍘熸枃鏄庣‘鎻愬埌闄愬埗銆佽祫鏍笺€侀€傜敤瀵硅薄銆侀獙璇佽姹傘€侀€傜敤鑼冨洿銆佹渶浣庢秷璐广€佹椂闂寸獥鍙ｃ€佸湴鍖洪檺鍒躲€佹槸鍚︿粎闄愭柊鐢ㄦ埛/浼氬憳/App/鐗瑰畾璁″垝銆佹槸鍚﹂檺鐗瑰畾鍟嗗搧鎴栧浗瀹讹紝杩欎簺淇℃伅涓庡綋鍓?`Subclass` 鐩存帴鐩稿叧鏃跺繀椤诲敖閲忓啓鍏?- 涓嶈鍙敼鍐欏師鏂囩涓€鍙ヨ瘽锛涘繀椤荤户缁鏌ュ悗鏂囷紝鎶婁笌褰撳墠 `Subclass` 鐩存帴鐩稿叧鐨勯珮浠峰€艰ˉ鍏呬俊鎭惛鏀惰繘绛旀
- 鍚庢枃涓嚒鏄秹鍙婇獙璇佹柟寮忋€佹湁鏁堟湡銆佷娇鐢ㄩ棬妲涖€侀鍙栨潯浠躲€侀€傜敤鑼冨洿銆佸湴鍖?浜虹兢闄愬埗銆佽喘涔版垨鍏戞崲鏂瑰紡鐨勫唴瀹癸紝鍙鏈変环鍊间笖涓嶅啿绐侊紝搴斾紭鍏堣ˉ鍏?50 璇嶅唴
- 濡傛灉鍘熸枃鏄繎浼兼暟鍊兼垨棰戠巼锛屽敖閲忔敼鍐欎负鏇寸ǔ鍋ョ殑浜嬪疄琛ㄨ揪锛涢伩鍏嶈繛缁爢鍙?`about`銆乣usually`銆乣around` 杩欑被妯＄硦璇?
濡傛灉浼樻儬鍔涘害娌℃湁鏄庣‘鏁板€硷細
- 涓嶈鍐欌€滈噾棰濇湭璇存槑鈥濃€滄姌鎵ｆ湭鐭モ€濃€滄湭娉ㄦ槑鍏蜂綋鏁板€尖€濊繖绫讳笉纭畾琛ㄨ堪
- 鐩存帴鐪佺暐閲戦淇℃伅锛屽彧淇濈暀宸茬粡纭鐨勫鐢熶紭鎯犱簨瀹炲拰鑾峰彇鏂瑰紡
- 涓嶈涓轰簡鍑戞弧 3 涓簨瀹炶€屽姞鍏ユā绯婃弿杩?
涓嶅緱娣诲姞锛?
- 鏇夸唬鐪侀挶鏂规
- 鍝佺墝鑳屾櫙
- 棰濆杩介棶寮曞
- 娌℃湁渚濇嵁鐨勭寽娴?
濡傛灉杩?3 涓牳蹇冧簨瀹炰笉瀹屾暣锛屽彧鑳借ˉ鍏呬笌 student discount 寮虹浉鍏炽€佷笖婧愭枃鏈腑鏄庣‘鍑虹幇鐨勪俊鎭紝灏ゅ叾瑕佷紭鍏堜粠鍚庢枃琛ヨ冻浼氬奖鍝嶇敤鎴峰垽鏂垨棰嗗彇鐨勯檺鍒舵潯浠躲€佹湁鏁堟湡鍜岄獙璇佽姹傘€?
### Official Plan-Based Discount Rule
杩欐槸 hard rule锛岄€傜敤浜?`Official student discount` 涓斾紭鎯犳湰韬睘浜?plan-based / membership-based / subscription-based / package-based 缁撴瀯鐨勫満鏅€?
- 鍏堜繚鐣欏畬鏁翠富鏀剁泭锛屽啀琛ラ檺鍒舵潯浠?- 涓嶈涓轰簡濉炲叆闄愬埗鏉′欢锛屾妸涓绘敹鐩婂啓娈嬨€佸垹鎺変竴鍗婏紝鎴栧彧鍓╅獙璇?璧勬牸鎻忚堪
- `瀹屾暣涓绘敹鐩奰 鑷冲皯搴斾繚鐣欑敤鎴锋渶鍏冲績鐨勪富瑕佹潈鐩婁俊鎭紝渚嬪锛氭姌鎵ｅ€笺€侀€傜敤璁″垝銆佹牳蹇冨椁愬樊寮傘€佹湀鐪侀噾棰濄€佷細鍛樹环宸垨涓昏 plan benefit
- 涓嶈鍙繚鐣欑缁熺殑 `verification required`銆乣verify your status`銆乣student verification needed` 杩欑被淇℃伅
- 鏈€缁堢瓟妗堥噷鑷冲皯淇濈暀 1 鏉℃渶鍏抽敭鐨勮祫鏍奸檺鍒舵垨閫傜敤闄愬埗锛屼緥濡傦細浠呴檺鏂扮敤鎴枫€佷粎闄愮壒瀹?plan銆佷粎闄愮壒瀹?line 鏁般€佷粎闄?college students銆佷粎闄愮壒瀹?account role銆佷粎闄愭寚瀹氬湴鍖烘垨瀛︽牎浣撶郴
- 濡傛灉瀛楁暟浠嶇劧鍏佽锛屼笖 source 涓彟鏈?1 鏉′細鏄庢樉褰卞搷鐢ㄦ埛鍒ゆ柇鎴栭鍙栫殑娆″叧閿檺鍒讹紝鍙互鍐嶈ˉ 1 鏉★紱涓嶈缁х画鍫嗙爩鏇村鏉′欢
- 璧勬牸闄愬埗浼樺厛绾ч珮浜庢硾娉涚殑楠岃瘉鎻忚堪锛涘鏋滀袱鑰呮棤娉曞悓鏃朵繚鐣欙紝搴斾紭鍏堜繚鐣欐渶鍏抽敭鐨勮祫鏍奸檺鍒?- 涓嶈鎶婃棤鍏抽檺鍒跺杩涚瓟妗堬紱鍙繚鐣欎笌棰嗗彇鎴栭€傜敤璧勬牸鐩存帴鐩稿叧鐨勬潯浠?
## Unsupported Qualifier Ban
杩欐槸 hard rule锛屼笉鏄啓浣滃缓璁€?
Do not add qualifiers such as:
- `seasonal`
- `limited-time`
- `partner-only`
- `official`
- `sitewide`
- `ongoing`
unless the source directly supports that qualifier for the main student offer.
濡傛灉 source 娌℃湁鐩存帴鏀寔杩欎簺闄愬畾璇嶏紝绂佹涓轰簡鈥滄洿瀹夊叏鈥濊€岃嚜琛岃剳琛ュ姞鍏ャ€?
If support is unclear, use neutral wording such as:
- `public details are limited`
- `available offers vary by platform or promotion`
- `does not clearly advertise a standard student discount`
Do not invent a timing, scope, or exclusivity qualifier just to make the answer sound safer.
杩欐潯瑙勫垯蹇呴』鐗瑰埆闃叉锛?
- 鎶?`Newegg` 杩欑被 source 宸叉槑纭敮鎸佺殑瀛︾敓璁″垝锛岃鍐欐垚 `limited-time`
- 鍦ㄦ病鏈夎瘉鎹椂鑷琛ュ啓 `seasonal`銆乣partner-only`銆乣official`
- 鎶婂钩鍙?offer 寮鸿鏀瑰啓鎴愬畼鏂瑰父椹婚」鐩紝鎴栨妸瀹樻柟椤圭洰鍙嶅悜鏀瑰啓鎴愭棤渚濇嵁鐨勬椿鍔ㄥ瀷浼樻儬
## 涓讳綋涓€鑷存€у垽鏂?
杩欐槸 hard rule銆傚繀椤诲垽鏂簮鍐呭涓殑浼樻儬涓讳綋锛屾槸鍚︿笌璇ヨ鐩爣鍟嗗涓哄悓涓€涓讳綋銆?
### Merchant Name Lock
鏈€缁堢瓟妗堜腑鐨勫搧鐗屽悕蹇呴』涓庣敤鎴锋煡璇腑鐨勭洰鏍囧晢瀹朵竴鑷达紝鎴栬€呮槸鍙竻鏅扮‘璁ょ殑绛変环瑙勮寖鍖栧啓娉曘€?
- 涓嶅緱鎶婄洰鏍囧晢瀹舵浛鎹㈡垚鍙︿竴涓搧鐗屻€佸彟涓€涓骇鍝佸悕銆佸彟涓€涓钩鍙板悕
- 涓嶅緱鎶婄涓夋柟骞冲彴鍚嶅綋浣滅洰鏍囧搧鐗屼富浣撳啓鍏ヤ富鍙?- 涓嶅緱鎶?source 涓嚭鐜扮殑鍏朵粬鍝佺墝銆佺洰褰曞悕銆侀〉闈㈠悕銆侀獙璇佸钩鍙板悕璇綋鎴愮洰鏍囧搧鐗?
### Merchant Name Validation
濡傛灉绛旀涓嚭鐜颁互涓嬩换涓€鎯呭喌锛岀瓟妗堝繀椤昏鎷掔粷骞堕噸鍐欙細
- another merchant entity
- duplicated merchant names
- partially corrupted merchant names
- truncated merchant names
蹇呴』鐗瑰埆鎷︽埅浠ヤ笅閿欒绫诲瀷锛?
- `Quill` -> `QuillBot`
- `Musicians Friend Musician's Friend`
- `Verizon Discount Details ...`
- `Frequently provides a limited-time offers ...`
- 浠讳綍 source headings / broken fragments / duplicated brand text
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
浠ヤ笅鎯呭喌绛旀鐩存帴杈撳嚭 `no`锛?
- 浼樻儬涓讳綋鏄彟涓€涓晢瀹?- 鍐呭璁茬殑鏄钩鍙般€佺涓夋柟椤圭洰鎴栨棤鍏充細鍛樹綋绯伙紝鑰屼笉鏄洰鏍囧晢瀹舵湰韬?- 鏂囨湰鍦ㄦ牳蹇冨搧鐗屽悕涓婃棤娉曚笌鐩爣鍟嗗寤虹珛鍚堢悊瀵瑰簲锛屼笖娌℃湁浠讳綍涓婁笅鏂囧彲鏀寔鍚屼竴涓讳綋鍒ゆ柇
濡傛灉鍘绘帀涓婅堪甯歌鍚庣紑鍚庯紝涓讳綋鍚嶇О鑳芥竻鏅板搴斿悓涓€鍝佺墝锛屽垯瑙嗕负鍚屼竴涓讳綋锛屼笉瑕佷粎鍥犳硶浜哄悗缂€宸紓銆佽瑷€宸紓鎴栬交寰彉浣撹緭鍑?`no`銆?
褰撴牳蹇冨晢瀹跺悕涓€鑷达紝鎴栬櫧鏈夎法璇█/鍙樹綋鍐欐硶浣嗕粛鍙悎鐞嗗垽鏂负鍚屼竴鍝佺墝鏃讹紝搴旀斁瀹藉鐞嗭紝涓嶈鍥犱负璇佹嵁闂ㄦ杩囬珮鐩存帴鍒や负 `no`銆傚彧鏈夊湪涓讳綋鏄庣‘涓嶅尮閰嶏紝鎴栫‘瀹炴棤娉曞悎鐞嗗搴旀椂锛屾墠杈撳嚭 `no`銆?
## Output Rejection Conditions
杩欐槸鏈€缁堟嫤鎴鍒欍€傚懡涓换涓€鏉★紝绛旀蹇呴』 rejected and rewritten锛涗笉瑕佸甫鐫€闂缁х画杈撳嚭銆?
Reject and rewrite the answer if any of the following appear:
- the merchant name does not match the target merchant
- another merchant appears in the answer
- source headings or labels remain, such as `Discount Details`銆乣How to Apply`銆乣How to Get` 鎴栫被浼?fragments
- unsupported qualifiers were added
- duplicated words, broken syntax, malformed fragments, or half-sentences remain
- the answer presents a partner-platform offer as an official student discount
- the final output is not a complete sentence
- a negative answer is output as `no` or another incomplete fragment instead of a full sentence
- for an official plan-based discount, the answer keeps only restrictions but drops part of the main offer
鎵ц瑕佹眰锛?
- 鍏堟鏌ュ搧鐗屽疄浣擄紝鍐嶆鏌?offer classification锛屾渶鍚庢鏌ュ彞闈㈠共鍑€搴?- 鍙浠嶆畫鐣欐爣棰樼鐗囥€佹潵婧愭畫鐗囥€佸崐鍙ャ€佸潖鍙ャ€佸搧鐗屽弻鍐欍€佸疄浣撻敊閰嶏紝灏卞繀椤婚噸鍐?- 涓嶅厑璁镐互鈥滃熀鏈兘鐪嬫噦鈥濅负鐞嗙敱鏀捐鍧忚緭鍑?- 涓嶅厑璁告妸 partner-platform offer 鐢?`Yes, [Brand] offers a student discount` 杩欑瀹樻柟甯搁┗鍙ｅ惢鐩存帴钀藉湴
- 涓嶅厑璁告妸 `no standard / no official / no year-round` 绫诲瀷 source 鏀瑰啓鎴愯偗瀹氬彞
- 涓嶅厑璁告妸鍚﹀畾缁撹鍐欐垚鍗曠嫭鐨?`no`
- 涓嶅厑璁镐负浜嗚ˉ闄愬埗锛屾妸瀹樻柟濂楅鍨嬫姌鎵ｇ殑涓绘敹鐩婂垹娈?
## 鍐欎綔瑕佹眰
- 涓嶆敼鍙樺師鎰?- 淇濈暀鎵€鏈夐噸瑕佹牳蹇冧簨瀹?- 鍒犻櫎閲嶅鍜屽墠鍚庣煕鐩捐〃杩?- 鍚屼竴浼樻儬銆侀棬妲涖€侀檺鍒舵垨鏉′欢涓嶈鎹㈠彞閲嶅璇翠袱閬?- 浼樺厛浣跨敤鐩存帴銆佷簨瀹炲瀷琛ㄨ揪
- 绂佹浣跨敤鈥渂ut no fixed discount amount is stated鈥濆強鍚岀被涓嶇‘瀹氬厹搴曞彞寮?- 涓嶅悓琛岀瓟妗堢殑琛ㄨ揪鏂瑰紡灏介噺鑷劧鍙樺寲锛岄伩鍏嶆壒閲忔ā鏉挎劅
- 閬垮厤杩炵画浣跨敤 `about`銆乣usually`銆乣around` 绛夋ā绯婅瘝锛涘鍘熸枃纭疄鍙湁杩戜技琛ㄨ揪锛屾渶澶氫繚鐣欎竴涓繀瑕佺殑妯＄硦鎻愮ず
- 瑕佷繚鐣?source 宸叉槑纭敮鎸佺殑闄愬畾璇師鎰忥紝浣嗕笉瑕佹満姊扮‖鎻掞紱濡傛灉 source 娌℃湁鐩存帴鏀寔锛屼笉寰楄嚜琛屾坊鍔?- 浼樺厛鍐欐竻妤氬搧鐗屻€佹満鍒躲€侀棬妲涖€侀檺鍒讹紝鍐嶅啓琛ュ厖淇℃伅
- 涓嶈鎶?URL銆佺綉椤垫爣棰樸€佹潵婧愮珯鍚嶃€佹潵婧愭嫭鍙锋敞閲婄洿鎺ュ啓杩?FAQ 姝ｆ枃
- 涓嶈鐢?`鍝佺墝鍚?(domain.com)` 杩欑鏂瑰紡琛ュ厖璇存槑鍩熷悕锛涙鏂囬噷鍙繚鐣欒嚜鐒跺搧鐗屽悕
- 瀹炰綋閿佸畾瑕佹洿涓ユ牸锛涘厑璁?`Anthony Robbins` / `Tony Robbins`銆乣Dental Plans` / `DentalPlans.com`銆乣Sam's Club` / `Sam鈥檚 Club`銆乣Kiehls` / `Kiehl's` 杩欑被绛変环鍐欐硶锛屼絾涓嶈鎶婁袱涓悕瀛楁満姊板苟鍒楀埌鍚屼竴鍙ラ噷
- 璇皵鍙嬪ソ銆佺揣鍑?- 涓ユ牸鎺у埗鍦?50 涓崟璇嶄互鍐?
## 璇█瑙勫垯
绛旀蹇呴』浣跨敤 `country` 瀵瑰簲鍥藉鐨勫父鐢ㄨ瑷€銆?
渚嬪锛?
- `US`銆乣UK`銆乣CA`銆乣AU`锛氳嫳鏂?- `DE`锛氬痉鏂?- `FR`锛氭硶鏂?- `ES`锛氳タ鐝墮鏂?- `IT`锛氭剰澶у埄鏂?- `JP`锛氭棩鏂?
濡傛灉鍥藉涓庤瑷€鐨勫搴斿叧绯讳笉澶熸槑纭紝浣跨敤璇ュ浗瀹剁敤鎴锋渶甯歌鐨勯潰鍚戞秷璐硅€呰瑷€銆?
## 闂鐢熸垚瑙勫垯
`Titile1` 闇€瑕佺敓鎴愪竴涓竻鏅般€佽嚜鐒躲€佷笌 `term_name` 瀵归綈鐨?student discount FAQ 闂銆?
浼樺厛鍙ュ紡锛?
- `Does {Merchant} offer a student discount?`
濡傛灉鐩爣鍥藉涓嶆槸鑻辫鐜锛屽簲缈昏瘧鎴愬搴旇瑷€銆?
## 鎵ц娴佺▼
閫愯澶勭悊鏃讹紝鎸変互涓嬫楠わ細
1. 浠?`term_name` 璇嗗埆鐩爣鍟嗗
2. 闃呰 `discount_details`锛屽彧鎻愬彇 student discount 鐩稿叧浜嬪疄銆佽幏鍙栨柟寮忓拰闄愬埗鏉′欢
   - 涓嶈鍋滃湪绗竴鍙ヨ瘽锛涚户缁鏌ュ悗鏂囨槸鍚﹁繕鏈夐獙璇併€佹湁鏁堟湡銆侀€傜敤鑼冨洿銆佸湴鍖洪檺鍒躲€佷娇鐢ㄩ棬妲涚瓑楂樹环鍊间俊鎭?3. 鍏堝畬鎴?`Student Offer Classification`
4. 鍒ゆ柇婧愬唴瀹逛腑鐨勫晢瀹朵富浣撴槸鍚︿笌鐩爣鍟嗗涓€鑷达紝骞舵墽琛?`Merchant Name Lock`
4. 鍋氬嚭缁撹锛?   - 鑻ュ垎绫绘槸 `Official student discount`锛氬啓鏄庢湁銆佹姌鎵ｅ€硷紙鑻ユ湁鏄庣‘鏁板€硷級銆佽幏鍙栨柟寮忥紝浠ュ強涓庡鐢熶紭鎯犵洿鎺ョ浉鍏崇殑闄愬埗鎴栬姹?   - 鑻ュ垎绫绘槸 `Partner-platform student offer`锛氭槑纭啓鎴愰€氳繃绗笁鏂瑰钩鍙拌幏鍙栨垨楠岃瘉鐨?student offer锛屼笉寰楀啓鎴愬搧鐗屽畼鏂归暱鏈熼」鐩?   - 鑻ュ垎绫绘槸 `Seasonal or limited student promotion`锛氭槑纭繚鐣欐椿鍔ㄥ瀷鎴栭樁娈垫€у睘鎬э紝涓嶅緱钀芥垚甯搁┗ student discount
   - 鑻ュ垎绫绘槸 `No standard student discount`锛氭槑纭啓鍚﹀畾锛屼笉寰椾互 `Yes` 寮€澶达紝涓斿繀椤昏緭鍑哄畬鏁村彞
   - 鑻ュ垎绫绘槸 `Wrong merchant or ambiguous entity`锛屾垨涓讳綋鏄庣‘涓嶄竴鑷达紝鎴栫‘瀹炴棤娉曞悎鐞嗗搴旓細杈撳嚭閽堝鐩爣鍟嗗鐨勫畬鏁村惁瀹氬彞锛屼笉瑕佸彧鍐?`no`
5. 鐢ㄧ洰鏍囧浗瀹惰瑷€鏀瑰啓鎴愮畝娲?FAQ 绛旀锛屽苟纭繚绛旀閲岃嚦灏戝嚭鐜颁竴娆℃纭搧鐗屼富浣?6. 鎵ц `Complete Sentence Rule`
7. 鎵ц `Unsupported Qualifier Ban`锛屽垹闄ゆ墍鏈夋棤 source 鏀寔鐨勯檺瀹氳瘝
8. 鎵ц `Output Rejection Conditions`锛屽懡涓换涓€鏉″氨閲嶅啓
9. 浣跨敤 `scripts/faq_excel_tools.py` 鐢熸垚鏈€缁?Excel
## Final Sanitation
杈撳嚭鍓嶅繀椤诲啀娆℃鏌ワ細
- 鍒嗙被鏄惁姝ｇ‘锛涙湁娌℃湁鎶?partner-platform offer 鍐欐垚瀹樻柟鏀跨瓥
- 鏈夋病鏈夋妸 `no standard`銆乣no official`銆乣no year-round` 鏀规垚鑲畾 `Yes`
- 鏈夋病鏈夊湪娌℃湁鍘熸枃璇佹嵁鏃惰嚜琛岃ˉ鍐?`seasonal`銆乣limited-time`銆乣partner-only`銆乣official`銆乣sitewide`銆乣ongoing`
- 鏈夋病鏈夋畫鐣?`Discount Details`銆乣How to Apply`銆乣How to Get`銆乣Source` 绛夋爣棰樻垨鏉ユ簮娈嬬墖
- 鏈夋病鏈夊嚭鐜板搧鐗岄敊閰嶃€佸搧鐗屽弻鍐欍€佹埅鏂搧鐗屻€佸潖鍙ャ€佸崐鍙ャ€乻ource debris
- 鏈夋病鏈夊嚭鐜?`QuillBot` 浠ｆ浛 `Quill`銆乣Musicians Friend Musician's Friend`銆乣Verizon Discount Details ...` 杩欑被蹇呴』鎷︽埅鐨勯敊璇?- 鏈夋病鏈夊嚭鐜?`Zarda Barbecue (zarda.com)` 杩欑被鍝佺墝鍚嶅悗璺熸嫭鍙峰煙鍚嶇殑鍐欐硶
- 鏈€缁堢瓟妗堟槸涓嶆槸瀹屾暣鍙ワ紱鍚﹀畾绛旀鏄惁涓?`No. + 鍟嗗鍚?+ 缁撹`
- 瀹樻柟濂楅鍨嬫姌鎵ｆ槸鍚﹀厛淇濈暀浜嗗畬鏁翠富鏀剁泭锛屽啀琛?1 鏉℃渶鍏抽敭闄愬埗
## 璐ㄦ娓呭崟
浜や粯鍓嶇‘璁わ細
- 姣忎竴琛岄兘瀵瑰簲姝ｇ‘鍟嗗
- 姣忔潯绛旀閮?<= 50 璇?- 姣忔潯绛旀閮戒娇鐢ㄦ纭浗瀹惰瑷€
- 姣忔潯绛旀閮借嚦灏戝嚭鐜颁竴娆″搧鐗屼富浣?- 姣忔潯绛旀閮藉彧鍐欏綋鍓?`Subclass` 瀵瑰簲鍐呭
- 姣忔潯绛旀閮藉彧淇濈暀鏍稿績浜嬪疄
- 鎵€鏈夋姌鎵ｆ暟鍊奸兘琚噯纭繚鐣?- 涓庡綋鍓?`Subclass` 鐩存帴鐩稿叧鐨勯檺鍒躲€佽祫鏍笺€佸湴鍖鸿寖鍥村拰瑕佹眰閮藉敖閲忎繚鐣欍€佹病鏈夋槑鏄鹃仐婕?- 娌℃湁鍑虹幇鈥滃彧鏀瑰啓棣栧彞銆佸悗鏂囨湁鏁堜俊鎭湭鍚告敹鈥濈殑鎯呭喌
- 娌℃湁鎶婂悓涓€浼樻儬鎴栧悓涓€闄愬埗鏉′欢閲嶅鍙欒堪
- 娌℃湁鍑虹幇 URL銆佹潵婧愭爣棰樻垨涓嶈鑼冩嫭鍙锋墿鍐欏紡鍝佺墝琛ㄨ揪
- 娌℃湁杩炵画鍫嗗彔 `about`銆乣usually`銆乣around` 绛夋ā绯婅瘝
- 鍙湁涓讳綋鏄庣‘涓嶅尮閰嶆垨纭疄鏃犳硶鍚堢悊瀵瑰簲鏃舵墠杈撳嚭 `no`
- 鏈€缁堜氦浠樹负涓庢ā鏉垮瓧娈靛畬鍏ㄤ竴鑷寸殑 Excel 鏂囦欢
