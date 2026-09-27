"use client";

import Image from "next/image";
import { useState } from "react";
import type { Attribute } from "./AttributeManager";

export interface Variant {
  id: string; // Temporary ID for UI
  attributes: Record<string, string>; // e.g., { "Color": "Red", "Size": "M" }
  price: string;
  cost: string;
  stock: string;
  minStock: string;
  sku: string;
  imageUrls?: string[];
}

interface VariantGeneratorProps {
  attributes: Attribute[];
  onVariantsGenerate: (variants: Variant[]) => void;
  initialVariants?: Variant[];
  productName?: string;
}

function toSkuToken(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "item";
}

export default function VariantGenerator({
  attributes,
  onVariantsGenerate,
  initialVariants = [],
  productName = "product",
}: VariantGeneratorProps) {
  const [variants, setVariants] = useState<Variant[]>(initialVariants);

  function generateVariantCombinations() {
    if (attributes.length === 0 || attributes.some((a) => a.values.length === 0)) {
      alert("Please add all attributes with values before generating variants");
      return;
    }

    const valueCount = attributes[0].values.length;
    if (attributes.some((attribute) => attribute.values.length !== valueCount)) {
      alert("Each attribute must have the same number of values so they can be paired.");
      return;
    }

    const combinations: Record<string, string>[] = Array.from(
      { length: valueCount },
      (_, valueIndex) =>
        Object.fromEntries(
          attributes.map((attribute) => [attribute.name, attribute.values[valueIndex]]),
        ),
    );

    const previous = new Map(variants.map((variant) => [JSON.stringify(variant.attributes), variant]));
    const newVariants: Variant[] = combinations.map((combo, index) => {
      const existing = previous.get(JSON.stringify(combo));
      const optionToken = Object.values(combo)
        .map((value) => toSkuToken(value))
        .filter(Boolean)
        .join("-") || "variant";
      const generatedSku = `${toSkuToken(productName)}-${optionToken}`.slice(0, 60);

      return existing ? {
        ...existing,
        id: existing.id || `variant-${Date.now()}-${index}`,
        sku: existing.sku || generatedSku,
      } : {
        id: `variant-${Date.now()}-${index}`,
        attributes: combo,
        price: "",
        cost: "",
        stock: "0",
        minStock: "5",
        sku: generatedSku,
        imageUrls: [],
      };
    });

    setVariants(newVariants);
    onVariantsGenerate(newVariants);
  }

  function updateVariant(id: string, field: keyof Variant, value: string) {
    const updated = variants.map((v) =>
      v.id === id ? { ...v, [field]: value } : v
    );
    setVariants(updated);
    onVariantsGenerate(updated);
  }

  async function uploadVariantImage(variantId: string, files: FileList | null) {
    const selectedFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!selectedFiles.length) return;

    const uploadFormData = new FormData();
    selectedFiles.forEach((file) => uploadFormData.append("files", file));

    try {
      const response = await fetch("/api/admin/products/upload", {
        method: "POST",
        body: uploadFormData,
        credentials: "same-origin",
      });
      const data = await response.json();

      if (!response.ok || !Array.isArray(data?.urls)) {
        return;
      }

      const updated = variants.map((variant) =>
        variant.id === variantId
          ? { ...variant, imageUrls: [...(variant.imageUrls ?? []), ...data.urls] }
          : variant
      );

      setVariants(updated);
      onVariantsGenerate(updated);
    } catch {
      // Error handled by the product form message state in the parent if needed.
    }
  }

  function removeVariant(id: string) {
    const updated = variants.filter((v) => v.id !== id);
    setVariants(updated);
    onVariantsGenerate(updated);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={generateVariantCombinations}
        disabled={attributes.length === 0}
        className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        Generate Variant Combinations
      </button>

      {variants.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            Each generated row is a sellable option. Fill in the SKU, price, and cost for every variant before saving.
          </div>
          <h3 className="font-medium text-slate-900 dark:text-slate-100">Generated variants ({variants.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm text-slate-900 dark:text-slate-100">
              <thead className="bg-slate-50 dark:bg-slate-800/80">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {attributes.map((attr) => (
                    <th key={attr.name} className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">
                      {attr.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">Image</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">SKU</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">Price</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">Cost</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">Min stock</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">Opening stock</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-700 dark:text-slate-200">Action</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <tr key={variant.id} className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                    {attributes.map((attr) => (
                      <td key={attr.name} className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {variant.attributes[attr.name]}
                      </td>
                    ))}
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        {(variant.imageUrls ?? []).map((url) => (
                          <Image
                            key={url}
                            src={url}
                            alt="Variant preview"
                            width={40}
                            height={40}
                            unoptimized
                            className="h-10 w-10 rounded border border-slate-200 object-cover dark:border-slate-700"
                          />
                        ))}
                        <label className="inline-flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) => {
                              void uploadVariantImage(variant.id, event.target.files);
                              event.currentTarget.value = "";
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        placeholder="SKU"
                        value={variant.sku}
                        onChange={(e) => updateVariant(variant.id, "sku", e.target.value)}
                        className="w-24 rounded border border-slate-300 bg-white p-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        placeholder="Price"
                        min="0"
                        step="0.01"
                        value={variant.price}
                        onChange={(e) => updateVariant(variant.id, "price", e.target.value)}
                        className="w-20 rounded border border-slate-300 bg-white p-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        placeholder="Cost"
                        min="0"
                        step="0.01"
                        value={variant.cost}
                        onChange={(e) => updateVariant(variant.id, "cost", e.target.value)}
                        className="w-20 rounded border border-slate-300 bg-white p-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        placeholder="Min"
                        min="0"
                        value={variant.minStock}
                        onChange={(e) => updateVariant(variant.id, "minStock", e.target.value)}
                        className="w-20 rounded border border-slate-300 bg-white p-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        placeholder="Stock"
                        min="0"
                        value={variant.stock}
                        onChange={(e) => updateVariant(variant.id, "stock", e.target.value)}
                        className="w-20 rounded border border-slate-300 bg-white p-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeVariant(variant.id)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
