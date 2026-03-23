# 完整验证示例 — 所有场景

所有示例均围绕 `referral discount` FAQ 改写，括号内为实际词数。

---

## 有 referral offer 场景示例

### HD-1：双方都可得固定金额奖励（Quince）

**输入：** brand=Quince，discount=$20/$20，discount_details=Refer a friend to Quince and both you and your friend can get $20 off. Your friend must place a qualifying first order through the referral link.

**Answer：**
> Yes, {Mer.} offers a referral discount: both the referrer and the friend can get $20 off. The friend must place a qualifying first order through the referral link.

**词数：28 ✓**

---

### HD-2：推荐人得积分，好友得首单折扣（YesStyle）

**输入：** brand=YesStyle，discount=2% off + reward credits，discount_details=Invite a friend and they can get 2% off their first order, while you earn reward credits after their purchase is completed.

**Answer：**
> Yes, {Mer.} offers a referral discount. Friends get 2% off a first order, and the referrer earns reward credits after the purchase is completed.

**词数：25 ✓**

---

### HD-3：账户余额奖励 + 仅限新用户（Away）

**输入：** brand=Away，discount=$20 credit，discount_details=Through the refer-a-friend program, new customers receive $20 off their first suitcase order, and the referrer receives account credit after the order ships.

**Answer：**
> Yes, {Mer.} offers a refer-a-friend discount. New customers get $20 off a first suitcase order, and the referrer receives account credit after the order ships.

**词数：26 ✓**

---

### HD-4：最低消费门槛（Bloomingdale's）

**输入：** brand=Bloomingdale's，discount=$25 off $150，discount_details=Referred customers can get $25 off a $150 purchase, and the referrer earns a reward once the qualifying order is completed.

**Answer：**
> Yes, {Mer.} offers a referral discount. Referred customers get $25 off a $150 purchase, and the referrer earns a reward after the qualifying order is completed.

**词数：27 ✓**

---

## 无 referral offer 场景示例

### ND-1：完全无推荐优惠（Lululemon）

**输入：** brand=Lululemon，supported=false，fact_type=referral discount，discount_details=There is currently no referral discount or refer-a-friend program available.

**Answer：**
> No, {Mer.} does not offer a referral discount.

**词数：10 ✓**

---

### ND-2：有分享功能但无奖励（Nike）

**输入：** brand=Nike，supported=false，fact_type=referral discount，discount_details=Customers can share products with friends, but there is no dedicated referral reward or discount program.

**Answer：**
> No, {Mer.} does not offer a dedicated referral discount. Product sharing is available, but there is no referral reward program.

**词数：21 ✓**

---

### ND-3：地区限定 referral offer（HelloFresh）

**输入：** brand=HelloFresh，supported=partial，fact_type=referral discount，regional_channel=select markets，discount_details=Referral offers are available in select markets, but there is no universal referral discount across all regions.

**Answer：**
> {Mer.} does not offer a universal referral discount. Referral offers may be available in select markets only.

**词数：16 ✓**

---

### ND-4：合作渠道限定奖励（StubHub）

**输入：** brand=StubHub，supported=partial，fact_type=referral discount，regional_channel=select partner campaigns，discount_details=Referral-style rewards may appear through select partner campaigns, but not as a standard sitewide referral program.

**Answer：**
> {Mer.} does not offer a standard referral discount. Referral-style rewards may be available through select partner campaigns.

**词数：17 ✓**
