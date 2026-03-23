# 完整验证示例

以下示例展示 `Yes / No / Not exactly` 三种判定，以及如何保留强证据。

---

## Yes：明确首单或欢迎优惠

### Y-1：零售首单折扣

**输入：** country=US，fact_type=new customer，discount_details=New customers get 10% off their first order with code WELCOME10. Excludes gift cards and limited-edition items.

**Titile1：**
> Does {Mer.} have a first-order discount?

**Brief Introduction：**
> Yes, {Mer.} gives new customers 10% off a first order with code WELCOME10. The offer excludes gift cards and limited-edition items.

---

### Y-2：订阅试用

**输入：** country=US，fact_type=new customer，discount_details=New users can start with a 14-day free trial and then get 20% off the first annual plan.

**Titile1：**
> Does {Mer.} offer a free trial or new-plan savings?

**Brief Introduction：**
> Yes, {Mer.} gives new users a 14-day free trial and 20% off the first annual plan. The savings apply only to the first paid subscription.

---

### Y-3：餐饮 App 首单

**输入：** country=US，fact_type=new customer，discount_details=First app orders get $5 off with code APP5 on orders over $20.

**Titile1：**
> Is there a first app order discount at {Mer.}?

**Brief Introduction：**
> Yes, {Mer.} offers $5 off a first app order with code APP5. You need to order in the app and spend at least $20.

---

## No：没有明确新客优惠

### N-1：只有普通促销

**输入：** country=US，fact_type=new customer，discount_details=The site is running a spring sale with up to 30% off selected items.

**Titile1：**
> Can new shoppers get a welcome offer at {Mer.}?

**Brief Introduction：**
> No, the available offer at {Mer.} is a general seasonal sale, not a first-order discount. To save more, check the deals page for active sitewide promotions.

---

### N-2：只有会员价

**输入：** country=US，fact_type=new customer，discount_details=Members get lower prices and earn reward points on every purchase.

**Titile1：**
> Does {Mer.} have a first-order discount?

**Brief Introduction：**
> No, {Mer.} only shows member pricing and ongoing rewards, not a dedicated new customer offer. Join the program if you want the member rate on future purchases.

---

### N-3：只有身份类折扣

**输入：** country=US，fact_type=new customer，discount_details=Students can get 10% off after verification with UNiDAYS.

**Titile1：**
> Can new shoppers get a welcome offer at {Mer.}?

**Brief Introduction：**
> No, the available savings at {Mer.} are tied to student verification rather than first-time status. Verify your status if you want to use that discount.

---

## Not exactly：有欢迎机制，但不是标准普适新客优惠

### NE-1：仅邮件注册，无明确首单折扣

**输入：** country=US，fact_type=new customer，discount_details=Sign up for emails to hear about new offers and promotions.

**Titile1：**
> Can new customers get a welcome offer at {Mer.}?

**Brief Introduction：**
> Not exactly, {Mer.} promotes email signup but does not clearly confirm a first-order discount. Sign up for emails to catch the next available offer.

---

### NE-2：地区限定欢迎优惠

**输入：** country=US，fact_type=new customer，discount_details=UK customers can get 10% off their first order, but no universal new customer deal is listed for other regions.

**Titile1：**
> Does {Mer.} have a first-order discount?

**Brief Introduction：**
> Not exactly, {Mer.} has a first-order offer in the UK, but not a universal new customer discount across all regions. Use the regional site to check whether your market qualifies.

---

### NE-3：第三方渠道首购优惠

**输入：** country=US，fact_type=new customer，discount_details=First-order savings may be available through the app or selected partners, but not as a standard sitewide offer.

**Titile1：**
> Can new shoppers get a welcome offer at {Mer.}?

**Brief Introduction：**
> Not exactly, any first-order savings at {Mer.} appear to be channel-specific rather than a standard sitewide new customer discount. Use the app or partner checkout to see whether a welcome offer is available.

---

## 多语种示例：语言严格跟随 `country`

### ES

**输入：** country=ES，discount_details=New customers get 15% off their first order with code HOLA15.

**Titile1：**
> ¿{Mer.} tiene descuento en la primera compra?

**Brief Introduction：**
> Yes, {Mer.} ofrece un 15% de descuento en la primera compra con el código HOLA15. La oferta solo aplica al primer pedido.

---

### KR

**输入：** country=KR，discount_details=First app orders get 5,000 won off after signup.

**Titile1：**
> {Mer.} 첫 앱 주문 할인은 있나요?

**Brief Introduction：**
> Yes, {Mer.}는 회원가입 후 첫 앱 주문에 5,000원 할인을 제공합니다. 앱에서만 적용되는 신규 주문 혜택입니다.

---

### PL

**输入：** country=PL，discount_details=There is no first-order discount, but email subscribers get sale alerts.

**Titile1：**
> Czy {Mer.} ma zniżkę na pierwsze zamówienie?

**Brief Introduction：**
> No, {Mer.} nie ma potwierdzonej zniżki na pierwsze zamówienie. Warto zapisać się do newslettera, aby otrzymywać informacje o aktualnych promocjach.
