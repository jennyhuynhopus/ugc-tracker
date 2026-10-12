"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/session";

export async function signIn(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const password = process.env.APP_PASSWORD;
  const entered = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!password) redirect("/");
  if (!safeEqual(await sessionToken(entered), await sessionToken(password))) {
    return { error: "That password isn't right." };
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
