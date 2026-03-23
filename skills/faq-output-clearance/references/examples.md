# 完整验证示例 — Clearance 场景

所有示例均围绕 `clearance` FAQ 改写。

---

## 有清仓优惠场景示例

### CL-1：明确折扣幅度 + 选定商品（Adidas）

**输入：** brand=Adidas，discount=up to 50%，discount_details=Clearance items are up to 50% off on selected shoes and apparel while supplies last.

**Answer：**
> Yes, {Mer.} has a clearance section with up to 50% off selected shoes and apparel. Availability is limited while supplies last.

**词数：20 ✓**

---

### CL-2：低至价 + 季末商品（Macy's）

**输入：** brand=Macy's，discount=from $9.99，discount_details=Shop end-of-season clearance with prices starting at $9.99 on select home and fashion items.

**Answer：**
> Yes, {Mer.} offers end-of-season clearance from $9.99 on select home and fashion items.

**词数：17 ✓**

---

### CL-3：最终甩卖 + 不退不换（ASOS）

**输入：** brand=ASOS，discount=up to 70%，discount_details=Final sale styles are up to 70% off. These items are non-returnable.

**Answer：**
> Yes, {Mer.} has final sale items with discounts of up to 70% off. These items are non-returnable.

**词数：16 ✓**

---

### CL-4：自动生效 + 指定类别（Wayfair）

**输入：** brand=Wayfair，discount=extra 20%，discount_details=An extra 20% discount is automatically applied to select clearance furniture and decor.

**Answer：**
> Yes, {Mer.} has clearance furniture and decor with an extra 20% discount. The discount is applied automatically on select items.

**词数：17 ✓**

---

## 无明确清仓优惠场景示例

### NC-1：没有单独 clearance 板块（Sephora）

**输入：** brand=Sephora，supported=false，fact_type=clearance，discount_details=There is no dedicated clearance section at this time, although promotions may appear during seasonal sales.

**Answer：**
> No, {Mer.} does not currently show a clearance or outlet section. It mainly runs seasonal promotions instead.

**词数：18 ✓**

---

### NC-2：仅常规促销，非清仓（Ulta）

**输入：** brand=Ulta，supported=false，fact_type=clearance，discount_details=The store runs regular promotions, but no ongoing clearance discount is confirmed.

**Answer：**
> No, {Mer.} does not have a confirmed clearance or outlet offer. Its discounts mainly come from regular promotions.

**词数：18 ✓**

---

### NC-3：部分门店尾货（Target）

**输入：** brand=Target，supported=partial，fact_type=clearance，discount_details=Clearance markdowns may be available in select stores, but there is no consistent sitewide clearance offer.

**Answer：**
> {Mer.} does not have a consistent sitewide clearance section. Clearance markdowns may still appear in select stores.

**词数：16 ✓**

---

## 反例说明：普通优惠不等于 clearance

### NG-1：只有 bundle 折扣（Skincare Brand）

**输入：** discount_details=The brand offers bundle deals, subscribe-and-save pricing, and occasional holiday discounts.

**Answer：**
> No, {Mer.} does not show a true clearance or outlet section. Its savings mainly come from bundle offers and subscription discounts.

**说明：**
> `bundle deals` 与 `subscription discounts` 不能直接写成 clearance。

---

### NG-2：只有 promo code（SaaS Brand）

**输入：** discount_details=Promo codes for 20% off are sometimes available during special campaigns.

**Answer：**
> No, {Mer.} does not appear to run a clearance or final sale program. It usually offers promo-code discounts during special campaigns.

**说明：**
> `promo code` 属于替代优惠形式，不属于真实清仓机制。
