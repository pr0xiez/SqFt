import bcrypt from "bcryptjs";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Hash password
    const hash = await bcrypt.hash(password, 12);

    // Create a placeholder org — user will set the name in onboarding
    const slug = `org-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: "My Company", slug },
    });

    // Create user as org owner
    await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        role: "owner",
        orgId: org.id,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
