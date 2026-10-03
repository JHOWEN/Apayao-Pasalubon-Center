"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Mail,
  MapPin,
  Moon,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Sun,
  User,
  UserRound,
  X,
} from "lucide-react";
import { clearCart, clearStoredUser, getStoredUser, saveStoredUser } from "@/features/cart/lib/cart";
import { getResponseErrorMessage, getUserFacingErrorMessage } from "@/lib/client-fetch";
import {
  compressUploadImage,
  PROFILE_IMAGE_COMPRESSION,
} from "@/utils/compress-upload-image";

const fallbackAvatarSrc = "";

type UserProfile = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  emailVerified?: boolean;
};

type ProfileForm = {
  name: string;
  phone: string;
};

type AddressForm = {
  zipCode: string;
  street: string;
  municipality: string;
  barangay: string;
  province: string;
  region: string;
  country: string;
};

const emptyAddress: AddressForm = {
  zipCode: "",
  street: "",
  municipality: "",
  barangay: "",
  province: "",
  region: "",
  country: "Philippines",
};

function buildProfileForm(user: UserProfile | null): ProfileForm {
  return {
    name: user?.name || "",
    phone: user?.phone || "",
  };
}

function buildAddressForm(address?: string | null): AddressForm {
  if (!address?.trim()) return { ...emptyAddress };

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { ...emptyAddress, street: address.trim() };

  const country = parts.at(-1) ?? emptyAddress.country;
  const hasZipBeforeRegion = /^\d{4,6}$/.test(parts.at(-3) ?? "");

  if (hasZipBeforeRegion && parts.length >= 7) {
    const zipCode = parts.at(-3) ?? "";
    const region = parts.at(-2) ?? "";
    const locationParts = parts.slice(0, -3);

    return {
      street: locationParts.slice(0, -3).join(", "),
      barangay: locationParts.at(-3) ?? "",
      municipality: locationParts.at(-2) ?? "",
      province: locationParts.at(-1) ?? "",
      region,
      zipCode,
      country,
    };
  }

  const zipCode = parts.at(-2) ?? "";
  const locationParts = parts.slice(0, -2);

  if (!/^\d{4,6}$/.test(zipCode) || locationParts.length < 5) {
    return { ...emptyAddress, street: address.trim() };
  }

  return {
    street: locationParts.slice(0, -4).join(", "),
    barangay: locationParts.at(-4) ?? "",
    municipality: locationParts.at(-3) ?? "",
    province: locationParts.at(-2) ?? "",
    region: locationParts.at(-1) ?? "",
    zipCode,
    country,
  };
}

function formatAddress(address: AddressForm) {
  return [
    address.street,
    address.barangay,
    address.municipality,
    address.province,
    address.zipCode,
    address.region,
    address.country,
  ]
    .filter((value) => value.trim())
    .join(", ");
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileForm>({ name: "", phone: "" });
  const [addressData, setAddressData] = useState<AddressForm>({ ...emptyAddress });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [previewImage, setPreviewImage] = useState<string>(fallbackAvatarSrc);
  const [statusMessage, setStatusMessage] = useState("");

  const isDeleteConfirmed = user?.email?.trim() && deleteEmail.trim() === user.email.trim();
  const canDeleteAccount = isDeleteConfirmed && deletePassword.trim().length > 0;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const storedTheme = window.localStorage.getItem("apc-theme");
    const themeTimeout = window.setTimeout(() => {
      setAppearance(storedTheme === "light" || storedTheme === "dark" ? storedTheme : mediaQuery.matches ? "dark" : "light");
    }, 0);

    const handleThemeUpdated = (event: Event) => {
      const nextTheme = (event as CustomEvent<"light" | "dark">).detail;
      if (nextTheme === "light" || nextTheme === "dark") setAppearance(nextTheme);
    };

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      const preference = window.localStorage.getItem("apc-theme");
      if (preference !== "light" && preference !== "dark") {
        setAppearance(event.matches ? "dark" : "light");
      }
    };

    window.addEventListener("apc-theme-updated", handleThemeUpdated);
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      window.clearTimeout(themeTimeout);
      window.removeEventListener("apc-theme-updated", handleThemeUpdated);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    async function loadProfile() {
      const cachedUser = getStoredUser() as UserProfile | null;

      if (cachedUser) {
        setUser(cachedUser);
        setFormData(buildProfileForm(cachedUser));
        setAddressData(buildAddressForm(cachedUser.address));
        setPreviewImage(cachedUser.imageUrl || fallbackAvatarSrc);
      }

      try {
        const response = await fetch("/api/auth/profile");
        const data = await response.json();

        if (!response.ok || !data?.user) {
          if (!cachedUser) {
            setUser(null);
            setFormData({ name: "", phone: "" });
            setAddressData({ ...emptyAddress });
            setPreviewImage(fallbackAvatarSrc);
          }
          return;
        }

        setUser(data.user);
        saveStoredUser(data.user);
        setFormData(buildProfileForm(data.user));
        setAddressData(buildAddressForm(data.user.address));
        setPreviewImage(data.user.imageUrl || fallbackAvatarSrc);
      } catch {
        if (!cachedUser) {
          setUser(null);
          setFormData({ name: "", phone: "" });
          setAddressData({ ...emptyAddress });
          setPreviewImage(fallbackAvatarSrc);
        }
      }
    }

    loadProfile();
  }, []);

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatusMessage("");
    setIsUploadingImage(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", await compressUploadImage(file, PROFILE_IMAGE_COMPRESSION));

      const uploadResponse = await fetch("/api/auth/profile/upload", {
        method: "POST",
        body: uploadFormData,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData?.url) {
        setStatusMessage(getResponseErrorMessage(uploadData, uploadResponse.status, "We couldn't upload your photo. Please try again."));
        return;
      }

      const saveResponse = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: uploadData.url }),
      });
      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        setStatusMessage(getResponseErrorMessage(saveData, saveResponse.status, "We couldn't save your profile photo. Please try again."));
        return;
      }

      const updatedUser = {
        ...(user ?? {}),
        ...(saveData.user ?? {}),
        imageUrl: saveData.user?.imageUrl ?? uploadData.url,
      };
      setUser(updatedUser);
      saveStoredUser(updatedUser);
      setPreviewImage(updatedUser.imageUrl || fallbackAvatarSrc);
      setStatusMessage("✓ Profile photo updated!");
      window.dispatchEvent(new Event("apc-user-updated"));
    } catch (error) {
      setStatusMessage(getUserFacingErrorMessage(error, "We couldn't upload your profile photo. Please try again."));
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleSave() {
    setStatusMessage("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, address: formatAddress(addressData) }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatusMessage(getResponseErrorMessage(data, response.status, "We couldn't save your profile yet. Please try again."));
        setIsSaving(false);
        return;
      }

      const updatedUser = { ...user, ...data.user };
      setUser(updatedUser);
      saveStoredUser(updatedUser);
      window.dispatchEvent(new Event("apc-user-updated"));
      setStatusMessage("✓ Profile updated successfully!");
      setIsEditing(false);

      setTimeout(() => {
        setStatusMessage("");
      }, 3000);
    } catch (error) {
      setStatusMessage(getUserFacingErrorMessage(error, "We couldn't save your profile yet. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (user) {
      setFormData({
        name: user.name || "",
        phone: user.phone || "",
      });
      setAddressData(buildAddressForm(user.address));
    }
    setIsEditing(false);
    setStatusMessage("");
  }

  async function handleDeleteAccount() {
    if (!user?.email) {
      setStatusMessage("You must be signed in to delete your account.");
      setShowDeleteModal(false);
      return;
    }

    if (deleteEmail.trim() !== user.email.trim()) {
      setStatusMessage("Please type your email exactly to confirm account deletion.");
      return;
    }

    if (!deletePassword.trim()) {
      setStatusMessage("Please enter your current password to continue.");
      return;
    }

    setStatusMessage("");
    setIsDeletingAccount(true);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: deleteEmail.trim(),
          password: deletePassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatusMessage(getResponseErrorMessage(data, response.status, "We couldn't delete your account right now. Please try again."));
        return;
      }

      clearStoredUser();
      clearCart();
      window.dispatchEvent(new Event("storage"));
      setUser(null);
      setDeleteEmail("");
      setDeletePassword("");
      setShowDeleteModal(false);
      setStatusMessage("✓ Account deleted successfully.");
      router.push("/login");
    } catch (error) {
      setStatusMessage(getUserFacingErrorMessage(error, "We couldn't delete your account right now. Please try again."));
    } finally {
      setIsDeletingAccount(false);
    }
  }

  function updateAppearance(nextTheme: "light" | "dark") {
    setAppearance(nextTheme);
    window.localStorage.setItem("apc-theme", nextTheme);
    window.dispatchEvent(new CustomEvent("apc-theme-updated", { detail: nextTheme }));
  }

  return (
    <main className="min-h-screen bg-[#0a0d14] text-slate-100 pb-16">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        
        {/* Header Card with Avatar */}
        <div className="rounded-3xl border border-white/10 bg-[#12141c] p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
            
            {/* Avatar & Basic Info */}
            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
              {/* Profile Image with Camera Hover */}
              <div className="relative group">
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full border-2 border-[#ff8a1e]/40 bg-[#181b24] shadow-md">
                  {previewImage ? (
                    <Image
                      src={previewImage}
                      alt="Profile"
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <UserRound className="h-10 w-10 text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Upload Action Overlay */}
                <label
                  htmlFor="profile-photo-upload"
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/70 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition cursor-pointer backdrop-blur-[2px]"
                >
                  <Camera className="h-4 w-4 mb-0.5" />
                  <span>{isUploadingImage ? "..." : "Change"}</span>
                </label>
                <input
                  id="profile-photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isUploadingImage}
                />
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
                  Customer Account
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                  {user?.name || "Your Profile"}
                </h1>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-slate-400">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{user?.email || "Not signed in"}</span>
                </div>
              </div>
            </div>

            {/* Action Toggle */}
            <div className="flex items-center gap-2.5">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-10 rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 hover:bg-[#f97316] transition disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="h-10 rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 hover:bg-[#f97316] transition"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback Banner */}
        {statusMessage && (
          <div
            className={`rounded-2xl border p-4 text-xs font-semibold ${
              statusMessage.includes("successfully")
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                : "border-rose-400/30 bg-rose-500/15 text-rose-200"
            }`}
          >
            {statusMessage}
          </div>
        )}

        {/* Account Readiness Status Banner */}
        <div className="rounded-3xl border border-white/10 bg-[#12141c] p-5 sm:p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-[#ff8a1e]" />
              <div>
                <h2 className="text-sm font-bold text-white">Ordering Verification Status</h2>
                <p className="text-xs text-slate-400">Status required for store reservation checkout.</p>
              </div>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                user?.emailVerified
                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-400/30 bg-amber-500/15 text-amber-300"
              }`}
            >
              {user?.emailVerified ? "Verified Customer" : "Pending Profile Details"}
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-400 leading-relaxed">
            {user?.emailVerified
              ? "Your profile has completed contact and address details. You can reserve products smoothly with Cash, GCash, or Maya."
              : "To place store pickup orders without delay, make sure to add your phone number and complete address below."}
          </p>
        </div>

        <section className="storefront-appearance rounded-3xl border border-white/10 bg-[#12141c] p-5 sm:p-6 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Appearance</h2>
              <p className="mt-1 text-xs text-slate-400">Choose the storefront color theme.</p>
            </div>
            <div role="group" aria-label="Appearance theme" className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={appearance === "light"}
                onClick={() => updateAppearance("light")}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-semibold transition ${
                  appearance === "light"
                    ? "border-[#ff8a1e] bg-[#ff8a1e] text-slate-950"
                    : "border-white/10 bg-[#181b24] text-slate-200 hover:border-[#ff8a1e]/50"
                }`}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
              <button
                type="button"
                aria-pressed={appearance === "dark"}
                onClick={() => updateAppearance("dark")}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-semibold transition ${
                  appearance === "dark"
                    ? "border-[#ff8a1e] bg-[#ff8a1e] text-slate-950"
                    : "border-white/10 bg-[#181b24] text-slate-200 hover:border-[#ff8a1e]/50"
                }`}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
            </div>
          </div>
        </section>

        {/* Personal Details & Address Card */}
        <div className="rounded-3xl border border-white/10 bg-[#12141c] p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h2 className="text-base font-bold text-white">Contact & Address Details</h2>
            <span className="text-[11px] text-slate-400">
              {isEditing ? "Editing mode" : "Saved information"}
            </span>
          </div>

          {isEditing ? (
            /* Edit Form */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="space-y-6 text-xs"
            >
              {/* Personal Info Group */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#ff8a1e]">
                  1. Contact Information
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Full Name</label>
                    <input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Phone Number</label>
                    <input
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="09XX XXX XXXX"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">Email Address</label>
                  <input
                    disabled
                    value={user?.email || ""}
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24]/50 px-4 font-medium text-slate-500 cursor-not-allowed outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Email address cannot be changed directly.</p>
                </div>
              </div>

              {/* Address Details Group */}
              <div className="space-y-4 pt-4 border-t border-white/10">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#ff8a1e]">
                  2. Pickup / Residence Address
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block font-semibold text-slate-300 mb-1.5">Street / House Number</label>
                    <input
                      required
                      value={addressData.street}
                      onChange={(e) => setAddressData({ ...addressData, street: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="e.g. Unit 4, Rizal Street"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Barangay</label>
                    <input
                      required
                      value={addressData.barangay}
                      onChange={(e) => setAddressData({ ...addressData, barangay: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="Barangay"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Municipality / Town</label>
                    <input
                      required
                      value={addressData.municipality}
                      onChange={(e) => setAddressData({ ...addressData, municipality: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="e.g. Luna"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Province</label>
                    <input
                      required
                      value={addressData.province}
                      onChange={(e) => setAddressData({ ...addressData, province: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="e.g. Apayao"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Region</label>
                    <input
                      required
                      value={addressData.region}
                      onChange={(e) => setAddressData({ ...addressData, region: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="e.g. CAR"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">ZIP Code</label>
                    <input
                      required
                      value={addressData.zipCode}
                      onChange={(e) => setAddressData({ ...addressData, zipCode: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="e.g. 3809"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">Country</label>
                    <input
                      required
                      value={addressData.country}
                      onChange={(e) => setAddressData({ ...addressData, country: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#181b24] px-4 font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                      placeholder="Philippines"
                    />
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-11 rounded-xl border border-white/10 bg-white/5 px-5 font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 rounded-xl bg-[#ff8a1e] px-6 font-bold text-slate-950 hover:bg-[#f97316] transition disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Details"}
                </button>
              </div>
            </form>
          ) : (
            /* View Mode */
            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-2xl border border-white/5 bg-[#181b24] p-4 space-y-2">
                <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <User className="h-3.5 w-3.5 text-[#ff8a1e]" />
                  <span>Full Name</span>
                </div>
                <div className="text-sm font-bold text-white">
                  {user?.name || "Not set yet"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-[#181b24] p-4 space-y-2">
                <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <Phone className="h-3.5 w-3.5 text-[#ff8a1e]" />
                  <span>Phone Number</span>
                </div>
                <div className="text-sm font-bold text-white">
                  {user?.phone || "Not set yet"}
                </div>
              </div>

              <div className="sm:col-span-2 rounded-2xl border border-white/5 bg-[#181b24] p-4 space-y-2">
                <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <MapPin className="h-3.5 w-3.5 text-[#ff8a1e]" />
                  <span>Saved Address</span>
                </div>
                <div className="text-xs sm:text-sm font-medium text-white leading-relaxed">
                  {user?.address || "No address on file. Click 'Edit Profile' to add your residence details."}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Danger Zone: Delete Account */}
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <ShieldAlert className="h-4 w-4" />
                <span>Account Deletion</span>
              </div>
              <p className="text-xs text-rose-200/70 leading-relaxed max-w-lg">
                Permanently delete your account and personal reservation history. This action cannot be undone.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setDeleteEmail("");
                setDeletePassword("");
                setShowDeleteModal(true);
              }}
              style={{ color: "var(--storefront-danger)" }}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold hover:bg-rose-500/20"
            >
              Delete Account
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            data-ecommerce-modal="true"
            onClick={() => setShowDeleteModal(false)}
          >
            <div
              className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-[#12141c] p-6 space-y-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <AlertTriangle className="h-5 w-5" />
                  <span>Confirm Account Deletion</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                This action is permanent. To confirm deletion, type your registered email address (
                <span className="font-semibold text-white">{user?.email}</span>) and current password below:
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Confirm Email</label>
                  <input
                    type="email"
                    value={deleteEmail}
                    onChange={(e) => setDeleteEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#181b24] px-3 text-white outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter current password"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#181b24] px-3 text-white outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteAccount()}
                  disabled={!canDeleteAccount || isDeletingAccount}
                  className="h-10 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-50"
                >
                  {isDeletingAccount ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
