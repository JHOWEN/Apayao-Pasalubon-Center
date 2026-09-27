"use client";

import { useState } from "react";

export interface Attribute {
  name: string;
  values: string[];
}

interface AttributeManagerProps {
  attributes: Attribute[];
  onAttributesChange: (attributes: Attribute[]) => void;
}

export default function AttributeManager({
  attributes,
  onAttributesChange,
}: AttributeManagerProps) {
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeValue, setNewAttributeValue] = useState("");
  const [editingAttributeIndex, setEditingAttributeIndex] = useState<number | null>(null);

  function addAttribute() {
    if (!newAttributeName.trim()) return;
    const newAttribute: Attribute = { name: newAttributeName, values: [] };
    onAttributesChange([...attributes, newAttribute]);
    setNewAttributeName("");
  }

  function removeAttribute(index: number) {
    onAttributesChange(attributes.filter((_, i) => i !== index));
    if (editingAttributeIndex === index) setEditingAttributeIndex(null);
  }

  function addValue(attributeIndex: number) {
    if (!newAttributeValue.trim()) return;
    const updated = [...attributes];
    if (!updated[attributeIndex].values.includes(newAttributeValue)) {
      updated[attributeIndex].values.push(newAttributeValue);
      onAttributesChange(updated);
    }
    setNewAttributeValue("");
  }

  function removeValue(attributeIndex: number, valueIndex: number) {
    const updated = [...attributes];
    updated[attributeIndex].values.splice(valueIndex, 1);
    onAttributesChange(updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-3 font-medium text-slate-900 dark:text-slate-100">Add Attributes</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Attribute name (e.g., Color, Size)"
              value={newAttributeName}
              onChange={(e) => setNewAttributeName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
              onKeyPress={(e) => e.key === "Enter" && addAttribute()}
            />
            <button
              type="button"
              onClick={addAttribute}
              className="rounded-lg bg-slate-200 px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {attributes.length > 0 && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/70">
          <h3 className="font-medium text-slate-900 dark:text-slate-100">Attributes</h3>
          {attributes.map((attr, attrIndex) => (
            <div key={attrIndex} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-medium text-slate-900 dark:text-slate-100">{attr.name}</h4>
                <button
                  type="button"
                  onClick={() => removeAttribute(attrIndex)}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`Add value for ${attr.name}`}
                    value={editingAttributeIndex === attrIndex ? newAttributeValue : ""}
                    onChange={(e) => {
                      setEditingAttributeIndex(attrIndex);
                      setNewAttributeValue(e.target.value);
                    }}
                    onFocus={() => setEditingAttributeIndex(attrIndex)}
                    className="flex-1 rounded border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                    onKeyPress={(e) =>
                      e.key === "Enter" && addValue(attrIndex)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => addValue(attrIndex)}
                    className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                  >
                    Add
                  </button>
                </div>

                {attr.values.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((value, valueIndex) => (
                      <div
                        key={valueIndex}
                        className="flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                      >
                        {value}
                        <button
                          type="button"
                          onClick={() => removeValue(attrIndex, valueIndex)}
                          className="text-xs text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
