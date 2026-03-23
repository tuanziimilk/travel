# 完整验证示例 — AAA Discount 场景

所有示例均围绕 `aaa discount` FAQ 改写。

---

## `direct AAA discount` 示例

### AD-1：百分比折扣 + 会员验证

**输入：** brand=Budget，discount=10%，discount_details=AAA members can save up to 10% on base rates at participating locations. A valid AAA membership number may be required at pickup.

**Answer：**
> Yes, {Mer.} gives AAA members up to 10% off base rates at participating locations. A valid AAA membership number may be required at pickup.

**词数：22 ✓**

---

### AD-2：酒店房价折扣 + 适用渠道

**输入：** brand=Best Western，discount=up to 15%，discount_details=AAA and CAA members receive up to 15% off flexible room rates when booking eligible stays through participating properties.

**Answer：**
> Yes, {Mer.} offers AAA and CAA members up to 15% off eligible room rates at participating properties.

**词数：17 ✓**

---

### AD-3：保险或服务类会员优惠

**输入：** brand=UPS Store，discount=5%，discount_details=AAA members get 5% off select products and services at participating The UPS Store locations. Exclusions may apply.

**Answer：**
> Yes, {Mer.} provides a 5% AAA discount on select products and services at participating locations. Exclusions may apply.

**词数：18 ✓**

---

## `AAA portal cashback` 示例

### PC-1：AAA portal 返现

**输入：** brand=Pfaltzgraff，discount_details=AAA members can earn 3.9% cash back in AAA Dollars when shopping through the AAA Discounts & Rewards portal. Purchases must start from the AAA link.

**Answer：**
> {Mer.} does not provide a direct AAA discount, but AAA members can earn 3.9% cash back in AAA Dollars when they start their order through the AAA portal.

### PC-2：返现且有排除条件

**输入：** brand=Batteries Plus，discount_details=AAA members earn 0.6% cash back on eligible website purchases after clicking through the AAA site or extension. App purchases are excluded.

**Answer：**
> {Mer.} offers AAA members 0.6% cash back on eligible website purchases through the AAA portal or extension. App orders are excluded.

## `AAA travel/member booking benefit` 示例

### TB-1：酒店 AAA rate

**输入：** brand=Marriott，discount_details=AAA rates are available only at selected properties and dates, not across every location.

**Answer：**
> {Mer.} offers AAA rates only at selected properties and on eligible dates, so the benefit is not available across every location.

### TB-2：限参与门店的旅行福利

**输入：** brand=Best Western，discount_details=AAA and CAA members receive up to 15% off flexible room rates when booking eligible stays through participating properties.

**Answer：**
> {Mer.} gives AAA and CAA members up to 15% off flexible room rates on eligible stays at participating properties.

## `non-AAA general offer` 示例

### ND-1：无 AAA 专属优惠

**输入：** brand=Target，supported=false，fact_type=aaa discount，discount_details=There is no dedicated AAA discount currently available.

**Answer：**
> No, {Mer.} does not have a dedicated AAA discount.

**词数：10 ✓**

---

### ND-2：仅第三方合作渠道可能提供

**输入：** brand=Expedia，supported=partial，fact_type=aaa discount，discount_details=AAA savings may appear through selected travel partners, but there is no standard AAA discount across all bookings.

**Answer：**
> {Mer.} does not provide a standard AAA discount across all bookings. Only selected travel partners may carry AAA-related savings.

**词数：16 ✓**

---

### ND-3：仅限部分地区或门店

**输入：** brand=Marriott，supported=partial，fact_type=aaa discount，discount_details=AAA rates are available only at selected properties and dates, not across every location.

**Answer：**
> {Mer.} does not offer a storewide AAA discount. The main savings in this source come from non-AAA partner or property-specific offers.

**词数：17 ✓**
