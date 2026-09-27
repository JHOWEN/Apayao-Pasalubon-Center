import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";

function serializeReview(review: {
  id: string;
  rating: number;
  comment: string | null;
  optionValue: string | null;
  createdAt: Date;
  user: {
    name: string;
    imageUrl: string | null;
  };
}) {
  return {
    id: review.id,
    rating: Number(review.rating),
    comment: review.comment,
    optionValue: review.optionValue,
    createdAt: review.createdAt.toISOString(),
    user: {
      name: review.user.name,
      imageUrl: review.user.imageUrl,
    },
  };
}

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "public:products:reviews:get", {
      maxAttempts: 120,
      windowMs: 60 * 1000,
      message: "Too many requests. Please try again in a moment.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("id")?.trim();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));
    const rating = Number(searchParams.get("rating"));
    const optionValue = searchParams.get("optionValue")?.trim();

    if (!productId) {
      return NextResponse.json({ success: false, message: "Product id is required." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const payload = token ? (verifyToken(token) as { sub?: string } | null) : null;
    const currentUserId = payload?.sub ?? null;

    const baseWhere: Prisma.ProductReviewWhereInput = { productId };
    const where: Prisma.ProductReviewWhereInput = {
      ...baseWhere,
      ...(Number.isInteger(rating) && rating >= 1 && rating <= 5 ? { rating } : {}),
      ...(optionValue && optionValue !== "all" ? { optionValue } : {}),
    };
    const [reviews, filteredCount, reviewCount, ratingAggregate, ratingGroups] = await Promise.all([
      prisma.productReview.findMany({
        where,
        include: { user: { select: { name: true, imageUrl: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.productReview.count({ where }),
      prisma.productReview.count({ where: baseWhere }),
      prisma.productReview.aggregate({ where: baseWhere, _avg: { rating: true } }),
      prisma.productReview.groupBy({ by: ["rating"], where: baseWhere, _count: { _all: true } }),
    ]);

    const existingReview = currentUserId
      ? await prisma.productReview.findFirst({
          where: { productId, userId: currentUserId },
          select: { id: true },
        })
      : null;

    const canReview = currentUserId
      ? Boolean(
          await prisma.orderItem.findFirst({
            where: {
              productId,
              order: {
                userId: currentUserId,
                status: "COMPLETED",
              },
            },
            select: { id: true },
          }) && !existingReview,
        )
      : false;

    return NextResponse.json({
      success: true,
      reviews: reviews.map(serializeReview),
      averageRating: Number((ratingAggregate._avg.rating ?? 0).toFixed(1)),
      reviewCount,
      ratingCounts: Object.fromEntries(ratingGroups.map((group) => [group.rating, group._count._all])),
      pagination: {
        page,
        limit,
        totalCount: filteredCount,
        totalPages: Math.max(1, Math.ceil(filteredCount / limit)),
      },
      canReview,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to load product reviews.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "public:products:reviews:post", {
      maxAttempts: 20,
      windowMs: 15 * 60 * 1000,
      message: "Too many review submissions. Please try again in a few minutes.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Please sign in to write a review." }, { status: 401 });
    }

    const payload = verifyToken(token) as { sub?: string } | null;

    if (!payload?.sub) {
      return NextResponse.json({ success: false, message: "Please sign in to write a review." }, { status: 401 });
    }

    const body = await request.json();
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const rating = Number(body.rating);
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";

    if (!productId) {
      return NextResponse.json({ success: false, message: "Product id is required." }, { status: 400 });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, message: "Please select a rating from 1 to 5." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, imageUrl: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const hasPurchased = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId: user.id,
          status: "COMPLETED",
        },
      },
      select: { id: true },
    });

    if (!hasPurchased) {
      return NextResponse.json(
        { success: false, message: "You can only review products that you have purchased." },
        { status: 403 },
      );
    }

    const optionValue = typeof body.optionValue === "string" ? body.optionValue.trim() || null : null;
    const existingReview = await prisma.productReview.findFirst({
      where: { productId, userId: user.id },
      include: {
        user: {
          select: { name: true, imageUrl: true },
        },
      },
    });

    const review = existingReview
      ? await prisma.productReview.update({
          where: { id: existingReview.id },
          data: {
            rating,
            comment: comment || null,
            optionValue,
          },
          include: {
            user: {
              select: { name: true, imageUrl: true },
            },
          },
        })
      : await prisma.productReview.create({
          data: {
            productId,
            userId: user.id,
            rating,
            comment: comment || null,
            optionValue,
          },
          include: {
            user: {
              select: { name: true, imageUrl: true },
            },
          },
        });

    return NextResponse.json({
      success: true,
      review: serializeReview({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        optionValue: review.optionValue,
        createdAt: review.createdAt,
        user: review.user,
      }),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to save your review.") }, { status: 500 });
  }
}
