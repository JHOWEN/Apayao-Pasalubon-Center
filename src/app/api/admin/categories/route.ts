import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureAuthenticatedAdmin } from "@/lib/auth";

export async function GET() {
  const userId = await ensureAuthenticatedAdmin();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, message: "Category name is required." },
        { status: 400 }
      );
    }

    const name = body.name.trim();
    const duplicate = await prisma.category.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json({ success: false, message: "A category with this name already exists." }, { status: 409 });
    }

    const category = await prisma.category.create({
      data: {
        name,
        description: body.description?.trim() || null,
      },
    });

    revalidateTag("public-categories", "max");

    return NextResponse.json(
      { success: true, category },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to create category." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    if (!body.id || !body.name?.trim()) {
      return NextResponse.json(
        { success: false, message: "Category id and name are required." },
        { status: 400 }
      );
    }

    const name = body.name.trim();
    const duplicate = await prisma.category.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        NOT: { id: body.id },
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json({ success: false, message: "A category with this name already exists." }, { status: 409 });
    }

    const category = await prisma.category.update({
      where: { id: body.id },
      data: {
        name,
        description: body.description?.trim() || null,
      },
    });

    revalidateTag("public-categories", "max");

    return NextResponse.json({ success: true, category });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to update category." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Category id is required." },
        { status: 400 }
      );
    }

    await prisma.category.delete({ where: { id } });
    revalidateTag("public-categories", "max");

    return NextResponse.json({ success: true, message: "Category deleted." });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to delete category." },
      { status: 500 }
    );
  }
}
