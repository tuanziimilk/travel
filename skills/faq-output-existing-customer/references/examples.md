# 完整验证示例 — 所有场景

所有示例均围绕 `existing customer` FAQ 改写，括号内为实际词数。

注意：

- 示例答案为英文，只因为示例假设 `country` 映射到英语
- 实际执行时必须以 `country` 映射语言输出，不跟随原文语言
- 答案开头先判断是否存在 dedicated existing-customer discount

---

## 有折扣场景示例

### HD-1：续订折扣已知 + 年付限定

**输入：** brand=Canva，discount=20%，discount_details=Existing customers can renew the annual plan at 20% off during the renewal window. Offer applies to eligible paid accounts only.

**Answer：**
> Yes, {Mer.} offers existing customers 20% off an annual plan renewal during the renewal window. Available for eligible paid accounts only.

**词数：21 ✓**

---

### HD-2：忠诚会员专属优惠码

**输入：** brand=HelloFresh，discount=15%，discount_details=Loyal customers may receive a 15% off retention code for their next box. The code is sent to selected existing subscribers.

**Answer：**
> Yes, {Mer.} has a retention offer for existing subscribers: 15% off a next box. It is sent to selected accounts only.

**词数：22 ✓**

---

### HD-3：积分返利 + 会员等级限制

**输入：** brand=Sephora，reward=double points，discount_details=Existing Beauty Insider members can earn double points during selected member events. Higher tiers may receive extra perks.

**Answer：**
> No dedicated existing-customer discount, but {Mer.} gives members double points during selected events. Extra perks depend on membership tier.

**词数：18 ✓**

---

### HD-4：自动续费优惠

**输入：** brand=NordVPN，discount=up to 30%，discount_details=Existing customers can get up to 30% off on selected renewal plans when auto-renew is enabled.

**Answer：**
> Yes, {Mer.} offers existing customers up to 30% off selected renewal plans. Auto-renew must be enabled.

**词数：17 ✓**

---

## 无通用折扣场景示例

### ND-1：完全无老客优惠

**输入：** brand=IKEA，supported=false，fact_type=existing customer，discount_details=No existing customer discount is currently available.

**Answer：**
> No dedicated existing-customer discount at {Mer.}.

**词数：10 ✓**

---

### ND-2：仅有常规会员权益，非专属折扣

**输入：** brand=Apple，supported=false，fact_type=existing customer，discount_details=Existing users keep access to their account benefits, but there is no dedicated discount for current customers.

**Answer：**
> No dedicated existing-customer discount from {Mer.}. Current users keep their regular account benefits only.

**词数：18 ✓**

---

### ND-3：定向保留优惠，非全量可得

**输入：** brand=Audible，supported=partial，fact_type=existing customer，discount_details=Retention offers may appear for selected members trying to cancel, but there is no standard discount for all existing customers.

**Answer：**
> No dedicated existing-customer discount across all current users. {Mer.} may show retention offers only to selected members who try to cancel.

**词数：16 ✓**

---

### ND-4：地区限定续费优惠

**输入：** brand=Adobe，supported=partial，fact_type=existing customer，discount_details=Existing customer renewal savings are available in some regions, but there is no universal offer across all markets.

**Answer：**
> No dedicated existing-customer discount across every market. {Mer.} only offers renewal savings in some regions.

**词数：16 ✓**
