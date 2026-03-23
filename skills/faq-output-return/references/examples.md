# 完整验证示例 — 退货政策场景

所有示例均围绕退货政策 FAQ 改写。

---

## 零售商品场景示例

### RT-1：免费邮寄退货

**输入：** brand=Nordstrom，country=UK，fact_type=returns，discount_details=Eligible items can be returned with a prepaid label at no charge. Refunds are usually sent to the original payment method.

**Answer：**
> Yes, {Mer.} offers free mail returns. The prepaid label applies to eligible items, and refunds are usually issued to the original payment method.

**词数：20**

---

### RT-2：仅门店免费退货

**输入：** brand=Kohl's，country=CA，fact_type=return policy，discount_details=Items can be returned for free at any store, but mailed returns are at the customer's expense.

**Answer：**
> {Mer.} offers free in-store returns, not free mail returns. If the item is mailed back, the customer usually pays the return shipping cost.

**词数：22**

---

### RT-3：只有免费换货，不算免费退货

**输入：** brand=Bare Necessities，country=AU，fact_type=exchange，discount_details=Exchanges for another size or color are free, but a return label fee is deducted from refunds.

**Answer：**
> No, {Mer.} does not provide free returns for refunds. Free handling applies only to exchanges, while refund returns usually have a label fee deducted.

**词数：23**

---

## 服务型场景示例

### SV-1：酒店预订应写取消政策

**输入：** brand=Best Western，country=UK，fact_type=refund，discount_details=Flexible rates can usually be cancelled free within the allowed window, but advance purchase rates are non-refundable.

**Answer：**
> {Mer.} does not have free returns in the retail sense. Free cancellation usually applies only to flexible rates, while advance purchase bookings are typically non-refundable.

**词数：24**

---

### SV-2：数字产品应写退款保证

**输入：** brand=Quicken，country=CA，fact_type=refund，discount_details=Quicken offers a 30-day money-back guarantee for eligible subscriptions, but shipping and handling are non-refundable.

**Answer：**
> {Mer.} does not offer free returns as a product-shipping policy. Instead, it provides a 30-day money-back guarantee for eligible subscriptions, while shipping and handling charges stay non-refundable.

**词数：27**

---

### SV-3：生鲜食品应写损坏订单处理

**输入：** brand=Mrs. Fields，country=UK，fact_type=return policy，discount_details=Perishable items cannot be returned once shipped, but damaged or incorrect orders may be resolved by customer service.

**Answer：**
> {Mer.} does not accept regular returns on shipped food orders. Support is usually limited to damaged or incorrect deliveries, which may be resolved through a replacement or refund review.

**词数：27**

---

## 不可退或部分免费场景示例

### NR-1：Final Sale 不可退

**输入：** brand=SHEIN，country=UK，fact_type=return policy，discount_details=Final Sale items cannot be returned or exchanged.

**Answer：**
> No, {Mer.} does not offer free returns for Final Sale items. Those products are excluded from both returns and exchanges.

**词数：19**

---

### NR-2：可退但不是免费退

**输入：** brand=Wayfair，country=CA，fact_type=refund，discount_details=Eligible items may be returned within 30 days, but return shipping costs are deducted from the refund. Some items may also incur a restocking fee.

**Answer：**
> No, {Mer.} does not offer free mail returns. Eligible items can usually be sent back within 30 days, but return shipping may be deducted and some items may incur a restocking fee.

**词数：31**

---

### NR-3：输出语言只跟随 country

**输入：** brand=Example，country=DE，fact_type=return policy，discount_details=This English source says prepaid labels are available for eligible mail returns within 30 days.

**Answer：**
> Ja, {Mer.} bietet kostenlose Ruecksendungen per Post fuer berechtigte Artikel an. Das vorfrankierte Etikett gilt fuer passende Ruecksendungen innerhalb von 30 Tagen.

**词数：22**
