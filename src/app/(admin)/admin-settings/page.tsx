"use client";

import NextImage from "@/components/safe-image";
import { AdminToast } from "@/components/admin/admin-toast";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import {
  Check,
  Copy,
  CreditCard,
  Info,
  KeyRound,
  MapPin,
  Phone,
  Printer,
  QrCode,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  ADMIN_MODAL_BACKDROP_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";
import { useEffect, useState } from "react";
import { getNewPasswordPolicyError, MIN_NEW_PASSWORD_CHARACTERS } from "@/lib/password-policy";

const fallbackAvatarSrc =
  process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png";

type SettingsTab = "profile" | "store" | "pos" | "wallets" | "security" | "team";

type SettingsState = {
  appName?: string;
  registeredBusinessName?: string | null;
  businessAddress?: string | null;
  tinNumber?: string | null;
  currency?: string;
  gcashAccountName?: string | null;
  gcashAccountNumber?: string | null;
  gcashQrCodeUrl?: string | null;
  mayaAccountName?: string | null;
  mayaAccountNumber?: string | null;
  mayaQrCodeUrl?: string | null;
};

type ProfileFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  imageUrl: string;
};

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  isBlocked: boolean;
  emailVerified: boolean;
  createdAt: string;
};

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const [settingsForm, setSettingsForm] = useState<SettingsState>({
    appName: "APC Inventory",
    registeredBusinessName: "APAYAO PASALUBONG CENTER",
    businessAddress: "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
    tinNumber: "",
    currency: "PHP",
    gcashAccountName: "",
    gcashAccountNumber: "",
    gcashQrCodeUrl: "",
    mayaAccountName: "",
    mayaAccountNumber: "",
    mayaQrCodeUrl: "",
  });

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    name: "",
    email: "",
    phone: "",
    address: "",
    imageUrl: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadingQr, setUploadingQr] = useState<"gcash" | "maya" | null>(null);
  const [previewImage, setPreviewImage] = useState<string>(fallbackAvatarSrc);

  // Universal Toast Feedback
  const [toast, setToast] = useState<{
    show: boolean;
    type: "success" | "error";
    message: string;
  }>({
    show: false,
    type: "success",
    message: "",
  });

  // Team & User Management
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamAccessState, setTeamAccessState] = useState<"loading" | "allowed" | "denied">("loading");
  const [teamAccessMessage, setTeamAccessMessage] = useState("");
  const [teamForm, setTeamForm] = useState({
    name: "",
    email: "",
    role: "STAFF" as "STAFF" | "ADMIN",
  });
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isCreatingTeamUser, setIsCreatingTeamUser] = useState(false);
  const [copiedTempPass, setCopiedTempPass] = useState(false);

  // Modern In-App Delete Confirmation Modal
  const [userToDelete, setUserToDelete] = useState<TeamUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const [userRole, setUserRole] = useState<"ADMIN" | "STAFF" | null>(null);
  const isAdmin = userRole === "ADMIN";

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ show: true, type, message });
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/settings");
        const data = await response.json();
        const nextSettings = {
          appName: "APC Inventory",
          registeredBusinessName: "APAYAO PASALUBONG CENTER",
          businessAddress: "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
          tinNumber: "",
          currency: "PHP",
          ...data?.settings,
        };
        setSettingsForm(nextSettings);
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    }

    async function loadProfile() {
      try {
        const response = await fetch("/api/admin/profile");
        const data = await response.json();

        if (response.ok && data.user) {
          const role =
            data.user.role === "ADMIN" ? "ADMIN" : data.user.role === "STAFF" ? "STAFF" : null;
          setUserRole(role);
          setProfileForm({
            name: data.user.name ?? "",
            email: data.user.email ?? "",
            phone: data.user.phone ?? "",
            address: data.user.address ?? "",
            imageUrl: data.user.imageUrl ?? "",
          });
          setPreviewImage(data.user.imageUrl ?? fallbackAvatarSrc);

          if (role === "ADMIN") {
            void loadSettings();
            void loadTeamUsers();
          }
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    }

    async function loadTeamUsers() {
      try {
        const response = await fetch("/api/admin/users");
        if (response.ok) {
          const data = await response.json();
          setTeamUsers(Array.isArray(data) ? data : []);
          setTeamAccessState("allowed");
          return;
        }

        const data = await response.json().catch(() => null);
        setTeamAccessState("denied");
        setTeamAccessMessage(data?.message ?? "Only an active ADMIN account can manage users.");
      } catch {
        setTeamAccessState("denied");
        setTeamAccessMessage("Unable to load team accounts.");
      }
    }

    void loadProfile();
  }, []);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const response = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Failed to update profile.");
        return;
      }

      setProfileForm({
        name: data.user.name ?? "",
        email: data.user.email ?? "",
        phone: data.user.phone ?? "",
        address: data.user.address ?? "",
        imageUrl: data.user.imageUrl ?? "",
      });
      setPreviewImage(data.user.imageUrl ?? fallbackAvatarSrc);
      window.dispatchEvent(new Event("apc-user-updated"));
      showToast("success", "Personal profile updated successfully.");
    } catch {
      showToast("error", "Unable to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function createCircularAvatar(file: File) {
    return new Promise<{ blob: Blob; previewUrl: string }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to process image preview."));
          return;
        }

        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (size - width) / 2;
        const y = (size - height) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(image, x, y, width, height);
        ctx.restore();

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Unable to process image."));
            return;
          }
          resolve({
            blob,
            previewUrl: URL.createObjectURL(blob),
          });
        }, "image/png");
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to read image file."));
      };

      image.src = objectUrl;
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);

    try {
      const { blob, previewUrl } = await createCircularAvatar(file);
      setPreviewImage(previewUrl);

      const formData = new FormData();
      formData.append("file", blob, file.name.replace(/\.[^.]+$/, ".png"));

      const response = await fetch("/api/admin/profile/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Image upload failed.");
        return;
      }

      const updatedProfile = { ...profileForm, imageUrl: data.url };
      setProfileForm(updatedProfile);
      setPreviewImage(data.url);

      const saveResponse = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile),
      });
      const saveData = await saveResponse.json();

      if (saveResponse.ok) {
        setProfileForm({
          name: saveData.user.name ?? "",
          email: saveData.user.email ?? "",
          phone: saveData.user.phone ?? "",
          address: saveData.user.address ?? "",
          imageUrl: saveData.user.imageUrl ?? "",
        });
        setPreviewImage(saveData.user.imageUrl ?? fallbackAvatarSrc);
        window.dispatchEvent(new Event("apc-user-updated"));
        showToast("success", "Avatar photo updated successfully.");
      }
    } catch {
      showToast("error", "Error uploading profile image.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSettingsSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingSettings(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Failed to save settings.");
        return;
      }

      const nextSettings = data?.settings ?? settingsForm;
      setSettingsForm(nextSettings);
      showToast("success", "Settings saved successfully.");
    } catch {
      showToast("error", "Error saving settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleQrUpload(wallet: "gcash" | "maya", file: File | undefined) {
    if (!file) return;

    setUploadingQr(wallet);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/payment-qr/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "QR upload failed.");
        return;
      }

      const field = wallet === "gcash" ? "gcashQrCodeUrl" : "mayaQrCodeUrl";
      const updatedForm = { ...settingsForm, [field]: data.url };
      setSettingsForm(updatedForm);

      // Auto-save settings with new QR code
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });

      showToast("success", `${wallet.toUpperCase()} QR code uploaded & saved.`);
    } catch {
      showToast("error", "Unable to upload QR code.");
    } finally {
      setUploadingQr(null);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("error", "New passwords do not match.");
      return;
    }

    const passwordError = getNewPasswordPolicyError(passwordForm.newPassword);
    if (passwordError) {
      showToast("error", passwordError);
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch("/api/admin/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Failed to change password.");
        return;
      }

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast("success", "Password updated. Please log in again.");
      window.setTimeout(() => window.location.replace("/login?reason=session-expired"), 1000);
    } catch {
      showToast("error", "Unable to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  // Create Team User
  async function handleCreateTeamUser(e: React.FormEvent) {
    e.preventDefault();
    setIsCreatingTeamUser(true);
    setTemporaryPassword("");
    setCopiedTempPass(false);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamForm),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Unable to create account.");
        return;
      }

      setTeamUsers((current) => [data.user, ...current]);
      setTemporaryPassword(data.temporaryPassword ?? "");
      setTeamForm({ name: "", email: "", role: "STAFF" });
      showToast("success", "Team member account created successfully.");
    } catch {
      showToast("error", "Unable to create team account.");
    } finally {
      setIsCreatingTeamUser(false);
    }
  }

  // Update Team User Role / Block status
  async function updateTeamUser(
    user: TeamUser,
    changes: { role?: TeamUser["role"]; isBlocked?: boolean }
  ) {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...changes }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Unable to update account.");
        return;
      }

      if (data.sessionEnded) {
        showToast("success", "Your role or account status changed. Please log in again.");
        window.setTimeout(() => window.location.replace("/login?reason=session-expired"), 1000);
        return;
      }

      setTeamUsers((current) =>
        current.map((item) => (item.id === user.id ? data.user : item))
      );
      showToast("success", "User permissions updated.");
    } catch {
      showToast("error", "Error updating account.");
    }
  }

  // Execute User Deletion
  async function confirmDeleteUser() {
    if (!userToDelete) return;
    setIsDeletingUser(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userToDelete.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message ?? "Unable to delete account.");
        return;
      }

      setTeamUsers((current) => current.filter((item) => item.id !== userToDelete.id));
      showToast("success", `Account for ${userToDelete.email} deleted.`);
      setUserToDelete(null);
    } catch {
      showToast("error", "Error deleting account.");
    } finally {
      setIsDeletingUser(false);
    }
  }

  const handleCopyTemporaryPassword = async () => {
    if (!temporaryPassword) return;

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(temporaryPassword);
        copied = true;
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = temporaryPassword;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        copied = document.execCommand("copy");
        textArea.remove();
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      showToast("error", "Unable to copy the temporary password.");
      return;
    }

    setCopiedTempPass(true);
    setTimeout(() => setCopiedTempPass(false), 2000);
  };

  return (
    <div className="space-y-6 pb-16 text-slate-900 dark:text-slate-100">
      {/* Universal Floating Toast */}
      {toast.show && (
        <AdminToast
          type={toast.type}
          message={toast.message}
          onDismiss={() => setToast((current) => ({ ...current, show: false }))}
        />
      )}

      {/* 1. Header with Role Indicator */}
      <header className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-bold tracking-tight text-slate-950 dark:text-white text-2xl">
                Settings
              </h1>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                {userRole === "ADMIN"
                  ? "System Administrator"
                  : userRole === "STAFF"
                  ? "Staff Account"
                  : "Loading..."}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Manage your profile, store configuration, POS receipt details, payment wallets, security, and team access.
            </p>
          </div>
        </div>

        {/* Segmented Category Tabs */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition ${
                activeTab === "profile"
                  ? "bg-slate-900 font-semibold text-white shadow-sm dark:bg-emerald-600"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Profile & Account</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("store")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition ${
                  activeTab === "store"
                    ? "bg-slate-900 font-semibold text-white shadow-sm dark:bg-emerald-600"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Store className="h-3.5 w-3.5" />
                <span>Store Setup</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("pos")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition ${
                  activeTab === "pos"
                    ? "bg-slate-900 font-semibold text-white shadow-sm dark:bg-emerald-600"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>POS Receipt</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("wallets")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition ${
                  activeTab === "wallets"
                    ? "bg-slate-900 font-semibold text-white shadow-sm dark:bg-emerald-600"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Payment Wallets</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition ${
                activeTab === "security"
                  ? "bg-slate-900 font-semibold text-white shadow-sm dark:bg-emerald-600"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Security</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition ${
                  activeTab === "team"
                    ? "bg-slate-900 font-semibold text-white shadow-sm dark:bg-emerald-600"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Team Management</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. TAB 1: PROFILE & ACCOUNT */}
      {activeTab === "profile" && (
        <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Personal Information
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Update your administrator avatar, contact phone, and registered credentials.
            </p>
          </div>

          {/* Avatar Section */}
          <div className="mt-5 flex flex-row items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
              <NextImage
                src={previewImage || profileForm.imageUrl || fallbackAvatarSrc}
                alt="Profile"
                fill
                sizes="80px"
                className="object-cover"
                unoptimized={Boolean(previewImage?.startsWith("blob:"))}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Profile Avatar Photo
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Processed as an optimal circular badge (PNG, JPG, WebP up to 5MB).
              </p>
              <div className="mt-2.5">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isUploadingImage ? "Uploading Photo..." : "Upload New Photo"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isUploadingImage}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <form className="mt-6 space-y-4" onSubmit={handleProfileSave}>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Full Name
                </label>
                <input
                  id="profile-name"
                  required
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm((curr) => ({ ...curr, name: e.target.value }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Email Address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  required
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm((curr) => ({ ...curr, email: e.target.value }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div>
                <label
                  htmlFor="profile-phone"
                  className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Phone className="h-3 w-3" />
                  Phone Number
                </label>
                <input
                  id="profile-phone"
                  value={profileForm.phone}
                  placeholder="+63 9XX XXX XXXX"
                  onChange={(e) =>
                    setProfileForm((curr) => ({ ...curr, phone: e.target.value }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-address"
                  className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <MapPin className="h-3 w-3" />
                  Business Address
                </label>
                <input
                  id="profile-address"
                  value={profileForm.address}
                  placeholder="Street, Barangay, City, Province"
                  onChange={(e) =>
                    setProfileForm((curr) => ({ ...curr, address: e.target.value }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {isSavingProfile ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 3. TAB 2: STORE & POS SETUP (Admin Only) */}
      {activeTab === "store" && isAdmin && (
        <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Store Setup
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Configure store identity.
            </p>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSettingsSave}>
            <div>
              <label
                htmlFor="store-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Store / Organization Name
              </label>
              <input
                id="store-name"
                required
                value={settingsForm.appName ?? ""}
                onChange={(e) =>
                  setSettingsForm((curr) => ({ ...curr, appName: e.target.value }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="store-currency"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Operating Currency Code
              </label>
              <input
                id="store-currency"
                value={settingsForm.currency ?? "PHP"}
                onChange={(e) =>
                  setSettingsForm((curr) => ({ ...curr, currency: e.target.value }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>



            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {isSavingSettings ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Save Store Settings</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* POS receipt business details (Admin Only) */}
      {activeTab === "pos" && isAdmin && (
        <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">POS Receipt Header</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              These business details appear at the top of browser and USB thermal receipts.
            </p>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSettingsSave}>
            <div>
              <label htmlFor="receipt-business-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Registered Business Name
              </label>
              <input
                id="receipt-business-name"
                maxLength={120}
                value={settingsForm.registeredBusinessName ?? ""}
                onChange={(e) => setSettingsForm((curr) => ({ ...curr, registeredBusinessName: e.target.value }))}
                placeholder="Enter the registered business name"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="receipt-business-address" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Business Address
              </label>
              <textarea
                id="receipt-business-address"
                maxLength={240}
                rows={3}
                value={settingsForm.businessAddress ?? ""}
                onChange={(e) => setSettingsForm((curr) => ({ ...curr, businessAddress: e.target.value }))}
                placeholder="Street, barangay, municipality, province"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="receipt-tin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                TIN No.
              </label>
              <input
                id="receipt-tin"
                maxLength={40}
                value={settingsForm.tinNumber ?? ""}
                onChange={(e) => setSettingsForm((curr) => ({ ...curr, tinNumber: e.target.value }))}
                placeholder="Enter TIN, or leave blank to omit it"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {isSavingSettings ? <span>Saving...</span> : <><Check className="h-3.5 w-3.5" /><span>Save POS Receipt Settings</span></>}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 4. TAB 3: PAYMENT WALLETS & QR CODES (Admin Only) */}
      {activeTab === "wallets" && isAdmin && (
        <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Payment Receiving Accounts & QR Codes
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Customers scan these QR codes or transfer directly to these accounts during checkout.
            </p>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>Security Guideline:</strong> Never enter your personal wallet PIN, MPIN,
              password, OTP, or recovery seed phrases. Only public receiving names and numbers belong
              here.
            </div>
          </div>

          <form className="mt-5 space-y-6" onSubmit={handleSettingsSave}>
            <div className="grid gap-6 grid-cols-2">
              {/* GCASH WALLET CARD */}
              <div className="rounded-xl border border-blue-200/80 bg-blue-50/30 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex items-center justify-between border-b border-blue-100 pb-3 dark:border-blue-900/40">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-[10px] font-bold text-white">
                      G
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      GCash Wallet
                    </span>
                  </div>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    Mobile Wallet
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="gcash-account-name"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Registered Account Name
                    </label>
                    <input
                      id="gcash-account-name"
                      placeholder="e.g. Juan Dela Cruz"
                      value={settingsForm.gcashAccountName ?? ""}
                      onChange={(e) =>
                        setSettingsForm((curr) => ({
                          ...curr,
                          gcashAccountName: e.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="gcash-account-number"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      GCash Mobile Number
                    </label>
                    <input
                      id="gcash-account-number"
                      placeholder="09XXXXXXXXX"
                      value={settingsForm.gcashAccountNumber ?? ""}
                      onChange={(e) =>
                        setSettingsForm((curr) => ({
                          ...curr,
                          gcashAccountNumber: e.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {/* QR Uploader & Preview */}
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Official GCash QR Code
                    </label>
                    <div className="mt-2 flex items-center gap-3 flex-row">
                      <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        {settingsForm.gcashQrCodeUrl ? (
                          <NextImage
                            src={settingsForm.gcashQrCodeUrl}
                            alt="GCash QR Preview"
                            width={120}
                            height={120}
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <div className="text-center text-[10px] text-slate-400">
                            <QrCode className="mx-auto h-6 w-6 text-slate-300" />
                            <span>No QR Uploaded</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          <Upload className="h-3.5 w-3.5" />
                          <span>
                            {uploadingQr === "gcash"
                              ? "Uploading..."
                              : settingsForm.gcashQrCodeUrl
                              ? "Replace QR Code"
                              : "Upload GCash QR"}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={(e) => void handleQrUpload("gcash", e.target.files?.[0])}
                            disabled={uploadingQr === "gcash"}
                          />
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Clear square photo of your printable merchant or personal QR code.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* MAYA WALLET CARD */}
              <div className="rounded-xl border border-sky-200/80 bg-sky-50/30 p-5 dark:border-sky-900/50 dark:bg-sky-950/20">
                <div className="flex items-center justify-between border-b border-sky-100 pb-3 dark:border-sky-900/40">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-bold text-white">
                      M
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Maya Wallet
                    </span>
                  </div>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    Mobile Wallet
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="maya-account-name"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Registered Account Name
                    </label>
                    <input
                      id="maya-account-name"
                      placeholder="e.g. Juan Dela Cruz"
                      value={settingsForm.mayaAccountName ?? ""}
                      onChange={(e) =>
                        setSettingsForm((curr) => ({
                          ...curr,
                          mayaAccountName: e.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="maya-account-number"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Maya Mobile Number
                    </label>
                    <input
                      id="maya-account-number"
                      placeholder="09XXXXXXXXX"
                      value={settingsForm.mayaAccountNumber ?? ""}
                      onChange={(e) =>
                        setSettingsForm((curr) => ({
                          ...curr,
                          mayaAccountNumber: e.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {/* QR Uploader & Preview */}
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Official Maya QR Code
                    </label>
                    <div className="mt-2 flex items-center gap-3 flex-row">
                      <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        {settingsForm.mayaQrCodeUrl ? (
                          <NextImage
                            src={settingsForm.mayaQrCodeUrl}
                            alt="Maya QR Preview"
                            width={120}
                            height={120}
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <div className="text-center text-[10px] text-slate-400">
                            <QrCode className="mx-auto h-6 w-6 text-slate-300" />
                            <span>No QR Uploaded</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          <Upload className="h-3.5 w-3.5" />
                          <span>
                            {uploadingQr === "maya"
                              ? "Uploading..."
                              : settingsForm.mayaQrCodeUrl
                              ? "Replace QR Code"
                              : "Upload Maya QR"}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={(e) => void handleQrUpload("maya", e.target.files?.[0])}
                            disabled={uploadingQr === "maya"}
                          />
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Clear square photo of your printable Maya merchant or personal QR code.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Info className="h-4 w-4 text-slate-400" />
                <span>Uploaded QR codes are instantly visible to online customers.</span>
              </div>
              <button
                type="submit"
                disabled={isSavingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {isSavingSettings ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Save Wallet Information</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 5. TAB 4: SECURITY & AUTHENTICATION */}
      {activeTab === "security" && (
        <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Password & Account Security
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Change your password regularly to protect store operations and business data.
            </p>
          </div>

          <form className="mt-5 max-w-xl space-y-4" onSubmit={handlePasswordChange}>
            <div>
              <label
                htmlFor="current-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Current Password
              </label>
              <input
                id="current-password"
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((curr) => ({
                    ...curr,
                    currentPassword: e.target.value,
                  }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={MIN_NEW_PASSWORD_CHARACTERS}
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((curr) => ({
                    ...curr,
                    newPassword: e.target.value,
                  }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Use at least {MIN_NEW_PASSWORD_CHARACTERS} characters and no more than 72 UTF-8 bytes. Passphrases and spaces are allowed.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((curr) => ({
                    ...curr,
                    confirmPassword: e.target.value,
                  }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {isChangingPassword ? (
                  <span>Updating...</span>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 6. TAB 5: TEAM MANAGEMENT (Admin Only) */}
      {activeTab === "team" && isAdmin && (
        <div className="space-y-6">
          {teamAccessState === "loading" && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Loading Team Management...
            </div>
          )}

          {teamAccessState === "denied" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {teamAccessMessage}
            </div>
          )}

          {teamAccessState === "allowed" && (
            <>
              {/* Create Team Member Card */}
              <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Create Team Account
                    </h2>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Provision staff or administrator credentials with instant temporary access.
                  </p>
                </div>

                <form
                  className="mt-4 grid gap-3 grid-cols-4 items-end"
                  onSubmit={handleCreateTeamUser}
                >
                  <div>
                    <label
                      htmlFor="team-name"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Staff Full Name
                    </label>
                    <input
                      id="team-name"
                      required
                      minLength={2}
                      placeholder="e.g. Maria Santos"
                      value={teamForm.name}
                      onChange={(e) =>
                        setTeamForm((curr) => ({ ...curr, name: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="team-email"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Email Address
                    </label>
                    <input
                      id="team-email"
                      type="email"
                      required
                      placeholder="staff@example.com"
                      value={teamForm.email}
                      onChange={(e) =>
                        setTeamForm((curr) => ({ ...curr, email: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="team-role"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Access Level / Role
                    </label>
                    <select
                      id="team-role"
                      value={teamForm.role}
                      onChange={(e) =>
                        setTeamForm((curr) => ({
                          ...curr,
                          role: e.target.value as "STAFF" | "ADMIN",
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="STAFF">Staff (POS & Inventory Access)</option>
                      <option value="ADMIN">Administrator (Full Access)</option>
                    </select>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={isCreatingTeamUser}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>{isCreatingTeamUser ? "Creating..." : "Add Member"}</span>
                    </button>
                  </div>
                </form>

                {/* Temporary Password Box */}
                {temporaryPassword && (
                  <div className="mt-4 flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/40 flex-row items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Temporary Credentials Generated:
                      </span>
                      <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                        Share this temporary password securely. It will not be displayed again.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-emerald-200 bg-white px-3 py-1 font-mono text-sm font-bold text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-white">
                        {temporaryPassword}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyTemporaryPassword}
                        title="Copy Password"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-200"
                      >
                        {copiedTempPass ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Team Ledger Table */}
              <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Active Team Members
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {teamUsers.length} staff & administrator accounts provisioned
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Member Name & Email</th>
                        <th className="px-4 py-3">Assigned Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Created On</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {teamUsers.map((user) => (
                        <tr
                          key={user.id}
                          className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {user.name}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <select
                              value={user.role}
                              onChange={(e) =>
                                void updateTeamUser(user, {
                                  role: e.target.value as TeamUser["role"],
                                })
                              }
                              className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            >
                              <option value="STAFF">Staff</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                user.isBlocked
                                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              }`}
                            >
                              {user.isBlocked ? "Deactivated" : "Active"}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {new Date(user.createdAt).toLocaleDateString("en-PH", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void updateTeamUser(user, { isBlocked: !user.isBlocked })
                                }
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                  user.isBlocked
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
                                    : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                                }`}
                              >
                                {user.isBlocked ? "Activate" : "Deactivate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setUserToDelete(user)}
                                title="Delete User Account"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/*Delete Confirmation Modal */}
      {userToDelete && (
        <AdminModalPortal>
        <div className={ADMIN_MODAL_BACKDROP_CLASS}>
          <div className={`${ADMIN_MODAL_PANEL_CLASS} w-full max-w-md animate-in fade-in zoom-in-95 p-6`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Delete Team Account
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              Are you sure you want to permanently delete the account for{" "}
              <strong>{userToDelete.name}</strong> (<code>{userToDelete.email}</code>)? They will
              immediately lose access to the system.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingUser}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteUser()}
                disabled={isDeletingUser}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60 dark:bg-rose-600 dark:hover:bg-rose-700"
              >
                {isDeletingUser ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      )}
    </div>
  );
}
