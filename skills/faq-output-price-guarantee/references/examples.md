# 完整验证示例 — 价格保障场景

所有示例均围绕价格保障 FAQ 改写，并遵循“先是否支持，再范围，再限制”的结构。

---

## 支持价格匹配场景

### PG-1：官方 `price match`

**输入：** country=UK，brand=Best Buy，fact_type=price match，discount_details=Best Buy matches the current price on identical new items from select competitors. The item must be in stock, and marketplace sellers are excluded.

**Question：**
> Does {Mer.} offer an official price match?

**Answer：**
> Yes, {Mer.} offers an official price match. It applies to identical new items from qualifying competitors. The lower price must be current and verifiable, and marketplace sellers are excluded.

---

### PG-2：官方 `price protection`

**输入：** country=CA，brand=Dell，fact_type=price protection，discount_details=Dell refunds the difference if the price of the same product drops on Dell.com within 30 days of the invoice date. Clearance items and Dell Outlet products are excluded.

**Question：**
> Does {Mer.} offer official price protection?

**Answer：**
> Yes, {Mer.} offers official price protection. It applies to lower prices on the same product on its own website after purchase. Claims must be made within 30 days of the invoice date, and clearance items and Dell Outlet products are excluded.

---

### PG-3：官方 `low-price guarantee`

**输入：** country=UK，brand=Best Western，fact_type=low-price guarantee，discount_details=Best Western offers a Low Rate Guarantee for bookings made on BestWestern.com. If a lower publicly available rate is found for the same stay, Best Western matches it and gives a $100 gift card. Claims must be submitted within 24 hours of booking.

**Question：**
> Does {Mer.} offer a low-price guarantee?

**Answer：**
> Yes, {Mer.} has an official low-price guarantee. It applies to bookings made on its official website for the same hotel stay. The lower rate must be publicly available, and the claim must be submitted within 24 hours.

---

## 部分支持或范围受限场景

### NP-1：仅官方商城购买后降价可补差

**输入：** country=DE，brand=Old Navy，fact_type=post-purchase adjustment，discount_details=Old Navy does not match competitor prices, but it offers a one-time price adjustment if its own price drops within 14 days. Clearance and final sale items are excluded.

**Question：**
> Bietet {Mer.} einen offiziellen Preisabgleich an?

**Answer：**
> Nein, {Mer.} bietet keinen offiziellen Preisabgleich mit Wettbewerbern an. Es gibt nur eine nachträgliche Preisanpassung bei eigenen Preisreduzierungen. Diese gilt innerhalb von 14 Tagen und schließt Clearance- und Final-Sale-Artikel aus.

---

### NP-2：仅门店层面、非统一官方政策

**输入：** country=FR，brand=Gap，fact_type=store-level discretionary matching，discount_details=Gap does not publish a chain-wide official price match policy, but some stores may match Gap.com prices at the manager's discretion. This is based on store-level reports and may vary by location.

**Question：**
> {Mer.} propose-t-il une politique officielle d'alignement des prix ?

**Answer：**
> Non, {Mer.} n'a pas de politique officielle d'alignement des prix à l'échelle de l'enseigne. Certains magasins peuvent aligner le prix affiché sur le site officiel selon la décision du magasin. Cela repose sur les politiques publiques actuelles et sur des retours au niveau des magasins, et cela varie selon le point de vente.

---

### NP-3：官方不支持，但替代政策明确

**输入：** country=HK，brand=AbeBooks，fact_type=price match，discount_details=AbeBooks does not offer a price match guarantee. Instead, it offers a 30-day money-back guarantee if the item is incorrect, not as described, or does not arrive on time.

**Question：**
> {Mer.} 是否提供官方價格匹配？

**Answer：**
> 不，{Mer.} 不提供官方價格匹配。此政策僅提供 30 天退款保障，適用於商品錯誤、與描述不符或未按時送達的情況。這不適用於購買後因其他賣家價格更低而補差。
