name: child-discount-faq-skill
description: 褰撶敤鎴锋彁渚涜〃鏍硷紝骞跺笇鏈涘熀浜?Google AI Overview 鐨勭粨鏋滄憳瑕佺敓鎴?HotDeals 鍎跨浼樻儬 FAQ 鏃朵娇鐢ㄦ skill銆傝鍙栬緭鍏ヨ〃涓殑 country銆乼erm_name銆乨iscount_details锛屽垽鏂唴瀹逛富浣撲笌鍟嗗鏄惁涓€鑷达紝鍐嶆寜鎸囧畾 FAQ 妯℃澘杈撳嚭 Excel 鏂囦欢锛岀瓟妗堥渶浣跨敤瀵瑰簲鍥藉璇█銆佺畝娲佷笖绗﹀悎 SEO銆?---
# Child Discount FAQ Skill
浣犳槸 HD 鐨?SEO 涓撳锛屾鍦ㄤ负 HotDeals 鐨?child discount 椤甸潰鍋?FAQ 鍐呭浼樺寲銆?
褰撶敤鎴锋彁渚涗竴涓〃鏍硷紝骞惰姹傛牴鎹?Google AI Overview 鏀堕泦鍒扮殑 `discount_details` 鍐呭锛屾娊璞＄敓鎴?child discount FAQ锛屽苟涓ユ牸鎸夋寚瀹?Excel 妯℃澘杈撳嚭鏃讹紝浣跨敤姝?skill銆?
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
- `Subclass`锛氬浐瀹氬～ `child`
- `鏉垮潡鍚嶇О`锛氬浐瀹氬～ `faq`
- `Titile1`锛欶AQ 闂
- `Brief Introduction`锛欶AQ 绛旀
- `Href Kw`锛氱暀绌?- `Href Url`锛氱暀绌?
## Subclass 鑱氱劍瑙勫垯
- `Subclass` 鍐冲畾褰撳墠琛屽彧鑳藉啓杩欎竴绫绘満鍒讹紝涓嶈鎶婂叾浠栦紭鎯犵被鍒贩鍐欒繘绛旀
- 鍙彁鍙栦笌褰撳墠 `Subclass` 鐩存帴鐩稿叧鐨勪簨瀹烇紱鍏朵粬鎶樻墸銆佷細鍛樸€佽繑鍒┿€佺ぜ鍖呫€佹弧鍑忋€佸厤杩愮瓑淇℃伅锛岄櫎闈炲畠鏈韩灏辨槸璇?`Subclass` 鐨勯鍙栨潯浠舵垨浣跨敤闄愬埗锛屽惁鍒欎笉瑕佸啓鍏?- 濡傛灉婧愭枃鏈悓鏃舵彁鍒板绫讳紭鎯狅紝浼樺厛淇濈暀褰撳墠 `Subclass` 鐨勬牳蹇冩満鍒躲€佹暟鍊笺€佽幏鍙栨柟寮忋€侀檺鍒舵潯浠讹紝鍒犻櫎鏃犲叧绫诲埆鍐呭
- 涓嶈涓轰簡涓板瘜绛旀锛屾妸鍏朵粬浼樻儬绫诲埆鎷兼帴鎴愨€滈檮鍔犱俊鎭€?
## Child Discount 瀹氫箟
褰撳墠 skill 鐨勭洰鏍囬棶棰樻槸锛?
- 杩欎釜 merchant 鏄惁瀛樺湪鍙互闈㈠悜鍎跨銆佹湭鎴愬勾浜恒€乧hild category 鏄庣‘璁ゅ畾鐨勪紭鎯犮€佸効绔ョエ浠枫€佸効绔ュ厤璐规斂绛栥€佸効绔ヤ笓灞炴姌鎵ｆ垨鍎跨鐩稿叧涓撳睘鏉冪泭
`child discount` 鍦ㄦ湰 skill 涓彧鎺ュ彈浠ヤ笅 4 绫昏瘉鎹細
### A. 鏄庣‘鐨勫効绔ョエ浠?/ 鍎跨瀹氫环
杩欑被璇佹嵁鍙洿鎺ユ敮鎸?`Yes`锛?
- `child fare`
- `child ticket`
- `child price`
- `junior price`
- `kids rate`
- `child pass`
- `reduced fare for children`
- `discounted child admission`
### B. 鏄庣‘鐨勫効绔ュ厤璐规斂绛?
杩欑被璇佹嵁鍙洿鎺ユ敮鎸?`Yes`锛?
- `kids stay free`
- `children under X stay free`
- `children under X free admission`
- `infants travel free or reduced`
- `children under X enter free`
### C. 鏄庣‘閽堝鍎跨鍟嗗搧 / 鍎跨鍒嗙被鐨勪紭鎯?
杩欑被璇佹嵁鍙湪淇℃伅鏄庣‘鎸囧悜 merchant 鑷韩鐨?kids category / kids collection / kids sale / kids clearance / children's products discount 鏃舵墠鍙繚鐣欙細
- `kids sale section`
- `children's clearance`
- `discounted kids' shoes`
- `reduced-price children's eyewear`
- `sale pricing on kids' apparel`
杩欐槸杈冨急鐨?`Yes` 绫诲瀷銆傚彧鑳藉啓鎴?`discounted kids' items`銆乣kids' items in sale or clearance sections`銆乣discounted children's products` 杩欎竴绫诲厠鍒跺彞寮忋€?
### D. 鏄庣‘鐨勫効绔ヤ笓灞炴潈鐩?/ 鍎跨涓撳睘娲诲姩浼樻儬
杩欑被璇佹嵁鍙洿鎺ユ敮鎸?`Yes`锛?
- `child birthday coupon`
- `kids class participant discount`
- `junior gear special pricing`
- `child-only pass pricing`
- `kid-specific bundle discount`
## 蹇呴』鍒?No 鐨勬儏鍐?
浠ヤ笅鎯呭喌鍗充娇鍑虹幇浜?`child`銆乣kids`銆乣student`銆乣school` 绛夎瘝锛屼篃涓嶈兘鐩存帴鍒?`Yes`锛?
### 1. 瀛︾敓浼樻儬 / 鏁欒偛浼樻儬涓嶇瓑浜?child discount
浠ヤ笅閮戒笉绠?child discount锛?
- `student discount`
- `education pricing`
- `school pricing`
- `teacher / educator offers`
- `academic membership`
- `back-to-school` 鐨勬硾淇冮攢锛岄櫎闈炴槑纭彧閽堝 kids products 鎴?child fares
### 2. 涓嶆槸 merchant 鑷韩锛岃€屾槸閿欒瀹炰綋 / 鍚屽悕瀹炰綋
濡傛灉鍙傝€冧俊鎭槑鏄炬寚鍚戝彟涓€涓搧鐗屻€佸湴鐐广€佹櫙鐐广€佹満鏋勩€乫ranchise銆佸湴鍖虹増鏈垨 legal entity锛屼笉鑳芥嬁鏉ュ洖绛斿綋鍓?merchant銆?
### 3. 鍙槸鍗?kids products锛屼絾娌℃湁鏄庣‘浼樻儬鎴栧効绔ヤ环
浠呭嚭鐜颁互涓嬪唴瀹硅繕涓嶅锛?
- `kids category`
- `children's products`
- `kids collection`
- `children's items`
蹇呴』鍚屾椂鍑虹幇鎶樻墸銆佷紭鎯犱环銆佸効绔ョエ浠枫€佸厤璐规斂绛栨垨鍎跨涓撳睘鏉冪泭銆?
### 4. 鍙槸娉涘晢鍝佷績閿€锛屼笖娌℃湁鏄庣‘鎸囧悜 kids
浠ヤ笅榛樿涓嶇畻 child discount锛?
- `sitewide sale`
- `seasonal sale`
- `newsletter discount`
- `clearance`
闄ら潪鍘熸枃鏄庣‘璇存槑瀹冮€傜敤浜?kids items銆乧hild fares銆乧hild pricing 鎴?child access銆?
### 5. 鍙湁绗笁鏂瑰钩鍙?/ 鑱氬悎椤?/ 璁哄潧 / 娉涙帹鑽愭枃绔犲湪鎺ㄦ柇
濡傛灉鍙湁绗笁鏂瑰湪璇粹€滃彲鑳芥湁鈥濃€滅粡甯告湁鈥濃€滃彲浠ョ湅鐪嬧€濓紝浣嗘病鏈夎冻澶熻瘉鎹瘉鏄?merchant 鏈韩鏄庣‘鎻愪緵 child discount锛屽簲淇濆畧澶勭悊銆傞€氬父杈撳嚭瀹屾暣 `No` 鍙ワ紱鍙湁鏂瑰悜鍩烘湰姝ｇ‘浣嗗姏搴︿笉瓒虫椂锛屾墠鍏佽 `appears to`銆?
### 6. 瀹跺涵璁″垝 / 淇濋櫓璁″垝 / 浼氬憳璁″垝 / 鏈烘瀯鎺堟潈
浠ヤ笅榛樿涓嶇畻 child discount锛?
- `pediatric plan`
- `family plan`
- `school license`
- `classroom license`
- `institutional pricing`
闄ら潪瀹冭兘琚槑纭敼鍐欎负褰撳墠 merchant 闈㈠悜 child 鐨勭洿鎺ヤ紭鎯犳満鍒讹紝鍚﹀垯涓嶈鍐欒繘 FAQ銆?
妯℃澘鍙傝€冿細
- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`
闇€瑕佸鐞?Excel 鏃讹紝浣跨敤锛?
```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/child_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/child_output.json --output /path/to/output.xlsx
```
## 绛旀瑙勮寖
姣忔潯绛旀閮藉繀椤昏仛鐒﹂棶棰樻湰韬紝骞堕伒寰?Atomic Facts 瑙勮寖銆備紭鍏堜繚鐣欎互涓?3 涓牳蹇冧簨瀹烇細
1. 璇ュ晢瀹舵槸鍚︽湁鍎跨浼樻儬
2. 浼樻儬鍔涘害鏄灏戯紝濡傛灉鏈夋槑纭暟鍊煎繀椤诲啓鍑?3. 濡備綍鑾峰彇
鍚屾椂閬靛惊浠ヤ笅纭€ц姹傦細
- 姣忔潯绛旀鑷冲皯鍑虹幇涓€娆″搧鐗屼富浣擄紝浼樺厛鐩存帴浣跨敤 `term_name` 鎴栧彲纭鐨勮鑼冨搧鐗屽悕
- 鍝佺墝涓讳綋鍐欐硶蹇呴』骞插噣銆佽嚜鐒讹紝涓嶈鎶?URL銆佺綉椤垫爣棰樸€佹潵婧愬悕銆佸ぇ娈垫嫭鍙疯ˉ鍏呮垨瑙ｉ噴鎬ф墿鍐欐弶杩涚瓟妗?- 闄ら潪鎷彿鍐呭鏈韩灏辨槸娑堣垂鑰呭繀椤荤煡閬撶殑姝ｅ紡鏉冪泭鍚嶇О锛屽惁鍒欎笉瑕佸啓绫讳技 `LA Police Gear (LAPG) https://...`銆乣Navyist Rewards (part of ...)` 杩欑被涓嶈鑼冭〃杈?- 鍙啓涓庡綋鍓?`Subclass` 鐩稿叧鐨勫唴瀹癸紝涓嶈娣峰叆鍏朵粬浼樻儬绫诲埆
- 濡傛灉鍘熸枃鏄庣‘鎻愬埌闄愬埗銆佽祫鏍笺€侀€傜敤瀵硅薄銆侀獙璇佽姹傘€侀€傜敤鑼冨洿銆佹渶浣庢秷璐广€佹椂闂寸獥鍙ｃ€佸湴鍖洪檺鍒躲€佹槸鍚︿粎闄愭柊鐢ㄦ埛/浼氬憳/App/鐗瑰畾璁″垝銆佹槸鍚﹂檺鐗瑰畾鍟嗗搧鎴栧浗瀹讹紝杩欎簺淇℃伅涓庡綋鍓?`Subclass` 鐩存帴鐩稿叧鏃跺繀椤诲敖閲忓啓鍏?- 涓嶈鍙敼鍐欏師鏂囩涓€鍙ヨ瘽锛涘繀椤荤户缁鏌ュ悗鏂囷紝鎶婁笌褰撳墠 `Subclass` 鐩存帴鐩稿叧鐨勯珮浠峰€艰ˉ鍏呬俊鎭惛鏀惰繘绛旀
- 鍚庢枃涓嚒鏄秹鍙婇獙璇佹柟寮忋€佹湁鏁堟湡銆佷娇鐢ㄩ棬妲涖€侀鍙栨潯浠躲€侀€傜敤鑼冨洿銆佸湴鍖?浜虹兢闄愬埗銆佽喘涔版垨鍏戞崲鏂瑰紡鐨勫唴瀹癸紝鍙鏈変环鍊间笖涓嶅啿绐侊紝搴斾紭鍏堣ˉ鍏?50 璇嶅唴
- 濡傛灉鍘熸枃鏄繎浼兼暟鍊兼垨棰戠巼锛屽敖閲忔敼鍐欎负鏇寸ǔ鍋ョ殑浜嬪疄琛ㄨ揪锛涢伩鍏嶈繛缁爢鍙?`about`銆乣usually`銆乣around` 杩欑被妯＄硦璇?
濡傛灉浼樻儬鍔涘害娌℃湁鏄庣‘鏁板€硷細
- 涓嶈鍐欌€滈噾棰濇湭璇存槑鈥濃€滄姌鎵ｆ湭鐭モ€濃€滄湭娉ㄦ槑鍏蜂綋鏁板€尖€濊繖绫讳笉纭畾琛ㄨ堪
- 鐩存帴鐪佺暐閲戦淇℃伅锛屽彧淇濈暀宸茬粡纭鐨勫効绔ヤ紭鎯犱簨瀹炲拰鑾峰彇鏂瑰紡
- 涓嶈涓轰簡鍑戞弧 3 涓簨瀹炶€屽姞鍏ユā绯婃弿杩?
涓嶅緱娣诲姞锛?
- 鏇夸唬鐪侀挶鏂规
- 鍝佺墝鑳屾櫙
- 棰濆杩介棶寮曞
- 娌℃湁渚濇嵁鐨勭寽娴?
濡傛灉杩?3 涓牳蹇冧簨瀹炰笉瀹屾暣锛屽彧鑳借ˉ鍏呬笌 child discount 寮虹浉鍏炽€佷笖婧愭枃鏈腑鏄庣‘鍑虹幇鐨勪俊鎭紝灏ゅ叾瑕佷紭鍏堜粠鍚庢枃琛ヨ冻浼氬奖鍝嶇敤鎴峰垽鏂垨棰嗗彇鐨勯檺鍒舵潯浠躲€佹湁鏁堟湡鍜岄€傜敤鑼冨洿銆?
## 瀹炰綋璇嗗埆瑙勫垯
鍦ㄥ垽鏂墠锛屽厛纭鍙傝€冧俊鎭鐨勬槸褰撳墠 merchant 鏈綋銆?
浠ヤ笅鎯呭喌浼樺厛瑙嗕负瀹炰綋娣锋穯椋庨櫓锛?
- 鍟嗗鍚嶈繃浜庨€氱敤
- 鎼滅储缁撴灉娣峰叆鍚屽悕鏅偣銆侀厭搴椼€佸鏍°€佹湇鍔℃垨 app
- 缁撴灉涓殑鍝佺墝鍩熷悕銆佷笟鍔＄被鍨嬨€佸浗瀹舵垨鍦板尯涓庣洰鏍?merchant 涓嶄竴鑷?- 缁撴灉鍦ㄨ鍙︿竴涓?legal entity銆佸彟涓€涓?franchise銆佸彟涓€涓瓙鍝佺墝
涓€鏃︽湁鏄庢樉瀹炰綋娣锋穯锛?
- 鑻ユ棤娉曠‘璁ょ粨鏋滃氨鏄綋鍓?merchant锛氳緭鍑哄畬鏁?`No` 鍙?- 涓嶈鎶婇敊璇疄浣撶殑 child offer 鍐欒繘绛旀
- 涓嶈涓轰簡灏介噺缁?`Yes` 鑰岀‖鎺ラ敊璇粨鏋?
## Yes / appears / No 浣跨敤瑙勫垯
### 1. 鐢?`Yes` 鐨勬潯浠?
鍙湁褰撳弬鑰冧俊鎭兘鏄庣‘璇佹槑浠ヤ笅 3 鐐瑰悓鏃舵垚绔嬫椂锛屾墠浣跨敤鑲畾鍙ワ細
- 璇寸殑鏄綋鍓?merchant 鏈綋
- 璇寸殑鏄?child-specific pricing銆乧hild offer銆乫ree child policy銆乵erchant 鑷繁 kids items 鐨勬槑纭姌鎵?- 璇佹嵁瓒冲鏄庣‘锛屼笉闇€瑕侀潬鎺ㄦ柇琛ュ叏
### 2. 鐢?`appears to` 鐨勬潯浠?
鍙湁鍦ㄤ互涓嬫儏鍐典笅鎵嶅彲浠ョ敤 `appears to`锛?
- 淇℃伅鏂瑰悜鍩烘湰姝ｇ‘
- 璇佹嵁涓昏鏉ヨ嚜 merchant 鑷繁鐨?sale section銆乴isting pattern 鎴栧晢鍝佸睍绀?- 鑳界湅鍑?merchant 纭疄鏈?kids item discount锛屼絾寮哄害銆佽寖鍥淬€佺ǔ瀹氭€т笉澶熸槑纭?- 闇€瑕侀伩鍏嶅じ澶ф垚鏄庣‘绋冲畾椤圭洰
鍏佽鐨勫吀鍨嬪彞寮忥細
- `appears to offer discounted kids' items through its sale section`
- `appears to offer discounted kids' eyewear through select promotions`
### 3. 涓嶅厑璁告互鐢?`appears`
濡傛灉鍏跺疄娌℃湁鏄庣‘ child discount 璇佹嵁锛屽彧鏄ā绯婄寽娴嬶紝涓嶈兘闈?`appears` 鍋锋浮鎴?`Yes`銆傝瘉鎹笉澶熸椂锛屽簲鐩存帴杈撳嚭瀹屾暣 `No` 鍙ャ€?
## Child Discount 涓撳睘鍒ゅ畾浼樺厛绾?
閫愯鍒ゆ柇鏃讹紝鎸変互涓嬮『搴忔墽琛岋細
1. 鍏堢‘璁ゅ疄浣撴槸鍚︽纭?2. 鍒ゆ柇鏄惁涓?child-specific锛岃€屼笉鏄?student銆乼eacher銆乫amily銆乪ducation銆乮nsurance銆乴icense
3. 鍒ゆ柇鏄惁涓?merchant 鑷韩浼樻儬锛岃€岄潪绗笁鏂规垨娉涘缓璁?4. 鍒ゆ柇鏄惁瓒冲鏄庣‘鍙互浣跨敤 `Yes`
5. 鑻ヨ瘉鎹亸寮变絾鏂瑰悜姝ｇ‘锛屽彲鐢?`appears`
6. 鑻ヤ笉婊¤冻浠ヤ笂鏉′欢锛岃緭鍑哄畬鏁磋嫳鏂?`No` 鍙?
鍘嬬缉浜嬪疄鏃讹紝浼樺厛鎶藉彇锛?
1. 鏄惁瀛樺湪鏄庣‘鍎跨浼樻儬鏈哄埗
2. 浼樻儬瀵硅薄鏄皝
   - `infant`
   - `child`
   - `kids`
   - `toddler`
   - `youth`
   - `junior`
   - `ages X鈥揧`
3. 浼樻儬褰㈠紡鏄粈涔?   - `free`
   - `reduced fare / reduced rate`
   - `percentage off`
   - `fixed-price child ticket / child pass`
   - `sale / clearance on kids items`
4. 濡備綍鑾峰彇
   - `booking as child ticket`
   - `selecting child fare`
   - `through kids sale section`
   - `with adult purchase`
   - `during class / camp participation`
5. 闄愬埗鏉′欢
   - 骞撮緞鑼冨洿
   - 鏄惁闇€涓庢垚浜哄悓琛?   - participating locations only
   - 鏌愬煄甯?/ 鏌愯矾绾?/ 鏌愰厭搴?/ 鏌?lounge 鎵嶉€傜敤
   - 浠呴€傜敤浜?kids section / junior gear / classes / camps
   - seasonal / limited-time / specific promotion锛屼粎褰撳師鏂囨槑纭?
濡傛灉绛旀绌洪棿鏈夐檺锛屼紭鍏堜繚鐣欙細
- age range
- `under-X free`
- `child / youth / junior category`
- 鏄惁闇€鎴愪汉璐拱銆佹垚浜哄悓琛?- participating locations only
- route / city / hotel / lounge / class restrictions
- 鍎跨浠锋槸鍚︿綆浜庢垚浜轰环
- 閫傜敤浜?tickets銆乻tays銆乵eals銆乧lasses銆乬ear 杩樻槸 kids items
- 鏄惁浠呴檺 kids sale / clearance section
杩欎簺淇℃伅浼樺厛绾ч珮浜庯細
- 娉涙硾鍝佺墝鑳屾櫙
- 娆¤閫氱敤浼樻儬
- 浣庝环鍊煎舰瀹硅瘝
- 鎺ㄨ崘鎬ц鍙?
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
- 渚嬪 `Kfzparts2` 涓?`kfzteile24`锛岃嫢缁撳悎涓婁笅鏂囧彲鍒ゆ柇鏄湪鎸囧悓涓€姹借溅閰嶄欢鍝佺墝锛屼笉瑕佷粎鍥犺嫳鏂?寰锋枃鍐欐硶涓嶅悓鐩存帴杈撳嚭瀹屾暣鑻辨枃 `No` 鍙?- 瀵逛簬 `Neckermann`銆乣Filmpalast`銆乣Tivoli` 杩欑被鏍稿績鍟嗗鍚嶆湰韬竴鑷寸殑鎯呭喌锛屽簲浼樺厛瑙嗕负涓讳綋涓€鑷达紱闄ら潪鏂囨湰鏄庣‘鎸囧悜鍙︿竴涓晢瀹躲€佸彟涓€涓搧鐗岋紝鎴栨槑纭槸鏃犲叧骞冲彴/椤圭洰
浠ヤ笅鎯呭喌绛旀鐩存帴杈撳嚭瀹屾暣鑻辨枃 `No` 鍙ワ細
- 浼樻儬涓讳綋鏄彟涓€涓晢瀹?- 鍐呭璁茬殑鏄钩鍙般€佺涓夋柟椤圭洰鎴栨棤鍏充細鍛樹綋绯伙紝鑰屼笉鏄洰鏍囧晢瀹舵湰韬?- 鏂囨湰鍦ㄦ牳蹇冨搧鐗屽悕涓婃棤娉曚笌鐩爣鍟嗗寤虹珛鍚堢悊瀵瑰簲锛屼笖娌℃湁浠讳綍涓婁笅鏂囧彲鏀寔鍚屼竴涓讳綋鍒ゆ柇
濡傛灉鍘绘帀涓婅堪甯歌鍚庣紑鍚庯紝涓讳綋鍚嶇О鑳芥竻鏅板搴斿悓涓€鍝佺墝锛屽垯瑙嗕负鍚屼竴涓讳綋锛屼笉瑕佷粎鍥犳硶浜哄悗缂€宸紓銆佽瑷€宸紓鎴栬交寰彉浣撹緭鍑哄畬鏁磋嫳鏂?`No` 鍙ャ€?
褰撴牳蹇冨晢瀹跺悕涓€鑷达紝鎴栬櫧鏈夎法璇█/鍙樹綋鍐欐硶浣嗕粛鍙悎鐞嗗垽鏂负鍚屼竴鍝佺墝鏃讹紝搴旀斁瀹藉鐞嗭紝涓嶈鍥犱负璇佹嵁闂ㄦ杩囬珮鐩存帴鍒や负 `No`銆傚彧鏈夊湪涓讳綋鏄庣‘涓嶅尮閰嶏紝鎴栫‘瀹炴棤娉曞悎鐞嗗搴旀椂锛屾墠杈撳嚭瀹屾暣鑻辨枃 `No` 鍙ャ€?
## Child 涓撳睘 Merchant Locking
child discount 鐨勪富浣撳繀椤绘槸鐩爣 merchant 鑷繁锛屾垨鐩爣 merchant 鑷繁鐨勪互涓嬪畼鏂硅寖鍥达細
- kids / child category
- 瀹樻柟 ticketing
- 瀹樻柟 pricing
- 瀹樻柟 classes / camps
- 瀹樻柟 stays / meals / passes / junior gear
涓嶅緱鎶婁互涓嬪唴瀹圭洿鎺ュ啓鎴愮洰鏍?merchant 鐨?child discount锛?
- 绗笁鏂?retailer 鐨勫効绔ュ晢鍝佹姌鎵?- 绗笁鏂?pass 鎴栬仛鍚堝瀷閫氱エ
- 绗笁鏂瑰崥瀹㈡垨鎬荤粨椤靛綊绾冲嚭鐨勫効绔ヤ紭鎯?- 鍏朵粬鏅偣銆侀厭搴椼€佺悆闃熴€佸搧鐗屻€佷細鍛樿鍒掓垨鍚堜綔鏂圭殑鍎跨浼樻儬
棰濆瑕佹眰锛?
- 涓嶈兘鍥犱负 `term_name` 涓甫鏈夐€氱敤璇嶏紝濡?`kids`銆乣family`銆乣baseball`銆乣dental`銆乣paris`銆乣london`銆乣reef`锛屽氨鑷姩鏀惧涓讳綋鍒ゆ柇
- 濡傛灉 source 鍙槸 broader category summary锛岃€屼笉鏄洰鏍?merchant 鐨勫崟涓€浜嬪疄锛屽簲浼樺厛杈撳嚭瀹屾暣鑻辨枃 `No` 鍙ワ紝鎴栧彧鍦ㄨ瘉鎹冻澶熸椂浣跨敤鏋佺ǔ鍋ュ彞寮?- 濡傛灉 source 鏄庢樉鍦ㄨ鍙︿竴涓讳綋锛屽嵆浣垮唴瀹规湰韬笌鍎跨鏈夊叧锛屼篃蹇呴』杈撳嚭瀹屾暣鑻辨枃 `No` 鍙?
## Yes / No 鍐崇瓥瑙勫垯
### 杈撳嚭 `Yes` 鐨勬潯浠?
婊¤冻浠ヤ笅浠讳竴鍗冲彲锛?
- 鍟嗗鏈夋槑纭?`children / kids / youth / junior` 瀹氫环鎴栧噺鍏?- 鍟嗗鏈?`children free`銆乣child fare`銆乣child pass`銆乣kids pricing` 涔嬬被鐨勭洿鎺ヨ瘉鎹?- 鍟嗗瀛樺湪鐢卞効绔ュ勾榫勩€佸効绔ヨ韩浠姐€佸効绔ョ敓鏃ヨЕ鍙戠殑涓撳睘浼樻儬
- 鍟嗗涓哄効绔ヨ绋嬨€佸浠よ惀銆佸効绔ユ椿鍔ㄥ弬涓庤€呮彁渚涙姌鎵?- 鍟嗗浠呮湁 kids category 鐨勬槑纭姌鎵ｃ€乻ale銆乧learance銆乵arkdown锛屼笖涓讳綋娓呮櫚銆佽瘉鎹洿鎺ワ紝姝ゆ椂鍙彲浣滀负寮?`Yes` 淇濈暀
### 杈撳嚭 `No` 鐨勬潯浠?
鍑虹幇浠ヤ笅鎯呭喌搴旂洿鎺ヨ緭鍑哄畬鏁磋嫳鏂?`No` 鍙ワ細
- source 璁茬殑鏄叾浠栧晢瀹躲€佸钩鍙般€佸悎浣滄柟銆佺涓夋柟椤圭洰锛岃€屼笉鏄洰鏍?merchant 鏈韩
- 鍙嚭鐜?`student`銆乣newsletter`銆乣app`銆乣loyalty`銆乣military` 绛夐潪 child 鎶樻墸
- 鍙槸娉涙硾鎻愬埌鈥滈€傚悎瀛╁瓙鈥濃€滄湁鍎跨浜у搧鈥濃€滃瀛愯兘鐢ㄢ€濓紝浣嗘病鏈夋姌鎵ｄ簨瀹?- 鍙槸瀹跺涵鎴栧闀夸紭鎯狅紝娌℃湁鏄庣‘ child 鏈汉銆乧hild fare銆乲ids product discount 鍙楃泭
- 鍐呭鏃犳硶涓庣洰鏍?merchant 寤虹珛鍚堢悊涓讳綋瀵瑰簲
### 杈圭晫鎯呭喌澶勭悊
瀵逛簬杈圭晫妯＄硦浣嗕粛鍙繚鐣欑殑鎯呭喌锛屼娇鐢ㄦ洿绋冲仴琛ㄨ揪锛?
- `appears to offer discounted kids' items through its sale section`
- `offers child pricing on select tickets`
- `children under X may receive free admission`
- `child rates are available on eligible bookings`
鍙湁鍦ㄥ師鏂囨湰韬槑纭椂锛屾墠鍙互鐢ㄩ潪甯歌偗瀹氱殑鍙ュ紡銆?
child subclass 涓繕瑕侀澶栭伒瀹堬細
- A 绫?child pricing / free / child-triggered benefit 鏄己 `Yes`
- B 绫?kids sale / clearance / discounted kids merchandise 鍙槸寮?`Yes`
- 褰?source 鍙湁 B 绫昏瘉鎹椂锛屼笉瑕佹妸瀹冨啓鎴愪紭鍏堢骇寰堥珮銆佸緢绋冲畾銆佸緢瀹樻柟鐨?child discount
## Child 涓撳睘鎺掗櫎瑙勫垯
杈撳嚭 child discount FAQ 鏃讹紝涓嶅緱娣峰叆锛?
- 瀛︾敓浼樻儬
- 瀹堕暱 / 鍐涘睘 / 浼氬憳 / 淇＄敤鍗?/ 璁㈤槄 / 鎺ㄨ崘杩斿埄
- 鍏朵粬 merchant 鐨勫効绔ヤ紭鎯?- 鏇夸唬鐪侀挶寤鸿
- 鈥滀篃鍙互鍘绘煇鏌愬钩鍙颁拱鏇翠究瀹溾€?- 鍏朵粬 unrelated savings path
濡傛灉 source 鍚屾椂鍖呭惈 child 鎶樻墸鍜屽埆鐨勪紭鎯狅紝鍙繚鐣?child 鐩稿叧淇℃伅銆?
濡傛灉 child 浜嬪疄涓嶅寮猴紝鑰屽叾浠栦紭鎯犲緢寮猴紝涔熶笉鑳芥嬁鍏朵粬浼樻儬鏉ヨˉ鍏ㄧ瓟妗堛€?
## 鍐欎綔瑕佹眰
- 涓嶆敼鍙樺師鎰?- 淇濈暀鎵€鏈夐噸瑕佹牳蹇冧簨瀹?- 鍒犻櫎閲嶅鍜屽墠鍚庣煕鐩捐〃杩?- 鍚屼竴浼樻儬銆侀棬妲涖€侀檺鍒舵垨鏉′欢涓嶈鎹㈠彞閲嶅璇翠袱閬?- 浼樺厛浣跨敤鐩存帴銆佷簨瀹炲瀷琛ㄨ揪
- 绂佹浣跨敤鈥渂ut no fixed discount amount is stated鈥濆強鍚岀被涓嶇‘瀹氬厹搴曞彞寮?- 涓嶅悓琛岀瓟妗堢殑琛ㄨ揪鏂瑰紡灏介噺鑷劧鍙樺寲锛岄伩鍏嶆壒閲忔ā鏉挎劅
- 閬垮厤杩炵画浣跨敤 `about`銆乣usually`銆乣around` 绛夋ā绯婅瘝锛涘鍘熸枃纭疄鍙湁杩戜技琛ㄨ揪锛屾渶澶氫繚鐣欎竴涓繀瑕佺殑妯＄硦鎻愮ず
- 瑕佷繚鐣?`seasonal`銆乣limited-time`銆乣variable`銆乣partner-only`銆乣no dedicated` 杩欑被闄愬畾璇殑鍘熸剰锛屼絾瑕佹敼鍐欐垚鑷劧鍙ュ瀷锛屼笉瑕佹満姊扮‖鎻掑師璇?- 娌℃湁鍘熸枃璇佹嵁鏃讹紝涓嶈鑷琛ュ啓 `seasonal`銆乣limited-time`銆乣variable`銆乣partner-only`銆乣no dedicated` 绛夐檺瀹氳瘝
- 浼樺厛鍐欐竻妤氬搧鐗屻€佹満鍒躲€侀棬妲涖€侀檺鍒讹紝鍐嶅啓琛ュ厖淇℃伅
- 涓嶈鎶?URL銆佺綉椤垫爣棰樸€佹潵婧愮珯鍚嶃€佹潵婧愭嫭鍙锋敞閲婄洿鎺ュ啓杩?FAQ 姝ｆ枃
- 涓嶈鐢?`鍝佺墝鍚?(domain.com)` 杩欑鏂瑰紡琛ュ厖璇存槑鍩熷悕锛涙鏂囬噷鍙繚鐣欒嚜鐒跺搧鐗屽悕
- 瀹炰綋閿佸畾瑕佹洿涓ユ牸锛涘厑璁?`Anthony Robbins` / `Tony Robbins`銆乣Dental Plans` / `DentalPlans.com`銆乣Sam's Club` / `Sam鈥檚 Club`銆乣Kiehls` / `Kiehl's` 杩欑被绛変环鍐欐硶锛屼絾涓嶈鎶婁袱涓悕瀛楁満姊板苟鍒楀埌鍚屼竴鍙ラ噷
- 璇皵鍙嬪ソ銆佺揣鍑?- 涓ユ牸鎺у埗鍦?50 涓崟璇嶄互鍐?
child subclass 鍙ュ紡杩樺繀椤荤鍚堜互涓嬪師鍒欙細
- `Yes` 绫荤瓟妗堝繀椤荤粺涓€浠?`Yes.` 寮€澶?- `No` 绫荤瓟妗堝繀椤荤粺涓€浠?`No.` 寮€澶?- 鏈€缁堢瓟妗堝繀椤绘槸 1 鍒?2 鍙ワ紝閫傚悎鍓嶅彴 FAQ 鐩存帴灞曠ず
- 涓嶈鍐欐绱㈡憳瑕併€佹潵婧愯В閲娿€佸厤璐ｅ０鏄庛€佸缓璁煡鐪嬪畼缃?- 瀵?A 绫?child-specific pricing锛屽彲鍐欐垚 `Yes. {Merchant} offers child fares...`銆乣Yes. Children under X get free entry...`銆乣Yes. {Merchant} has child rates...`
- 瀵?B 绫?kids section / category sale锛屽彧鑳藉啓鎴?`Yes. {Merchant} has discounted kids' items...`銆乣Yes. {Merchant} has kids' items in sale or clearance sections...`銆乣Yes. {Merchant} offers discounted kids' items through its sale section.`
- 涓嶈兘鎶?B 绫诲啓鎴愬浐瀹氬畼鏂瑰効绔ユ斂绛?- 涓嶈兘鎶?`children's products on sale` 璇啓鎴?`children receive a discount`
- 褰撹瘉鎹粎琛ㄦ槑 merchant 鏈?kids / baby / junior category 鐨?sale銆乧learance銆乵arkdown 鏃讹紝绂佹鍐?`child discount` 鎴?`discount for children`
- `No` 蹇呴』鍐欐垚瀹屾暣鑻辨枃鍙ュ瓙锛屼笉鑳藉彧鍐?`no`
- 鎺ㄨ崘 `No` 鍙ュ紡锛?  - `No. {Merchant} does not offer a standard child discount.`
  - `No. {Merchant} does not offer a standard child discount. The source refers to a different entity.`
  - `No. {Merchant} does not offer a standard child discount. The source refers to student or educator pricing instead.`
  - `No. {Merchant} does not offer a standard child discount. The source describes broader family or pediatric savings, not a child-specific merchant offer.`
- 涓嶈鍐?`No, the available information does not clearly show...`
- 涓嶈鍐?`Based on available information...`
- 涓嶈鍐?`There is no evidence that...`
- 涓嶈鍐?`It does not appear to...`
- 娌℃湁鍘熸枃璇佹嵁鏃讹紝涓嶈鑷琛ュ啓 `seasonal`銆乣limited-time`銆乣official`銆乣standard`銆乣dedicated`
## 璇█瑙勫垯
绛旀蹇呴』浣跨敤 `country` 瀵瑰簲鍥藉鐨勫父鐢ㄨ瑷€銆?
渚嬪锛?
- `US`銆乣UK`銆乣CA`銆乣AU`锛氳嫳鏂?- `DE`锛氬痉鏂?- `FR`锛氭硶鏂?- `ES`锛氳タ鐝墮鏂?- `IT`锛氭剰澶у埄鏂?- `JP`锛氭棩鏂?
濡傛灉鍥藉涓庤瑷€鐨勫搴斿叧绯讳笉澶熸槑纭紝浣跨敤璇ュ浗瀹剁敤鎴锋渶甯歌鐨勯潰鍚戞秷璐硅€呰瑷€銆?
## 闂鐢熸垚瑙勫垯
`Titile1` 闇€瑕佺敓鎴愪竴涓竻鏅般€佽嚜鐒躲€佷笌 `term_name` 瀵归綈鐨?child discount FAQ 闂銆?
浼樺厛鍙ュ紡锛?
- `Does {Merchant} offer a child discount?`
濡傛灉鐩爣鍥藉涓嶆槸鑻辫鐜锛屽簲缈昏瘧鎴愬搴旇瑷€銆?
## 鎵ц娴佺▼
閫愯澶勭悊鏃讹紝鎸変互涓嬫楠わ細
1. 浠?`term_name` 璇嗗埆鐩爣鍟嗗
2. 鍏堝仛瀹炰綋鏍￠獙锛涘鏋滃瓨鍦ㄦ槑鏄惧疄浣撴贩娣嗕笖鏃犳硶纭鏄綋鍓?merchant锛屾湰琛岀洿鎺ヨ緭鍑哄畬鏁磋嫳鏂?`No` 鍙?3. 闃呰 `discount_details`锛屽厛鍒ゆ柇瀹冨睘浜?A 绫?child-specific pricing銆丅 绫?kids category sale銆丏 绫?child-specific benefit锛岃繕鏄潪 child 鎶樻墸
4. 鍙彁鍙?child discount 鐩稿叧浜嬪疄銆佽幏鍙栨柟寮忓拰闄愬埗鏉′欢
   - 涓嶈鍋滃湪绗竴鍙ヨ瘽锛涚户缁鏌ュ悗鏂囨槸鍚﹁繕鏈夊勾榫勮寖鍥淬€佹湁鏁堟湡銆侀€傜敤鑼冨洿銆佸湴鍖洪檺鍒躲€佷娇鐢ㄩ棬妲涚瓑楂樹环鍊间俊鎭?5. 鍒ゆ柇婧愬唴瀹逛腑鐨勫晢瀹朵富浣撴槸鍚︿笌鐩爣鍟嗗涓€鑷达紝骞舵墽琛?child 涓撳睘 merchant locking
6. 鍋氬嚭缁撹锛?   - 鑻ョ‘璁ゆ湁鍎跨浼樻儬锛氳緭鍑轰互 `Yes.` 寮€澶寸殑鏈€缁堢瓟妗?   - 鑻ュ彧鏄?kids section / category sale锛氫繚鐣欎负 `Yes`锛屼絾蹇呴』浣跨敤鍏嬪埗鍙ュ紡
   - 鑻ヨ瘉鎹柟鍚戞纭絾鍔涘害涓嶈冻锛氫粎鍦ㄥ繀瑕佹椂浣跨敤涓€娆?`appears to`
   - 鑻ョ‘璁ゆ病鏈夛紝鎴栦富浣撴槑纭笉涓€鑷达紝鎴栫‘瀹炴棤娉曞悎鐞嗗搴旓紝鎴栦粎鏈夐潪 child 鎶樻墸锛氳緭鍑轰互 `No.` 寮€澶寸殑瀹屾暣鑻辨枃 `No` 鍙?7. 鐢ㄧ洰鏍囧浗瀹惰瑷€鏀瑰啓鎴愮畝娲?FAQ 绛旀锛屽苟纭繚绛旀閲岃嚦灏戝嚭鐜颁竴娆″搧鐗屼富浣擄紱鑻ヨ緭鍑?`Yes`锛屽彞寮忓繀椤讳笌 A / B 绫诲瀷鍖归厤
8. 妫€鏌ョ瓟妗堟槸鍚﹀彧淇濈暀褰撳墠 `Subclass` 鍐呭銆佹病鏈夌紪閫犱俊鎭€佹病鏈夊爢鍙犳ā绯婅瘝
9. 浣跨敤 `scripts/faq_excel_tools.py` 鐢熸垚鏈€缁?Excel
## Final Sanitation
杈撳嚭鍓嶅繀椤诲啀娆℃鏌ワ細
- 鏈夋病鏈夋妸 broader offer 鍐欐垚 exact match
- 鏈夋病鏈夋妸 partner offer 鍐欐垚瀹樻柟鏀跨瓥
- 鏈夋病鏈夋妸 `no clear` / `no dedicated` 鏀规垚鑲畾 `Yes`
- 鏈夋病鏈夋紡鎺?`seasonal`銆乣limited-time`銆乣variable`銆乣partner-only`銆乣no dedicated` 杩欑被闄愬畾璇殑鍘熸剰锛屾垨鎶婂畠浠敓纭‖鎻掕繘鍙ュ瓙
- 鏈夋病鏈夊湪娌℃湁鍘熸枃璇佹嵁鏃惰嚜琛岃ˉ鍐欓檺瀹氳瘝
- 鏈夋病鏈夋畫鐣?`Apple`銆乣Google Play`銆乣How to Apply`銆乣How to Get`銆乣Source` 绛夋爣棰樻垨鏉ユ簮娈嬬墖
- 鏈夋病鏈夊嚭鐜?`Zarda Barbecue (zarda.com)` 杩欑被鍝佺墝鍚嶅悗璺熸嫭鍙峰煙鍚嶇殑鍐欐硶
- 鏈夋病鏈夋嫾鎺ュ潖鍙ュ瓙銆侀噸澶嶅彞瀛愩€侀敊鍒瓧
- 鏈夋病鏈夊嚭鐜?`Anthony Robbins Tony Robbins`銆乣Dental Plans DentalPlans.com`銆乣Sam's Club Sam鈥檚 Club`銆乣Kiehls Kiehl's` 杩欑瀹炰綋鍙屽啓
- 鏈夋病鏈夋妸 `kids sale` 鍐欐垚 `official child discount`
- 鏈夋病鏈夋妸 `student discount for high school students` 鍐欐垚 `child discount`
- 鏈夋病鏈夋妸 `family offer`銆乣parent offer`銆乣dependent offer` 鍐欐垚 child offer
- 鏈夋病鏈夋妸 broader travel / attraction / dental / school summary 鍐欐垚鏌愪釜 merchant 鐨勫畼鏂?child discount
- 鏈夋病鏈夋妸绗笁鏂?pass銆佺涓夋柟闆跺敭鍟嗐€佸叾浠栭厭搴?/ 鏅偣 / 鍝佺墝鐨?kids offer 娣疯繘姝ｆ枃
- 鏈夋病鏈夋畫鐣欑綉椤靛箍鍛婅銆佹爮鐩爣棰樸€丼EO 鏍囬銆乻ource 鏂彞
- 鏈夋病鏈変繚鐣?`How to get`銆乣Key details`銆乣Why spend more`銆乣where to find`銆乣shop now` 绛夌綉椤垫畫鐗?- 鏈夋病鏈夋妸 `children's products on sale` 璇啓鎴?`children receive a discount`
- 鏈夋病鏈夊湪 B 绫诲急 `Yes` 涓啓鍑?`child discount` 鎴?`discount for children`
- 鏈夋病鏈夊湪鏃犺瘉鎹椂鑷琛ュ啓 `seasonal`銆乣limited-time`銆乣official`銆乣standard`銆乣dedicated`
- 鏈夋病鏈夋妸 `student discount`銆乣education pricing`銆乣teacher offer`銆乣school license`銆乣classroom license`銆乣family plan`銆乣insurance plan` 鍐欐垚 child discount
- 鏈夋病鏈夋妸瀹炰綋娣锋穯缁撴灉銆佸悓鍚嶅搧鐗屻€佸紓鍦板尯鐗堟湰銆佺涓夋柟骞冲彴鍐呭鍐欑粰褰撳墠 merchant
- `Yes` 鏄惁浠?`Yes.` 寮€澶达紝`No` 鏄惁浠?`No.` 寮€澶?- `No` 鏄惁閬垮厤浜?`available information does not clearly show`銆乣there is no evidence that`銆乣it does not appear to`
- 鏄惁浠嶇劧淇濈暀浜嗘悳绱㈣厰銆佸厤璐ｅ０鏄庛€佸缓璁煡鐪嬪畼缃戙€佹潵婧愯В閲?
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
- 鍙湁涓讳綋鏄庣‘涓嶅尮閰嶆垨纭疄鏃犳硶鍚堢悊瀵瑰簲鏃舵墠杈撳嚭瀹屾暣鑻辨枃 `No` 鍙?- 鏈€缁堜氦浠樹负涓庢ā鏉垮瓧娈靛畬鍏ㄤ竴鑷寸殑 Excel 鏂囦欢
