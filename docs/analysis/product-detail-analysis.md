# Product Detail Page Analysis

**File:** `src/app/(ecommerce)/products/[id]/page.tsx`

---

## ⚠️ CRITICAL FINDING: Incomplete State Variables

The component is **missing 9 required state variable declarations** that are actively being used in the code. This will cause runtime errors.

### Missing State Variables (Not Declared)

These variables are referenced throughout the component but have no `useState()` declarations:

1. **`groupedOptionValues`** - Used at [line ~560](<src/app/(ecommerce)/products/[id]/page.tsx#L560>)
   - No setter found
   - Used to render product group option buttons in modal

2. **`selectedOptionValue`** / `setSelectedOptionValue` - Used at [line ~131](<src/app/(ecommerce)/products/[id]/page.tsx#L131>)
   - Set in `loadProduct()` effect: `setSelectedOptionValue("")`
   - Used in review submission: `optionValue: selectedOptionValue`
   - Used in modal header display

3. **`showOptionsModal`** / `setShowOptionsModal` - Used at [line ~69](<src/app/(ecommerce)/products/[id]/page.tsx#L69>) (conditional render)
   - Referenced: [line ~70](<src/app/(ecommerce)/products/[id]/page.tsx#L70>) (toggle)
   - Modal trigger: [line ~581](<src/app/(ecommerce)/products/[id]/page.tsx#L581>)

4. **`displayProduct`** - Used at [lines ~246, ~256](<src/app/(ecommerce)/products/[id]/page.tsx#L246>)
   - No setter found
   - Used as fallback: `displayProduct?.id ?? product?.id`
   - Used for name, image, price, stock, description

5. **`activeGalleryIndex`** / `setActiveGalleryIndex` - Used at [line ~506](<src/app/(ecommerce)/products/[id]/page.tsx#L506>)
   - Set in gallery button: `setActiveGalleryIndex(index)`
   - No initial declaration

6. **`galleryImages`** - Used at [line ~500](<src/app/(ecommerce)/products/[id]/page.tsx#L500>)
   - No setter found
   - Iterated in gallery grid: `.length > 1` check and `.map()`

7. **`modalAction`** / `setModalAction` - Used at [lines ~251, ~1076](<src/app/(ecommerce)/products/[id]/page.tsx#L251>)
   - Set in `openVariantModal()`: `setModalAction(action)` ("cart" or "buy")
   - Used to determine button text: `modalAction === "buy"`

8. **`modalQuantity`** / `setModalQuantity` - Used at [lines ~252, ~1056](<src/app/(ecommerce)/products/[id]/page.tsx#L252>)
   - Set in `openVariantModal()`: `setModalQuantity(1)`
   - Used in `confirmVariantSelection()`: `Math.max(1, modalQuantity)`
   - Rendered in quantity input: `value={modalQuantity}`

9. **`modalMessage`** / `setModalMessage` - Used at [lines ~253, ~1026](<src/app/(ecommerce)/products/[id]/page.tsx#L253>)
   - Set in `openVariantModal()`: `setModalMessage("")`
   - Set in `confirmVariantSelection()`: error messages
   - Rendered conditionally: [line ~1074](<src/app/(ecommerce)/products/[id]/page.tsx#L1074>)

---

## ✅ State Variables That ARE Declared

These state variables **are properly declared** (lines 59-78):

| Variable                | Type                             | Line | Usage                      |
| ----------------------- | -------------------------------- | ---- | -------------------------- |
| `product`               | `ProductType \| null`            | 59   | Main product data          |
| `setProduct`            | function                         | 59   | -                          |
| `selectedVariantId`     | string                           | 60   | Variant selection          |
| `setSelectedVariantId`  | function                         | 60   | -                          |
| `loading`               | boolean                          | 61   | Loading state              |
| `setLoading`            | function                         | 61   | -                          |
| `lookupMessage`         | string                           | 62   | Error/info messages        |
| `setLookupMessage`      | function                         | 62   | -                          |
| `reviews`               | array                            | 63   | Review list                |
| `setReviews`            | function                         | 63   | -                          |
| `averageRating`         | number                           | 64   | Star rating average        |
| `setAverageRating`      | function                         | 64   | -                          |
| `reviewCount`           | number                           | 65   | Total review count         |
| `setReviewCount`        | function                         | 65   | -                          |
| `canReview`             | boolean                          | 66   | User can leave review      |
| `setCanReview`          | function                         | 66   | -                          |
| `ratingValue`           | number                           | 67   | User's star rating (1-5)   |
| `setRatingValue`        | function                         | 67   | -                          |
| `reviewComment`         | string                           | 68   | Review text                |
| `setReviewComment`      | function                         | 68   | -                          |
| `reviewMessage`         | string                           | 69   | Review submission feedback |
| `setReviewMessage`      | function                         | 69   | -                          |
| `isSubmittingReview`    | boolean                          | 70   | Loading state for review   |
| `setIsSubmittingReview` | function                         | 70   | -                          |
| `reviewImages`          | string[]                         | 71   | Review image URLs          |
| `setReviewImages`       | function                         | 71   | -                          |
| `selectedImage`         | string \| null                   | 72   | Current displayed image    |
| `setSelectedImage`      | function                         | 72   | -                          |
| `reviewFilter`          | "all" \| number \| "with-images" | 73   | Review sorting             |
| `setReviewFilter`       | function                         | 73   | -                          |
| `lightboxImage`         | string \| null                   | 74   | Lightbox preview image     |
| `setLightboxImage`      | function                         | 74   | -                          |
| `relatedProducts`       | ProductType[]                    | 75   | Recommended products       |
| `setRelatedProducts`    | function                         | 75   | -                          |
| `showVariantModal`      | boolean                          | 76   | Variant selection modal    |
| `setShowVariantModal`   | function                         | 76   | -                          |

---

## 🎯 Product Group/Options JSX Sections

### Options Modal (Conditional Render)

**Line Range:** [~1130-1180](<src/app/(ecommerce)/products/[id]/page.tsx#L1130>)

Condition: `{showOptionsModal ? (...) : null}`

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-6">
  <div className="w-full max-w-3xl overflow-hidden rounded-4xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-sm sm:p-6">
    <header>
      <h2>{product.productGroup?.optionType}</h2>
      <button onClick={() => setShowOptionsModal(false)}>Close</button>
    </header>

    <div className="mt-6">
      <div className="grid gap-3">
        {groupedOptionValues.map((item) => {
          const optionValue = item.optionValue;
          const isSelected = selectedOptionValue === optionValue;
          const inventory = item.inventoryProduct;
          const isInStock = Number(inventory?.stock ?? 0) > 0;

          return (
            <button onClick={() => {
              setSelectedOptionValue(optionValue);
              setShowOptionsModal(false);
            }}>
              {/* Option details: price, stock, unit */}
            </button>
          );
        })}
      </div>
    </div>
  </div>
</div>
```

### Product Group Section Display

**Line Range:** [~557-570](<src/app/(ecommerce)/products/[id]/page.tsx#L557>)

Condition: `{groupedOptionValues.length > 0 && product?.productGroup?.optionType ? (...) : null}`

```tsx
<div className="rounded-[28px] border border-white/6 bg-[#111111] p-6">
  <div>
    <div className="text-xs uppercase tracking-[0.32em] text-slate-500">
      {product.productGroup.optionType}
    </div>
    <div className="mt-2 text-sm text-slate-300">
      <span className="font-semibold text-white">
        {selectedOptionValue || "Select an option"}
      </span>
    </div>
  </div>
  <button onClick={() => setShowOptionsModal(true)}>
    Choose Options
  </button>
</div>
```

---

## 🎯 Variant/Size/Color JSX Sections

### Variant Selection Modal

**Line Range:** [~1184-1274](<src/app/(ecommerce)/products/[id]/page.tsx#L1184>)

Condition: `{showVariantModal ? (...) : null}`

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-6">
  <div className="w-full max-w-3xl overflow-hidden rounded-4xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-sm sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
          Choose your variant
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-white">{product.name}</h2>
      </div>
      <button onClick={closeVariantModal}>Close</button>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      {/* LEFT: Image preview */}
      <div className="space-y-4">
        <Image src={selectedVariantPrimaryImage || primaryImage || "/logo/apc-logo.png"} />
        {/* Variant image gallery: selectedVariantImages */}
      </div>

      {/* RIGHT: Variant options, quantity, price */}
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-900 p-4">
        <div className="text-xs uppercase tracking-[0.32em] text-slate-500">Options</div>

        {isVariantRequired ? (
          <div className="grid gap-2">
            {product.variants?.map((variant) => {
              const isActive = selectedVariantId === variant.id;
              const isSoldOut = Number(variant.stock) <= 0;

              return (
                <button
                  key={variant.id}
                  onClick={() => {
                    setSelectedVariantId(variant.id);
                    setSelectedImage(null);
                  }}
                  disabled={isSoldOut}
                >
                  <span>{getVariantLabel(variant)}</span>
                  <span>₱{variant.price.toFixed(2)}</span>
                  <span>{isSoldOut ? "Sold out" : `${variant.stock} in stock`}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>This product has no variants.</div>
        )}

        {/* Quantity selector */}
        <div className="rounded-3xl border border-white/10 bg-slate-950 p-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Quantity</span>
            <span className="font-semibold text-slate-200">{modalQuantity}</span>
          </div>
          <input
            type="number"
            min={1}
            value={modalQuantity}
            onChange={(event) => setModalQuantity(Number(event.target.value))}
          />

          {/* Price and stock display */}
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>Price</span>
              <span className="font-semibold text-white">₱{effectivePrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Stock</span>
              <span>{effectiveStock}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Error message */}
    {modalMessage ? (
      <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
        {modalMessage}
      </div>
    ) : null}

    {/* Action buttons */}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      <button onClick={confirmVariantSelection}>
        {modalAction === "buy" ? "Add and checkout" : "Add to cart"}
      </button>
      <button onClick={closeVariantModal}>Cancel</button>
    </div>
  </div>
</div>
```

### Inline Variant Selection (Color)

**Line Range:** [~603-633](<src/app/(ecommerce)/products/[id]/page.tsx#L603>)

Condition: `{product.variants?.some((variant) => variant.color) ? (...) : null}`

```tsx
<div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
  <div className="text-sm font-semibold text-white">Color</div>
  <div className="mt-4 flex flex-wrap items-center gap-3">
    {Array.from(new Map((product.variants ?? [])
      .filter((variant) => variant.color)
      .map((variant) => [variant.color, variant])
    ).values()).map((variant) => {
      const isActive = selectedVariantId === variant.id;

      return (
        <button
          key={variant.id}
          onClick={() => {
            setSelectedVariantId(variant.id);
            setSelectedImage(null);
          }}
          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition duration-200 ${
            isActive ? "border-[#FF8A1E] bg-white/5 text-white" : "border-white/10 bg-slate-950 text-slate-200 hover:border-white/20"
          }`}
        >
          <span
            className="inline-flex h-3.5 w-3.5 rounded-full border"
            style={{ backgroundColor: variant.color ?? "transparent" }}
          />
          <span>{variant.color}</span>
        </button>
      );
    })}
  </div>
</div>
```

### Inline Variant Selection (Size)

**Line Range:** [~635-662](<src/app/(ecommerce)/products/[id]/page.tsx#L635>)

Condition: `{product.variants?.some((variant) => variant.measurementValue != null) ? (...) : null}`

```tsx
<div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
  <div className="text-sm font-semibold text-white">Size</div>
  <div className="mt-4 flex flex-wrap items-center gap-3">
    {Array.from(new Map((product.variants ?? [])
      .filter((variant) => variant.measurementValue != null)
      .map((variant) => [`${variant.measurementValue}-${variant.measurementUnit}`, variant])
    ).values()).map((variant) => {
      const isActive = selectedVariantId === variant.id;

      return (
        <button
          key={variant.id}
          onClick={() => {
            setSelectedVariantId(variant.id);
            setSelectedImage(null);
          }}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition duration-200 ${
            isActive ? "border-[#FF8A1E] bg-white/5 text-white" : "border-white/10 bg-slate-950 text-slate-200 hover:border-white/20"
          }`}
        >
          {variant.measurementValue} {variant.measurementUnit}
        </button>
      );
    })}
  </div>
</div>
```

---

## 🎯 Helper Functions

### `getVariantLabel()`

**Line Range:** [~80-88](<src/app/(ecommerce)/products/[id]/page.tsx#L80>)

Constructs variant display string from color and measurement:

- Returns: `"Red · 500g"` or just `"Red"` or just `"500g"` or `"Variant"`
- Used in variant selection modal to display variant options

### `openVariantModal()`

**Line Range:** [~244-275](<src/app/(ecommerce)/products/[id]/page.tsx#L244>)

Handles opening the variant/quantity selection modal:

- **Parameters:** `action: "cart" | "buy"`
- **Logic:**
  - Checks if user is logged in; redirects to `/register` if not
  - For non-variant products, directly adds to cart and navigates
  - For variant products, initializes first in-stock variant
  - Sets: `modalAction`, `modalQuantity`, `modalMessage`, `showVariantModal`

### `closeVariantModal()`

**Line Range:** [~277-280](<src/app/(ecommerce)/products/[id]/page.tsx#L277>)

Closes modal and clears error message:

- Resets: `showVariantModal`, `modalMessage`

### `confirmVariantSelection()`

**Line Range:** [~282-321](<src/app/(ecommerce)/products/[id]/page.tsx#L282>)

Validates and confirms variant/quantity selection:

- **Validations:**
  - Checks product ID exists
  - Requires variant selection if variants exist
  - Validates quantity is within stock
- **On error:** Sets `modalMessage` with error text
- **On success:**
  - Calls `addToCart()` with variant details
  - Dispatches storage event
  - Closes modal
  - Navigates to checkout if `modalAction === "buy"`

---

## 📊 Computed Values

| Name                          | Lines    | Computation                                                        |
| ----------------------------- | -------- | ------------------------------------------------------------------ |
| `selectedVariant`             | ~210     | Finds variant by `selectedVariantId`                               |
| `selectedVariantImages`       | ~211     | Filters variant image URLs                                         |
| `selectedVariantPrimaryImage` | ~212     | First image from variant or null                                   |
| `primaryImage`                | ~213     | Product's primary image via utility                                |
| `displayedImage`              | ~214     | Fallback chain: selectedImage → variantImage → primaryImage → logo |
| `effectivePrice`              | ~216     | Variant price or product price                                     |
| `effectiveStock`              | ~217     | Variant stock or product stock                                     |
| `effectiveSku`                | ~218     | Variant SKU or product SKU                                         |
| `isVariantRequired`           | ~219     | Boolean: product has variants                                      |
| `averageRounded`              | ~220     | Rounded average rating (0-5)                                       |
| `filteredReviews`             | ~221-230 | Reviews filtered by `reviewFilter`                                 |
| `ratingBreakdown`             | ~231-238 | 5-star distribution array                                          |

---

## 🔗 Related Dependencies

- **Types:** `ProductType`, `VariantType`
- **Imports:** `addToCart()`, `getStoredUser()`, `getPrimaryImageUrl()`
- **Hooks:** `useParams()`, `useRouter()`, `useEffect()`, `useState()`
- **External:** Next.js Image, Link; lucide-react Star icon

---

## Summary of Issues

| #   | Issue                                | Severity    | Impact                             |
| --- | ------------------------------------ | ----------- | ---------------------------------- |
| 1   | `groupedOptionValues` undefined      | 🔴 CRITICAL | Options modal won't render         |
| 2   | `selectedOptionValue` setter missing | 🔴 CRITICAL | Can't select product group options |
| 3   | `showOptionsModal` setter missing    | 🔴 CRITICAL | Can't toggle options modal         |
| 4   | `displayProduct` undefined           | 🔴 CRITICAL | Product display fallback broken    |
| 5   | `galleryImages` undefined            | 🔴 CRITICAL | Gallery won't render               |
| 6   | `activeGalleryIndex` setter missing  | 🔴 CRITICAL | Can't select gallery images        |
| 7   | `modalAction` setter missing         | 🟠 HIGH     | Variant modal functionality broken |
| 8   | `modalQuantity` setter missing       | 🟠 HIGH     | Can't adjust quantity in modal     |
| 9   | `modalMessage` setter missing        | 🟠 HIGH     | Error messages won't display       |
