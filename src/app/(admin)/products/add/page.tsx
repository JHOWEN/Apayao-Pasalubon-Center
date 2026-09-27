"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, UploadCloud, X } from "lucide-react";
import AttributeManager, { type Attribute } from "@/components/admin/AttributeManager";
import VariantGenerator, { type Variant } from "@/components/admin/VariantGenerator";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import {
  ADMIN_MODAL_BACKDROP_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";

type Category = { id: string; name: string };

export default function AddProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<{ name: string; type: string } | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [productType, setProductType] = useState<"simple" | "variant">("simple");
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [form, setForm] = useState({
    name: "", sku: "", categoryId: "", description: "",
    price: "", cost: "", stock: "", minStock: "5", unit: "piece",
    optionType: "Variant",
  });

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((response) => response.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setStatus("Unable to load categories."));
  }, []);

  function updateField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleImageUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }

    setIsUploadingImage(true);
    setStatus("");
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const response = await fetch("/api/admin/products/upload", { method: "POST", body: uploadFormData, credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data?.url) throw new Error(data?.message ?? "Unable to upload image.");
      setImageUrl(data.url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to upload image.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving product...");
    setIsSaving(true);
    try {
      const shouldHaveVariants = productType === "variant";
      if (!form.sku || !form.price || !form.cost || !form.stock) {
        throw new Error("Parent SKU, price, cost, and opening stock are required.");
      }
      if (shouldHaveVariants && variants.length === 0) {
        throw new Error("Please generate variants before saving.");
      }

      const payload: {
        [key: string]: string | boolean | number | Array<unknown> | Record<string, unknown> | undefined;
      } = {
        ...form,
        imageUrls: imageUrl ? [imageUrl] : [],
        hasVariants: shouldHaveVariants,
        optionType: shouldHaveVariants ? form.optionType.trim() || "Variant" : undefined,
      };

      if (shouldHaveVariants) {
        // Validate variants
        const invalidVariants = variants.filter(
          (v) => !v.sku || !v.price || !v.cost
        );
        if (invalidVariants.length > 0) {
          throw new Error("All variants must have SKU, price, and cost.");
        }

        // Format variants for API
        payload.attributes = attributes;
        payload.variants = variants.map((v) => ({
          sku: v.sku,
          price: parseFloat(v.price),
          cost: parseFloat(v.cost),
          stock: parseInt(v.stock),
          minStock: parseInt(v.minStock),
          attributeValues: v.attributes,
        }));
      }

      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to create product.");
      setStatus("");
      setCreatedProduct({ name: form.name, type: shouldHaveVariants ? "Parent product and variants" : "Simple product" });
      window.setTimeout(() => router.push("/admin/products"), 1400);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create product.");
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <header className="border-b border-slate-200/80 dark:border-slate-800 pb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">Catalog setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Add product</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Set up the catalog product first. Stock movements are recorded later in the Inventory section.</p>
      </header>

      {/* Product Type Tabs */}
      <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => {
            setProductType("simple");
            setAttributes([]);
            setVariants([]);
          }}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            productType === "simple"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          Simple Product
        </button>
        <button
          type="button"
          onClick={() => {
            setProductType("variant");
            setAttributes([]);
            setVariants([]);
          }}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            productType === "variant"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          Parent Product and Variants
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 border-t-4 border-t-emerald-500 bg-white p-8 shadow-sm dark:border-slate-800 dark:border-t-emerald-400 dark:bg-slate-900/90">
        <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><ImagePlus className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Product image</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add one clear cover image for the catalog.</p></div></div>
          <div className="mt-4 flex gap-4 flex-row items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">{imageUrl ? <Image src={imageUrl} alt="Product preview" width={112} height={112} className="h-full w-full object-cover" unoptimized /> : <ImagePlus className="h-7 w-7 text-slate-400" />}</div>
            <div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"><UploadCloud className="h-4 w-4" />{isUploadingImage ? "Uploading..." : "Upload image"}<input type="file" accept="image/*" className="hidden" disabled={isUploadingImage} onChange={(event) => { void handleImageUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>{imageUrl ? <button type="button" onClick={() => setImageUrl("")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><X className="h-4 w-4" />Remove</button> : null}</div>
          </div>
        </section>
        {/* Basic Product Info */}
        <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
          <div className="mb-5"><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Basic information</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The identity shoppers and staff will see.</p></div>
          <div className="grid gap-4 grid-cols-2">
            <label className="text-sm font-medium">
              Product name
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="mt-1 w-full rounded-lg border p-2.5"
              />
            </label>
            <label className="text-sm font-medium">
              Category
              <select
                required
                value={form.categoryId}
                onChange={(event) => updateField("categoryId", event.target.value)}
                className="mt-1 w-full rounded-lg border p-2.5"
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Description
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border p-2.5"
            />
          </label>
        </section>

        {/* Variant Management - Only for Variant Products */}
        {productType === "variant" && (
          <section className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div>
              <h2 className="font-semibold">Product options and variant details</h2>
              <p className="mt-1 text-xs text-blue-700">
                The product name, category, description, and cover image belong to the parent catalog product. Add custom options below, then assign each variant its own gallery, SKU, price, cost, opening stock, and minimum stock.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <label className="block text-sm font-medium text-slate-700">
                Choice name (optional)
                <input
                  type="text"
                  value={form.optionType}
                  onChange={(event) => updateField("optionType", event.target.value)}
                  placeholder="e.g. Color, Size, Flavor, Capacity"
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
              <p className="mt-2 text-xs text-slate-600">
                Your custom attributes below are the choices customers will use on the product page.
              </p>
            </div>

            <AttributeManager
              attributes={attributes}
              onAttributesChange={setAttributes}
            />
            <VariantGenerator
              attributes={attributes}
              onVariantsGenerate={setVariants}
              initialVariants={variants}
              productName={form.name}
            />
            <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 grid-cols-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Parent product stock</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Parent and variants are sellable</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">The parent and each variant keep separate SKU, price, and stock records.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">How stock works</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Customers can buy the parent or a selected variant. Use Inventory for future stock in, stock out, and threshold changes.</p>
              </div>
            </div>
          </section>
        )}

        {/* Pricing & Inventory - Simple Product */}
        {(
          <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
            <div className="mb-5"><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Parent pricing and inventory</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The parent is sellable and keeps its own stock balance, even when variants are added.</p></div>
            <div className="grid gap-4 grid-cols-5">
              <label className="text-sm font-medium">
                Parent product code
                <input
                  required
                  value={form.sku}
                  onChange={(event) => updateField("sku", event.target.value)}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
              <label className="text-sm font-medium">
                Unit
                <select
                  value={form.unit}
                  onChange={(event) => updateField("unit", event.target.value)}
                  className="mt-1 w-full rounded-lg border p-2.5"
                >
                  <option value="piece">Piece</option>
                  <option value="kg">Kilogram</option>
                  <option value="liter">Liter</option>
                  <option value="meter">Meter</option>
                  <option value="box">Box</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Price
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => updateField("price", event.target.value)}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
              <label className="text-sm font-medium">
                Cost
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(event) => updateField("cost", event.target.value)}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
              <label className="text-sm font-medium">
                Stock
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) => updateField("stock", event.target.value)}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium">
              Minimum stock
              <input
                required
                type="number"
                min="0"
                step="1"
                value={form.minStock}
                onChange={(event) => updateField("minStock", event.target.value)}
                className="mt-1 w-full rounded-lg border p-2.5"
              />
            </label>
          </section>
        )}

        {/* Status and Submit */}
        {status && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
            {status}
          </div>
        )}
        <div className="flex gap-3 border-t border-slate-200 pt-5 dark:border-slate-700 flex-row items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">Fields marked required must be completed.</p>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving product..." : "Create product"}
        </button>
        </div>
      </form>

      {createdProduct ? (
        <AdminModalPortal>
        <div className={`${ADMIN_MODAL_BACKDROP_CLASS} px-4`} role="status" aria-live="polite">
          <div className={`${ADMIN_MODAL_PANEL_CLASS} w-full max-w-sm border-emerald-200 p-7 text-center shadow-2xl dark:border-emerald-900/60`}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="h-9 w-9" /></div>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">Success</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Product created successfully</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-900 dark:text-white">{createdProduct.name}</span> was added as a {createdProduct.type.toLowerCase()}.</p>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Returning to products...</p>
          </div>
        </div>
        </AdminModalPortal>
      ) : null}
    </main>
  );
}
