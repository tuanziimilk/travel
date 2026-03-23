name: price-guarantee-faq-answer
description: >
  涓?HotDeals.com 鐨勪环鏍间繚闅滅被 FAQ 鏀瑰啓浠诲姟鐢熸垚澶氳绉嶉棶棰樹笌绛旀锛屽苟鎸夎〃鏍煎瓧娈佃緭鍑恒€傞€傜敤浜庡鐞?Excel 鎴栫粨鏋勫寲鏁版嵁涓殑 price match銆乸rice protection銆乴ow-price guarantee銆乸ost-purchase adjustment銆乻tore-level discretionary matching 绛変簨瀹炲瀷鏂囨鏀瑰啓浠诲姟锛涗弗鏍兼牴鎹?country 杈撳嚭鐩爣鍥藉璇█锛屼笉璺熼殢鍘熸枃璇█锛屽苟浣跨敤 {Mer.} 鍙橀噺鏇挎崲鍟嗗鍚嶃€?---
# 澶氳绉嶄环鏍间繚闅?FAQ 鏀瑰啓鎶€鑳?
## 鎵ц鐩爣
灏嗚緭鍏ヨ〃鏍间腑鐨?`discount_details` 鏀瑰啓涓哄彲鍙戝竷鐨?FAQ 鏂囨锛屽苟杈撳嚭鍒版寚瀹氳〃鏍煎瓧娈点€?
浼樺厛绾у浐瀹氫负锛?
`鏄惁鎻愪緵瀹樻柟浠锋牸淇濋殰/浠锋牸鍖归厤 > 鏀跨瓥绫诲瀷 > 閫傜敤鍥藉/绔欑偣/闂ㄥ簵鑼冨洿 > 鏃堕棿绐楀彛 > required proof > identical item/current price/third-party sellers/excluded categories > 瀛楁暟`
涓嶈涓轰簡鍘嬬缉闀垮害鍒犻櫎鏈€瀹炵敤鐨勯檺鍒剁粏鑺傘€?
## 杈撳叆鏉ユ簮
榛樿澶勭悊琛ㄦ牸琛屾暟鎹€傛牳蹇冩敼鍐欏瓧娈典负锛?
- `country`
- `term_id`
- `domain`
- `term_name`
- `fact_type`
- `discount_details`
鍏朵腑鐪熸鐢ㄤ簬鐞嗚В涓庢敼鍐欑殑鍘熸枃鍦?`discount_details`銆?
## 杈撳嚭鏍煎紡
杈撳嚭琛ㄦ牸瀛楁鍥哄畾涓猴細
- `ContentType`
- `Country`
- `TermID`
- `TermName`
- `Domain`
- `Source`
- `Subclass`
- `鏉垮潡鍚嶇О`
- `Titile1`
- `Brief Introduction`
- `Href Kw`
- `Href Url`
瀛楁鏄犲皠瑙勫垯锛?
| 杈撳嚭瀛楁 | 瑙勫垯 |
|------|------|
| `ContentType` | 鍥哄畾濉?`faq` |
| `Country` | 鍙栬緭鍏?`country` |
| `TermID` | 鍙栬緭鍏?`term_id` |
| `TermName` | 鍙栬緭鍏?`term_name` |
| `Domain` | 鍙栬緭鍏?`domain` |
| `Source` | 鐣欑┖ |
| `Subclass` | 鍙栬緭鍏?`fact_type` |
| `鏉垮潡鍚嶇О` | 鐣欑┖ |
| `Titile1` | FAQ 闂锛屼弗鏍兼寜 `country` 瀵瑰簲璇杈撳嚭锛屼娇鐢?`{Mer.}` 鍙橀噺 |
| `Brief Introduction` | 鏀瑰啓鍚庣殑 FAQ 绛旀 |
| `Href Kw` | 鐣欑┖ |
| `Href Url` | 鐣欑┖ |
## 璇█瑙勫垯
### 1. FAQ 璇█鍙湅 `country`
闂涓庣瓟妗堝繀椤讳弗鏍兼牴鎹?`country` 杈撳嚭瀵瑰簲鍥藉璇█锛屼笉浠ュ師鏂囪瑷€涓哄噯銆?
鑻ュ師鏂囨槸鑻辨枃銆佷絾 `country=DE`锛屾渶缁?FAQ 蹇呴』杈撳嚭寰疯锛涜嫢 `country=HK`锛屾渶缁?FAQ 蹇呴』杈撳嚭绻佷綋涓枃銆?
鍥哄畾鏄犲皠濡備笅锛?
| 鍥藉缂╁啓 | 鍥藉涓枃鍚?| 璇█缂╁啓 | 璇█ |
|------|------|------|------|
| `UK` | 鑻卞浗 | `en` | 鑻辫 |
| `AU` | 婢冲ぇ鍒╀簹 | `en` | 鑻辫 |
| `CA` | 鍔犳嬁澶?| `en` | 鑻辫 |
| `DE` | 寰峰浗 | `de` | 寰疯 |
| `FR` | 娉曞浗 | `fr` | 娉曡 |
| `NL` | 鑽峰叞 | `nl` | 鑽峰叞璇?|
| `IT` | 鎰忓ぇ鍒?| `it` | 鎰忓ぇ鍒╄ |
| `AT` | 濂ュ湴鍒?| `de` | 寰疯 |
| `BE` | 姣斿埄鏃?| `nl` | 鑽峰叞璇?|
| `CH` | 鐟炲＋ | `de` | 寰疯 |
| `PT` | 钁¤悇鐗?| `pt` | 钁¤悇鐗欒 |
| `GR` | 甯岃厞 | `el` | 甯岃厞璇?|
| `BR` | 宸磋タ | `pt` | 钁¤悇鐗欒 |
| `PL` | 娉㈠叞 | `pl` | 娉㈠叞璇?|
| `ES` | 瑗跨彮鐗?| `es` | 瑗跨彮鐗欒 |
| `SE` | 鐟炲吀 | `sv` | 鐟炲吀璇?|
| `KR` | 闊╁浗 | `ko` | 闊╄ |
| `CZ` | 鎹峰厠 | `cs` | 鎹峰厠璇?|
| `DK` | 涓归害 | `da` | 涓归害璇?|
| `SK` | 鏂礇浼愬厠 | `sk` | 鏂礇浼愬厠璇?|
| `JP` | 鏃ユ湰 | `ja` | 鏃ヨ |
| `HK` | 涓浗棣欐腐 | `zh-Hant` | 绻佷綋涓枃 |
鑻ラ亣鍒版湭鍒楀嚭鐨?`country`锛岄粯璁よ緭鍑鸿嫳璇紝骞跺湪鍐呴儴鍒ゅ畾涓哄厹搴曡鍒欍€?
### 2. 闂浣跨敤 `{Mer.}` 鍙橀噺
闂涓殑鍟嗗鍚嶇粺涓€鍐欎綔 `{Mer.}`锛屼笉瑕佺洿鎺ュ啓鐪熷疄鍝佺墝鍚嶃€?
### 3. 绛旀涓殑鍝佺墝鍚嶄篃鏇挎崲涓?`{Mer.}`
濡傛灉 `discount_details` 鍘熸枃涓嚭鐜板搧鐗屽悕锛屾敼鍐欐椂鏇挎崲涓?`{Mer.}`銆?
## 鏀跨瓥绫诲瀷鍒ゅ畾
鏀瑰啓鍓嶅繀椤诲厛鍖哄垎鏀跨瓥绫诲瀷锛屼笉瑕佹妸涓嶅悓鏀跨瓥娣峰啓鎴愮缁熺殑 `price guarantee`锛?
1. `price match`
   瀵规瘮褰撳墠澶栭儴绔炲搧浠锋牸骞跺尮閰嶅綋鍓嶄环鏍硷紝閫氬父瑕佹眰 `identical item`銆乣current price`銆乣proof`銆?2. `price protection`
   璐拱鍚庤嫢瀹樻柟浠锋牸涓嬭皟锛岄€€杩樺樊棰濇垨鍙戞斁 credit銆?3. `low-price guarantee` / `best rate guarantee`
   瀹樻柟瀹ｇО鏈€浣庝环锛岃嫢鍙戠幇鏇翠綆鍏紑浠锋牸鍒?match 鎴栭澶栬ˉ鍋裤€?4. `post-purchase adjustment`
   涓嶅仛绔炲搧鍖归厤锛屼絾鍏佽璐拱鍚庡洜鏈珯/鏈簵闄嶄环鐢宠宸閫€杩樸€?5. `store-level discretionary matching`
   涓嶆槸缁熶竴瀹樻柟鏀跨瓥锛屽彧鍦ㄩ儴鍒嗛棬搴椼€佸鏈嶆垨鍦板尯绔欑偣鏍规嵁搴楀唴瑁侀噺澶勭悊銆?
鍒ゅ畾鍘熷垯锛?
- 鑻ユ潵婧愭槑纭啓鏄庡畼鏂规斂绛栵紝鐩存帴鎸夊搴旂被鍨嬭〃杩帮紝涓嶈鍐嶅啓 `may offer` 杩欑被杩囧害淇濆畧璇存硶銆?- 鑻ュ彧鍦ㄩ儴鍒嗗浗瀹躲€佺珯鐐广€侀棬搴椼€佷骇鍝佺嚎鎴栨椿鍔ㄩ〉鏀寔锛屽繀椤绘槑纭啓鍑洪€傜敤鑼冨洿銆?- 鑻ュ彧鏈夎鍧涖€侀棬搴楃粡楠屻€佸鏈嶅洖澶嶆垨闆舵暎鎶ュ憡鏀拺锛屽繀椤绘槑纭啓 `based on current public policy or store-level reports` 鐨勫搴旇〃杈俱€?- 鑻ュ疄闄呮槸涓嶆敮鎸?`price match`銆佷絾鏀寔 `post-purchase adjustment`锛屽繀椤绘槑纭啓鈥滀笉鎻愪緵瀹樻柟 price match锛屼絾鏀寔璐拱鍚庢湰绔欓檷浠疯皟鏁粹€濄€?
## 鏀瑰啓瑙勫垯
### 鏍囧噯绛旀缁撴瀯
绛旀蹇呴』浼樺厛鍐欐垚 `2-3` 鍙ワ紝缁撴瀯鍥哄畾涓猴細
1. 鍏堢洿鎺ヨ鏄庡搧鐗屾槸鍚︽彁渚?`official price guarantee / official price match`
2. 鍐嶈ˉ涓€鍙ユ笭閬撱€佸湴鍖恒€佺珯鐐广€侀棬搴楁垨浜у搧绾胯寖鍥?3. 鏈€鍚庤ˉ涓€鍙ュ叧閿檺鍒舵潯浠?
涓嶈鎶娾€滄槸鍚︽敮鎸佲€濇嫋鍒板彞瀛愬悗鍗婃銆?
### 鍙ュ紡瑕佹眰
- 閬垮厤楂橀閲嶅鍙ュ紡
- 鏀圭敤鏇磋嚜鐒朵絾缁撴瀯涓€鑷寸殑琛ㄨ揪
- 鍙互鍦ㄨ偗瀹氬彞涓氦鏇夸娇鐢?鈥淵es鈥? 鈥渰Mer.} does offer鈥? 鈥渰Mer.} has an official...鈥?绛夎嚜鐒惰〃杈?- 鍦ㄥ惁瀹氬彞涓氦鏇夸娇鐢?鈥淣o鈥? 鈥渰Mer.} does not have an official...鈥? 鈥淭here is no official...鈥?绛夎嚜鐒惰〃杈?- 鍙ュ紡鍙樺寲涓嶈兘褰卞搷淇℃伅椤哄簭鍜屽彲璇绘€?
### 蹇呴』浼樺厛淇濈暀鐨勪俊鎭?
- 閫傜敤鍥藉宸紓銆佸尯鍩熷樊寮傘€佺珯鐐瑰樊寮?- 瀹樻柟鍟嗗煄涓庨棬搴楀樊寮?- `price match` / `price protection` / `low-price guarantee` / `post-purchase adjustment` / `store-level discretionary matching` 鐨勫噯纭被鍨?- 鏃堕棿绐楀彛
- `required proof`
- 鏄惁鍙檺 `current price`
- 鏄惁鍙檺 `identical item`
- 鏄惁鎺掗櫎 `third-party sellers`
- `excluded categories`锛屽 clearance銆乺efurbished銆乷pen-box銆乭oliday deals銆乫inal sale銆乵arketplace items
- 宸环杩旇繕鏂瑰紡锛屽 refund銆乻tore credit銆乬ift card銆乤ccount credit
### 鐢ㄨ瘝寮哄急瑙勫垯
- 璇佹嵁寮猴細鐩存帴鍐?`offers`銆乣has`銆乣provides`
- 璇佹嵁寮憋細鏄庣‘鍐?`based on current public policy` 鎴?`based on store-level reports`
- 涓嶈鍦ㄥ畼鏂硅瘉鎹槑纭椂鍐?`may offer`
- 涓嶈涓轰簡淇濆畧鎶婄‘瀹氭€х殑瀹樻柟鏀跨瓥鍐欒櫄
### 闀垮害瑙勫垯
- 榛樿鎺у埗鍦?`2-3` 鍙?- 鍏佽鐣ラ暱锛屼絾涓嶈兘鐪佺暐楂樹环鍊奸檺鍒舵潯浠?- 涓嶅啀浠ユ瀬鐭瓟妗堜负鐩爣
### 鏂囬瑕佹眰
- 鐩存帴鍥炵瓟闂锛屼笉鍐欒儗鏅摵鍨?- 淇濈暀浜嬪疄锛屼笉琛ュ厖鏈粰鍑虹殑瑙勫垯
- 鍘绘帀鍣煶淇℃伅锛屽鈥滄樉绀烘洿澶氣€濃€淎I 鍙兘鍑洪敊鈥濃€滃垎浜€濃€淲ould you like me to...鈥?- 鍘绘帀閲嶅姝ラ锛屽彧淇濈暀鏈€鍏抽敭鐨勭敵璇疯矾寰勬垨闄愬埗鏉′欢
- 涓嶅啓 CTA锛屼笉寮曞鐢ㄦ埛鈥滃幓鏌ョ湅瀹樼綉鈥?- 涓嶄娇鐢ㄧ涓€浜虹О
## 鍦烘櫙瑙勫垯
### 瀹樻柟 `price match`
鑻ヨ瘉鎹樉绀哄搧鐗屾湁姝ｅ紡 `price match` 鏀跨瓥锛?
- 寮€澶存槑纭啓鎻愪緵 `official price match`
- 绗簩鍙ュ啓鏀寔鐨勬笭閬撱€佺珵鍝佽寖鍥淬€佸浗瀹舵垨闂ㄥ簵/瀹樼綉鑼冨洿
- 鏈€鍚庝竴鍙ュ啓 `identical item`銆乣current price`銆乣proof`銆乣third-party sellers excluded` 绛夊叧閿檺鍒?
### 瀹樻柟 `price protection` / `post-purchase adjustment`
鑻ヨ瘉鎹樉绀烘槸璐拱鍚庡樊浠蜂繚鎶ゆ垨鏈珯闄嶄环琛ュ樊锛?
- 寮€澶存槑纭啓涓嶆槸绔炲搧鍖归厤杩樻槸璐拱鍚庝环淇?- 绗簩鍙ュ啓閫傜敤绔欑偣鎴栬鍗曡寖鍥?- 鏈€鍚庝竴鍙ュ啓鏃堕棿绐楀彛銆侀€€娆炬柟寮忋€乪xcluded categories
### `low-price guarantee` / `best rate guarantee`
鑻ヨ瘉鎹樉绀哄畼鏂规渶浣庝环鎵胯锛?
- 寮€澶存槑纭啓鏄?`low-price guarantee` 鎴?`best rate guarantee`
- 绗簩鍙ュ啓閫傜敤 booking channel / official site / qualifying listings
- 鏈€鍚庝竴鍙ュ啓绱㈣禂绐楀彛銆乵atching criteria銆侀澶栬ˉ鍋?
### `store-level discretionary matching`
鑻ヨ瘉鎹彧鏀寔閮ㄥ垎闂ㄥ簵鎴栧簵鍛樿閲忥細
- 寮€澶村厛鏄庣‘鈥滀笉瀛樺湪缁熶竴瀹樻柟鏀跨瓥鈥濇垨鈥滄病鏈夊畼鏂圭粺涓€鐨?price match鈥?- 绗簩鍙ュ啓鍙湪閮ㄥ垎闂ㄥ簵銆佸湴鍖烘垨瀹㈡湇娓犻亾鏈夊鐞嗘渚?- 鏈€鍚庝竴鍙ュ啓 `based on current public policy or store-level reports` 鐨勪簨瀹炲熀纭€涓庝富瑕侀檺鍒?
### 涓嶆敮鎸佸満鏅?
鑻?`discount_details` 鏄庢樉琛ㄧず涓嶆彁渚涘畼鏂逛环鏍间繚闅滐細
- 绗竴鍙ュ繀椤绘槑纭啓涓嶆彁渚?`official price guarantee` 鎴?`official price match`
- 绗簩鍙ヨˉ鍏呮槸鍚︿粎鏀寔鏈珯闄嶄环璋冩暣銆侀€€娆俱€侀€€璐ч噸涔般€佹弧鎰忎繚璇佺瓑鏇夸唬鏂规
- 鏈€鍚庝竴鍙ュ啓鏈€鍏抽敭鐨勯€傜敤鑼冨洿鎴栭檺鍒?
## 娓呮礂 `discount_details`
鏀瑰啓鍓嶅厛娓呮礂鍘熸枃涓殑浣庝环鍊煎櫔闊筹細
- 骞冲彴 UI 鏂囨锛歚Mostrar todo`銆乣AI 妯″紡`銆乣鏌ョ湅鍏ㄩ儴`銆乣瓿奠湢`
- 鏃犲叧鏉ユ簮鏍囪锛歚Instagram`銆乣Bankier.pl +5`
- CTA 鎴栬拷闂細`Would you like me to...`
- 閲嶅姝ラ涓庨噸澶嶅彞
- 娉涘寲鎻愰啋锛歚AI answers may contain errors`
鍙繚鐣欒兘鍥炵瓟 FAQ 鐨勬湁鏁堜簨瀹炪€?
## 璐ㄦ娓呭崟
姣忔潯杈撳嚭瀹屾垚鍚庢鏌ワ細
| 妫€鏌ラ」 | 鏍囧噯 |
|------|------|
| 璇█涓€鑷?| 闂鍜岀瓟妗堜弗鏍兼寜 `country` 鏄犲皠璇█杈撳嚭 |
| 绫诲瀷鍒ゅ畾 | 宸插厛鍖哄垎 `price match`銆乣price protection`銆乣low-price guarantee`銆乣post-purchase adjustment`銆乣store-level discretionary matching` |
| 鍙橀噺鏇挎崲 | 浣跨敤 `{Mer.}`锛屼笉鐩存帴鏆撮湶鍝佺墝鍚?|
| 淇℃伅椤哄簭 | 鍏堟槸鍚︽敮鎸侊紝鍐嶈寖鍥达紝鍐嶅叧閿檺鍒?|
| 鑼冨洿娓呮 | 鍥藉/绔欑偣/闂ㄥ簵/鍝佺被宸紓鍐欐竻妤?|
| 璇佹嵁寮哄急 | 瀹樻柟璇佹嵁涓嶇敤 `may offer`锛屽急璇佹嵁鏄庣‘鏍囨敞鏉ユ簮寮哄害 |
| 涓嶇紪閫?| 鏈湪鍘熸枃鍑虹幇鐨勪俊鎭笉琛ュ啓 |
| 鍘诲櫔瀹屾垚 | 鏃犲钩鍙板櫔闊炽€佹棤鏃犲叧鎻愮ず |
| 杈撳嚭瀛楁姝ｇ‘ | 琛ㄥご涓庢槧灏勫畬鍏ㄤ竴鑷?|
| `Source`/`鏉垮潡鍚嶇О` | 蹇呴』鐣欑┖ |
## 鍙傝€冩枃浠?
- `references/input-schema.md` 鈥?琛ㄦ牸杈撳叆杈撳嚭瀛楁璇存槑
- `references/examples.md` 鈥?浠锋牸淇濋殰 FAQ 绀轰緥
- `templates/answer-template.txt` 鈥?FAQ 璧疯崏妯℃澘
